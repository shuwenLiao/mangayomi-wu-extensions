const mangayomiSources = [{
  "name": "樱花动漫",
  "lang": "zh",
  "baseUrl": "https://www.yhdmg.com",
  "apiUrl": "",
  "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/zh.yhdm.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.4",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime/src/zh/yhdm.js"
}];

class DefaultExtension extends MProvider {
  // Guard against double-decoding: only decode when the string is still
  // Latin-1 garbled (all char codes <= 255). Decoded Chinese sits above 255.
  stringUTF8(text) {
    if (!text) return text;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 255) return text;
    }
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      bytes.push(text.charCodeAt(i));
    }
    var charCodes = [];
    var i = 0;
    while (i < bytes.length) {
      var byte1 = bytes[i];
      var charCode;
      if (byte1 < 0x80) {
        charCode = byte1;
        i += 1;
      } else if (byte1 < 0xE0) {
        var byte2 = bytes[i + 1];
        charCode = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
        i += 2;
      } else if (byte1 < 0xF0) {
        var byte2 = bytes[i + 1];
        var byte3 = bytes[i + 2];
        charCode = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
        i += 3;
      } else {
        var byte2 = bytes[i + 1];
        var byte3 = bytes[i + 2];
        var byte4 = bytes[i + 3];
        charCode = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
        i += 4;
      }
      charCodes.push(charCode);
    }
    return String.fromCharCode.apply(null, charCodes);
  }

  getBaseUrl() {
    try {
      const preference = new SharedPreferences();
      var base_url = preference.get("domain_url");
      if (base_url && base_url.length > 0) {
        if (base_url.endsWith("/")) return base_url.slice(0, -1);
        return base_url;
      }
    } catch (_) {}
    return "https://www.yhdmg.com";
  }

  fullUrl(path) {
    if (!path) return this.getBaseUrl();
    if (path.indexOf("http") === 0) return path;
    if (path.charAt(0) !== "/") path = "/" + path;
    return this.getBaseUrl() + path;
  }

  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Referer": this.getBaseUrl() + "/"
    };
  }

  // Parse a Maccms list page (homepage / type / new): div.vod-item blocks.
  // Cover lives in div.ewave-img-wrapper[data-original], NOT in an <img>.
  // The "latest" page instead uses li.new-item blocks (same cover/title/link).
  parseList(doc) {
    const items = [];
    const seen = {};
    const push = (name, img, link) => {
      if (!link || seen[link]) return;
      seen[link] = true;
      name = this.stringUTF8((name || "").trim());
      if (!name) return;
      if (img && img.indexOf("http") !== 0) img = this.fullUrl(img);
      items.push({ name: name, imageUrl: img || "", link: link });
    };
    let elements = doc.select("div.vod-item");
    for (const el of elements) {
      const a = el.selectFirst("h5.vod-item-title a");
      if (!a) continue;
      let img = "";
      const wrap = el.selectFirst("div.ewave-img-wrapper");
      if (wrap) img = wrap.attr("data-original") || wrap.attr("data-src") || "";
      if (!img) {
        const im = el.selectFirst("img");
        if (im) img = im.attr("data-original") || im.attr("src") || "";
      }
      push(a.text, img, a.attr("href"));
    }
    if (items.length > 0) return items;
    // Latest-updates page layout
    elements = doc.select("li.new-item");
    for (const el of elements) {
      const a = el.selectFirst("div.new-item-name a");
      if (!a) continue;
      let img = "";
      const wrap = el.selectFirst("div.ewave-img-wrapper");
      if (wrap) img = wrap.attr("data-original") || wrap.attr("data-src") || "";
      push(a.text, img, a.attr("href"));
    }
    return items;
  }

  async getPopular(page) {
    const res = await new Client().get(this.getBaseUrl() + "/", this.headers());
    const doc = new Document(res.body);
    const list = this.parseList(doc);
    return { list: list, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    const res = await new Client().get(this.getBaseUrl() + "/index.php/label/new.html", this.headers());
    const doc = new Document(res.body);
    const list = this.parseList(doc);
    return { list: list, hasNextPage: false };
  }

  async search(query, page, filters) {
    // Text search: the site's own search HTML is behind a "系统安全验证" trap
    // page, but its AJAX suggest endpoint returns clean JSON. Use that.
    if (query) {
      const url = this.getBaseUrl() + "/index.php/ajax/suggest?mid=1&wd=" + encodeURIComponent(query);
      const res = await new Client().get(url, this.headers());
      let data = null;
      try { data = JSON.parse(res.body); } catch (_) { return { list: [], hasNextPage: false }; }
      const list = [];
      const arr = (data && data.list) ? data.list : [];
      for (const it of arr) {
        if (!it || !it.id) continue;
        list.push({
          name: this.stringUTF8(it.name || ""),
          imageUrl: it.pic || "",
          link: "/index.php/vod/detail/id/" + it.id + ".html"
        });
      }
      return { list: list, hasNextPage: false };
    }
    // No query: browse by type filter (values carry the type page path).
    const typeVal = (filters && filters.length > 0 && filters[0].values && filters[0].values[filters[0].state])
      ? filters[0].values[filters[0].state].value : "/index.php/vod/type/id/1.html";
    const p = (page && page > 1) ? "/page/" + page + ".html" : "";
    // typeVal ends with .html; page 1 uses it as-is, page N uses /page/N.html
    let fetchUrl;
    if (page && page > 1) {
      fetchUrl = this.getBaseUrl() + typeVal.replace(/\.html$/, "") + "/page/" + page + ".html";
    } else {
      fetchUrl = this.getBaseUrl() + typeVal;
    }
    const res = await new Client().get(fetchUrl, this.headers());
    const doc = new Document(res.body);
    const list = this.parseList(doc);
    return { list: list, hasNextPage: list.length > 0 };
  }

  async getDetail(url) {
    const res = await new Client().get(this.fullUrl(url), this.headers());
    const doc = new Document(res.body);
    let cover = "";
    const cimg = doc.selectFirst("div.detail-cover img");
    if (cimg) cover = cimg.attr("data-original") || cimg.attr("src") || "";
    if (!cover) {
      const c2 = doc.selectFirst("img.lazyload");
      if (c2) cover = c2.attr("data-original") || c2.attr("src") || "";
    }
    if (cover && cover.indexOf("http") !== 0) cover = this.fullUrl(cover);
    const h1 = doc.selectFirst("h1");
    const title = this.stringUTF8(h1 ? h1.text.trim() : "");
    let desc = "";
    const d = doc.selectFirst("div.detail-desc-content");
    if (d) desc = this.stringUTF8(d.text.trim());
    // Episodes: all play links in the episode box, deduped by nid (one per
    // episode). The URL carries a sid (source line); getVideoList tries
    // every sid for that episode, so any sid works here.
    const eps = [];
    const seenNid = {};
    const links = doc.select("div.episode-box a");
    for (const a of links) {
      const href = a.attr("href") || "";
      const m = href.match(/\/vod\/play\/id\/(\d+)\/sid\/\d+\/nid\/(\d+)\.html/);
      if (!m) continue;
      const nid = m[2];
      if (seenNid[nid]) continue;
      seenNid[nid] = true;
      const name = this.stringUTF8((a.text || "").trim());
      if (!name) continue;
      eps.push({ name: name, url: href });
    }
    return {
      name: title,
      imageUrl: cover,
      description: desc,
      genre: [],
      episodes: eps
    };
  }

  // Extract the direct m3u8 from a play page. The page embeds JSON with
  // "url":"https:\/\/<cdn>\/...\/index.m3u8". Returns "" when none found.
  extractM3u8(playBody) {
    const m = playBody.match(/"url"\s*:\s*"((?:https?:)?\\?\/\\?\/[^"]+?\.m3u8[^"]*)"/);
    if (!m) return "";
    let u = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    if (u.indexOf("//") === 0) u = "https:" + u;
    return u;
  }

  async validateM3u8(url, referer) {
    try {
      const r = await new Client().get(url, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": referer
      });
      const b = r.body || "";
      return b.indexOf("#EXTM3U") !== -1 && b.indexOf(".ts") !== -1;
    } catch (_) {
      return false;
    }
  }

  // ---- duplicate-entry fallback (v0.0.4) ----
  // yhdmg.com has many duplicate entries for the same show (different
  // collection sources): one entry's lines can be all dead (lzcdn31 404,
  // ffzy 403, or no line 2/3 at all) while a duplicate's line works.
  // When every sid fails, search for near-identical titles and try their
  // play pages for the same episode number.
  normalizeName(name) {
    return (name || "").replace(/\s+/g, "");
  }

  seasonOf(name) {
    const n = this.normalizeName(name);
    const m = n.match(/第([一二三四五六七八九十\d]+)季/);
    if (m) {
      const c = m[1];
      if (/^\d+$/.test(c)) return parseInt(c, 10);
      const map = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
      return map[c] || 0;
    }
    // trailing digit season, e.g. 魔法姐妹露露与莉莉2
    const t = n.match(/([1-9])$/);
    if (t && n.length > 5) return parseInt(t[1], 10);
    return 0;
  }

  coreOf(name) {
    let n = this.normalizeName(name);
    n = n.replace(/(动画版|動畫版|20\d\d)$/, "");
    n = n.replace(/第[一二三四五六七八九十\d]+季$/, "");
    if (n.length > 5) n = n.replace(/[1-9]$/, "");
    return n;
  }

  // Same show/season? Cores must match; seasons must agree when both
  // specify one. 特別篇 is kept in the core, so it never matches a
  // regular entry (different content).
  isSameTitle(a, b) {
    if (!a || !b) return false;
    const ca = this.coreOf(a), cb = this.coreOf(b);
    if (!ca || !cb || ca !== cb) return false;
    const sa = this.seasonOf(a), sb = this.seasonOf(b);
    return sa === 0 || sb === 0 || sa === sb;
  }

  async searchDuplicates(title) {
    try {
      const r = await new Client().get(
        this.getBaseUrl() + "/index.php/ajax/suggest?mid=1&wd=" + encodeURIComponent(title),
        this.headers()
      );
      const d = JSON.parse(r.body || "");
      return (d && d.list) || [];
    } catch (_) {
      return [];
    }
  }

  async resolveViaDuplicates(vid, nid, title) {
    // Search with the CORE name (season/suffix stripped): the suggest API
    // matches on the query string, so the full title only returns itself,
    // while the core returns every duplicate entry of the show.
    const cands = await this.searchDuplicates(this.coreOf(title) || title);
    for (const c of cands.slice(0, 8)) {
      const cid = c.id;
      if (!cid || String(cid) === String(vid)) continue;
      if (!this.isSameTitle(title, c.name || "")) continue;
      for (const sid of ["2", "1", "3"]) {
        const purl = this.getBaseUrl() + "/index.php/vod/play/id/" + cid + "/sid/" + sid + "/nid/" + nid + ".html";
        let body = "";
        try {
          const r = await new Client().get(purl, this.headers());
          body = r.body || "";
        } catch (_) { continue; }
        if (!body) continue;
        const stream = this.extractM3u8(body);
        if (!stream || !/^https?:\/\/.+\.m3u8/.test(stream)) continue;
        const ok = await this.validateM3u8(stream, purl);
        if (!ok) continue;
        return [{
          url: stream,
          originalUrl: stream,
          quality: "Origin",
          headers: {
            "Referer": purl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
          }
        }];
      }
    }
    return [];
  }

  async getVideoList(url) {
    const playUrl = this.fullUrl(url);
    const m = playUrl.match(/\/vod\/play\/id\/(\d+)\/sid\/(\d+)\/nid\/(\d+)\.html/);
    if (!m) return [];
    const vid = m[1], nid = m[3];
    const curSid = m[2];
    // Try every source line for this episode: current sid first, then the
    // others. One line's CDN is often dead (404) or blocked (403) while
    // another serves a real playlist.
    const order = [curSid];
    for (const s of ["2", "1", "3"]) if (order.indexOf(s) === -1) order.push(s);
    for (const sid of order) {
      const purl = this.getBaseUrl() + "/index.php/vod/play/id/" + vid + "/sid/" + sid + "/nid/" + nid + ".html";
      let body = "";
      try {
        const r = await new Client().get(purl, this.headers());
        body = r.body || "";
      } catch (_) { continue; }
      if (!body) continue;
      const stream = this.extractM3u8(body);
      if (!stream) continue;
      if (!/^https?:\/\/.+\.m3u8/.test(stream)) continue;
      const ok = await this.validateM3u8(stream, purl);
      if (!ok) continue;
      return [{
        url: stream,
        originalUrl: stream,
        quality: "Origin",
        headers: {
          "Referer": purl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
      }];
    }
    // Every line dead for this entry: try duplicate entries of the same title.
    let title = "";
    try {
      const dr = await new Client().get(this.getBaseUrl() + "/index.php/vod/detail/id/" + vid + ".html", this.headers());
      const doc = new Document(dr.body || "");
      const h1 = doc.selectFirst("h1");
      title = this.stringUTF8(h1 ? h1.text.trim() : "");
    } catch (_) { }
    if (title) {
      const dup = await this.resolveViaDuplicates(vid, nid, title);
      if (dup.length) return dup;
    }
    return [];
  }

  getFilterList() {
    return [{
      type: "Select",
      type_name: "SelectFilter",
      name: "分类",
      values: [
        { name: "日本动漫", value: "/index.php/vod/type/id/1.html", type_name: "SelectOption" },
        { name: "国产动漫", value: "/index.php/vod/type/id/2.html", type_name: "SelectOption" },
        { name: "欧美动漫", value: "/index.php/vod/type/id/3.html", type_name: "SelectOption" },
        { name: "港台动漫", value: "/index.php/vod/type/id/4.html", type_name: "SelectOption" },
        { name: "海外动漫", value: "/index.php/vod/type/id/5.html", type_name: "SelectOption" }
      ]
    }];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "樱花动漫网址",
        "value": "https://www.yhdmg.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
