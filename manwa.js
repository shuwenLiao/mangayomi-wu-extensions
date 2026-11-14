const mangayomiSources = [{
  "name": "漫蛙漫画",
  "lang": "zh",
  "baseUrl": "https://manwadz.cc",
  "apiUrl": "",
  "iconUrl": "https://manwadz.cc/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": true,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "manwa.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://manwadz.cc";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
      "Referer": this.getBaseUrl() + "/",
      "Accept": "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
  }

  async loadJson(url) {
    const res = await new Client().get(url, this.headers());
    const code = Number(res.statusCode || 200);
    if (code >= 400) throw new Error("漫蛙漫画：网站返回 HTTP " + code + "：" + url);
    const body = res.body || "";
    let j;
    try { j = JSON.parse(body); } catch (e) { throw new Error("漫蛙漫画：接口返回不是 JSON：" + url); }
    if (j.code !== undefined && Number(j.code) !== 200) throw new Error("漫蛙漫画：接口错误 " + j.code + " " + (j.msg || j.message || "") + "：" + url);
    return j.data;
  }

  comicLink(it) {
    if (it.url) return this.getBaseUrl() + it.url;
    if (it.id !== undefined && it.id !== null) return this.getBaseUrl() + "/comic/" + it.id;
    return "";
  }

  mapListItem(it) {
    return {
      name: (it.title || "").trim(),
      imageUrl: it.pic || it.cover || "",
      link: this.comicLink(it)
    };
  }

  async getPopular(page) {
    const data = await this.loadJson(this.getBaseUrl() + "/api/rank?page=" + page);
    const items = data.list || [];
    const list = items.map((it) => this.mapListItem(it)).filter((x) => x.name && x.link);
    const total = Number(data.total || 0);
    return { list: list, hasNextPage: total ? page * 20 < total : items.length > 0 };
  }

  async getLatestUpdates(page) {
    const data = await this.loadJson(this.getBaseUrl() + "/api/home?page=" + page);
    const items = data.comicList || [];
    const list = items.map((it) => this.mapListItem(it)).filter((x) => x.name && x.link);
    const total = Number(data.total || 0);
    return { list: list, hasNextPage: total ? page * 6 < total : items.length > 0 };
  }

  async search(query, page, filters) {
    const data = await this.loadJson(this.getBaseUrl() + "/api/search?keyword=" + encodeURIComponent(query) + "&page=" + page);
    const items = data.list || [];
    const list = items.map((it) => this.mapListItem(it)).filter((x) => x.name && x.link);
    const total = Number(data.total || 0);
    return { list: list, hasNextPage: total ? page * 20 < total : items.length > 0 };
  }

  comicIdFromUrl(url) {
    const m = url.match(/\/comic\/(\d+)/);
    if (!m) throw new Error("漫蛙漫画：详情链接里没有作品 id");
    return m[1];
  }

  async getDetail(url) {
    const id = this.comicIdFromUrl(url);
    const d = await this.loadJson(this.getBaseUrl() + "/api/comic/" + id);
    const tags = d.tags ? String(d.tags).split(",").map((t) => t.trim()).filter(Boolean) : [];
    // 注意：详情接口的 status 不是完结标志（实测：连载中的《一人之下》返回 1，
    // 标题带“完结”的作品反而返回 0），且详情里没有其他完结字段，故一律标未知
    const status = 3;
    const ch = await this.loadJson(this.getBaseUrl() + "/api/comic/" + id + "/chapters");
    const list = ch.list || [];
    const episodes = list.map((c) => ({
      name: (c.title || "").trim(),
      url: this.getBaseUrl() + "/api/comic/image/" + c.id,
      dateUpload: c.editTime ? Number(c.editTime) * 1000 : (c.createTime ? Number(c.createTime) * 1000 : null),
      scanlator: null
    })).filter((e) => e.name && e.url);
    if (episodes.length === 0) throw new Error("漫蛙漫画：找不到章节目录");
    return {
      name: (d.title || "").trim(),
      link: url,
      imageUrl: d.cover || "",
      description: d.intro || "",
      author: d.author || "",
      artist: "",
      genre: tags,
      status: status,
      chapters: episodes,
      episodes: episodes
    };
  }

  async getPageList(chapterUrl) {
    const data = await this.loadJson(chapterUrl);
    const images = data.images || [];
    const urls = images.map((im) => im.url || "").filter(Boolean);
    if (urls.length === 0) throw new Error("漫蛙漫画：章节没有图片");
    return urls;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "漫蛙漫画网址（换域名时改这里）",
        "value": "https://manwadz.cc",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
