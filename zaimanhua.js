const mangayomiSources = [{
  "name": "再漫画",
  "lang": "zh",
  "baseUrl": "https://manhua.zaimanhua.com",
  "apiUrl": "",
  "iconUrl": "https://manhua.zaimanhua.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "zaimanhua.js"
}];

class DefaultExtension extends MProvider {
  // 网站 API 要求带 uuid（任意 UUID 即可）
  _uuid() {
    return "550e8400-e29b-41d4-a716-446655440000";
  }

  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://manhua.zaimanhua.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Referer": this.getBaseUrl() + "/",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
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

  async loadJson(url) {
    const res = await new Client().get(url, this.headers());
    const code = Number(res.statusCode || 200);
    if (code >= 400) throw new Error("再漫画：网站返回 HTTP " + code + "：" + url);
    let j;
    try { j = JSON.parse(res.body || "{}"); }
    catch (e) { throw new Error("再漫画：接口返回不是 JSON：" + url); }
    if (j.errno !== 0) throw new Error("再漫画：接口错误（" + (j.errmsg || j.errno) + "）");
    return j.data;
  }

  detailLink(comicId) {
    return this.getBaseUrl() + "/details/" + comicId;
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const data = await this.loadJson(this.getBaseUrl() + "/api/v1/comic2/index?uuid=" + this._uuid());
    const inner = (data && data.data) || {};
    const ranks = inner.weekRankList || [];
    const list = [];
    for (let i = 0; i < ranks.length; i++) {
      const r = ranks[i];
      if (!r.comic_id || !r.title) continue;
      list.push({ name: r.title, imageUrl: r.cover || "", link: this.detailLink(r.comic_id) });
    }
    return { list: list, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    const data = await this.loadJson(this.getBaseUrl() + "/api/v1/comic2/update_list?page=" + page + "&size=18&uuid=" + this._uuid());
    const comics = (data && data.comicList) || [];
    const list = [];
    for (let i = 0; i < comics.length; i++) {
      const c = comics[i];
      if (!c.id || !c.name) continue;
      list.push({ name: c.name, imageUrl: c.cover || "", link: this.detailLink(c.id) });
    }
    return { list: list, hasNextPage: comics.length >= 18 };
  }

  async search(query, page, filters) {
    // 注意：不要加 source 参数，否则接口返回“请输入搜索的内容”
    const url = this.getBaseUrl() + "/app/v1/search/index?keyword=" + encodeURIComponent(query) +
      "&page=" + page + "&size=18";
    const data = await this.loadJson(url);
    const items = (data && data.list) || [];
    const total = (data && data.total) || 0;
    const list = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const id = it.id || it.comic_id;
      if (!id || !it.title) continue;
      list.push({ name: it.title, imageUrl: it.cover || "", link: this.detailLink(id) });
    }
    return { list: list, hasNextPage: total > 0 ? (page * 18 < total) : (items.length >= 18) };
  }

  async getDetail(url) {
    const idM = url.match(/\/details\/(\d+)/);
    if (!idM) throw new Error("再漫画：详情链接无法解析漫画 ID：" + url);
    const comicId = idM[1];
    const data = await this.loadJson(this.getBaseUrl() + "/api/v1/comic2/comic/detail?uuid=" + this._uuid() + "&id=" + comicId);
    const info = (data && data.comicInfo) || {};
    const name = info.title || "";
    const imageUrl = info.cover || "";
    const description = info.description || "";
    let author = "";
    if (info.authorsTagList && info.authorsTagList.length > 0) author = info.authorsTagList[0].tagName || "";
    const genre = [];
    const tagLists = [info.themeTagList, info.cateTagList];
    for (let t = 0; t < tagLists.length; t++) {
      const tl = tagLists[t] || [];
      for (let i = 0; i < tl.length; i++) {
        const g = tl[i].tagName || "";
        if (g && genre.indexOf(g) < 0) genre.push(g);
      }
    }
    let status = 3;
    const stl = info.statusTagList || [];
    for (let i = 0; i < stl.length; i++) {
      const s = stl[i].tagName || "";
      if (s.indexOf("已完结") >= 0) { status = 1; break; }
      if (s.indexOf("连载") >= 0) { status = 0; break; }
    }
    const episodes = [];
    const seen = {};
    const groups = info.chapterList || [];
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      const prefix = groups.length > 1 && grp.title ? (grp.title + " ") : "";
      const chs = grp.data || [];
      for (let i = 0; i < chs.length; i++) {
        const ch = chs[i];
        if (!ch.chapter_id || !ch.chapter_title) continue;
        const epUrl = this.detailLink(comicId) + "?chapter=" + ch.chapter_id;
        if (seen[epUrl]) continue;
        seen[epUrl] = true;
        episodes.push({
          name: prefix + ch.chapter_title,
          url: epUrl,
          dateUpload: null,
          scanlator: null
        });
      }
    }
    if (episodes.length === 0) throw new Error("再漫画：找不到章节目录");
    episodes.reverse();
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
    const idM = chapterUrl.match(/\/details\/(\d+)/);
    const chM = chapterUrl.match(/[?&]chapter=(\d+)/);
    if (!idM || !chM) throw new Error("再漫画：章节链接无法解析 ID：" + chapterUrl);
    const data = await this.loadJson(this.getBaseUrl() + "/api/v1/comic2/chapter/detail?uuid=" + this._uuid() +
      "&comic_id=" + idM[1] + "&chapter_id=" + chM[1]);
    const info = (data && data.chapterInfo) || {};
    const pages = info.page_url || [];
    if (pages.length === 0) throw new Error("再漫画：本话无图片");
    return pages;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "再漫画网址（换域名时改这里）",
        "value": "https://manhua.zaimanhua.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
