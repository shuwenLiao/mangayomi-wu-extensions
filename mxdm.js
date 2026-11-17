const mangayomiSources = [{
  "name": "MX动漫",
  "lang": "zh",
  "baseUrl": "https://www.dcc3.com",
  "apiUrl": "",
  "iconUrl": "https://www.dcc3.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.3",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "mxdm.js"
}];

class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) {
      return text;
    }
    // v0.0.3 fix: 桥已按 UTF-8 解出中文时（任一字符码 > 255），不再二次解码，否则标题变乱码
    for (var j = 0; j < text.length; j++) {
      if (text.charCodeAt(j) > 255) return text;
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
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.dcc3.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.getBaseUrl() + url;
    return this.getBaseUrl() + "/" + url;
  }

  // 首页 li 条目：取带图且链接指向 /detail/ 的
  async getHomeItems() {
    const res = await new Client().get(this.getBaseUrl() + "/");
    const doc = new Document(res.body);
    const items = [];
    const seen = {};
    const elements = doc.select("li");
    for (const el of elements) {
      const a = el.selectFirst("a");
      const img = el.selectFirst("img");
      if (!a || !img) continue;
      const href = a.attr("href") || "";
      if (href.indexOf("/detail/") === -1) continue;
      if (seen[href]) continue;
      seen[href] = true;
      const name = (img.attr("alt") || a.attr("title") || "").trim();
      const imageUrl = img.attr("data-original") || img.attr("src") || "";
      if (!name) continue;
      items.push({
        name: this.stringUTF8(name, true),
        imageUrl: imageUrl,
        link: href
      });
    }
    return { list: items, hasNextPage: false };
  }

  async getPopular(page) {
    return await this.getHomeItems();
  }

  async getLatestUpdates(page) {
    return await this.getHomeItems();
  }

  async search(query, page, filters) {
    const res = await new Client().get(
      this.getBaseUrl() + "/search/?wd=" + encodeURIComponent(query)
    );
    const doc = new Document(res.body);
    const items = [];
    const elements = doc.select("div.search.container ul li");
    for (const el of elements) {
      const a = el.selectFirst("h3 a");
      const img = el.selectFirst("img.lazy");
      if (!a) continue;
      const name = (a.text || "").trim();
      const link = a.attr("href") || "";
      const imageUrl = img ? (img.attr("data-original") || img.attr("src") || "") : "";
      if (!name || !link) continue;
      items.push({
        name: this.stringUTF8(name, true),
        imageUrl: imageUrl,
        link: link
      });
    }
    return { list: items, hasNextPage: false };
  }

  // v0.0.2：详情页直连被拦（手机上 0 集）时的兜底：内置浏览器打开详情页，
  // 等 ul.list24 出现后把整页 HTML 交回来，再用同一套解析。
  async loadDetailViaWebview(url) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = `(function(){
      if (window.__mxdmDetailRead) return;
      window.__mxdmDetailRead = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function poll() {
        var body = document.body;
        if (body) {
          var markup = document.documentElement.outerHTML || "";
          var guarded = /Just a moment|Checking your browser|Attention Required/i.test(String(document.title || "")) ||
            /cf-challenge|challenge-platform|cf-turnstile|_cf_chl/i.test(markup);
          if (!guarded && document.querySelector('ul.list24')) {
            send({html: markup, error: ""});
            return;
          }
        }
        if (Date.now() - started > 14500) send({html: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(url, {}, [script], 18);
    } catch (_) {
      return "";
    }
    try {
      const data = JSON.parse(String(result || ""));
      return (data && data.html) ? data.html : "";
    } catch (_) {
      return "";
    }
  }

  parseDetailHtml(html) {
    const doc = new Document(html || "");
    const titleEl = doc.selectFirst("title");
    let name = titleEl ? (titleEl.text || "") : "";
    name = name.split("-")[0].trim();
    const cover = doc.selectFirst("img.lazy");
    const imageUrl = cover ? (cover.attr("data-original") || cover.attr("src") || "") : "";
    const meta = doc.selectFirst('meta[name="description"]');
    const description = meta ? this.stringUTF8(meta.attr("content") || "", true) : "";
    const genre = [];
    const tags = doc.select("div.tags div");
    for (const t of tags) {
      const txt = (t.text || "").trim();
      if (txt) genre.push(this.stringUTF8(txt, true));
    }
    // 只取默认（第一个）播放源的剧集，避免多个源重复
    const eps = [];
    const list = doc.selectFirst("ul.list24");
    if (list) {
      const links = list.select("li a");
      for (const a of links) {
        const epName = (a.text || "").trim();
        const epUrl = a.attr("href") || "";
        if (!epName || !epUrl) continue;
        // 列表末尾的“展开全部”是 javascript:void(0)，不是剧集，跳过
        if (epUrl.indexOf("javascript:") === 0) continue;
        eps.push({ name: this.stringUTF8(epName, true), url: epUrl });
      }
    }
    return {
      name: this.stringUTF8(name, true),
      imageUrl: imageUrl,
      description: description,
      genre: genre,
      episodes: eps
    };
  }

  async getDetail(url) {
    const detailUrl = this.fullUrl(url);
    let html = "";
    try {
      const res = await new Client().get(detailUrl);
      html = res.body || "";
    } catch (_) { html = ""; }
    // v0.0.2：直连拿不到剧集时走 WebView 兜底
    let parsed = this.parseDetailHtml(html);
    if (parsed.episodes.length === 0) {
      const wv = await this.loadDetailViaWebview(detailUrl);
      if (wv) parsed = this.parseDetailHtml(wv);
    }
    return parsed;
  }

  async getVideoList(url) {
    const res = await new Client().get(this.fullUrl(url));
    const body = res.body || "";
    const found = [];
    const seen = {};
    const patterns = [
      /https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g,
      /\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g,
      /https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/g
    ];
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(body)) !== null) {
        let u = m[0];
        if (u.indexOf("//") === 0) u = "https:" + u;
        if (!seen[u]) {
          seen[u] = true;
          found.push({ url: u, originalUrl: u, quality: "Origin" });
        }
      }
    }
    return found;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "MX动漫网址",
        "value": "https://www.dcc3.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
