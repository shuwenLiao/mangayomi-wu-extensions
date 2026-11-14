const mangayomiSources = [{
  "name": "爱奇艺动漫",
  "lang": "zh",
  "baseUrl": "https://manhua.iqiyi.com",
  "apiUrl": "",
  "iconUrl": "https://manhua.iqiyi.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "iqiyi.js"
}];

class DefaultExtension extends MProvider {
  // ---------- MD5（运行环境无内置 crypto，自带实现） ----------
  _md5(str) {
    function rr(v, c) { return (v << c) | (v >>> (32 - c)); }
    function add(x, y) {
      const l = (x & 0xFFFF) + (y & 0xFFFF);
      const m = (x >> 16) + (y >> 16) + (l >> 16);
      return (m << 16) | (l & 0xFFFF);
    }
    function f(x, y, z) { return (x & y) | (~x & z); }
    function g(x, y, z) { return (x & z) | (y & ~z); }
    function h(x, y, z) { return x ^ y ^ z; }
    function ii(x, y, z) { return y ^ (x | ~z); }
    function ff(a, b, c, d, x, s, ac) { a = add(a, add(add(f(b, c, d), x), ac)); return add(rr(a, s), b); }
    function gg(a, b, c, d, x, s, ac) { a = add(a, add(add(g(b, c, d), x), ac)); return add(rr(a, s), b); }
    function hh(a, b, c, d, x, s, ac) { a = add(a, add(add(h(b, c, d), x), ac)); return add(rr(a, s), b); }
    function iii(a, b, c, d, x, s, ac) { a = add(a, add(add(ii(b, c, d), x), ac)); return add(rr(a, s), b); }
    function utf8(s2) {
      s2 = s2.replace(/\r\n/g, "\n");
      let out = "";
      for (let n = 0; n < s2.length; n++) {
        const c = s2.charCodeAt(n);
        if (c < 128) out += String.fromCharCode(c);
        else if (c < 2048) { out += String.fromCharCode((c >> 6) | 192); out += String.fromCharCode((c & 63) | 128); }
        else { out += String.fromCharCode((c >> 12) | 224); out += String.fromCharCode(((c >> 6) & 63) | 128); out += String.fromCharCode((c & 63) | 128); }
      }
      return out;
    }
    const s = utf8(str);
    const len = s.length;
    const blocks = [];
    for (let i = 0; i < len; i++) blocks[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    blocks[len >> 2] |= 0x80 << ((len % 4) << 3);
    blocks[(((len + 8) >> 6) << 4) + 14] = len * 8;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < blocks.length; i += 16) {
      const oa = a, ob = b, oc = c, od = d;
      a = ff(a, b, c, d, blocks[i], 7, -680876936); d = ff(d, a, b, c, blocks[i + 1], 12, -389564586);
      c = ff(c, d, a, b, blocks[i + 2], 17, 606105819); b = ff(b, c, d, a, blocks[i + 3], 22, -1044525330);
      a = ff(a, b, c, d, blocks[i + 4], 7, -176418897); d = ff(d, a, b, c, blocks[i + 5], 12, 1200080426);
      c = ff(c, d, a, b, blocks[i + 6], 17, -1473231341); b = ff(b, c, d, a, blocks[i + 7], 22, -45705983);
      a = ff(a, b, c, d, blocks[i + 8], 7, 1770035416); d = ff(d, a, b, c, blocks[i + 9], 12, -1958414417);
      c = ff(c, d, a, b, blocks[i + 10], 17, -42063); b = ff(b, c, d, a, blocks[i + 11], 22, -1990404162);
      a = ff(a, b, c, d, blocks[i + 12], 7, 1804603682); d = ff(d, a, b, c, blocks[i + 13], 12, -40341101);
      c = ff(c, d, a, b, blocks[i + 14], 17, -1502002290); b = ff(b, c, d, a, blocks[i + 15], 22, 1236535329);
      a = gg(a, b, c, d, blocks[i + 1], 5, -165796510); d = gg(d, a, b, c, blocks[i + 6], 9, -1069501632);
      c = gg(c, d, a, b, blocks[i + 11], 14, 643717713); b = gg(b, c, d, a, blocks[i], 20, -373897302);
      a = gg(a, b, c, d, blocks[i + 5], 5, -701558691); d = gg(d, a, b, c, blocks[i + 10], 9, 38016083);
      c = gg(c, d, a, b, blocks[i + 15], 14, -660478335); b = gg(b, c, d, a, blocks[i + 4], 20, -405537848);
      a = gg(a, b, c, d, blocks[i + 9], 5, 568446438); d = gg(d, a, b, c, blocks[i + 14], 9, -1019803690);
      c = gg(c, d, a, b, blocks[i + 3], 14, -187363961); b = gg(b, c, d, a, blocks[i + 8], 20, 1163531501);
      a = gg(a, b, c, d, blocks[i + 13], 5, -1444681467); d = gg(d, a, b, c, blocks[i + 2], 9, -51403784);
      c = gg(c, d, a, b, blocks[i + 7], 14, 1735328473); b = gg(b, c, d, a, blocks[i + 12], 20, -1926607734);
      a = hh(a, b, c, d, blocks[i + 5], 4, -378558); d = hh(d, a, b, c, blocks[i + 8], 11, -2022574463);
      c = hh(c, d, a, b, blocks[i + 11], 16, 1839030562); b = hh(b, c, d, a, blocks[i + 14], 23, -35309556);
      a = hh(a, b, c, d, blocks[i + 1], 4, -1530992060); d = hh(d, a, b, c, blocks[i + 4], 11, 1272893353);
      c = hh(c, d, a, b, blocks[i + 7], 16, -155497632); b = hh(b, c, d, a, blocks[i + 10], 23, -1094730640);
      a = hh(a, b, c, d, blocks[i + 13], 4, 681279174); d = hh(d, a, b, c, blocks[i], 11, -358537222);
      c = hh(c, d, a, b, blocks[i + 3], 16, -722521979); b = hh(b, c, d, a, blocks[i + 6], 23, 76029189);
      a = hh(a, b, c, d, blocks[i + 9], 4, -640364487); d = hh(d, a, b, c, blocks[i + 12], 11, -421815835);
      c = hh(c, d, a, b, blocks[i + 15], 16, 530742520); b = hh(b, c, d, a, blocks[i + 2], 23, -995338651);
      a = iii(a, b, c, d, blocks[i], 6, -198630844); d = iii(d, a, b, c, blocks[i + 7], 10, 1126891415);
      c = iii(c, d, a, b, blocks[i + 14], 15, -1416354905); b = iii(b, c, d, a, blocks[i + 5], 21, -57434055);
      a = iii(a, b, c, d, blocks[i + 12], 6, 1700485571); d = iii(d, a, b, c, blocks[i + 3], 10, -1894986606);
      c = iii(c, d, a, b, blocks[i + 10], 15, -1051523); b = iii(b, c, d, a, blocks[i + 1], 21, -2054922799);
      a = iii(a, b, c, d, blocks[i + 8], 6, 1873313359); d = iii(d, a, b, c, blocks[i + 15], 10, -30611744);
      c = iii(c, d, a, b, blocks[i + 6], 15, -1560198380); b = iii(b, c, d, a, blocks[i + 13], 21, 1309151649);
      a = iii(a, b, c, d, blocks[i + 4], 6, -145523070); d = iii(d, a, b, c, blocks[i + 11], 10, -1120210379);
      c = iii(c, d, a, b, blocks[i + 2], 15, 718787259); b = iii(b, c, d, a, blocks[i + 9], 21, -343485551);
      a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
    }
    // 标准 hex：逐字节低位在前
    function hex32(v) {
      const bytes = [(v & 0xFF), ((v >> 8) & 0xFF), ((v >> 16) & 0xFF), ((v >> 24) & 0xFF)];
      let out = "";
      for (let i = 0; i < 4; i++) out += ("0" + bytes[i].toString(16)).slice(-2);
      return out;
    }
    return hex32(a) + hex32(b) + hex32(c) + hex32(d);
  }

  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://comic.iqiyi.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  // 爱奇艺漫画 H5 接口签名：header md5 = MD5(path + query + key)
  // h5 平台：srcPlatform 14 / appVer 3.0.0 / key 3sj8...；acg 平台：23 / 100.0.0 / key 0n9w...
  _signedUrl(path, params, platform) {
    const pf = platform === "acg"
      ? { srcPlatform: "23", appVer: "100.0.0", key: "0n9wdzm8pcyl1obxe0n9qdzm2pcyf1ob" }
      : { srcPlatform: "14", appVer: "3.0.0", key: "3sj8xof48xof4tk9f4tk9ypgk9ypg5ul" };
    const all = {};
    const keys = Object.keys(params || {});
    for (let i = 0; i < keys.length; i++) all[keys[i]] = params[keys[i]];
    all.qiyiId = "1";
    all.timeStamp = String(Date.now());
    all.srcPlatform = pf.srcPlatform;
    all.appVer = pf.appVer;
    all.agentVersion = "h5";
    const qs = Object.keys(all).map(function (k) { return k + "=" + all[k]; }).join("&");
    const md5 = this._md5(path + qs + pf.key);
    return { url: this.getBaseUrl() + path + "?" + qs, md5: md5 };
  }

  async _api(path, params, platform) {
    const s = this._signedUrl(path, params, platform);
    const res = await new Client().get(s.url, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Referer": "https://manhua.iqiyi.com/comic/index",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "md5": s.md5
    });
    const code = Number(res.statusCode || 200);
    if (code >= 400) throw new Error("爱奇艺动漫：接口返回 HTTP " + code + "：" + path);
    let j;
    try { j = JSON.parse(res.body || "{}"); } catch (e) { throw new Error("爱奇艺动漫：接口返回非 JSON：" + path); }
    if (j.code !== "A00000" && j.code !== "A00001") {
      throw new Error("爱奇艺动漫：接口错误 " + (j.code || "") + " " + (j.msg || ""));
    }
    return j.data || {};
  }

  _toItem(c) {
    const id = c.comicId || c.bookId;
    if (!id) return null;
    return {
      name: (c.title || "").trim(),
      imageUrl: c.pic || c.cover || "",
      link: this.getBaseUrl() + "/views/1.0/comicDetail?comicId=" + id
    };
  }

  async getPopular(page) {
    const data = await this._api("/views/1.0/resource_comics", { resourceId: "3872784912", page: String(page), count: "18" }, "h5");
    const list = [];
    const comics = data.comics || [];
    for (let i = 0; i < comics.length; i++) {
      const it = this._toItem(comics[i]);
      if (it && it.name) list.push(it);
    }
    return { list: list, hasNextPage: list.length === 18 };
  }

  async getLatestUpdates(page) {
    // homFeed 需额外 device 参数未破解；首页推荐流 resource_comics 即为最新推荐
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const data = await this._api("/acgn/books/acnKeyword", {
      platform: "IOS",
      keyword: encodeURIComponent(query),
      page: String(page),
      size: "18",
      category: "2"
    }, "acg");
    const list = [];
    const els = data.elements || [];
    for (let i = 0; i < els.length; i++) {
      if (els[i].business !== 2) continue;
      const it = this._toItem(els[i]);
      if (it && it.name) list.push(it);
    }
    const total = Number(data.total || 0);
    return { list: list, hasNextPage: total ? (page * 18 < total) : (list.length === 18) };
  }

  _comicIdFromUrl(url) {
    const m = url.match(/comicId=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  async getDetail(url) {
    const numericId = this._comicIdFromUrl(url);
    if (!numericId) throw new Error("爱奇艺动漫：详情链接无 comicId");
    const data = await this._api("/views/1.0/comicDetail", { comicId: numericId }, "acg");
    const strId = data.comicId || "";
    const genre = [];
    const tags = data.comicTagList || data.comicTags || [];
    for (let i = 0; i < tags.length; i++) {
      const t = typeof tags[i] === "string" ? tags[i] : (tags[i].name || "");
      if (t && genre.indexOf(t) < 0) genre.push(t);
    }
    if (genre.length === 0 && data.comicTag) {
      const parts = String(data.comicTag).split(/[,，]/);
      for (let i = 0; i < parts.length; i++) {
        const t = parts[i].trim();
        if (t && genre.indexOf(t) < 0) genre.push(t);
      }
    }
    const status = data.serializeStatus === 2 ? 1 : 0;
    const episodes = [];
    const eps = data.episodes || [];
    for (let i = 0; i < eps.length; i++) {
      const ep = eps[i];
      if (!ep.episodeId) continue;
      episodes.push({
        name: (ep.episodeTitle || ("第" + (ep.episodeOrder || (i + 1)) + "话")),
        url: this.getBaseUrl() + "/read/1.0/batchRead?comicId=" + encodeURIComponent(strId) + "&episodeId=" + encodeURIComponent(ep.episodeId) + "&order=0&size=0",
        dateUpload: ep.firstOnlineTime ? Number(ep.firstOnlineTime) : null,
        scanlator: null
      });
    }
    if (episodes.length === 0) throw new Error("爱奇艺动漫：找不到章节目录");
    return {
      name: (data.title || "").trim(),
      link: url,
      imageUrl: data.pic || "",
      description: (data.brief || "").trim(),
      author: (data.authorsName || "").trim(),
      artist: "",
      genre: genre,
      status: status,
      episodes: episodes
    };
  }

  async getPageList(chapterUrl) {
    const cm = chapterUrl.match(/comicId=([^&]+)/);
    const em = chapterUrl.match(/episodeId=([^&]+)/);
    if (!cm || !em) throw new Error("爱奇艺动漫：章节链接缺少 comicId/episodeId");
    const data = await this._api("/read/1.0/batchRead", {
      comicId: decodeURIComponent(cm[1]),
      episodeId: decodeURIComponent(em[1]),
      order: "0",
      size: "0"
    }, "acg");
    const eps = data.episodes || [];
    if (!eps.length || !eps[0].episodePicture) throw new Error("爱奇艺动漫：本话无图片（可能需 VIP / 登录）");
    const pics = [];
    const arr = eps[0].episodePicture;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      let u = it.imageUrl || "";
      if (it.imageUrlList && it.imageUrlList[1] && it.imageUrlList[1].imageUrl) u = it.imageUrlList[1].imageUrl;
      if (u) pics.push(u);
    }
    if (pics.length === 0) throw new Error("爱奇艺动漫：本话无图片");
    return pics;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "爱奇艺漫画接口地址（换域名时改这里）",
        "value": "https://comic.iqiyi.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
