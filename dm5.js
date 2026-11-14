const mangayomiSources = [{
  "name": "动漫屋",
  "lang": "zh",
  "baseUrl": "https://www.dm5.com",
  "apiUrl": "",
  "iconUrl": "https://www.dm5.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "dm5.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.dm5.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  headers(referer) {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Referer": referer || (this.getBaseUrl() + "/"),
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

  async load(url, referer) {
    const res = await new Client().get(url, this.headers(referer));
    const code = Number(res.statusCode || 200);
    if (code === 404 || code === 410) throw new Error("动漫屋：页面不存在（HTTP " + code + "）：" + url);
    if (code >= 400) throw new Error("动漫屋：网站返回 HTTP " + code + "：" + url);
    return res.body || "";
  }

  // ---------- Dean Edwards packer 解包（chapterfun.ashx 返回 packed JS，不用 eval） ----------
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

  // ---------- 列表解析：mh-cover 封面 + 标题链接按顺序配对 ----------
  parseMhItems(html) {
    const items = [];
    const seen = {};
    const re = /class="mh-cover[^"]*"[^>]*style="background-image:\s*url\(([^)]+)\)"[\s\S]{0,800}?<a href="(\/manhua-[^"]+\/)" title="([^"]*)">/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = this.fullUrl(m[2]);
      if (seen[link]) continue;
      seen[link] = true;
      const name = (m[3] || "").trim();
      if (!name) continue;
      items.push({ name: name, imageUrl: this.fullUrl(m[1] || ""), link: link });
    }
    return items;
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/manhua-rank/");
    return { list: this.parseMhItems(html), hasNextPage: false };
  }

  async getLatestUpdates(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/manhua-new/");
    return { list: this.parseMhItems(html), hasNextPage: false };
  }

  async search(query, page, filters) {
    const url = this.getBaseUrl() + "/search?title=" + encodeURIComponent(query) + "&language=1&page=" + page;
    const html = await this.load(url);
    const items = this.parseMhItems(html);
    return { list: items, hasNextPage: html.indexOf("page=" + (page + 1)) >= 0 };
  }

  meta(html, name) {
    const m = html.match(new RegExp('<meta content="([^"]*)" name="' + name + '"', 'i'));
    return m ? m[1].trim() : "";
  }

  async getDetail(url) {
    const html = await this.load(url);
    const nameM = html.match(/<p class="title">\s*([^<]+?)\s*<span/);
    let name = nameM ? nameM[1].replace(/\s+/g, " ").trim() : "";
    if (!name) {
      const t = (html.match(/<title>([^<]*)<\/title>/) || ["", ""])[1];
      name = t.split("漫画")[0].trim();
    }
    const coverM = html.match(/<img[^>]*src="(https:\/\/mhfm[^"]+)"/);
    const imageUrl = coverM ? coverM[1] : "";
    const authorM = html.match(/作者：<a[^>]*>([^<]+)<\/a>/);
    const author = authorM ? authorM[1].trim() : "";
    let description = this.meta(html, "Description");
    const di = description.indexOf("漫画简介：");
    if (di >= 0) description = description.slice(di + 5).trim();
    const genre = [];
    const themeM = html.match(/题材：([\s\S]{0,800})/);
    if (themeM) {
      const gm = themeM[1].match(/<span>([^<]+)<\/span>/g) || [];
      for (let i = 0; i < gm.length; i++) {
        const g = gm[i].replace(/<\/?span>/g, "").trim();
        if (g && genre.indexOf(g) < 0) genre.push(g);
      }
    }
    let status = 3;
    const stM = html.match(/状态：<span>([^<]+)<\/span>/);
    if (stM) {
      if (stM[1].indexOf("已完结") >= 0) status = 1;
      else if (stM[1].indexOf("连载") >= 0) status = 0;
    }
    const episodes = [];
    const seen = {};
    const secRe = /<ul[^>]*detail-list-select[^>]*>([\s\S]*?)<\/ul>/g;
    let sec;
    while ((sec = secRe.exec(html)) !== null) {
      const re = /<a href="(\/m\d+\/)"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(sec[1])) !== null) {
        const epUrl = this.fullUrl(m[1]);
        if (seen[epUrl]) continue;
        seen[epUrl] = true;
        const t = (m[2] || "").replace(/<[^>]+>/g, "").replace(/（\d+P）/g, "").replace(/\s+/g, " ").trim();
        if (!t) continue;
        episodes.push({ name: t, url: epUrl, dateUpload: null, scanlator: null });
      }
    }
    if (episodes.length === 0) throw new Error("动漫屋：找不到章节目录");
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

  // chapterfun.ashx 每页返回 2 张图（DM5_PAGEPCOUNT）：pix + path + ?cid=&key=
  async _ashxPage(chapterUrl, cid, mid, dt, sign, pageNum) {
    const q = "cid=" + cid + "&page=" + pageNum + "&key=&language=1&gtk=6&_cid=" + cid +
      "&_mid=" + mid + "&_dt=" + encodeURIComponent(dt) + "&_sign=" + sign;
    const body = await this.load(chapterUrl + "chapterfun.ashx?" + q, chapterUrl);
    const unpacked = this._unpackPacked(body);
    if (!unpacked) return [];
    const pixM = unpacked.match(/pix\s*=\s*\\?"([^"\\]+)/);
    const keyM = unpacked.match(/var key\s*=\s*\\?'([^'\\]+)/);
    const pvM = unpacked.match(/pvalue\s*=\s*\[([^\]]*)\]/);
    if (!pixM || !pvM) return [];
    const pix = pixM[1];
    const key = keyM ? keyM[1] : "";
    const paths = pvM[1].match(/"([^"]+)"/g) || [];
    const out = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i].replace(/"/g, "");
      if (!p) continue;
      if (/^(https?:)?\/\//i.test(p)) { out.push(p); continue; }
      out.push(pix + p + "?cid=" + cid + "&key=" + key);
    }
    return out;
  }

  async getPageList(chapterUrl) {
    const html = await this.load(chapterUrl);
    const cidM = html.match(/var DM5_CID\s*=\s*(\d+)/);
    const midM = html.match(/var DM5_MID\s*=\s*(\d+)/);
    const signM = html.match(/var DM5_VIEWSIGN\s*=\s*"([^"]+)"/);
    const dtM = html.match(/var DM5_VIEWSIGN_DT\s*=\s*"([^"]+)"/);
    const countM = html.match(/var DM5_IMAGE_COUNT\s*=\s*(\d+)/);
    const perM = html.match(/var DM5_PAGEPCOUNT\s*=\s*(\d+)/);
    if (!cidM || !signM) throw new Error("动漫屋：章节页找不到 DM5_CID / VIEWSIGN");
    const cid = cidM[1];
    const mid = midM ? midM[1] : "";
    const sign = signM[1];
    const dt = dtM ? dtM[1] : "";
    const total = countM ? Number(countM[1]) : 0;
    const per = perM ? Number(perM[1]) : 2;
    const totalPages = total > 0 ? Math.ceil(total / per) : 1;
    const out = [];
    const seen = {};
    for (let p = 1; p <= Math.min(totalPages, 100); p++) {
      let imgs = [];
      try { imgs = await this._ashxPage(chapterUrl, cid, mid, dt, sign, p); }
      catch (e) { break; }
      if (imgs.length === 0) break;
      for (let i = 0; i < imgs.length; i++) {
        if (!seen[imgs[i]]) { seen[imgs[i]] = true; out.push(imgs[i]); }
      }
      if (total > 0 && out.length >= total) break;
    }
    if (out.length === 0) throw new Error("动漫屋：本话无图片");
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
        "summary": "动漫屋网址（换域名时改这里）",
        "value": "https://www.dm5.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
