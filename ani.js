const mangayomiSources = [{
  "name": "ANi",
  "lang": "zh",
  "baseUrl": "https://open.ani.rip",
  "apiUrl": "",
  "iconUrl": "https://open.ani.rip/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.3",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "ani.js"
}];

// ANi（open.ani.rip，Telegram 频道 t.me/channel_ani）。
// 两条数据路：
//  (1) Resources Core RSS：https://api.ani.rip/ani-download.xml（可直接访问）。
//      每条 <item> = 一集：
//        <title><![CDATA[[ANi] 番名 - 06 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4]]></title>
//        <link>https://resources.ani.rip/2026-10/...mp4?d=mp4</link>  ← 直链 MP4
//        <category><![CDATA[<番剧 UUID>]]></category>  ← 同一部番共用一个 UUID，当番剧 id 用
//      限制：RSS 是固定的一份“最近更新”，约 53 条、52 部番、只覆盖最近一周，
//      没有分页、没有搜索接口（?page=2、?limit=200 返回同一份）。
//  (2) 官网全库（v0.0.3 新增，未完全验证，见下）：open.ani.rip 本身是个文件浏览器
//      （源码 github.com/RyanL-29/aniopen，Google Drive 式目录），前端用 POST 查全库：
//        POST <当前目录路径>  body '{"inputvalue":"<关键词>"}'  → 搜索全库，返回 {foldername, files}
//        POST <当前目录路径>  body '{"password":"<已存密码或null>"}'  → 列目录，返回 {files}
//      files 每一项是 {name, size, createdTime, mimeType}；搜索时 foldername 可能是数组
//      （每条文件对应一个目录），普通列表时是字符串；文件夹的 mimeType 是
//      'application/vnd.google-apps.folder'。
//      ⚠️ 但 open.ani.rip 被 Cloudflare 互动验证挡着（curl 直接 403 "Just a moment..."），
//      直接 Client 请求拿不到 JSON，只能走内置浏览器（evaluateJavascriptViaWebview）
//      让真正的浏览器去过验证，再在页内 fetch POST 搜索。能不能过验证、
//      取决于手机上 WebView 里 Cloudflare 的表现，服务器这边无法验证。
//      所以 v0.0.3 的策略是：搜索先走 RSS（快）；RSS 一个都找不到时，才试内置浏览器
//      搜全库；内置浏览器失败就回落到空结果，不破坏原有功能。
// 播放：剧集地址是 resources.ani.rip 直链 MP4（1080P，Baha，繁中字幕），
//      固定 301 到 cloud.ani-download.workers.dev（同路径，只换域名），
//      扩展直接给最终地址 + Referer/UA 头（v0.0.2 已验证能播）。
// 种子 API（ani-torrent.xml）只有 .torrent 文件，不能原生播，不做。

const ANI_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ANI_RSS = "https://api.ani.rip/ani-download.xml";
const ANI_SITE = "https://open.ani.rip/";

class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) return text;
    var bytes = [];
    for (var i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i));
    var charCodes = [];
    var i = 0;
    while (i < bytes.length) {
      var byte1 = bytes[i];
      var charCode;
      if (byte1 < 0x80) { charCode = byte1; i += 1; }
      else if (byte1 < 0xE0) { charCode = ((byte1 & 0x1F) << 6) | (bytes[i + 1] & 0x3F); i += 2; }
      else if (byte1 < 0xF0) { charCode = ((byte1 & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F); i += 3; }
      else { charCode = ((byte1 & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F); i += 4; }
      charCodes.push(charCode);
    }
    return String.fromCharCode.apply(null, charCodes);
  }

  fixText(text) {
    if (!text) return "";
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(text)) return text;
    return this.stringUTF8(text, true);
  }

  headers() {
    return { "User-Agent": ANI_UA, "Accept": "application/rss+xml, application/xml, text/xml, */*" };
  }

  // 从 "[ANi] 番名 - 06 [1080P]..." 这类文件名拆出番名和集数（RSS 标题和官网文件名共用）
  parseFileTitle(rawTitle) {
    let t = String(rawTitle || "").replace(/^\[ANi\]\s*/i, "").replace(/\.mp4\s*$/i, "");
    let animeName = t, epNum = "";
    const dash = t.match(/^(.*)\s+-\s+(\d+(?:\.\d+)?)\s*\[/);
    if (dash) {
      animeName = dash[1].trim();
      epNum = dash[2];
    } else {
      const dash2 = t.match(/^(.*)\s+-\s+(\d+(?:\.\d+)?)\s*$/);
      if (dash2) { animeName = dash2[1].trim(); epNum = dash2[2]; }
    }
    return { animeName: animeName, epNum: epNum };
  }

  // RSS 用正则解析（Mangayomi 的 Document 是 HTML 解析器，XML 用正则更稳）。
  // 标题格式：[ANi] 番名 - 06 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4
  parseRss(xml) {
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml || "")) !== null) {
      const body = m[1] || "";
      const titleM = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(body);
      const linkM = /<link>([\s\S]*?)<\/link>/i.exec(body);
      const catM = /<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/i.exec(body);
      if (!titleM || !linkM) continue;
      const rawTitle = (titleM[1] || "").trim();
      const link = (linkM[1] || "").trim();
      const uuid = catM ? (catM[1] || "").trim() : "";
      const parsed = this.parseFileTitle(rawTitle);
      if (!parsed.animeName || !link) continue;
      items.push({
        animeName: this.fixText(parsed.animeName),
        epNum: parsed.epNum,
        epName: parsed.epNum ? ("第" + parsed.epNum + "集") : rawTitle,
        link: link,
        uuid: uuid
      });
    }
    return items;
  }

  async fetchRss() {
    const res = await new Client().get(ANI_RSS, this.headers());
    return this.parseRss(res.body || "");
  }

  // 按番剧 UUID 分组，一部番一条；link 用 "ani:<uuid>"，getDetail 凭它过滤
  groupByAnime(items) {
    const map = {};
    const order = [];
    for (const it of items) {
      const key = it.uuid || ("name:" + it.animeName);
      if (!map[key]) {
        map[key] = { name: it.animeName, imageUrl: "", link: "ani:" + key, count: 0 };
        order.push(key);
      }
      map[key].count += 1;
    }
    return order.map(function(k) { return map[k]; });
  }

  async getPopular(page) {
    const items = await this.fetchRss();
    return { list: this.groupByAnime(items), hasNextPage: false };
  }

  async getLatestUpdates(page) {
    return await this.getPopular(page);
  }

  // ---- v0.0.3：内置浏览器搜官网全库（仅当 RSS 一个都找不到时才试） ----
  // 官网被 Cloudflare 挡，直接 Client POST 会拿到 "Just a moment..." 挑战页；
  // 用 evaluateJavascriptViaWebview 在真浏览器里打开官网，等验证通过后，
  // 在页内按官网前端的做法 fetch POST '{"inputvalue":"<关键词>"}' 搜全库。
  // ⚠️ 未验证：服务器这边跑不了真 WebView，Cloudflare 挑战在手机内置浏览器里
  // 能不能自动通过、多久通过，都没法事先确认；失败时返回 []，由调用方回落。
  async webviewSearch(query) {
    if (typeof evaluateJavascriptViaWebview !== "function") return [];
    const q = String(query || "").trim();
    if (!q) return [];
    const script = `(function(){
      if (window.__aniSearch) return;
      window.__aniSearch = true;
      var done = false, started = Date.now(), interval;
      var QUERY = ${JSON.stringify(q)};
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function poll() {
        var title = document.title || "";
        var input = document.getElementById("searchinput");
        // Cloudflare 挑战页标题是 "Just a moment..."，且没有搜索框；继续等它通过
        if (title.indexOf("Just a moment") !== -1 || !input) {
          if (Date.now() - started > 25000) send({files: [], foldername: "", error: "challenge"});
          return;
        }
        // 页面就绪：按官网前端的做法 POST 搜索
        if (interval) clearInterval(interval);
        try {
          fetch(window.location.pathname, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({inputvalue: QUERY})
          }).then(function(r){ return r.text(); }).then(function(t){
            try {
              var obj = JSON.parse(t);
              send({files: obj.files || [], foldername: (obj.foldername || ""), error: ""});
            } catch(e) { send({files: [], foldername: "", error: "parse"}); }
          }).catch(function(e){ send({files: [], foldername: "", error: "fetch"}); });
        } catch(e) { send({files: [], foldername: "", error: "exception"}); }
      }
      interval = setInterval(poll, 1000);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(ANI_SITE, this.headers(), [script], 30);
    } catch (err) {
      return [];
    }
    try {
      const data = JSON.parse(String(result || ""));
      if (!data || !data.files || data.error) return [];
      return this.parseWebFiles(data.files, data.foldername);
    } catch (_) {
      return [];
    }
  }

  // 把官网搜索返回的 {files, foldername} 转成剧集条目。
  // foldername 可能是字符串（普通列表）或数组（搜索结果，每条文件对应一个目录）。
  // 文件路径拼成 resources.ani.rip 的直链（RSS 同款格式，播放沿用 v0.0.2 的重定向解析）。
  parseWebFiles(files, foldername) {
    const items = [];
    const isArray = Array.isArray(foldername);
    for (let i = 0; i < (files || []).length; i++) {
      const f = files[i];
      if (!f || !f.name) continue;
      const name = String(f.name || "");
      const isVideo = /\.mp4$/i.test(name) || (f.mimeType && String(f.mimeType).indexOf("video") === 0);
      if (!isVideo) continue;
      let dir = "";
      if (isArray) dir = String(foldername[i] || "");
      else dir = String(foldername || "");
      let fullPath = (dir || "") + name;
      if (fullPath.charAt(0) !== "/") fullPath = "/" + fullPath;
      const parsed = this.parseFileTitle(name);
      if (!parsed.animeName) continue;
      // 路径逐段 percent-encode（和 RSS 里的链接格式一致）
      const encPath = fullPath.split("/").map(function(seg) {
        return encodeURIComponent(seg);
      }).join("/");
      items.push({
        animeName: this.fixText(parsed.animeName),
        epNum: parsed.epNum,
        epName: parsed.epNum ? ("第" + parsed.epNum + "集") : name,
        link: "https://resources.ani.rip" + encPath + "?d=mp4"
      });
    }
    return items;
  }

  // 按番名分组（官网搜索结果没有 UUID，按名字分）；剧集列表编码进 link，
  // getDetail 直接解码，不用重跑内置浏览器。
  groupWebByAnime(items) {
    const map = {};
    const order = [];
    for (const it of items) {
      const key = it.animeName;
      if (!map[key]) {
        map[key] = { name: it.animeName, eps: [] };
        order.push(key);
      }
      map[key].eps.push(it);
    }
    return order.map(function(k) {
      const g = map[k];
      g.eps.sort(function(a, b) {
        const na = parseFloat(a.epNum || "0"), nb = parseFloat(b.epNum || "0");
        if (na !== nb) return na - nb;
        return a.epName < b.epName ? -1 : 1;
      });
      const payload = { n: g.name, e: g.eps.map(function(e) { return [e.epName, e.link, e.epNum]; }) };
      return {
        name: g.name,
        imageUrl: "",
        link: "aniweb:" + encodeURIComponent(JSON.stringify(payload))
      };
    });
  }

  // 搜索：先走 RSS（快）；RSS 一个都找不到（可能是老番）时，才试内置浏览器搜全库
  async search(query, page, filters) {
    const q = String(query || "").trim().toLowerCase();
    const items = await this.fetchRss();
    const filtered = q ? items.filter(function(it) {
      return it.animeName.toLowerCase().indexOf(q) !== -1;
    }) : items;
    if (filtered.length > 0) {
      return { list: this.groupByAnime(filtered), hasNextPage: false };
    }
    try {
      const webItems = await this.webviewSearch(query);
      if (webItems && webItems.length > 0) {
        return { list: this.groupWebByAnime(webItems), hasNextPage: false };
      }
    } catch (_) {}
    return { list: [], hasNextPage: false };
  }

  async getDetail(url) {
    const u = String(url || "");
    // 官网搜索结果：剧集列表编码在 link 里，直接解码
    if (u.indexOf("aniweb:") === 0) {
      try {
        const payload = JSON.parse(decodeURIComponent(u.slice(7)));
        const eps = (payload.e || []).map(function(e) { return { name: e[0], url: e[1] }; });
        return {
          name: payload.n || "",
          imageUrl: "",
          description: "",
          genre: [],
          status: 3,
          episodes: eps
        };
      } catch (_) {
        return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: [] };
      }
    }
    // RSS 结果：按 UUID 过滤
    const key = u.replace(/^ani:/, "");
    const items = await this.fetchRss();
    const eps = [];
    for (const it of items) {
      const k = it.uuid || ("name:" + it.animeName);
      if (k !== key) continue;
      eps.push({ name: it.epName, url: it.link, _num: it.epNum });
    }
    // 按集数升序
    eps.sort(function(a, b) {
      const na = parseFloat(a._num || "0"), nb = parseFloat(b._num || "0");
      if (na !== nb) return na - nb;
      return a.name < b.name ? -1 : 1;
    });
    let animeName = "";
    for (const it of items) {
      const k = it.uuid || ("name:" + it.animeName);
      if (k === key) { animeName = it.animeName; break; }
    }
    return {
      name: animeName,
      imageUrl: "",
      description: "",
      genre: [],
      status: 3,
      episodes: eps.map(function(e) { return { name: e.name, url: e.url }; })
    };
  }

  // v0.0.2：resources.ani.rip 的直链固定 301 到 cloud.ani-download.workers.dev
  // （同路径，只换域名），播放器跟重定向不可靠，直接给最终地址；
  // 另带 Referer + UA 头。
  // 剧集地址本身就是直链 MP4，直接返回；质量标 1080P（RSS 标题里即是）
  async getVideoList(url) {
    const u = String(url || "").trim();
    if (!u) return [];
    const finalUrl = u.replace(/^https:\/\/resources\.ani\.rip\//, "https://cloud.ani-download.workers.dev/");
    return [{ url: finalUrl, originalUrl: finalUrl, quality: "1080P", headers: { "Referer": "https://open.ani.rip/", "User-Agent": ANI_UA } }];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "ANi 网址",
        "value": "https://open.ani.rip",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
