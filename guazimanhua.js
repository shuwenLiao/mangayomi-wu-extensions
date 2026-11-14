const mangayomiSources = [{
  "name": "瓜子漫画",
  "lang": "zh",
  "baseUrl": "https://www.guazimanhua.com",
  "apiUrl": "",
  "iconUrl": "https://www.guazimanhua.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "guazimanhua.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.guazimanhua.com";
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
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
  }

  async load(url) {
    const res = await new Client().get(url, this.headers());
    const code = Number(res.statusCode || 200);
    if (code === 404 || code === 410) throw new Error("瓜子漫画：页面不存在（HTTP " + code + "）：" + url);
    if (code >= 400) throw new Error("瓜子漫画：网站返回 HTTP " + code + "：" + url);
    return res.body || "";
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.getBaseUrl() + url;
    return this.getBaseUrl() + "/" + url;
  }

  decodeEntities(s) {
    return (s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }

  // 分类/搜索页的作品卡片：<article class="card"><a class="cover-wrap" href="/comic.php?id=..">
  // <img class="cover" src=".."><h3><a href="..">标题</a></h3>
  parseCards(html) {
    const items = [];
    const seen = {};
    const re = /<article class="card">[\s\S]*?<a class="cover-wrap" href="([^"]+)"[\s\S]*?<img class="cover"[^>]*src="([^"]+)"[^>]*>[\s\S]*?<h3><a[^>]*>([^<]+)<\/a><\/h3>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = this.fullUrl(this.decodeEntities(m[1]));
      if (seen[link]) continue;
      seen[link] = true;
      const name = this.decodeEntities(m[3] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: this.decodeEntities(m[2] || ""), link: link });
    }
    return items;
  }

  hasNextCategoryPage(html, page) {
    return html.indexOf("page=" + (page + 1)) >= 0;
  }

  async getPopular(page) {
    const html = await this.load(this.getBaseUrl() + "/category.php?sort=hits&page=" + page);
    return { list: this.parseCards(html), hasNextPage: this.hasNextCategoryPage(html, page) };
  }

  async getLatestUpdates(page) {
    const html = await this.load(this.getBaseUrl() + "/category.php?sort=update&page=" + page);
    return { list: this.parseCards(html), hasNextPage: this.hasNextCategoryPage(html, page) };
  }

  async search(query, page, filters) {
    const html = await this.load(this.getBaseUrl() + "/category.php?keyword=" + encodeURIComponent(query) + "&page=" + page);
    return { list: this.parseCards(html), hasNextPage: this.hasNextCategoryPage(html, page) };
  }

  // 详情页嵌的 JSON-LD：ComicStory（标题/作者/封面/简介）+ ItemList（章节目录：url + name）
  parseJsonLd(html) {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }

  async getDetail(url) {
    const html = await this.load(url);
    let name = "", author = "", imageUrl = "", description = "";
    let episodes = [];
    const ld = this.parseJsonLd(html);
    if (ld && ld["@graph"]) {
      for (const node of ld["@graph"]) {
        if (node["@type"] === "ComicStory") {
          name = node.name || "";
          author = (node.author && node.author.name) || "";
          imageUrl = node.image || "";
          description = node.description || "";
        }
        if (node["@type"] === "ItemList" && Array.isArray(node.itemListElement)) {
          for (const it of node.itemListElement) {
            if (!it.url || !it.name) continue;
            episodes.push({ name: String(it.name).trim(), url: String(it.url), dateUpload: null, scanlator: null });
          }
        }
      }
    }
    if (!name) {
      const hm = html.match(/<h1[^>]*>([^<]+)<\/h1>/) || html.match(/<div class="mobile-comic-title">([^<]+)<\/div>/);
      name = hm ? hm[1].trim() : "";
    }
    if (!author) {
      const am = html.match(/作者：<a[^>]*>([^<]+)<\/a>/);
      author = am ? am[1].trim() : "";
    }
    if (!description) {
      const dm = html.match(/<p class="mobile-comic-desc">([\s\S]*?)<\/p>/);
      description = dm ? dm[1].replace(/<[^>]+>/g, "").trim() : "";
    }
    if (!imageUrl) {
      const im = html.match(/<meta property="og:image" content="([^"]+)"/);
      imageUrl = im ? im[1] : "";
    }
    if (episodes.length === 0) {
      // 兜底：直接解析章节链接 <a href="/chapter.php?id=.."><span>标题</span>
      const seen = {};
      const re = /<a[^>]*href="(\/chapter\.php\?id=\d+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const title = m[2].replace(/<[^>]+>/g, "").replace(/阅读/g, "").trim();
        if (!title || title === "开始阅读") continue;
        const link = this.fullUrl(m[1]);
        if (seen[link]) continue;
        seen[link] = true;
        episodes.push({ name: title, url: link, dateUpload: null, scanlator: null });
      }
    }
    if (episodes.length === 0) throw new Error("瓜子漫画：找不到章节目录");
    let status = 3;
    const metaM = html.match(/<p class="mobile-comic-meta">([^<]*)<\/p>/);
    const metaText = metaM ? metaM[1] : html;
    if (/完结/.test(metaText)) status = 1;
    else if (/连载/.test(metaText)) status = 0;
    return {
      name: name,
      link: url,
      imageUrl: imageUrl,
      description: description,
      author: author,
      artist: "",
      genre: [],
      status: status,
      chapters: episodes,
      episodes: episodes
    };
  }

  async getPageList(chapterUrl) {
    const html = await this.load(chapterUrl);
    const imgs = [];
    // 章节页图片：<img class="reading-image ..." src="https://img.guazicdn.com/...webp">
    const re = /<img[^>]*class="[^"]*reading-image[^"]*"[^>]*src="([^"]+)"[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const src = this.decodeEntities(m[1]);
      if (src) imgs.push(src);
    }
    if (imgs.length === 0) {
      // 兜底：class 在 src 之后的写法
      const re2 = /<img[^>]*src="([^"]+)"[^>]*class="[^"]*reading-image[^"]*"[^>]*>/g;
      while ((m = re2.exec(html)) !== null) {
        const src = this.decodeEntities(m[1]);
        if (src) imgs.push(src);
      }
    }
    if (imgs.length === 0) throw new Error("瓜子漫画：章节没有图片");
    return imgs;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "瓜子漫画网址（换域名时改这里）",
        "value": "https://www.guazimanhua.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
