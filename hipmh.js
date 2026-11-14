const mangayomiSources = [{
  "name": "嬉皮漫画",
  "lang": "zh",
  "baseUrl": "https://m.hipmh.com",
  "apiUrl": "",
  "iconUrl": "https://m.hipmh.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": true,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "hipmh.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://m.hipmh.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  // 站点 API 与图片 CDN（m.hipmh.com 首页/阅读器页面上 data-api-base-url / data-chapter-img-base 给出的地址）
  getApiBase() {
    return "https://hipapi1.s3file.top";
  }

  getCoverBase() {
    return "https://cover.s3imgs.top";
  }

  getImgBase() {
    return "https://hip-tx-1.s3imgs.top";
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
    if (code >= 400) throw new Error("嬉皮漫画：网站返回 HTTP " + code + "：" + url);
    const body = res.body || "";
    let j;
    try { j = JSON.parse(body); } catch (e) { throw new Error("嬉皮漫画：接口返回不是 JSON：" + url); }
    if (j.code !== undefined && Number(j.code) !== 200) throw new Error("嬉皮漫画：接口错误 " + j.code + " " + (j.message || "") + "：" + url);
    return j.data;
  }

  coverUrl(path) {
    if (!path) return "";
    if (path.indexOf("http") === 0) return path;
    return this.getCoverBase() + path;
  }

  mapListItem(it) {
    const mid = it.mid || it.id || "";
    const img = it.vertical_image_url || it.cover_image_url || "";
    return {
      name: (it.title || "").trim(),
      imageUrl: this.coverUrl(img),
      link: this.getBaseUrl() + "/works/" + mid
    };
  }

  async getPopular(page) {
    const data = await this.loadJson(this.getApiBase() + "/v1/mangas?sort=popularity&page=" + page);
    const items = data.items || [];
    const list = items.map((it) => this.mapListItem(it)).filter((x) => x.name);
    const totalPages = Number(data.total_pages || 0);
    return { list: list, hasNextPage: totalPages ? page < totalPages : items.length > 0 };
  }

  async getLatestUpdates(page) {
    const data = await this.loadJson(this.getApiBase() + "/v1/mangas?sort=updated&page=" + page);
    const items = data.items || [];
    const list = items.map((it) => this.mapListItem(it)).filter((x) => x.name);
    const totalPages = Number(data.total_pages || 0);
    return { list: list, hasNextPage: totalPages ? page < totalPages : items.length > 0 };
  }

  async search(query, page, filters) {
    const data = await this.loadJson(this.getApiBase() + "/v1/search?q=" + encodeURIComponent(query) + "&page=" + page);
    const items = data.data || [];
    const list = items.map((it) => this.mapListItem(it)).filter((x) => x.name);
    const totalPages = Number(data.total_pages || 0);
    return { list: list, hasNextPage: totalPages ? page < totalPages : items.length > 0 };
  }

  // base64url 编解码（只处理 ASCII 内容：hid 与章节图片 JSON 均为 ASCII/UTF-8 文本）
  _b64urlEncode(str) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < str.length; i += 3) {
      const b0 = str.charCodeAt(i) & 0xFF;
      const b1 = i + 1 < str.length ? str.charCodeAt(i + 1) & 0xFF : 0;
      const b2 = i + 2 < str.length ? str.charCodeAt(i + 2) & 0xFF : 0;
      out += chars[b0 >> 2];
      out += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
      if (i + 1 < str.length) out += chars[((b1 & 0x0F) << 2) | (b2 >> 6)];
      if (i + 2 < str.length) out += chars[b2 & 0x3F];
    }
    return out.replace(/\+/g, "-").replace(/\//g, "_");
  }

  _b64urlDecodeToStr(b64u) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let s = b64u.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bytes = [];
    let acc = 0, nbits = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "=") break;
      const v = chars.indexOf(c);
      if (v < 0) continue;
      acc = (acc << 6) | v;
      nbits += 6;
      if (nbits >= 8) { nbits -= 8; bytes.push((acc >> nbits) & 0xFF); }
    }
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

  // 详情页 URL /works/<mid>-<slug> 里取出接口用的 mid（base64url 编码的 "m:<数字id>"；
  // mid 本身是 base64url 串、理论上可含 "-"，所以逐段累加、解码校验 "m:<数字>" 来定位）
  _midFromUrl(url) {
    const slug = decodeURIComponent(url).split("/works/").pop().split("/")[0].split("?")[0].split("#")[0];
    if (!slug) throw new Error("嬉皮漫画：详情链接里没有作品 id");
    const parts = slug.split("-");
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      acc = acc ? acc + "-" + parts[i] : parts[i];
      let dec = "";
      try { dec = this._b64urlDecodeToStr(acc); } catch (e) { dec = ""; }
      if (/^m:\d+$/.test(dec)) return acc;
    }
    // 兜底：整个 slug 去掉标题段（第一个 "-" 之前）
    return parts[0];
  }

  // 章节列表接口给的是前端 hid（"m:<mid>-c:<cid>" 与 "<mid>:<章号>.00" 两段 base64url 以 "-" 连接），
  // 而 /v2/chapter 接口要的是 api hid（"c:<cid>" 与 "<mid>:<章号>.00" 两段）；据此换算
  _apiHidFromFrontendHid(hid, mid, chapterNumber) {
    const num = Number(chapterNumber);
    const tok2 = this._b64urlEncode(mid + ":" + (isNaN(num) ? String(chapterNumber) : num.toFixed(2)));
    let tok1 = "";
    if (hid.endsWith("-" + tok2)) {
      tok1 = hid.slice(0, hid.length - tok2.length - 1);
    } else {
      const cut = hid.lastIndexOf("-");
      if (cut <= 0) throw new Error("嬉皮漫画：章节 hid 格式异常");
      tok1 = hid.slice(0, cut);
    }
    const dec1 = this._b64urlDecodeToStr(tok1);
    const m = dec1.match(/-c:(\d+)$/);
    if (!m) throw new Error("嬉皮漫画：章节 hid 里没有章节 id");
    return this._b64urlEncode("c:" + m[1]) + "-" + tok2;
  }

  async getDetail(url) {
    const mid = this._midFromUrl(url);
    const d = await this.loadJson(this.getApiBase() + "/v1/manga?mid=" + encodeURIComponent(mid));
    const authors = (d.authors || []).map((a) => a.name).filter(Boolean);
    const genres = (d.genres || []).map((g) => g.name).filter(Boolean);
    const status = d.status === "completed" ? 1 : (d.status === "ongoing" ? 0 : 3);
    // 章节列表分页取全（每页 20 条，按章号升序排列）
    const chapters = [];
    let page = 1, totalPages = 1;
    while (page <= totalPages && page <= 200) {
      const ch = await this.loadJson(this.getApiBase() + "/v1/manga/chapters?mid=" + encodeURIComponent(mid) + "&page=" + page);
      totalPages = Number(ch.total_pages || 1);
      const items = ch.items || [];
      for (const it of items) {
        let apiHid = "";
        try { apiHid = this._apiHidFromFrontendHid(it.hid, String(d.id), it.chapter_number); } catch (e) { apiHid = ""; }
        chapters.push({
          name: (it.title || ("第" + it.chapter_number + "话")).trim(),
          url: apiHid ? this.getApiBase() + "/v2/chapter?hid=" + encodeURIComponent(apiHid) : "",
          dateUpload: it.created_at ? Date.parse(it.created_at) : null,
          scanlator: null,
          _num: Number(it.chapter_number)
        });
      }
      if (items.length === 0) break;
      page++;
    }
    chapters.sort((a, b) => (a._num || 0) - (b._num || 0));
    const episodes = chapters.map((c) => ({ name: c.name, url: c.url, dateUpload: c.dateUpload, scanlator: c.scanlator }));
    return {
      name: (d.title || "").trim(),
      link: url,
      imageUrl: this.coverUrl(d.vertical_image_url || d.cover_image_url || ""),
      description: d.description || "",
      author: authors.join("、"),
      artist: "",
      genre: genres,
      status: status,
      chapters: episodes,
      episodes: episodes
    };
  }

  // 阅读器 chapter-decoder.js 的解密流程（已用站方原版解码器在 3 个真实章节上逐字节比对一致）：
  // 密文 = "qM9" + <p3前段…> + "Z7"，中间按 L=(len-5)、n=floor(L/3)、off=ceil((L-n)/2)、seg=L-n-off
  // 切成 p1 + "Vx" + p2 + "pL0" + p3；拼接 p3+p1+p2；每 7 字符一块、奇数块反转；
  // 再按 LOOKUP 下标映射到标准 base64url 字母表，最后 base64url 解码得到图片路径 JSON
  decodeChapterImages(enc) {
    if (typeof enc !== "string" || enc.indexOf("qM9") < 0 || enc.slice(-2) !== "Z7") throw new Error("嬉皮漫画：章节图片数据格式异常");
    const sliced = enc.slice(3, -2);
    const L = sliced.length - 2 - 3;
    if (L < 0) throw new Error("嬉皮漫画：章节图片数据格式异常");
    const n = Math.floor(L / 3);
    const off = Math.ceil((L - n) / 2);
    const seg = L - n - off;
    const p1 = sliced.slice(0, off);
    const marker = sliced.slice(off, off + 2);
    const p2 = sliced.slice(off + 2, off + 2 + seg);
    const chk = sliced.slice(off + 2 + seg, off + 2 + seg + 3);
    const p3 = sliced.slice(off + 2 + seg + 3, off + 2 + seg + 3 + n);
    if (marker !== "Vx" || chk !== "pL0" || p3.length !== n) throw new Error("嬉皮漫画：章节图片数据校验失败");
    const joined = p3 + p1 + p2;
    let unscr = "";
    for (let i = 0, idx = 0; i < joined.length; i += 7, idx++) {
      const chunk = joined.slice(i, i + 7);
      unscr += (idx % 2) ? chunk.split("").reverse().join("") : chunk;
    }
    const LOOKUP = "_-9876543210abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let sub = "";
    for (let i = 0; i < unscr.length; i++) {
      const ix = LOOKUP.indexOf(unscr[i]);
      if (ix < 0) throw new Error("嬉皮漫画：章节图片数据含非法字符");
      sub += STD[ix];
    }
    const paths = JSON.parse(this._b64urlDecodeToStr(sub));
    if (!Array.isArray(paths)) throw new Error("嬉皮漫画：章节图片数据不是列表");
    return paths;
  }

  async getPageList(chapterUrl) {
    const data = await this.loadJson(chapterUrl);
    let paths;
    if (typeof data.images === "string") {
      paths = this.decodeChapterImages(data.images);
    } else if (Array.isArray(data.images)) {
      paths = data.images;
    } else {
      throw new Error("嬉皮漫画：章节没有图片数据");
    }
    const base = this.getImgBase();
    return paths.map((p) => {
      if (!p) return "";
      if (p.indexOf("http") === 0) return p;
      return base + (p.charAt(0) === "/" ? p : "/" + p);
    }).filter(Boolean);
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "嬉皮漫画网址（换域名时改这里）",
        "value": "https://m.hipmh.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
