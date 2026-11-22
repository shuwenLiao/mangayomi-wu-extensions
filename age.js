const mangayomiSources = [{
  "name": "AGE动漫",
  "lang": "zh",
  "baseUrl": "https://www.agedm.io",
  "apiUrl": "",
  "iconUrl": "https://www.agedm.io/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.8",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "age.js"
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
      if (window.__ageListRead) return;
      window.__ageListRead = true;
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
      result = await evaluateJavascriptViaWebview(url, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }, [script], 18);
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

  // 根因（2026-11-14 实测）：agedm.io 对不带 User-Agent 的请求返回 403，
  // 带浏览器 UA 才返回 200。扩展的 Client() 默认不发 UA，所以列表/搜索一直是空的。
  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    };
  }

  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.agedm.io";
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

  // v0.0.8：封面直连图床，不走百度 gimg 代理。
  // 站源 data-original 是百度代理地址（gimg*.baidu.com/gimg?...&src=<urlencoded 真地址>），
  // 代理在部分网络下会返回错图/旧图（手机上黄金神威显示成鬼灭/地错封面，图床源文件本身是对的）。
  // 从地址里抠出 covers/<id>.jpg，直接拼图床直链 cdn.aqdstatic.com:966。
  // 抠不到 id 时原样返回，不破坏原有逻辑。
  coverUrl(raw) {
    if (!raw) return "";
    const m = raw.match(/covers(?:\/|%2F)(\d+)\.jpg/i);
    if (m) return "https://cdn.aqdstatic.com:966/age/covers/" + m[1] + ".jpg";
    return raw;
  }

  // 首页 / 最近更新的卡片都是 div.video_item
  parseVideoItems(doc) {
    const items = [];
    const elements = doc.select("div.video_item");
    for (const el of elements) {
      const a = el.selectFirst("div.video_item-title a");
      const img = el.selectFirst("img");
      if (!a || !img) continue;
      const name = (a.text || "").trim();
      const link = a.attr("href") || "";
      const imageUrl = this.coverUrl(img.attr("data-original") || img.attr("src") || "");
      if (!name || !link) continue;
      items.push({
        name: this.fixText(name),
        imageUrl: imageUrl,
        link: link
      });
    }
    return { list: items, hasNextPage: false };
  }

  async getPopular(page) {
    const url = this.getBaseUrl() + "/";
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let result = this.parseVideoItems(new Document(res ? (res.body || "") : ""));
    if (result.list.length === 0) {
      const html = await this.loadListViaWebview(url, "div.video_item");
      if (html) result = this.parseVideoItems(new Document(html));
    }
    return result;
  }

  async getLatestUpdates(page) {
    const url = this.getBaseUrl() + "/update";
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let result = this.parseVideoItems(new Document(res ? (res.body || "") : ""));
    if (result.list.length === 0) {
      const html = await this.loadListViaWebview(url, "div.video_item");
      if (html) result = this.parseVideoItems(new Document(html));
    }
    return result;
  }

  parseSearchItems(doc) {
    const items = [];
    const elements = doc.select("div.card.cata_video_item");
    for (const el of elements) {
      const a = el.selectFirst("h5.card-title a");
      const img = el.selectFirst("img.video_thumbs");
      if (!a) continue;
      const name = (a.text || "").trim();
      const link = a.attr("href") || "";
      const imageUrl = img ? this.coverUrl(img.attr("data-original") || img.attr("src") || "") : "";
      if (!name || !link) continue;
      items.push({
        name: this.fixText(name),
        imageUrl: imageUrl,
        link: link
      });
    }
    return { list: items, hasNextPage: false };
  }

  async search(query, page, filters) {
    const url = this.getBaseUrl() + "/search?query=" + encodeURIComponent(query);
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let result = this.parseSearchItems(new Document(res ? (res.body || "") : ""));
    if (result.list.length === 0) {
      const html = await this.loadListViaWebview(url, "div.card.cata_video_item");
      if (html) result = this.parseSearchItems(new Document(html));
    }
    return result;
  }

  async getDetail(url) {
    let body = "";
    try {
      const res = await new Client().get(this.fullUrl(url), this.headers());
      body = res.body || "";
    } catch (_) { body = ""; }
    // v0.0.5：直连被拦（手机上 0 集、无描述）时走 WebView 兜底，
    // 复用 loadListViaWebview（等 div.tab-pane 出现再读 HTML）。
    let doc = new Document(body);
    let pane = doc.selectFirst("div.tab-pane");
    if (!pane) {
      const html = await this.loadListViaWebview(this.fullUrl(url), "div.tab-pane");
      if (html) doc = new Document(html);
    }
    pane = doc.selectFirst("div.tab-pane");
    const titleEl = doc.selectFirst("title");
    let name = titleEl ? (titleEl.text || "") : "";
    name = name.split(" - ")[0].trim();
    const cover = doc.selectFirst("img.video_thumbs");
    const imageUrl = cover ? this.coverUrl(cover.attr("data-original") || cover.attr("src") || "") : "";
    const meta = doc.selectFirst('meta[name="description"]');
    const description = meta ? this.fixText(meta.attr("content") || "") : "";
    // 只取默认（第一个）播放源的剧集，避免 8 个源重复
    const eps = [];
    if (pane) {
      const links = pane.select("ul.video_detail_episode li a");
      for (const a of links) {
        const epName = (a.text || "").trim();
        const epUrl = a.attr("href") || "";
        if (!epName || !epUrl) continue;
        eps.push({ name: this.fixText(epName), url: epUrl });
      }
    }
    return {
      name: this.fixText(name),
      imageUrl: imageUrl,
      description: description,
      genre: [],
      episodes: eps
    };
  }

  // v0.0.7：播放页静态 HTML 已无解析器 iframe（JS 渲染后才注入），
//   静态正则抓不到直链时改走播放页 WebView 路线（loadPlayPageVideo）：
//   把播放页放进内置浏览器，等 JS 注入解析器并开始播后，
//   同时扫 <video> currentSrc 和 performance 网络记录，过滤广告后挑正片直链。
//   与 DM84 v0.0.8 同一套做法。手机实测为准。
// 解析器页（jx.wuzhoupai.com 云播放器）在内置浏览器里跑完 JS 后，
  // ArtPlayer 会把最终直链放到 <video> 上；轮询抓那个地址回来。
  // 已验证：最终地址是直链 MP4（akamaized.net，无扩展名、无签名），
  // 不用登录、不用 Referer；但广告贴片（adposter.mp4）和解析失败时
  // 的兜底错误视频（kjjsaas-sh…mp4，3 秒）要排除掉。
  // v0.0.4：解析器页在手机 UA 下 Autoplay=false（它按 UA 判断，含 Android
  // 就不自动播放），光等 currentSrc 可能一直是空的；改成每轮主动触发播放，
  // 并把超时从 17 秒放宽到 28 秒（解析器解密+加载经常超过 17 秒）。
  async loadParserVideo(parserUrl) {
    if (typeof evaluateJavascriptViaWebview !== "function") {
      return "";
    }
    const script = String.raw`(function(){
      if (window.__ageRead) return;
      window.__ageRead = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      // v0.0.8：解析器用 MSE/hls.js 时 <video> 的 currentSrc 是 blob:，直链只在网络记录里。
      // 所以除了扫 <video>，还要扫 performance 网络记录（与 DM84 v0.0.8、loadPlayPageVideo 同一套）。
      function isAdUrl(u) {
        if (!u) return true;
        var low = u.toLowerCase();
        if (low.indexOf("adposter") !== -1) return true;
        if (low.indexOf("kjjsaas-sh") !== -1) return true;
        if (low.indexOf("pujing") !== -1) return true;
        if (low.indexOf("xinpu") !== -1) return true;
        if (low.indexOf("casino") !== -1) return true;
        if (low.indexOf("aomen") !== -1) return true;
        if (low.indexOf("promo") !== -1) return true;
        if (low.indexOf("banner") !== -1) return true;
        if (/\/ad[\/_-]/i.test(u)) return true;
        if (/[\/_-]ad[\/_.-]/i.test(u)) return true;
        return false;
      }
      function isContentCdn(u) {
        return u.indexOf("akamaized") !== -1 || u.indexOf("wuzhoupai") !== -1;
      }
      function pickBest(list) {
        var best = null, bestScore = -1;
        for (var i = 0; i < list.length; i++) {
          var u = list[i];
          if (isAdUrl(u)) continue;
          var score = 0;
          if (isContentCdn(u)) score += 10;
          if (/\.mp4(\?|$)/.test(u)) score += 5;
          else if (/\.m3u8(\?|$)/.test(u)) score += 2;
          if (score > bestScore) { bestScore = score; best = u; }
        }
        return best;
      }
      function tryPlay() {
        // 每轮都主动触发一次播放：静音 play + 点播放按钮 + 点播放器容器本身
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          try { videos[i].muted = true; var p = videos[i].play(); if (p && p.catch) p.catch(function(){}); } catch (e) {}
          try { videos[i].click(); } catch (e) {}
        }
        var btns = document.querySelectorAll(".artplayer-play, .art-icon-play, .art-play, .artplayer-video-play, .vjs-big-play-button, [class*='play-btn'], .artplayer");
        for (var j = 0; j < btns.length; j++) {
          try { btns[j].click(); } catch (e) {}
        }
        // ArtPlayer 实例如果挂在 window 上，直接调它的 play
        try {
          var ap = window.artplayer || (window.__artplayer) || null;
          if (ap && ap.play) { ap.muted = true; ap.play(); }
        } catch (e) {}
        // 有些播放器要先点掉加载/封面层
        try {
          var cov = document.querySelector(".artplayer-poster, .artplayer-loading, #loading .mov");
          if (cov) cov.click();
        } catch (e) {}
      }
      function poll() {
        tryPlay();
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          var v = videos[i];
          var src = v.currentSrc || v.src || "";
          if (!src) {
            var s = v.querySelector("source");
            if (s) src = s.src || "";
          }
          if (!src) continue;
          if (src.indexOf("adposter") !== -1) continue;
          if (src.indexOf("kjjsaas-sh") !== -1) continue;
          if (src.indexOf("blob:") === 0 || src.indexOf("data:") === 0) continue;
          var dur = v.duration;
          if (src.indexOf("akamaized.net") !== -1 ||
              /\.m3u8(\?|$)/.test(src) || /\.mp4(\?|$)/.test(src) ||
              (typeof dur === "number" && !isNaN(dur) && dur > 30)) {
            send({url: src, error: ""});
            return;
          }
        }
        // v0.0.8：播放器用 MSE 时 <video> 的 src 是 blob:，直链在网络记录里
        try {
          var entries = performance.getEntriesByType("resource") || [];
          var cands = [];
          for (var k = 0; k < entries.length; k++) {
            var name = entries[k].name || "";
            if (name.indexOf(".m3u8") === -1 && name.indexOf(".mp4") === -1) continue;
            cands.push(name);
          }
          var best = pickBest(cands);
          if (best) { send({url: best, error: ""}); return; }
        } catch (e) {}
        // 解析器出错时会显示 #error；一直停在 #loading 说明还没跑完，继续等
        var errEl = document.querySelector("#error");
        if (errEl && errEl.offsetParent !== null && errEl.innerText && errEl.innerText.trim()) {
          send({url: "", error: "parser-error"});
          return;
        }
        if (Date.now() - started > 55000) send({url: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(parserUrl, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }, [script], 32);
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

  // v0.0.7：播放页静态 HTML 里已没有解析器 iframe（JS 渲染后才注入），
  // 静态正则抓不到直链。改成把播放页本身放进内置浏览器：等页面 JS 跑完、
  // 解析器注入并开始播后，同时扫 <video> 的 currentSrc 和 performance 网络记录，
  // 收集全部 .m3u8/.mp4 候选，过滤广告，挑正片直链回来。
  // 与 DM84 v0.0.8 同一套做法（performance 扫描 + pickBest）。
  async loadPlayPageVideo(playUrl) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = String.raw`(function(){
      if (window.__agePlayRead) return;
      window.__agePlayRead = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function isAdUrl(u) {
        if (!u) return true;
        var low = u.toLowerCase();
        if (low.indexOf("adposter") !== -1) return true;
        if (low.indexOf("kjjsaas-sh") !== -1) return true;
        if (low.indexOf("pujing") !== -1) return true;
        if (low.indexOf("xinpu") !== -1) return true;
        if (low.indexOf("casino") !== -1) return true;
        if (low.indexOf("aomen") !== -1) return true;
        if (low.indexOf("promo") !== -1) return true;
        if (low.indexOf("banner") !== -1) return true;
        if (/\/ad[\/_-]/i.test(u)) return true;
        if (/[\/_-]ad[\/_.-]/i.test(u)) return true;
        return false;
      }
      function isContentCdn(u) {
        return u.indexOf("akamaized") !== -1 || u.indexOf("wuzhoupai") !== -1;
      }
      function pickBest(list) {
        var best = null, bestScore = -1;
        for (var i = 0; i < list.length; i++) {
          var u = list[i];
          if (isAdUrl(u)) continue;
          var score = 0;
          if (isContentCdn(u)) score += 10;
          if (/\.mp4(\?|$)/.test(u)) score += 5;
          else if (/\.m3u8(\?|$)/.test(u)) score += 2;
          if (score > bestScore) { bestScore = score; best = u; }
        }
        return best;
      }
      function tryPlay() {
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          try { videos[i].muted = true; var p = videos[i].play(); if (p && p.catch) p.catch(function(){}); } catch (e) {}
          try { videos[i].click(); } catch (e) {}
        }
        var btns = document.querySelectorAll(".artplayer-play, .art-icon-play, .art-play, .artplayer-video-play, .vjs-big-play-button, [class*='play-btn'], .artplayer");
        for (var j = 0; j < btns.length; j++) {
          try { btns[j].click(); } catch (e) {}
        }
        try {
          var ap = window.artplayer || (window.__artplayer) || null;
          if (ap && ap.play) { ap.muted = true; ap.play(); }
        } catch (e) {}
        try {
          var cov = document.querySelector(".artplayer-poster, .artplayer-loading, #loading .mov");
          if (cov) cov.click();
        } catch (e) {}
      }
      function poll() {
        tryPlay();
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          var v = videos[i];
          var src = v.currentSrc || v.src || "";
          if (!src) {
            var s = v.querySelector("source");
            if (s) src = s.src || "";
          }
          if (!src) continue;
          if (isAdUrl(src)) continue;
          if (src.indexOf("blob:") === 0 || src.indexOf("data:") === 0) continue;
          var dur = v.duration;
          if (src.indexOf("akamaized.net") !== -1 ||
              /\.m3u8(\?|$)/.test(src) || /\.mp4(\?|$)/.test(src) ||
              (typeof dur === "number" && !isNaN(dur) && dur > 30)) {
            send({url: src, error: ""});
            return;
          }
        }
        // 播放器用 MSE 时 <video> 的 src 是 blob:，直链在网络记录里
        try {
          var entries = performance.getEntriesByType("resource") || [];
          var cands = [];
          for (var k = 0; k < entries.length; k++) {
            var name = entries[k].name || "";
            if (name.indexOf(".m3u8") === -1 && name.indexOf(".mp4") === -1) continue;
            cands.push(name);
          }
          var best = pickBest(cands);
          if (best) { send({url: best, error: ""}); return; }
        } catch (e) {}
        var errEl = document.querySelector("#error");
        if (errEl && errEl.offsetParent !== null && errEl.innerText && errEl.innerText.trim()) {
          send({url: "", error: "parser-error"});
          return;
        }
        if (Date.now() - started > 55000) send({url: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(playUrl, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }, [script], 60);
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
    // 1. 播放页静态 HTML 里有直链就直接用（目前一般没有，留作兜底）
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
    if (found.length > 0) return found;
    // 2. AGE 播放页内嵌解析器 iframe（jx.wuzhoupai.com/vip/?url=age_<token>），
    // token 是服务端查表/解密的，静态抓不到直链，也没有可直接调的解析 API
    // （2026-11-14 浏览器实测：常见候选接口 /vip/api.php、/api/、/vip/api、/jx/ 均为 404）。
    // v0.0.7：实测播放页静态 HTML 里已没有 iframe（JS 渲染后才注入），
    // 所以 iframe 正则经常抓不到。抓不到时改走播放页 WebView 路线：
    // 把播放页本身放进内置浏览器，等 JS 注入解析器并开始播后，
    // 从 <video> 或 performance 网络记录里取最终直链。
    let parserUrl = "";
    const iframe = body.match(/<iframe[^>]*src="([^"]*jx\.wuzhoupai[^"]*)"/i);
    if (iframe) {
      parserUrl = iframe[1].replace(/&amp;/g, "&");
    } else {
      const direct = body.match(/https:\/\/jx\.wuzhoupai\.com:8443\/vip\/\?url=age_[^"'\s&]+/);
      if (direct) parserUrl = direct[0];
    }
    if (parserUrl) {
      const videoUrl = await this.loadParserVideo(parserUrl);
      if (videoUrl) return [{ url: videoUrl, originalUrl: videoUrl, quality: "Origin" }];
    }
    const playUrl = await this.loadPlayPageVideo(this.fullUrl(url));
    if (!playUrl) return [];
    return [{ url: playUrl, originalUrl: playUrl, quality: "Origin" }];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "AGE动漫网址",
        "value": "https://www.agedm.io",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
