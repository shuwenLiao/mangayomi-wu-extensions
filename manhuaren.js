const mangayomiSources = [{
  "name": "漫画人",
  "lang": "zh",
  "baseUrl": "https://www.manhuaren.com",
  "apiUrl": "",
  "iconUrl": "https://www.manhuaren.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "manhuaren.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.manhuaren.com";
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

  async load(url) {
    const res = await new Client().get(url, this.headers());
    const code = Number(res.statusCode || 200);
    if (code === 404 || code === 410) throw new Error("漫画人：页面不存在（HTTP " + code + "）：" + url);
    if (code >= 400) throw new Error("漫画人：网站返回 HTTP " + code + "：" + url);
    return res.body || "";
  }

  // ---------- Dean Edwards packer 解包（章节页 newImgs / DM5 ashx 都是这种 packed JS，不用 eval） ----------
  _unpackPacked(packed) {
    const m = packed.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\),0,\{\}\)\)/);
    if (!m) return null;
    let p = m[1];
    const a = Number(m[2]);
    const k = m[4].split("|");
    const dict = {};
    let n = Number(m[3]);
    const enc = function (c) {
      return (c < a ? "" : enc(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    };
    while (n--) dict[enc(n)] = k[n] || enc(n);
    p = p.replace(/\b\w+\b/g, function (w) {
      return dict[w] !== undefined ? dict[w] : w;
    });
    return p;
  }

  _unpackFirstWith(html, needle) {
    const re = /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('[\s\S]*?',\d+,\d+,'[\s\S]*?'\.split\('\|'\),0,\{\}\)\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const unpacked = this._unpackPacked(m[0]);
      if (unpacked && unpacked.indexOf(needle) >= 0) return unpacked;
    }
    return null;
  }

  // ---------- 列表解析：搜索页 book-list ----------
  parseSearchItems(html) {
    const items = [];
    const seen = {};
    const re = /<a href="(\/manhua-[^"]+\/)"[^>]*>\s*<img class="book-list-cover-img" src="([^"]+)"[^>]*alt="([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = this.fullUrl(m[1]);
      if (seen[link]) continue;
      seen[link] = true;
      const name = (m[3] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: this.fullUrl(m[2] || ""), link: link });
    }
    return items;
  }

  // ---------- 榜单页 rankList_N ----------
  parseRankItems(html, listId) {
    const sec = html.match(new RegExp('<ul class="rank-list" id="' + listId + '"([\\s\\S]*?)</ul>'));
    if (!sec) return [];
    const items = [];
    const seen = {};
    const re = /<a href="(\/manhua-[^"]+\/)" title="([^"]*)">[\s\S]{0,400}?<img class="rank-list-cover-img" src="([^"]+)"/g;
    let m;
    while ((m = re.exec(sec[1])) !== null) {
      const link = this.fullUrl(m[1]);
      if (seen[link]) continue;
      seen[link] = true;
      const name = (m[2] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: this.fullUrl(m[3] || ""), link: link });
    }
    return items;
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/manhua-rank/");
    return { list: this.parseRankItems(html, "rankList_1"), hasNextPage: false };
  }

  async getLatestUpdates(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/manhua-rank/");
    return { list: this.parseRankItems(html, "rankList_2"), hasNextPage: false };
  }

  async search(query, page, filters) {
    const url = this.getBaseUrl() + "/search?title=" + encodeURIComponent(query) + "&page=" + page;
    const html = await this.load(url);
    const items = this.parseSearchItems(html);
    return { list: items, hasNextPage: items.length >= 20 };
  }

  async getDetail(url) {
    const html = await this.load(url);
    const nameM = html.match(/<p class="detail-main-info-title">([^<]+)<\/p>/);
    const name = nameM ? nameM[1].trim() : "";
    const coverM = html.match(/<div class="detail-main-cover"><img src="([^"]+)"/);
    const imageUrl = coverM ? this.fullUrl(coverM[1]) : "";
    const authorM = html.match(/<p class="detail-main-info-author">作者：<a[^>]*>([^<]+)<\/a>/);
    const author = authorM ? authorM[1].trim() : "";
    const descM = html.match(/<p class="detail-desc">([\s\S]*?)<\/p>/);
    let description = descM ? descM[1].replace(/<[^>]+>/g, "").trim() : "";
    const genre = [];
    const classM = html.match(/<p class="detail-main-info-class">([\s\S]*?)<\/p>/);
    if (classM) {
      const gm = classM[1].match(/<a>([^<]+)<\/a>/g) || [];
      for (let i = 0; i < gm.length; i++) {
        const g = gm[i].replace(/<\/?a>/g, "").trim();
        if (g && genre.indexOf(g) < 0) genre.push(g);
      }
    }
    let status = 3;
    const stM = html.match(/<span class="detail-list-title-1">([^<]+)<\/span>/);
    if (stM) {
      if (stM[1].indexOf("已完结") >= 0) status = 1;
      else if (stM[1].indexOf("连载") >= 0) status = 0;
    }
    const episodes = [];
    const seen = {};
    const re = /<a href="(\/m\d+\/)"[^>]*class="chapteritem"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const epUrl = this.fullUrl(m[1]);
      if (seen[epUrl]) continue;
      seen[epUrl] = true;
      const t = (m[2] || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      episodes.push({ name: t, url: epUrl, dateUpload: null, scanlator: null });
    }
    if (episodes.length === 0) throw new Error("漫画人：找不到章节目录");
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
    const html = await this.load(chapterUrl);
    const unpacked = this._unpackFirstWith(html, "newImgs");
    if (!unpacked) throw new Error("漫画人：章节页找不到图片数据（newImgs）");
    const arrM = unpacked.match(/newImgs\s*=\s*\[([\s\S]*?)\]/);
    if (!arrM) throw new Error("漫画人：newImgs 解析失败");
    const urls = arrM[1].match(/https?:\/\/[^\s'"\\]+/g) || [];
    const out = [];
    const seen = {};
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i].replace(/\\$/, "");
      if (!seen[u]) { seen[u] = true; out.push(u); }
    }
    if (out.length === 0) throw new Error("漫画人：本话无图片");
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
        "summary": "漫画人网址（换域名时改这里）",
        "value": "https://www.manhuaren.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
