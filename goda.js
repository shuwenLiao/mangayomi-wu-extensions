const mangayomiSources = [{
  "name": "GoDa漫画",
  "lang": "zh",
  "baseUrl": "https://godamh.com",
  "apiUrl": "https://v2.apikk.top",
  "iconUrl": "https://godamh.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "goda.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://godamh.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  getApiHost() {
    const preference = new SharedPreferences();
    var api_host = preference.get("api_host");
    if (!api_host) {
      api_host = "https://v2.apikk.top";
    }
    if (api_host.endsWith("/")) {
      return api_host.slice(0, -1);
    }
    return api_host;
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

  // Mangayomi 用它取图片请求头（图片 CDN 有防盗链/Cloudflare 检查）
  getHeaders(url) {
    return this.headers(false);
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.getBaseUrl() + url;
    return this.getBaseUrl() + "/" + url;
  }

  async load(url) {
    const res = await new Client().get(url, this.headers(false));
    const code = Number(res.statusCode || 200);
    if (code === 404 || code === 410) throw new Error("GoDa漫画：页面不存在（HTTP " + code + "）：" + url);
    if (code >= 400) throw new Error("GoDa漫画：网站返回 HTTP " + code + "：" + url);
    return res.body || "";
  }

  async loadJson(url) {
    const text = await this.load(url);
    return JSON.parse(text);
  }

  // 列表页卡片：<a href="/manga/<slug>">…<img src="<cover>">…<h3 class="cardtitle">标题</h3>
  parseList(html) {
    const items = [];
    const seen = {};
    const re = /<a href="\/manga\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      const link = this.getBaseUrl() + "/manga/" + slug;
      if (seen[link]) continue;
      seen[link] = true;
      const name = (m[3] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: this.fullUrl((m[2] || "").trim()), link: link });
    }
    return items;
  }

  hasNextListPage(html, kind, page) {
    if (page >= 100) return false;
    return html.indexOf("/" + kind + "/page/" + (page + 1) + '"') >= 0;
  }

  async getPopular(page) {
    const html = await this.load(this.getBaseUrl() + "/hots/page/" + page);
    const list = this.parseList(html);
    return { list: list, hasNextPage: this.hasNextListPage(html, "hots", page) };
  }

  async getLatestUpdates(page) {
    const html = await this.load(this.getBaseUrl() + "/dayup/page/" + page);
    const list = this.parseList(html);
    return { list: list, hasNextPage: this.hasNextListPage(html, "dayup", page) };
  }

  async search(query, page, filters) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/s/" + encodeURIComponent(query));
    const list = this.parseList(html);
    return { list: list, hasNextPage: false };
  }

  og(html, prop) {
    const m = html.match(new RegExp('<meta property="og:' + prop + '" content="([^"]*)"', 'i'));
    return m ? m[1].trim() : "";
  }

  async getDetail(url) {
    const html = await this.load(url);
    const midM = html.match(/data-mid="(\d+)"/);
    if (!midM) throw new Error("GoDa漫画：详情页找不到作品 ID");
    const mid = midM[1];
    const apiHostM = html.match(/data-api-host="([^"]+)"/);
    const apiHost = apiHostM ? apiHostM[1].replace(/\/$/, "") : this.getApiHost();
    const name = (this.og(html, "title") || "").replace(/\s*[-－—|].*$/, "").trim()
      || (html.match(/<title>([^<]+)<\/title>/) || ["", ""])[1].replace(/\s*[-－—|].*$/, "").trim();
    const imageUrl = this.fullUrl(this.og(html, "image"));
    const authorM = html.match(/作者：[\s\S]{0,300}?<span>\s*([^<]+?)\s*<\/span>/);
    const author = authorM ? authorM[1].trim() : "";
    const genre = [];
    const genreRe = /href="\/manga-genre\/[^"]*"[^>]*>(?:\s*<span[^>]*>)?\s*([^<]+?)\s*(?:<\/span>)?\s*<\/a>/g;
    let gm;
    while ((gm = genreRe.exec(html)) !== null) {
      const g = gm[1].trim();
      if (g && genre.indexOf(g) < 0) genre.push(g);
    }
    const tagRe = /href="\/manga-tag\/[^"]*"[^>]*>(?:\s*<span[^>]*>)?\s*#?([^<]+?)\s*(?:<\/span>)?\s*<\/a>/g;
    while ((gm = tagRe.exec(html)) !== null) {
      const g = gm[1].trim();
      if (g && genre.indexOf(g) < 0) genre.push(g);
    }
    let status = 3;
    if (/已完結/.test(html)) status = 1;
    else if (/連載中/.test(html)) status = 0;
    let description = this.og(html, "description");
    // 章节走官方 API：/api/v2/manga/get?mid=<mid>&mode=all
    const data = await this.loadJson(apiHost + "/api/v2/manga/get?mid=" + encodeURIComponent(mid) + "&mode=all");
    if (!data || !data.status || !data.data) throw new Error("GoDa漫画：章节接口返回异常");
    const info = data.data;
    if (info.desc) description = info.desc;
    // 详情页 og:title 已可用；API 的 title 仅作一致性参考，不覆盖
    if (info.status === "1" || info.status === 1) status = 1;
    else if (info.status === "0" || info.status === 0) status = 0;
    const chapters = [];
    const list = Array.isArray(info.chapters) ? info.chapters : [];
    for (let i = 0; i < list.length; i++) {
      const ch = list[i];
      if (!ch || !ch.id || !ch.attributes) continue;
      const title = (ch.attributes.title || "").trim() || ("第" + (ch.attributes.order || (i + 1)) + "话");
      let dateUpload = null;
      if (ch.attributes.updatedAt) {
        const ts = Date.parse(ch.attributes.updatedAt);
        if (!isNaN(ts)) dateUpload = String(ts);
      }
      chapters.push({ name: title, url: mid + "|" + ch.id, dateUpload: dateUpload, scanlator: null });
    }
    if (chapters.length === 0) throw new Error("GoDa漫画：找不到章节目录");
    return {
      name: name,
      link: url,
      imageUrl: imageUrl,
      description: description,
      author: author,
      artist: "",
      genre: genre,
      status: status,
      episodes: chapters
    };
  }

  // ---- 章节图片解码 ----
  // 章节图片密文格式（见 /api/v2/chapter/getinfo 返回的 data.info.images.images）：
  // "J7r" + body + "nQ"；body = head + "kD" + mid + "W4s" + tail，
  // 其中 head/tail/mid 拼起来后按 7 字符分块、奇数块反转，再做一次换表，最后是 base64url 的 JSON。
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

  _unchunk(s) {
    let out = "";
    let j = 0;
    for (let i = 0; i < s.length; i += 7, j++) {
      const chunk = s.slice(i, i + 7);
      out += (j % 2) ? chunk.split("").reverse().join("") : chunk;
    }
    return out;
  }

  _substitute(s) {
    const src = "_-9876543210abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const dst = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let out = "";
    for (let k = 0; k < s.length; k++) {
      const idx = src.indexOf(s[k]);
      if (idx < 0) throw new Error("GoDa漫画：章节图片解码失败（非法字符）");
      out += dst[idx];
    }
    return out;
  }

  _b64urlDecode(s) {
    let t = s.replace(/-/g, "+").replace(/_/g, "/");
    while (t.length % 4) t += "=";
    return this._b64ToUtf8(t);
  }

  decodeChapterImages(blob) {
    if (typeof blob !== "string" || blob.indexOf("J7r") !== 0 || blob.slice(-2) !== "nQ")
      throw new Error("GoDa漫画：章节图片数据格式不对");
    const body = blob.slice(3, -2);
    const n = body.length - 2 - 3; // 减 "kD" 与 "W4s"
    if (n <= 0) throw new Error("GoDa漫画：章节图片数据过短");
    const count = Math.floor(n / 3);
    const off = Math.floor((n - count) / 2);
    const rem = (n - count) - off;
    const head = body.slice(0, off);
    if (body.slice(off, off + 2) !== "kD") throw new Error("GoDa漫画：章节图片校验失败");
    const mid = body.slice(off + 2, off + 2 + rem);
    if (body.slice(off + 2 + rem, off + 2 + rem + 3) !== "W4s") throw new Error("GoDa漫画：章节图片校验失败");
    const tail = body.slice(off + 2 + rem + 3);
    if (tail.length !== count) throw new Error("GoDa漫画：章节图片校验失败");
    const text = this._b64urlDecode(this._substitute(this._unchunk(tail + head + mid)));
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("GoDa漫画：章节图片解码结果不是数组");
    return arr;
  }

  async getPageList(chapterUrl) {
    const parts = (chapterUrl || "").split("|");
    if (parts.length < 2) throw new Error("GoDa漫画：章节链接格式不对");
    const mid = parts[0];
    const cid = parts[1];
    const data = await this.loadJson(this.getApiHost() + "/api/v2/chapter/getinfo?m=" + encodeURIComponent(mid) + "&c=" + encodeURIComponent(cid));
    if (!data || !data.status || !data.data || !data.data.info || !data.data.info.images)
      throw new Error("GoDa漫画：章节图片接口返回异常");
    const images = data.data.info.images;
    const arr = this.decodeChapterImages(images.images);
    const host = images.line === 2 ? "https://c-nd2-1.6wm.top" : "https://c-nd3-1.6wm.top";
    arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    const urls = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].url) urls.push(host + arr[i].url);
    }
    if (urls.length === 0) throw new Error("GoDa漫画：本章没有图片");
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
        "summary": "GoDa漫画网址（换域名时改这里）",
        "value": "https://godamh.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }, {
      "key": "api_host",
      "editTextPreference": {
        "title": "Api Host",
        "summary": "GoDa漫画章节 API 地址",
        "value": "https://v2.apikk.top",
        "dialogTitle": "Api Host",
        "dialogMessage": ""
      }
    }];
  }
}
