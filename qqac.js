const mangayomiSources = [{
  "name": "腾讯动漫",
  "lang": "zh",
  "baseUrl": "https://ac.qq.com",
  "apiUrl": "",
  "iconUrl": "https://ac.qq.com/favicon.ico",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.2",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "qqac.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://ac.qq.com";
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

  // v0.0.2：图片请求带站首页 Referer（章节图 host 未实测，留一手）。
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
    if (code === 404 || code === 410) throw new Error("腾讯动漫：页面不存在（HTTP " + code + "）：" + url);
    if (code >= 400) throw new Error("腾讯动漫：网站返回 HTTP " + code + "：" + url);
    return res.body || "";
  }

  // ---------- 列表解析：封面锚点 + 标题锚点按 id 合并 ----------
  parseListItems(html) {
    const covers = {};
    const names = {};
    const order = [];
    const seen = {};
    let m;
    const reCover = /<a[^>]*href=["']\/Comic\/[Cc]omicInfo\/id\/(\d+)["'][^>]*>\s*<img[^>]*(?:data-original|src)=["']([^"']+)["']/g;
    while ((m = reCover.exec(html)) !== null) {
      covers[m[1]] = m[2];
      if (!seen[m[1]]) { seen[m[1]] = true; order.push(m[1]); }
    }
    const reTitleAttr = /<a[^>]*href=["']\/Comic\/[Cc]omicInfo\/id\/(\d+)["'][^>]*title=["']([^"']+)["']/g;
    while ((m = reTitleAttr.exec(html)) !== null) {
      if (!names[m[1]]) names[m[1]] = m[2];
      if (!seen[m[1]]) { seen[m[1]] = true; order.push(m[1]); }
    }
    const reTitleText = /<a[^>]*href=["']\/Comic\/[Cc]omicInfo\/id\/(\d+)["'][^>]*>([^<]{1,60})<\/a>/g;
    while ((m = reTitleText.exec(html)) !== null) {
      const t = (m[2] || "").replace(/\s+/g, " ").trim();
      if (t && !/^\d+$/.test(t) && t !== "开始阅读") {
        if (!names[m[1]]) names[m[1]] = t;
        if (!seen[m[1]]) { seen[m[1]] = true; order.push(m[1]); }
      }
    }
    const items = [];
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      let name = (names[id] || "").trim().replace(/^腾讯动漫-/, "");
      if (!name) continue;
      items.push({
        name: name,
        imageUrl: this.fullUrl(covers[id] || ""),
        link: this.getBaseUrl() + "/Comic/comicInfo/id/" + id
      });
    }
    return items;
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/Rank/comicRank/type/1");
    return { list: this.parseListItems(html), hasNextPage: false };
  }

  async getLatestUpdates(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/");
    return { list: this.parseListItems(html), hasNextPage: false };
  }

  async search(query, page, filters) {
    if (page > 1) return { list: [], hasNextPage: false };
    const html = await this.load(this.getBaseUrl() + "/Comic/searchList/search/" + encodeURIComponent(query));
    return { list: this.parseListItems(html), hasNextPage: false };
  }

  meta(html, name) {
    const m = html.match(new RegExp('<meta name="' + name + '" content="([^"]*)"', 'i'));
    return m ? m[1].trim() : "";
  }

  async getDetail(url) {
    const html = await this.load(url);
    const titleRaw = (html.match(/<title>([^<]*)<\/title>/) || ["", ""])[1];
    let name = titleRaw.replace(/^《/, "").split("》")[0].trim();
    if (!name) name = (titleRaw.split("_")[0] || "").trim();
    const authorM = html.match(/作者[：:]\s*([^<&]+)/);
    const author = authorM ? authorM[1].replace(/&nbsp;/g, "").trim() : "";
    const description = this.meta(html, "Description");
    const coverM = html.match(/<img[^>]*(?:data-original|src)=["'](https:\/\/manhua\.acimg\.cn\/vertical\/[^"']+)["']/);
    const imageUrl = coverM ? coverM[1] : "";
    const genre = [];
    const kw = this.meta(html, "Keywords");
    if (kw) {
      const parts = kw.split(/[,，]/);
      for (let i = 0; i < parts.length; i++) {
        const g = parts[i].trim();
        if (!g || g === name || g === "腾讯动漫" || g.indexOf(name) >= 0 || /在线阅读|免费/.test(g)) continue;
        if (genre.indexOf(g) < 0) genre.push(g);
      }
    }
    let status = 3;
    if (/已完结/.test(html)) status = 1;
    else if (/连载中/.test(html)) status = 0;
    const idM = url.match(/\/id\/(\d+)/);
    const comicId = idM ? idM[1] : "";
    const episodes = [];
    const seen = {};
    const re = /href=["']\/ComicView\/index\/id\/\d+\/cid\/(\d+)["'][^>]*>([^<]*)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const cid = m[1];
      if (seen[cid]) continue;
      const t = (m[2] || "").replace(/\s+/g, " ").trim();
      if (!t || t === "开始阅读") continue;
      seen[cid] = true;
      episodes.push({
        name: t,
        url: this.getBaseUrl() + "/ComicView/index/id/" + comicId + "/cid/" + cid,
        dateUpload: null,
        scanlator: null
      });
    }
    if (episodes.length === 0) throw new Error("腾讯动漫：找不到章节目录");
    // 页面先出现番外链接，正话在后：番外排到末尾
    const normal = episodes.filter(function (e) { return e.name.indexOf("番外") < 0; });
    const extra = episodes.filter(function (e) { return e.name.indexOf("番外") >= 0; });
    const ordered = normal.concat(extra);
    return {
      name: name,
      link: url,
      imageUrl: imageUrl,
      description: description,
      author: author,
      artist: "",
      genre: genre,
      status: status,
      episodes: ordered
    };
  }

  // ---------- base64 解码（与 biquge2.js 同款，无内置 atob 时可用） ----------
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

  // ---------- nonce 里 (+eval("...")) 小表达式求值：数字/+-*/%/括号/~~ /Math.round/'c'.charCodeAt() ----------
  // v0.0.2：补 !（逻辑非）与字符串字面量 .substring/.slice/.charAt/.length
  // （真实 nonce 含 !1 与 '123'.substring(2)，旧版直接抛 bad number）。
  _evalArith(src) {
    let s = src.replace(/'([^']*)'\.charCodeAt\(\s*\)/g, function (_, ch) {
      return String(ch.charCodeAt(0));
    }).replace(/"([^"]*)"\.charCodeAt\(\s*\)/g, function (_, ch) {
      return String(ch.charCodeAt(0));
    });
    let pos = 0;
    const peek = function () { return s[pos]; };
    const skip = function () { while (pos < s.length && /\s/.test(s[pos])) pos++; };
    const parseNum = function () {
      skip();
      let start = pos;
      while (pos < s.length && /[0-9.]/.test(s[pos])) pos++;
      if (pos === start) throw new Error("bad number at " + pos + " in " + src);
      return parseFloat(s.slice(start, pos));
    };
    const parseStrLit = function () {
      // 字符串字面量，可带 .substring(a[,b]) / .slice(a[,b]) / .charAt(n) / .length
      const q = s[pos];
      let j = pos + 1;
      let lit = "";
      while (j < s.length && s[j] !== q) {
        if (s[j] === "\\" && j + 1 < s.length) { lit += s[j + 1]; j += 2; }
        else { lit += s[j]; j++; }
      }
      pos = j + 1;
      skip();
      const m = s.slice(pos).match(/^\.(substring|slice)\(\s*(-?\d+)\s*(?:,\s*(-?\d+)\s*)?\)/);
      if (m) {
        pos += m[0].length;
        const a = parseInt(m[2], 10);
        const b = m[3] !== undefined ? parseInt(m[3], 10) : undefined;
        return b === undefined ? lit.substring(a) : lit.substring(a, b);
      }
      const mc = s.slice(pos).match(/^\.charAt\(\s*(-?\d+)\s*\)/);
      if (mc) { pos += mc[0].length; return lit.charAt(parseInt(mc[1], 10)); }
      if (s.slice(pos, pos + 7) === ".length") { pos += 7; return lit.length; }
      return lit;
    };
    const parsePrimary = function () {
      skip();
      if (s[pos] === '"' || s[pos] === "'") return parseStrLit();
      if (s[pos] === "!") {
        pos++;
        const v = parsePrimary();
        return v ? 0 : 1;
      }
      if (s[pos] === "(") {
        pos++;
        const v = parseAdd();
        skip();
        if (s[pos] !== ")") throw new Error("missing ) in " + src);
        pos++;
        return v;
      }
      if (s.substr(pos, 10) === "Math.round") {
        pos += 10;
        skip();
        if (s[pos] !== "(") throw new Error("Math.round needs ( in " + src);
        pos++;
        const v = parseAdd();
        skip();
        if (s[pos] !== ")") throw new Error("missing ) in " + src);
        pos++;
        return Math.round(v);
      }
      if (s[pos] === "~") {
        pos++;
        return ~parsePrimary();
      }
      if (s[pos] === "-") { pos++; return -parsePrimary(); }
      if (s[pos] === "+") { pos++; return parsePrimary(); }
      return parseNum();
    };
    const parseMul = function () {
      let v = Number(parsePrimary());
      for (;;) {
        skip();
        const c = s[pos];
        if (c === "*" || c === "/" || c === "%") {
          pos++;
          const r = Number(parsePrimary());
          v = c === "*" ? v * r : (c === "/" ? v / r : v % r);
        } else break;
      }
      return v;
    };
    const parseAdd = function () {
      let v = parseMul();
      for (;;) {
        skip();
        const c = s[pos];
        if (c === "+" || c === "-") {
          pos++;
          const r = parseMul();
          v = c === "+" ? v + r : v - r;
        } else break;
      }
      return v;
    };
    const v = parseAdd();
    skip();
    if (pos !== s.length) throw new Error("trailing chars in " + src);
    return v;
  }

  // nonce 形如 window["n"+"once"] = "2" + (+eval("2 + 2")).toString() + "b6e..." ;
  // 按出现顺序拼出字符串字面量与 eval 结果
  extractNonce(html) {
    const m = html.match(/window\[[^\]]+\]\s*=\s*([^;]*eval\([^;]*);/);
    if (!m) {
      // v0.0.2 回退：纯字符串拼接的 nonce（无 eval，如 window["no"+"nce"] = '' + '11f159…'）
      const m2 = html.match(/window\[[^\]]+\]\s*=\s*([^;]+);/);
      if (m2) {
        let out2 = "";
        const rhs2 = m2[1];
        let i2 = 0;
        while (i2 < rhs2.length) {
          const ch2 = rhs2[i2];
          if (ch2 === '"' || ch2 === "'") {
            const q2 = ch2;
            let j2 = i2 + 1;
            let lit2 = "";
            while (j2 < rhs2.length && rhs2[j2] !== q2) {
              if (rhs2[j2] === "\\" && j2 + 1 < rhs2.length) { lit2 += rhs2[j2 + 1]; j2 += 2; }
              else { lit2 += rhs2[j2]; j2++; }
            }
            out2 += lit2;
            i2 = j2 + 1;
          } else { i2++; }
        }
        if (out2) return out2;
      }
      throw new Error("腾讯动漫：章节页找不到 nonce");
    }
    const rhs = m[1];
    let out = "";
    let i = 0;
    while (i < rhs.length) {
      const ch = rhs[i];
      if (ch === '"' || ch === "'") {
        const q = ch;
        let j = i + 1;
        let lit = "";
        while (j < rhs.length && rhs[j] !== q) {
          if (rhs[j] === "\\" && j + 1 < rhs.length) { lit += rhs[j + 1]; j += 2; }
          else { lit += rhs[j]; j++; }
        }
        out += lit;
        i = j + 1;
      } else if (rhs.substr(i, 7) === "(+eval(") {
        const start = rhs.indexOf('"', i);
        if (start < 0) throw new Error("腾讯动漫：nonce 解析失败");
        const q = rhs[start];
        let j = start + 1;
        let expr = "";
        while (j < rhs.length && rhs[j] !== q) {
          if (rhs[j] === "\\" && j + 1 < rhs.length) { expr += rhs[j + 1]; j += 2; }
          else { expr += rhs[j]; j++; }
        }
        out += String(this._evalArith(expr));
        i = j + 1;
      } else {
        i++;
      }
    }
    if (!out) throw new Error("腾讯动漫：nonce 为空");
    return out;
  }

  decodeChapterData(html) {
    const dm = html.match(/var DATA = '([^']+)'/);
    if (!dm) throw new Error("腾讯动漫：章节页找不到 DATA");
    const nonce = this.extractNonce(html);
    const chars = dm[1].split("");
    const tokens = nonce.match(/\d+[a-zA-Z]+/g) || [];
    let len = tokens.length;
    while (len--) {
      const locate = parseInt(tokens[len], 10) & 255;
      const str = tokens[len].replace(/\d+/g, "");
      chars.splice(locate, str.length);
    }
    const json = this._b64ToUtf8(chars.join(""));
    return JSON.parse(json);
  }

  async getPageList(chapterUrl) {
    const html = await this.load(chapterUrl);
    let data;
    try { data = this.decodeChapterData(html); }
    catch (e) { throw new Error("腾讯动漫：章节解码失败（" + chapterUrl + "）：" + e.message); }
    if (!data.chapter || data.chapter.canRead === false || data.chapter.vipStatus === 2) {
      throw new Error("腾讯动漫：本话需 VIP / 登录后阅读（" + ((data.chapter && data.chapter.cTitle) || "") + "）");
    }
    const pics = (data.picture || []).map(function (p) { return p.url; }).filter(function (u) { return !!u; });
    if (pics.length === 0) throw new Error("腾讯动漫：本话无图片");
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
        "summary": "腾讯动漫网址（换域名时改这里）",
        "value": "https://ac.qq.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
