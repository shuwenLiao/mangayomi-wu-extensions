const mangayomiSources = [{
  "name": "桐溪观影厅",
  "lang": "zh",
  "baseUrl": "https://www.fentiny.com",
  "apiUrl": "",
  "iconUrl": "https://www.fentiny.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "fentiny.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.fentiny.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.getBaseUrl() + url;
    return this.getBaseUrl() + "/" + url;
  }

  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Referer": this.getBaseUrl() + "/",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
  }

  unescapeJson(s) {
    if (!s) return "";
    return s.replace(/\\u002F/g, "/").replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\"/g, '"');
  }

  // 首页 / 搜索页的卡片：<div class="item"><a class="link" href="/detail/{id}.html" title="片名">
  // <img class="img" src="/pic/..." alt="片名"/>，标题也可能在 <a class="title"> 里
  parseCards(body) {
    const items = [];
    const seen = {};
    const blocks = (body || "").split('<div class="item">');
    for (let i = 1; i < blocks.length; i++) {
      const b = blocks[i];
      const hm = b.match(/href="(\/detail\/\d+\.html)"/);
      if (!hm) continue;
      const link = this.fullUrl(hm[1]);
      if (seen[link]) continue;
      seen[link] = true;
      let name = "";
      const tm = b.match(/class="link"[^>]*title="([^"]+)"/) || b.match(/<a class="title"[^>]*>([^<]+)<\/a>/);
      if (tm) name = tm[1];
      if (!name) {
        const am = b.match(/alt="([^"]+)"/);
        if (am) name = am[1];
      }
      let imageUrl = "";
      const im = b.match(/<img[^>]*class="img"[^>]*src="([^"]+)"/) || b.match(/<img[^>]*src="([^"]+)"/);
      if (im) imageUrl = this.fullUrl(im[1]);
      if (!name) name = "未命名短剧";
      items.push({ name: name.trim(), imageUrl: imageUrl, link: link });
    }
    return { list: items, hasNextPage: false };
  }

  async getPopular(page) {
    const res = await new Client().get(this.getBaseUrl() + "/", this.headers());
    return this.parseCards(res.body || "");
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const res = await new Client().get(
      this.getBaseUrl() + "/search.html?wd=" + encodeURIComponent(query),
      this.headers()
    );
    const body = res.body || "";
    // 该站搜索常被 Cloudflare 拦截（403 "Just a moment..."），直接报清楚，不返回空列表误导
    if (res.statusCode === 403 || /Just a moment|Attention Required|cf-chl/i.test(body)) {
      throw new Error("桐溪观影厅：搜索被 Cloudflare 拦截，请先在首页浏览，或稍后再试");
    }
    return this.parseCards(body);
  }

  async getDetail(url) {
    const res = await new Client().get(url, this.headers());
    const body = res.body || "";
    let name = "";
    const hm = body.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (hm) name = hm[1].trim();
    if (!name) name = "未命名短剧";
    let imageUrl = "";
    const om = body.match(/<meta property="og:image" content="([^"]+)"/);
    if (om) imageUrl = this.fullUrl(this.unescapeJson(om[1]));
    let description = "";
    const dm = body.match(/<meta name="description" content="([^"]*)"/);
    if (dm) description = this.unescapeJson(dm[1]);
    const genre = [];
    const gm = body.match(/类型：([^<\s]+)/);
    if (gm) genre.push(gm[1]);
    const rm = body.match(/地区：([^<\s]+)/);
    if (rm) genre.push(rm[1]);
    // 该站短剧是“合全集”单视频：整部剧合并成一个视频，没有分集。
    // 详情页只链线路 1 的播放页，但播放页里同时有两条线路的 m3u8，
    // getVideoList 会把两条线路都取出来当清晰度选项。
    const episodes = [];
    const pm = body.match(/href="(\/play\/\d+-\d+-1\.html)"/);
    if (pm) {
      episodes.push({ name: "全集", url: this.fullUrl(pm[1]) });
    }
    return {
      name: name,
      imageUrl: imageUrl,
      description: description,
      genre: genre,
      status: 3,
      episodes: episodes
    };
  }

  // 播放页里有 window.__ALTS=[{"n":"线路1","u":"...index.m3u8"},{"n":"线路2","u":"..."}]
  // 以及 player 配置里的 "url":"...m3u8"，两种都抓，n 当清晰度名
  extractM3u8(body) {
    const urls = [];
    const seen = {};
    const push = function (name, u) {
      u = u || "";
      if (u.indexOf("//") === 0) u = "https:" + u;
      if (u.indexOf("http") !== 0) return;
      if (seen[u]) return;
      seen[u] = true;
      urls.push({ name: name || "", url: u });
    };
    let m;
    const reAlt = /\{\s*"n"\s*:\s*"([^"]+)"\s*,\s*"u"\s*:\s*"([^"]*?\.m3u8[^"]*)"\s*\}/g;
    while ((m = reAlt.exec(body)) !== null) {
      push(m[1], this.unescapeJson(m[2]));
    }
    const re = /"url"\s*:\s*"((?:https?:)?[^"]*?\.m3u8[^"]*)"/g;
    while ((m = re.exec(body)) !== null) {
      push("", this.unescapeJson(m[1]));
    }
    // 兜底：页面里裸露的 m3u8 地址
    if (urls.length === 0) {
      const re2 = /(https?:\/\/[^\s"'\\]+\.m3u8)/g;
      while ((m = re2.exec(body)) !== null) {
        push("", this.unescapeJson(m[1]));
      }
    }
    return urls;
  }

  otherLineUrl(url) {
    // /play/{id}-1-1.html <-> /play/{id}-2-1.html
    const m = (url || "").match(/^(.*\/play\/\d+-)(\d+)(-1\.html.*)$/);
    if (!m) return "";
    return m[1] + (m[2] === "1" ? "2" : "1") + m[3];
  }

  async getVideoList(url) {
    // 播放页里的 m3u8 是标准 HLS AES-128（密钥 enc.key 可直接取），
    // ExoPlayer 原生支持，不用扩展解密。直接把地址交给播放器。
    const tries = [url];
    const alt = this.otherLineUrl(url);
    if (alt) tries.push(alt);
    for (const u of tries) {
      try {
        const res = await new Client().get(u, this.headers());
        const urls = this.extractM3u8(res.body || "");
        if (urls.length > 0) {
          return urls.map(function (v, i) {
            return { url: v.url, originalUrl: v.url, quality: v.name || ("线路" + (i + 1)) };
          });
        }
      } catch (e) { }
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
        "summary": "桐溪观影厅网址",
        "value": "https://www.fentiny.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
