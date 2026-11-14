const mangayomiSources = [{
  "name": "DM84",
  "lang": "zh",
  "baseUrl": "https://dmbus.cc",
  "apiUrl": "",
  "iconUrl": "https://dmbus.cc/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "dm84.js"
}];

// DM84（动漫巴士 dmbus.cc）。搜索/详情/剧集都是静态 HTML，可直接解析；
// 播放页没有直链，只嵌了一个解析器 iframe（hhjx.hhplayer.com/?url=<hex token>），
// token 需服务端解析，静态拿不到直链——改走内置浏览器：
// 让解析器页跑完 JS，从 <video> 上读最终直链（并主动触发播放，
// 因为后台 WebView 默认禁自动播放，光等 currentSrc 可能一直是空的）。

const DM84_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) return text;
    var bytes = [];
    for (var i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i));
    var charCodes = [];
    var i = 0;
    while (i < bytes.length) {
      var byte1 = bytes[i];
      var charCode;
      if (byte1 < 0x80) { charCode = byte1; i += 1; }
      else if (byte1 < 0xE0) { charCode = ((byte1 & 0x1F) << 6) | (bytes[i + 1] & 0x3F); i += 2; }
      else if (byte1 < 0xF0) { charCode = ((byte1 & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F); i += 3; }
      else { charCode = ((byte1 & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F); i += 4; }
      charCodes.push(charCode);
    }
    return String.fromCharCode.apply(null, charCodes);
  }

  // 名字可能是正确的 UTF-8（站声明了 charset=utf-8，桥直接给正确中文），
  // 也可能是 Latin-1 乱码（站没声明 charset 时桥按 Latin-1 解）。
  // 已有中文就直接用，没有中文才按 UTF-8 重新解一次，避免把正确中文二次解成乱码。
  fixText(text) {
    if (!text) return "";
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(text)) return text;
    return this.stringUTF8(text, true);
  }

  // 列表页在内置浏览器里打开，等卡片出现后把整页 HTML 交回来；
  // 静态请求拿不到内容（VPN/网络抖动、空响应）时的兜底，静态能拿到时不用它
  async loadListViaWebview(url, readySelector) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = `(function(){
      if (window.__dm84ListRead) return;
      window.__dm84ListRead = true;
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
          if (!guarded && document.querySelector('${readySelector}')) {
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
      result = await evaluateJavascriptViaWebview(url, this.headers(), [script], 18);
    } catch (err) {
      return "";
    }
    try {
      const data = JSON.parse(String(result || ""));
      return (data && data.html) ? data.html : "";
    } catch (_) {
      return "";
    }
  }

  base() { return "https://dmbus.cc"; }

  headers() {
    return { "User-Agent": DM84_UA, "Accept": "text/html,application/xhtml+xml" };
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.base() + url;
    return this.base() + "/" + url;
  }

  // 搜索页和首页都是 ul.v_list > li > div.item > a.cover[data-bg] + a.title[href]
  parseItems(html) {
    const items = [];
    const seen = {};
    const re = /<li[^>]*>\s*<div class="item">([\s\S]*?)<\/div>\s*<\/li>/gi;
    let m;
    while ((m = re.exec(html || "")) !== null) {
      const inner = m[1] || "";
      const titleA = /<a[^>]*class="title"[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*>/i.exec(inner) ||
                     /<a[^>]*href="([^"]+)"[^>]*class="title"[^>]*>/i.exec(inner);
      if (!titleA) continue;
      const link = this.fullUrl(titleA[1]);
      let name = titleA[2] || "";
      if (!name) {
        const t = /<a[^>]*class="title"[^>]*>([^<]+)<\/a>/i.exec(inner);
        name = t ? t[1] : "";
      }
      const cover = /<a[^>]*class="cover[^"]*"[^>]*data-bg="([^"]+)"/i.exec(inner);
      const imageUrl = cover ? cover[1] : "";
      if (!link || !name || seen[link]) continue;
      seen[link] = true;
      items.push({ name: this.fixText(name.trim()), imageUrl: imageUrl, link: link });
    }
    return items;
  }

  async getPopular(page) {
    const url = this.base() + "/";
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let list = this.parseItems(res ? (res.body || "") : "");
    if (list.length === 0) {
      const html = await this.loadListViaWebview(url, "ul.v_list li");
      if (html) list = this.parseItems(html);
    }
    return { list: list, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const url = this.base() + "/s----------.html?wd=" + encodeURIComponent(query);
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let list = this.parseItems(res ? (res.body || "") : "");
    if (list.length === 0) {
      const html = await this.loadListViaWebview(url, "ul.v_list li");
      if (html) list = this.parseItems(html);
    }
    return { list: list, hasNextPage: false };
  }

  async getDetail(url) {
    const res = await new Client().get(this.fullUrl(url), this.headers());
    const html = res.body || "";
    let name = "";
    const h1 = /<h1 class="v_title">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(html);
    if (h1) name = h1[1];
    if (!name) {
      const t = /<title>([^<]+)<\/title>/i.exec(html);
      if (t) name = t[1].replace(/《|》/g, "").split("全集")[0].trim();
    }
    let imageUrl = "";
    const og = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(html);
    if (og) imageUrl = og[1];
    if (!imageUrl) {
      const cov = /<a[^>]*class="cover[^"]*"[^>]*data-bg="([^"]+)"/i.exec(html);
      if (cov) imageUrl = cov[1];
    }
    let description = "";
    const meta = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
    if (meta) description = this.fixText(meta[1]);
    // 只取第一个播放列表（线路1），避免 2 条线路重复
    const eps = [];
    const listM = /<ul class="play_list[^"]*">([\s\S]*?)<\/ul>/i.exec(html);
    if (listM) {
      const re = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let a;
      while ((a = re.exec(listM[1])) !== null) {
        const epUrl = a[1];
        const epText = (a[2] || "").trim();
        if (!epUrl || !epText) continue;
        const num = /^\d+$/.test(epText) ? ("第" + epText + "集") : epText;
        eps.push({ name: this.fixText(num), url: epUrl });
      }
    }
    return {
      name: this.fixText(name || "DM84"),
      imageUrl: imageUrl,
      description: description,
      genre: [],
      status: 3,
      episodes: eps
    };
  }

  // 在内置浏览器里打开解析器页：主动触发播放（静音 play + 点播放按钮），
  // 再轮询 <video> 的 currentSrc，把最终直链带回来
  async loadParserVideo(parserUrl) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = String.raw`(function(){
      if (window.__dm84Read) return;
      window.__dm84Read = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function tryPlay() {
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          try { videos[i].muted = true; var p = videos[i].play(); if (p && p.catch) p.catch(function(){}); } catch (e) {}
        }
        var btns = document.querySelectorAll(".artplayer-play, .art-icon-play, .art-play, .vjs-big-play-button, [class*='play-btn']");
        for (var j = 0; j < btns.length; j++) {
          try { btns[j].click(); } catch (e) {}
        }
      }
      function poll() {
        tryPlay();
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          var v = videos[i];
          var src = v.currentSrc || v.src || "";
          if (!src) continue;
          if (src.indexOf("adposter") !== -1) continue;
          if (src.indexOf("kjjsaas-sh") !== -1) continue;
          if (src.indexOf("blob:") === 0 || src.indexOf("data:") === 0) continue;
          var dur = v.duration;
          if (/\.m3u8(\?|$)/.test(src) || /\.mp4(\?|$)/.test(src) ||
              src.indexOf("akamaized.net") !== -1 ||
              (typeof dur === "number" && !isNaN(dur) && dur > 30)) {
            send({url: src, error: ""});
            return;
          }
        }
        if (Date.now() - started > 17000) send({url: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(parserUrl, this.headers(), [script], 20);
    } catch (err) {
      return "";
    }
    try {
      const data = JSON.parse(String(result || ""));
      return (data && data.url) ? data.url : "";
    } catch (_) {
      return "";
    }
  }

  async getVideoList(url) {
    const res = await new Client().get(this.fullUrl(url), this.headers());
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
        if (!seen[u]) { seen[u] = true; found.push({ url: u, originalUrl: u, quality: "Origin" }); }
      }
    }
    if (found.length > 0) return found;
    // 播放页只嵌解析器 iframe（hhjx.hhplayer.com/?url=<hex token>）
    let parserUrl = "";
    const iframe = body.match(/<iframe[^>]*src="([^"]*hhjx[^"]*)"/i) ||
                   body.match(/<iframe[^>]*src="([^"]+)"/i);
    if (iframe) parserUrl = iframe[1].replace(/&amp;/g, "&");
    if (!parserUrl) return [];
    const videoUrl = await this.loadParserVideo(parserUrl);
    if (!videoUrl) return [];
    return [{ url: videoUrl, originalUrl: videoUrl, quality: "Origin" }];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "DM84 网址",
        "value": "https://dmbus.cc",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
