const mangayomiSources = [{
  "name": "92漫画",
  "lang": "zh",
  "baseUrl": "https://www.92mh.com",
  "apiUrl": "",
  "iconUrl": "https://www.92mh.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "92mh.js"
}];

class DefaultExtension extends MProvider {
  _apiHost() {
    return "https://api.92mh.com";
  }

  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.92mh.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  headers(form) {
    const h = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Referer": this.getBaseUrl() + "/",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
    if (form) h["Content-Type"] = "application/x-www-form-urlencoded";
    return h;
  }

  getHeaders() {
    return this.headers();
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.indexOf("//") === 0) return "https:" + url;
    if (url.charAt(0) === "/") return this.getBaseUrl() + url;
    return this.getBaseUrl() + "/" + url;
  }

  async load(url) {
    const res = await new Client().get(url, this.headers(false));
    const code = Number(res.statusCode || 200);
    if (code === 404 || code === 410) throw new Error("92漫画：页面不存在（HTTP " + code + "）：" + url);
    if (code >= 400) throw new Error("92漫画：网站返回 HTTP " + code + "：" + url);
    return res.body || "";
  }

  async postJson(url, body) {
    const res = await new Client().post(url, this.headers(true), body);
    const code = Number(res.statusCode || 200);
    if (code >= 400) throw new Error("92漫画：接口返回 HTTP " + code + "：" + url);
    let j;
    try { j = JSON.parse(res.body || "{}"); }
    catch (e) { throw new Error("92漫画：接口返回不是 JSON：" + url); }
    return j;
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/comic/rank/");
    const items = [];
    const seen = {};
    const re = /<div class="ph_r_con_li_c" data-key="(\d+)">[\s\S]{0,1500}?<a class="dec_img" href="([^"]+)" title="([^"]*)"><img[^>]*src="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = this.fullUrl(m[2]);
      if (seen[link]) continue;
      seen[link] = true;
      const name = (m[3] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: this.fullUrl(m[4] || ""), link: link });
    }
    return { list: items, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    const html = await this.load(this.getBaseUrl() + "/list/update/?page=" + page);
    const items = [];
    const seen = {};
    const re = /<li class="list-comic" data-key="(\d+)">[\s\S]{0,900}?<a class="comic_img" href="([^"]+)"><img src="([^"]+)"[^>]*>[\s\S]{0,500}?<h3><a[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = this.fullUrl(m[2]);
      if (seen[link]) continue;
      seen[link] = true;
      const name = (m[4] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: this.fullUrl(m[3] || ""), link: link });
    }
    return { list: items, hasNextPage: items.length >= 20 };
  }

  async search(query, page, filters) {
    if (page > 1) return { list: [], hasNextPage: false };
    const j = await this.postJson(this._apiHost() + "/comic/search", "keywords=" + encodeURIComponent(query));
    const items = (j && j.items) || [];
    const list = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const name = it.title || it.name || "";
      if (!name || !it.uri) continue;
      list.push({ name: name, imageUrl: it.coverUrl || "", link: this.fullUrl(it.uri) });
    }
    return { list: list, hasNextPage: false };
  }

  meta(html, name) {
    const m = html.match(new RegExp('<meta name="' + name + '" content="([^"]*)"', 'i'));
    return m ? m[1].trim() : "";
  }

  async getDetail(url) {
    const html = await this.load(url);
    const titleRaw = (html.match(/<title>([^<]*)<\/title>/) || ["", ""])[1];
    const name = titleRaw.split("漫画在线观看")[0].trim();
    const description = this.meta(html, "description");
    const coverM = html.match(/<img src="([^"]+)" width="207" height="278"/);
    const imageUrl = coverM ? coverM[1] : "";
    const authorM = html.match(/作者：\s*(?:<a[^>]*>)?([^<]{1,40})/);
    const author = authorM ? authorM[1].replace(/<\/a>/g, "").trim() : "";
    const genre = [];
    const typeM = html.match(/类型：([\s\S]{0,400})/);
    if (typeM) {
      const gm = typeM[1].match(/#([^<\s|]+)/g) || [];
      for (let i = 0; i < gm.length; i++) {
        const g = gm[i].slice(1).trim();
        if (g && genre.indexOf(g) < 0) genre.push(g);
      }
    }
    let status = 3;
    const stM = html.match(/状态：<a[^>]*>([^<]+)<\/a>/);
    if (stM) {
      if (stM[1].indexOf("已完结") >= 0) status = 1;
      else if (stM[1].indexOf("连载") >= 0) status = 0;
    }
    const episodes = [];
    const seen = {};
    const re = /<a href="(https?:\/\/www\.92mh\.com\/manhua\/\d+\/(\d+)\.html)">[\s\S]{0,300}?<span class="list_con_zj">([^<]*)<\/span>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const epUrl = m[1];
      if (seen[epUrl]) continue;
      seen[epUrl] = true;
      let t = (m[3] || "").replace(/\s+/g, " ").trim();
      if (!t) t = "第" + m[2] + "话";
      episodes.push({ name: t, url: epUrl, dateUpload: null, scanlator: null });
    }
    if (episodes.length === 0) throw new Error("92漫画：找不到章节目录");
    return {
      name: name,
      link: url,
      imageUrl: imageUrl,
      description: description,
      author: author,
      artist: "",
      genre: genre,
      status: status,
      episodes: episodes
    };
  }

  async getPageList(chapterUrl) {
    const html = await this.load(chapterUrl);
    const hostM = html.match(/var chapterImageHost\s*=\s*"([^"]+)"/);
    const arrM = html.match(/var chapterImages\s*=\s*\[([\s\S]*?)\];/);
    if (!arrM) throw new Error("92漫画：章节页找不到图片数据（chapterImages）");
    const host = hostM ? hostM[1] : "";
    const out = [];
    const seen = {};
    const re = /"((?:\\.|[^"\\])*)"/g;
    let m;
    while ((m = re.exec(arrM[1])) !== null) {
      let p = m[1].replace(/\\\//g, "/");
      if (!p) continue;
      const u = p.indexOf("http") === 0 ? p : (host + p);
      if (!seen[u]) { seen[u] = true; out.push(u); }
    }
    if (out.length === 0) throw new Error("92漫画：本话无图片");
    return out;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "92漫画网址（换域名时改这里）",
        "value": "https://www.92mh.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
