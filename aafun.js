const mangayomiSources = [{
  "name": "aafun",
  "lang": "zh",
  "baseUrl": "https://www.moonci.com",
  "apiUrl": "",
  "iconUrl": "https://www.moonci.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.4",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "aafun.js"
}];

// aafun（月之祠 moonci.com）。搜索/详情/剧集都是静态 HTML，可直接解析；
// 播放页没有直链，player_aaaa 里 "url" 是 percent 编码后的另一个播放页
// （next.xifanacg.com/anime/…/play/…），需再跟一跳才有视频。
// v0.0.4：下一跳是 Xfani 的 Next.js 站，页面 HTML 里根本没有视频地址，
// 它是浏览器里调 Supabase Edge Function "issue-web-playback" 拿直链的。
// 扩展直接调同一个接口：POST api.xifanacg.com/functions/v1/issue-web-playback，
// body {"action":"fallback","episode_id":…}，返回直链 mp4/m3u8（含各线路 candidates）。
// 链路：播放页 → 解出 next.xifanacg.com 地址 → 从中取 episode_id → 调接口拿直链；
// 接口失败才退回抓下一跳页面 / WebView。

const AAFUN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// Xfani 播放接口：Supabase Edge Function issue-web-playback。
// apikey 是网站前端公开的 publishable key（写在其 JS 里），
// 和网站本身调的是同一个接口、同一把钥匙。
const XF_PLAY_API = "https://api.xifanacg.com/functions/v1/issue-web-playback";
const XF_API_KEY = "sb_publishable_OBIVAWACIX6lPXrO98_z24_HcsmalkA";

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
      if (window.__aafunListRead) return;
      window.__aafunListRead = true;
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

  base() { return "https://www.moonci.com"; }

  headers() {
    return { "User-Agent": AAFUN_UA, "Accept": "text/html,application/xhtml+xml" };
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.base() + url;
    return this.base() + "/" + url;
  }

  percentDecode(s) {
    if (!s) return "";
    try {
      if (typeof decodeURIComponent === "function") return decodeURIComponent(s);
    } catch (e) { }
    // 手动 %XX 解码（decodeURIComponent 不可用时的兜底）
    try {
      return s.replace(/%([0-9A-Fa-f]{2})/g, function (_, h) {
        return String.fromCharCode(parseInt(h, 16));
      });
    } catch (e) { return s; }
  }

  // 首页横幅 a.hl-br-thumb + 列表 a.hl-item-thumb：title 属性是名，data-original 是封面
  parseCards(html) {
    const items = [];
    const seen = {};
    const re = /<a[^>]*class="[^"]*hl-(?:br|item)-thumb[^"]*"[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*data-original="([^"]*)"[^>]*>/gi;
    let m;
    while ((m = re.exec(html || "")) !== null) {
      const link = this.fullUrl(m[1]);
      const name = (m[2] || "").trim();
      const imageUrl = m[3] || "";
      if (!link || !name || seen[link]) continue;
      seen[link] = true;
      items.push({ name: this.fixText(name), imageUrl: imageUrl, link: link });
    }
    return items;
  }

  async getPopular(page) {
    const url = this.base() + "/";
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let list = this.parseCards(res ? (res.body || "") : "");
    if (list.length === 0) {
      const html = await this.loadListViaWebview(url, "a.hl-item-thumb");
      if (html) list = this.parseCards(html);
    }
    return { list: list, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const url = this.base() + "/search/-------------.html?wd=" + encodeURIComponent(query) + "&submit=";
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let list = this.parseCards(res ? (res.body || "") : "");
    if (list.length === 0) {
      const html = await this.loadListViaWebview(url, "a.hl-item-thumb");
      if (html) list = this.parseCards(html);
    }
    return { list: list, hasNextPage: false };
  }

  async getDetail(url) {
    let html = "";
    try {
      const res = await new Client().get(this.fullUrl(url), this.headers());
      html = res.body || "";
    } catch (_) { html = ""; }
    // v0.0.2：直连被拦（手机上 0 集、无描述）时走 WebView 兜底，
    // 复用 loadListViaWebview，等剧集列表出现再读 HTML。
    let listM = /<ul[^>]*id="hl-plays-list"[^>]*>([\s\S]*?)<\/ul>/i.exec(html) ||
                /<ul[^>]*class="[^"]*hl-plays-list[^"]*"[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
    if (!listM) {
      const wv = await this.loadListViaWebview(this.fullUrl(url), "ul#hl-plays-list, ul.hl-plays-list");
      if (wv) html = wv;
    }
    let name = "";
    const t = /<title>([^<]+)<\/title>/i.exec(html);
    if (t) name = t[1].replace(/《|》/g, "").split("番剧")[0].split("高清")[0].trim();
    let imageUrl = "";
    const cov = /data-original="(https?:\/\/[^"]+)"/i.exec(html);
    if (cov) imageUrl = cov[1];
    let description = "";
    const meta = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
    if (meta) description = this.fixText(meta[1]);
    // 只取第一个播放列表（线路1），避免多线路重复
    const eps = [];
    if (!listM) {
      listM = /<ul[^>]*id="hl-plays-list"[^>]*>([\s\S]*?)<\/ul>/i.exec(html) ||
              /<ul[^>]*class="[^"]*hl-plays-list[^"]*"[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
    }
    if (listM) {
      const re = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let a;
      while ((a = re.exec(listM[1])) !== null) {
        const epUrl = a[1];
        const epName = (a[2] || "").trim();
        if (!epUrl || !epName) continue;
        eps.push({ name: this.fixText(epName), url: epUrl });
      }
    }
    return {
      name: this.fixText(name || "aafun"),
      imageUrl: imageUrl,
      description: description,
      genre: [],
      status: 3,
      episodes: eps
    };
  }

  extractDirect(body) {
    const found = [];
    const seen = {};
    const patterns = [
      /https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g,
      /\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g,
      /https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/g
    ];
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(body || "")) !== null) {
        let u = m[0];
        if (u.indexOf("//") === 0) u = "https:" + u;
        if (!seen[u]) { seen[u] = true; found.push({ url: u, originalUrl: u, quality: "Origin" }); }
      }
    }
    return found;
  }

  // player_aaaa 里的 "url" 是 percent 编码后的另一个播放页地址；
  // 页里还有 "url":"www.moonci.com" 这种干扰项，只取解码后是 http 且不是本站的
  extractNextUrl(body) {
    const re = /"url"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(body || "")) !== null) {
      let raw = m[1];
      let decoded = raw;
      if (raw.indexOf("%") !== -1) decoded = this.percentDecode(raw);
      if (decoded.indexOf("http") === 0 && decoded.indexOf("moonci.com") === -1) return decoded;
      if (decoded.indexOf("//") === 0) return "https:" + decoded;
    }
    return "";
  }

  async loadVideoViaWebview(pageUrl) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = String.raw`(function(){
      if (window.__aafunRead) return;
      window.__aafunRead = true;
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
      result = await evaluateJavascriptViaWebview(pageUrl, this.headers(), [script], 20);
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

  // Xfani 播放接口：从 next.xifanacg.com/anime/<id>/play/<episodeId> 里取
  // episodeId，调 issue-web-playback 拿直链。返回的 url 是带签名的直链
  //（几小时过期，每次现取现用）；candidates 是各线路，名字就是线路名。
  async resolveXfaniPlayback(nextUrl) {
    const m = /\/play\/(\d+)/.exec(nextUrl || "");
    if (!m) return [];
    let data = null;
    try {
      const res = await new Client().post(XF_PLAY_API, {
        "Content-Type": "application/json",
        "apikey": XF_API_KEY,
        "Authorization": "Bearer " + XF_API_KEY,
        "User-Agent": AAFUN_UA
      }, JSON.stringify({ action: "fallback", episode_id: parseInt(m[1], 10) }));
      data = JSON.parse(res.body || "");
    } catch (e) {
      return [];
    }
    if (!data || !data.ok) return [];
    const items = [];
    const seen = {};
    const push = function (u, q) {
      if (!u || seen[u]) return;
      seen[u] = true;
      items.push({ url: u, originalUrl: u, quality: q || "Origin" });
    };
    if (data.url) {
      let q = "Origin";
      if (Array.isArray(data.candidates)) {
        for (const c of data.candidates) {
          if (c && c.url === data.url && c.source_name) { q = c.source_name; break; }
        }
      }
      push(data.url, q);
    }
    if (Array.isArray(data.candidates)) {
      for (const c of data.candidates) {
        if (c && c.url) push(c.url, c.source_name || "Origin");
      }
    }
    return items;
  }

  async getVideoList(url) {
    const res = await new Client().get(this.fullUrl(url), this.headers());
    const body = res.body || "";
    let found = this.extractDirect(body);
    if (found.length > 0) return found;
    const nextUrl = this.extractNextUrl(body);
    if (!nextUrl) return [];
    // 先调 Xfani 播放接口拿直链（最快最稳）
    if (nextUrl.indexOf("xifanacg.com") !== -1) {
      found = await this.resolveXfaniPlayback(nextUrl);
      if (found.length > 0) return found;
    }
    // 跟一跳：抓下一跳播放页的直链
    try {
      const res2 = await new Client().get(nextUrl, this.headers());
      found = this.extractDirect(res2.body || "");
      if (found.length > 0) return found;
    } catch (e) { }
    // 再不行就用内置浏览器打开下一跳播放页，从 <video> 上读直链
    const videoUrl = await this.loadVideoViaWebview(nextUrl);
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
        "summary": "aafun 网址",
        "value": "https://www.moonci.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
