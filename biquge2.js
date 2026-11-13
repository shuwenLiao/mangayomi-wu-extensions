const mangayomiSources = [{
  "name": "笔趣阁TW",
  "lang": "zh",
  "baseUrl": "https://www.biquge.com.tw",
  "apiUrl": "",
  "iconUrl": "https://www.biquge.com.tw/favicon.ico",
  "typeSource": "single",
  "itemType": 2,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "biquge2.js"
}];

class DefaultExtension extends MProvider {
  _b64decode(b64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const map = {};
    for (let i = 0; i < chars.length; i++) map[chars[i]] = i;
    const bytes = [];
    let acc = 0, nbits = 0;
    for (let i = 0; i < b64.length; i++) {
      const c = b64[i];
      if (c === "=") break;
      const v = map[c];
      if (v === undefined) continue;
      acc = (acc << 6) | v;
      nbits += 6;
      if (nbits >= 8) {
        nbits -= 8;
        bytes.push((acc >> nbits) & 0xFF);
      }
    }
    return bytes;
  }

  // base64 -> UTF-8 字符串（章节正文是 base64 包起来的 <p> 段落）
  _b64ToUtf8(b64) {
    const bytes = this._b64decode(b64);
    let out = "";
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i];
      if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
      else if ((b & 0xE0) === 0xC0) { out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F)); i += 2; }
      else if ((b & 0xF0) === 0xE0) { out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F)); i += 3; }
      else if ((b & 0xF8) === 0xF0) {
        const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
        const v = cp - 0x10000;
        out += String.fromCharCode(0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF));
        i += 4;
      } else { i += 1; }
    }
    return out;
  }

  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.biquge.com.tw";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  headers(form) {
    const h = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
      "Referer": this.getBaseUrl() + "/",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
    if (form) h["Content-Type"] = "application/x-www-form-urlencoded";
    return h;
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.getBaseUrl() + url;
    return this.getBaseUrl() + "/" + url;
  }

  async load(url, postBody) {
    let res;
    if (postBody) {
      res = await new Client().post(url, this.headers(true), postBody);
    } else {
      res = await new Client().get(url, this.headers(false));
    }
    const code = Number(res.statusCode || 200);
    if (code === 404 || code === 410) throw new Error("笔趣阁TW：页面不存在（HTTP " + code + "）：" + url);
    if (code >= 400) throw new Error("笔趣阁TW：网站返回 HTTP " + code + "：" + url);
    return res.body || "";
  }

  parseHomeItems(html) {
    const items = [];
    const seen = {};
    const re = /<dl class="rec-focus-book">[\s\S]*?<a href="(\/[^"]+\/)"><img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>[\s\S]*?<h2><a href="[^"]+">([^<]+)<\/a><\/h2>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = this.fullUrl(m[1]);
      if (seen[link]) continue;
      seen[link] = true;
      const name = (m[4] || m[3] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: this.fullUrl(m[2] || ""), link: link });
    }
    return { list: items, hasNextPage: false };
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/");
    return this.parseHomeItems(html);
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/search.html", "s=" + encodeURIComponent(query));
    const items = [];
    const seen = {};
    const re = /<span class="s2"><a href="(\/[^"]+\/)">([^<]+)<\/a><\/span>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = this.fullUrl(m[1]);
      if (seen[link]) continue;
      seen[link] = true;
      const name = (m[2] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: "", link: link });
    }
    return { list: items, hasNextPage: false };
  }

  og(html, prop) {
    const m = html.match(new RegExp('<meta property="og:' + prop + '" content="([^"]*)"', 'i'));
    return m ? m[1].trim() : "";
  }

  async getDetail(url) {
    const html = await this.load(url);
    const name = this.og(html, "novel:book_name") || (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || ["", ""])[1].trim();
    const author = this.og(html, "novel:author");
    const description = this.og(html, "description");
    const imageUrl = this.fullUrl(this.og(html, "image"));
    const genreText = this.og(html, "novel:category");
    const statusText = this.og(html, "novel:status");
    const status = statusText === "完本" ? 1 : (statusText === "连载中" ? 0 : 3);
    const genre = genreText ? [genreText] : [];
    // 章节目录在 /ml1.html、/ml2.html…… 每页约 100 章，跟“下一页”走到头
    const chapters = [];
    const seen = {};
    const slug = url.replace(/\/$/, "").split("/").pop();
    let dirPage = 1;
    while (dirPage <= 40) {
      const dirUrl = url.replace(/\/$/, "") + "/ml" + dirPage + ".html";
      let dirHtml;
      try { dirHtml = await this.load(dirUrl); }
      catch (e) { break; }
      const re = new RegExp('<a href="(/' + slug + '/[^"]+\\.html)"[^>]*>([^<]+?)(?:<[^>]+>)*</a>', 'g');
      let m, found = 0;
      while ((m = re.exec(dirHtml)) !== null) {
        const href = m[1];
        if (/^\/[^/]+\/ml\d+\.html$/.test(href)) continue;
        const title = (m[2] || "").trim();
        if (!/第.+章/.test(title)) continue;
        if (title.indexOf("开始阅读") >= 0 || title.indexOf("切换") >= 0 || title.indexOf("查看更多") >= 0) continue;
        const chapterUrl = this.fullUrl(href);
        if (seen[chapterUrl]) continue;
        seen[chapterUrl] = true;
        // 目录里标题带全局序号（“1 第1章 绯红”），去掉前面的数字方便阅读
        const clean = title.replace(/^\d+\s+/, "");
        chapters.push({ name: clean, url: chapterUrl, dateUpload: null, scanlator: null });
        found++;
      }
      if (found === 0) break;
      if (!/下一页/.test(dirHtml)) break;
      dirPage++;
    }
    if (chapters.length === 0) throw new Error("笔趣阁TW：找不到章节目录");
    return {
      name: name,
      link: url,
      imageUrl: imageUrl,
      description: description,
      author: author,
      artist: "",
      genre: genre,
      status: status,
      chapters: chapters
    };
  }

  // 从一页正文里把 base64 段落解出来（函数名会变，只认 writeln 里的 base64 串）
  decodePageText(html) {
    const txtM = html.match(/<div class="txt"[^>]*>([\s\S]*?)<\/div>/);
    const scope = txtM ? txtM[1] : html;
    const parts = [];
    const re = /'([A-Za-z0-9+/=]{20,})'/g;
    let m;
    while ((m = re.exec(scope)) !== null) {
      const s = m[1];
      if (s.length % 4 !== 0) continue;
      let decoded;
      try { decoded = this._b64ToUtf8(s); } catch (e) { continue; }
      if (decoded.indexOf("<p>") === 0 || decoded.indexOf("<p ") === 0) {
        parts.push(decoded);
      }
    }
    return parts.join("\n");
  }

  chapterKeyFromH1(html) {
    const m = html.match(/<h1[^>]*>([^<]*)<\/h1>/);
    if (!m) return "";
    // “1 第1章 绯红（第1页）” -> “第1章 绯红”
    return m[1].replace(/^\d+\s+/, "").replace(/（第\d+页）/, "").trim();
  }

  async getHtmlContent(name, url) {
    const firstHtml = await this.load(url);
    const key = this.chapterKeyFromH1(firstHtml);
    const parts = [this.decodePageText(firstHtml)];
    // 长章节会分多页：slug_1.html、slug_2.html…… 直到标题不再是同一章
    const base = url.replace(/\.html(?:[?#].*)?$/, "");
    for (let n = 1; n <= 8; n++) {
      const nextUrl = base + "_" + n + ".html";
      let nextHtml;
      try { nextHtml = await this.load(nextUrl); }
      catch (e) { break; }
      if (key && this.chapterKeyFromH1(nextHtml) !== key) break;
      const text = this.decodePageText(nextHtml);
      if (!text.trim()) break;
      parts.push(text);
    }
    const content = parts.join("\n").trim();
    if (!content.replace(/<[^>]*>/g, "").trim()) throw new Error("笔趣阁TW：正文为空");
    return content;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "笔趣阁TW网址（换域名时改这里）",
        "value": "https://www.biquge.com.tw",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
