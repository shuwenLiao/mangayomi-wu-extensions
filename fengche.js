const mangayomiSources = [{
  "name": "风车动漫",
  "lang": "zh",
  "baseUrl": "https://www.fengche11.com",
  "apiUrl": "",
  "iconUrl": "https://www.fengche11.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime/src/zh/fengche.js"
}];

// 风车动漫 fengche11.com — Maccms 站，照樱花动漫 (yhdm.js) 的路子建。
// 已验证（2026-11-23 服务器端）：首页 200；详情页 /anime/<24位hash>.html，
// 4 条线路（1 精品 / 2 暴风 / 3 量子 / 4 优质）；播单页 player_aaaa JSON 的
// url 字段是百分号编码 + %uXXXX，解开是直链 m3u8（暴风线同樱花的 fengbao14
// 家族）；最新走 /rss/index.xml；搜索走“系统安全验证”口令流（见 search）。
// 注意：数字 id 换不出 hash（hash 是站里随机存的），搜索不能走 suggest API，
// 只能走验证流拿搜索结果页上的 /anime/<hash>.html 直链。

class DefaultExtension extends MProvider {
  // Guard against double-decoding: only decode when the string is still
  // Latin-1 garbled (all char codes <= 255). Decoded Chinese sits above 255.
  stringUTF8(text) {
    if (!text) return text;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 255) return text;
    }
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      bytes.push(text.charCodeAt(i));
    }
    var charCodes = [];
    var i = 0;
    while (i < bytes.length) {
      var byte1 = bytes[i];
      var charCode;
      if (byte1 < 0x80) {
        charCode = byte1;
        i += 1;
      } else if (byte1 < 0xE0) {
        var byte2 = bytes[i + 1];
        charCode = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
        i += 2;
      } else if (byte1 < 0xF0) {
        var byte2 = bytes[i + 1];
        var byte3 = bytes[i + 2];
        charCode = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
        i += 3;
      } else {
        var byte2 = bytes[i + 1];
        var byte3 = bytes[i + 2];
        var byte4 = bytes[i + 3];
        charCode = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
        i += 4;
      }
      charCodes.push(charCode);
    }
    return String.fromCharCode.apply(null, charCodes);
  }

  getBaseUrl() {
    try {
      const preference = new SharedPreferences();
      var base_url = preference.get("domain_url");
      if (base_url && base_url.length > 0) {
        if (base_url.endsWith("/")) return base_url.slice(0, -1);
        return base_url;
      }
    } catch (_) {}
    return "https://www.fengche11.com";
  }

  fullUrl(path) {
    if (!path) return this.getBaseUrl();
    if (path.indexOf("http") === 0) return path;
    if (path.charAt(0) !== "/") path = "/" + path;
    return this.getBaseUrl() + path;
  }

  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Referer": this.getBaseUrl() + "/"
    };
  }

  // ---- 首页热门：a.lazyload 锚点自带 title + data-original 封面 ----
  async getPopular(page) {
    const res = await new Client().get(this.getBaseUrl() + "/", this.headers());
    const doc = new Document(res.body);
    const list = [];
    const seen = {};
    const anchors = doc.select("a.lazyload");
    for (const a of anchors) {
      const href = a.attr("href") || "";
      if (href.indexOf("/anime/") !== 0) continue;
      if (seen[href]) continue;
      seen[href] = true;
      const name = this.stringUTF8((a.attr("title") || a.text || "").trim());
      if (!name) continue;
      let img = a.attr("data-original") || "";
      if (img && img.indexOf("http") !== 0) img = this.fullUrl(img);
      list.push({ name: name, imageUrl: img || "", link: href });
    }
    return { list: list, hasNextPage: false };
  }

  // ---- 最新：RSS /rss/index.xml，<title> 是“剧名 集数”，<link> 是详情直链 ----
  async getLatestUpdates(page) {
    const res = await new Client().get(this.getBaseUrl() + "/rss/index.xml", this.headers());
    const body = res.body || "";
    const list = [];
    const seen = {};
    const items = body.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const it of items) {
      const tm = it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const lm = it.match(/<link>([\s\S]*?)<\/link>/);
      if (!tm || !lm) continue;
      let name = this.stringUTF8(tm[1].trim());
      let link = lm[1].trim();
      if (!link || seen[link]) continue;
      seen[link] = true;
      // 去掉标题尾巴的集数/完结标记，只留剧名
      name = name.replace(/\s*(第?\d+集|完结|已完结|全集)\s*$/, "");
      if (!name) continue;
      list.push({ name: name, imageUrl: "", link: link });
    }
    return { list: list, hasNextPage: false };
  }

  // ---- 搜索：验证口令流（Route A）----
  // 搜索页 /search/<词>-------------.html 第一次返回“系统安全验证”插页：
  // 点“继续访问”会 POST /index.php/ajax/verify_check?type=search，带 i 参数。
  // i 的算法整段写在插页里：16 字节密钥（页面 HTML 里嵌着，可用正则抠），
  // 取当前时间戳字符串，逐字节异或密钥（循环），再 base64。回 code==1 即放行，
  // 之后重取搜索页直接带 /anime/<hash>.html 结果链接。
  // 唯一没验过的点：Mangayomi 的 JS Client 在 POST 和重取之间能不能保住 cookie，
  // 服务器端测不了（这台机器的出口策略拦了 verify_check 的 POST），只能手机验。
  VERIFY_KEY() {
    return [0x4e, 0x3f, 0xa9, 0xc2, 0x12, 0x7d, 0x88, 0xef, 0x55, 0xaa, 0x0b, 0xcd, 0xde, 0xad, 0xbe, 0xef];
  }

  extractVerifyKey(body) {
    try {
      const m = body.match(/new Uint8Array\(\[([0-9a-fA-Fx,\s]+)\]\)/);
      if (!m) return null;
      const parts = m[1].split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      const key = parts.map(function (p) { return parseInt(p, 16); });
      if (key.length !== 16) return null;
      for (const v of key) if (isNaN(v)) return null;
      return key;
    } catch (_) {
      return null;
    }
  }

  base64Encode(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b1 = bytes[i], b2 = (i + 1 < bytes.length) ? bytes[i + 1] : 0, b3 = (i + 2 < bytes.length) ? bytes[i + 2] : 0;
      out += chars[b1 >> 2];
      out += chars[((b1 & 3) << 4) | (b2 >> 4)];
      out += (i + 1 < bytes.length) ? chars[((b2 & 15) << 2) | (b3 >> 6)] : "=";
      out += (i + 2 < bytes.length) ? chars[b3 & 63] : "=";
    }
    return out;
  }

  computeVerifyToken(key) {
    const f = String(Date.now());
    const bytes = [];
    for (let i = 0; i < f.length; i++) {
      bytes.push(f.charCodeAt(i) ^ key[i % key.length]);
    }
    return this.base64Encode(bytes);
  }

  // 从任意 HTML 里抠 /anime/<hash>.html 结果链接（搜索结果页布局未知，
  // 用正则比 Document 选择器更稳）。title 属性优先，没有就取锚点文字。
  parseSearchResults(body) {
    const list = [];
    const seen = {};
    const re = /<a[^>]*href="(\/anime\/[0-9a-f]{24}\.html)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const href = m[1];
      if (seen[href]) continue;
      seen[href] = true;
      const tag = m[0];
      const tm = tag.match(/title="([^"]+)"/);
      let name = "";
      if (tm) {
        name = tm[1];
      } else {
        name = m[2].replace(/<[^>]+>/g, "").trim();
      }
      name = this.stringUTF8((name || "").trim());
      if (!name) continue;
      list.push({ name: name, imageUrl: "", link: href });
    }
    return list;
  }

  async search(query, page, filters) {
    if (!query) return { list: [], hasNextPage: false };
    const searchUrl = this.getBaseUrl() + "/search/" + encodeURIComponent(query) + "-------------.html";
    let body = "";
    try {
      const res = await new Client().get(searchUrl, this.headers());
      body = res.body || "";
    } catch (_) { return { list: [], hasNextPage: false }; }
    let items = this.parseSearchResults(body);
    if (items.length > 0) return { list: items, hasNextPage: false };
    // 没结果且是验证插页：算口令、POST 放行、重取。
    if (body.indexOf("系统安全验证") === -1 && body.indexOf("verify_check") === -1) {
      return { list: [], hasNextPage: false };
    }
    const key = this.extractVerifyKey(body) || this.VERIFY_KEY();
    const token = this.computeVerifyToken(key);
    try {
      // 注意：header 名用小写 "content-type"（Xfani 的教训：桥接按小写查表，
      // 大写 "Content-Type" 会漏判 JSON 分支；body 传对象、不要 stringify，
      // 否则桥接二次编码）。这里要的是表单编码，对象 + 小写表单 content-type。
      await new Client().post(
        this.getBaseUrl() + "/index.php/ajax/verify_check?type=search",
        {
          "content-type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Referer": searchUrl
        },
        { i: token }
      );
    } catch (_) { /* 放行失败就直接重取一次，看运气 */ }
    try {
      const res2 = await new Client().get(searchUrl, this.headers());
      body = res2.body || "";
    } catch (_) { return { list: [], hasNextPage: false }; }
    items = this.parseSearchResults(body);
    return { list: items, hasNextPage: false };
  }

  async getDetail(url) {
    const res = await new Client().get(this.fullUrl(url), this.headers());
    const doc = new Document(res.body);
    let cover = "";
    const imgs = doc.select("img.lazyload");
    for (const im of imgs) {
      const d = im.attr("data-original") || "";
      if (d && d.indexOf("upload/") !== -1) {
        cover = d;
        break;
      }
    }
    if (!cover) {
      const c2 = doc.selectFirst("img.lazyload");
      if (c2) cover = c2.attr("data-original") || "";
    }
    if (cover && cover.indexOf("http") !== 0) cover = this.fullUrl(cover);
    let title = "";
    const h1 = doc.selectFirst("h1.title") || doc.selectFirst("h1");
    if (h1) title = this.stringUTF8(h1.text.trim());
    let desc = "";
    const d = doc.selectFirst("p.desc.detail") || doc.selectFirst("span.detail-sketch");
    if (d) {
      desc = this.stringUTF8(d.text.trim().replace(/^简介：/, ""));
    }
    // 集数：各线路播单里的链接，title="1集" 这种；“立即播放”没有 title，直接排除。
    // 4 条线路内容相同，按 nid 去重。
    const eps = [];
    const seenNid = {};
    const links = doc.select("a");
    for (const a of links) {
      const href = a.attr("href") || "";
      const m = href.match(/\/anime\/[0-9a-f]{24}\/play\/\d+\/(\d+)\.html/);
      if (!m) continue;
      const nid = m[1];
      if (seenNid[nid]) continue;
      const t = (a.attr("title") || a.text || "").trim();
      const nm = t.match(/^(\d+)集$/);
      if (!nm) continue;
      seenNid[nid] = true;
      eps.push({ name: "第" + nm[1] + "集", url: href });
    }
    eps.sort(function (a, b) {
      const na = parseInt(a.name.replace(/\D/g, ""), 10) || 0;
      const nb = parseInt(b.name.replace(/\D/g, ""), 10) || 0;
      return na - nb;
    });
    return {
      name: title,
      imageUrl: cover,
      description: desc,
      genre: [],
      episodes: eps
    };
  }

  // 播单页 player_aaaa JSON 的 url 字段：百分号编码 + %uXXXX，先解 %u 再
  // decodeURIComponent，得到直链（暴风线里含中文“第01集”这种裸中文）。
  decodePlayerUrl(u) {
    if (!u) return "";
    let s = u.replace(/%u([0-9a-fA-F]{4})/g, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    });
    try { s = decodeURIComponent(s); } catch (_) {}
    return s;
  }

  // 安全编码：只编非 ASCII 字符，已有的 %XX 原样保留（Xfani 的教训：
  // 整串 encodeURI 会把 %E8 二次编成 %25E8，播 401；Dart 遇到裸中文
  // 地址会把整个播单丢掉）。
  safeEncodeUrl(u) {
    return String(u).replace(/[^\x00-\x7F]/g, function (ch) {
      return encodeURIComponent(ch);
    });
  }

  extractPlayerUrl(body) {
    let m = body.match(/player_aaaa=(\{.*?\})\s*<\/script>/s);
    if (m) {
      try {
        const d = JSON.parse(m[1]);
        if (d && d.url) return this.decodePlayerUrl(d.url);
      } catch (_) {}
    }
    // 兜底：直接抠 "url":"..." 再解
    m = body.match(/"url"\s*:\s*"((?:%[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|[^"\\])+)"/);
    if (m) return this.decodePlayerUrl(m[1]);
    return "";
  }

  async validateM3u8(url, referer) {
    try {
      const r = await new Client().get(url, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": referer
      });
      const b = r.body || "";
      return b.indexOf("#EXTM3U") !== -1 && b.indexOf(".ts") !== -1;
    } catch (_) {
      return false;
    }
  }

  lineName(sid) {
    return { "1": "精品", "2": "暴风", "3": "量子", "4": "优质" }[sid] || "Origin";
  }

  async getVideoList(url) {
    const playUrl = this.fullUrl(url);
    const m = playUrl.match(/\/anime\/([0-9a-f]{24})\/play\/\d+\/(\d+)\.html/);
    if (!m) return [];
    const hash = m[1], nid = m[2];
    // 暴风线先（同樱花能播的 fengbao14 家族），精品线最后（它的 url 是
    // 加密 token 不是直链，天然会被跳过）。
    const order = ["2", "3", "4", "1"];
    for (const sid of order) {
      const purl = this.getBaseUrl() + "/anime/" + hash + "/play/" + sid + "/" + nid + ".html";
      let body = "";
      try {
        const r = await new Client().get(purl, this.headers());
        body = r.body || "";
      } catch (_) { continue; }
      if (!body) continue;
      const stream = this.extractPlayerUrl(body);
      if (!stream || !/^https?:\/\/.+\.m3u8/.test(stream)) continue;
      const encoded = this.safeEncodeUrl(stream);
      const ok = await this.validateM3u8(encoded, purl);
      if (!ok) continue;
      return [{
        url: encoded,
        originalUrl: encoded,
        quality: this.lineName(sid),
        headers: {
          "Referer": purl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
      }];
    }
    return [];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "风车动漫网址",
        "value": "https://www.fengche11.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
