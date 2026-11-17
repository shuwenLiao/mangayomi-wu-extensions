const mangayomiSources = [{
  "name": "DM84",
  "lang": "zh",
  "baseUrl": "https://dmbus.cc",
  "apiUrl": "",
  "iconUrl": "https://dmbus.cc/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.4",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "dm84.js"
}];

// DM84（动漫巴士 dmbus.cc）。搜索/详情/剧集都是静态 HTML，可直接解析；
// 播放页没有直链，只嵌了一个解析器 iframe（hhjx.hhplayer.com/?url=<hex token>），
// v0.0.3：先静态 POST 解析器 /api/parse 拿直链（bootstrap 的 url/t/key，不带 ts_key），
// 再兜底旧的内置浏览器路线（解析器页常被 Cloudflare 拦，WebView 返回空）。

const DM84_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) return text;
    // v0.0.3 fix: 桥已按 UTF-8 解出中文时（任一字符码 > 255），不再二次解码，否则标题变乱码
    for (var j = 0; j < text.length; j++) {
      if (text.charCodeAt(j) > 255) return text;
    }
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

  // v0.0.2：getDetail 直连被拦（手机上 0 集）时的兜底：复用 loadListViaWebview，
  // 等 ul.play_list 出现后把整页 HTML 交回来，再用同一套正则解析。
  parseDetail(html) {
    html = html || "";
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

  async getDetail(url) {
    const detailUrl = this.fullUrl(url);
    let html = "";
    try {
      const res = await new Client().get(detailUrl, this.headers());
      html = res.body || "";
    } catch (_) { html = ""; }
    // v0.0.2：直连拿不到剧集时走 WebView 兜底（与 getPopular/search 同一套方法）
    let parsed = this.parseDetail(html);
    if (parsed.episodes.length === 0) {
      const wv = await this.loadListViaWebview(detailUrl, "ul.play_list");
      if (wv) parsed = this.parseDetail(wv);
    }
    return parsed;
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

  // v0.0.3：静态调解析器 /api/parse 拿直链，不走后台 WebView。
  // 解析器页含 window.__HHJX_BOOTSTRAP__={url,t,key,ts_key,...}，
  // POST {url,t,key,client_fallback:false}（不带 ts_key）到 <parser origin>/api/parse，
  // 返回 {code:200, url:<cibn-edge 直链 m3u8>}，302 到上游真实 HLS。
  // 签名有时效，播放时现取现用，不缓存；失败返回 ""，由调用方走旧 WebView 兜底。
  async parseViaApi(playUrl, body) {
    try {
      const iframe = body.match(/<iframe[^>]*src="([^"]*hhjx[^"]*)"/i) ||
                     body.match(/<iframe[^>]*src="([^"]+)"/i);
      if (!iframe) return "";
      const parserUrl = iframe[1].replace(/&amp;/g, "&");
      if (parserUrl.indexOf("hhjx") === -1 && parserUrl.indexOf("hhplayer") === -1) return "";
      const pRes = await new Client().get(parserUrl, {
        "User-Agent": DM84_UA,
        "Accept": "text/html,application/xhtml+xml",
        "Referer": playUrl
      });
      const pHtml = pRes.body || "";
      const bsM = pHtml.match(/window\.__HHJX_BOOTSTRAP__\s*=\s*(\{.*?\});/);
      if (!bsM) return "";
      let bs;
      try { bs = JSON.parse(bsM[1]); } catch (_) { return ""; }
      if (!bs.url || !bs.t || !bs.key) return "";
      const origin = parserUrl.split("?")[0].replace(/\/$/, "");
      const res = await new Client().post(origin + "/api/parse", {
        "User-Agent": DM84_UA,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Referer": parserUrl
      }, JSON.stringify({ url: bs.url, t: bs.t, key: bs.key, client_fallback: false }));
      let data;
      try { data = JSON.parse(res.body || ""); } catch (_) { return ""; }
      if (!data || data.code !== 200 || !data.url) return "";
      if (data.url.indexOf(".m3u8") === -1 && data.url.indexOf(".mp4") === -1) return "";
      return data.url;
    } catch (_) {
      return "";
    }
  }

  async getVideoList(url) {
    const playUrl = this.fullUrl(url);
    const res = await new Client().get(playUrl, this.headers());
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
    // v0.0.3：静态 POST 解析器 /api/parse 拿直链（不走 WebView；
    // 手机上解析器页常被 Cloudflare 拦，WebView 路线返回空）
    const apiUrl = await this.parseViaApi(playUrl, body);
    if (apiUrl) {
      return [{ url: apiUrl, originalUrl: apiUrl, quality: "Origin",
        headers: { "User-Agent": DM84_UA, "Referer": playUrl } }];
    }
    // 兜底：旧 WebView 路线
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
