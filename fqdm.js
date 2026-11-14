const mangayomiSources = [{
  "name": "FQDM",
  "lang": "zh",
  "baseUrl": "https://www.fqdm.cc",
  "apiUrl": "",
  "iconUrl": "https://www.fqdm.cc/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "fqdm.js"
}];

// FQDM（番茄动漫 https://www.fqdm.cc，Apple-CMS 站）。
// 搜索：GET /index.php/vod/search/wd/<关键词>.html，卡片在 div.module-card-item 里
//   （链接 /index.php/vod/detail/id/<id>.html，封面 img[data-original]，标题在 .module-card-item-title strong）。
// 详情：GET /index.php/vod/detail/id/<id>.html，剧集在第一个 div.module-play-list-content 里
//   （链接 /index.php/vod/play/id/<id>/sid/<sid>/nid/<nid>.html），只取第一条线路，避免多线路重复。
// 播放：播放页里有 player_aaaa JSON，encrypt=0 时 url 就是明文直链 m3u8
//   （已验证：JOJO 飙马野郎第1集，xlm3u8 线路 https://play.xluuss.com/play/dwpmRM8e/index.m3u8
//    和 hnm3u8 线路 https://hn.bfvvs.com/play/erkRMypa/index.m3u8 都是 HTTP 200 的标准 HLS，
//    AES-128 分片，ExoPlayer 原生支持）；encrypt=1 时 unescape，encrypt=2 时 base64 解。
//   静态拿不到直链时才走内置浏览器兜底（解析器页跑完 JS 后从 <video> 读地址）。

const FQDM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

  fixText(text) {
    if (!text) return "";
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(text)) return text;
    return this.stringUTF8(text, true);
  }

  base() { return "https://www.fqdm.cc"; }

  headers() {
    return { "User-Agent": FQDM_UA, "Accept": "text/html,application/xhtml+xml" };
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.base() + url;
    return this.base() + "/" + url;
  }

  // 列表卡片有两种结构：搜索页是 div.module-card-item，首页是 a.module-poster-item
  parseItems(html) {
    const items = [];
    const seen = {};
    const addItem = (link, name, imageUrl) => {
      if (!link || !name || seen[link]) return;
      seen[link] = true;
      items.push({ name: this.fixText(name.trim()), imageUrl: imageUrl || "", link: link });
    };
    // 1) 搜索页：div.module-card-item
    const re1 = /<div class="module-card-item[^"]*">([\s\S]*?)<\/div>\s*<\/div>/gi;
    let m;
    while ((m = re1.exec(html || "")) !== null) {
      const inner = m[1] || "";
      const linkM = /<a[^>]*href="([^"]*\/vod\/detail\/id\/\d+\.html)"[^>]*>/i.exec(inner);
      if (!linkM) continue;
      let name = "";
      const titleM = /module-card-item-title[\s\S]*?<strong>([^<]+)<\/strong>/i.exec(inner);
      if (titleM) name = titleM[1];
      if (!name) {
        const altM = /<img[^>]*alt="([^"]+)"/i.exec(inner);
        if (altM) name = altM[1];
      }
      let imageUrl = "";
      const imgM = /<img[^>]*data-original="([^"]+)"/i.exec(inner) ||
                   /<img[^>]*src="([^"]+)"/i.exec(inner);
      if (imgM) imageUrl = imgM[1];
      if (imageUrl.indexOf("load.gif") !== -1 || imageUrl.indexOf("errorpic") !== -1) imageUrl = "";
      addItem(this.fullUrl(linkM[1]), name, imageUrl);
    }
    // 2) 首页：a.module-poster-item（title 属性即番名，img[data-original] 是封面）
    const re2 = /<a[^>]*href="([^"]*\/vod\/detail\/id\/\d+\.html)"[^>]*class="module-poster-item[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = re2.exec(html || "")) !== null) {
      const link = m[1];
      const inner = m[2] || "";
      const fullTag = m[0] || "";
      let name = "";
      const titleAttr = /title="([^"]+)"/i.exec(fullTag);
      if (titleAttr) name = titleAttr[1];
      if (!name) {
        const titleM = /module-poster-item-title">([^<]+)</i.exec(inner);
        if (titleM) name = titleM[1];
      }
      if (!name) {
        const altM = /<img[^>]*alt="([^"]+)"/i.exec(inner);
        if (altM) name = altM[1];
      }
      let imageUrl = "";
      const imgM = /<img[^>]*data-original="([^"]+)"/i.exec(inner);
      if (imgM) imageUrl = imgM[1];
      if (imageUrl.indexOf("load.gif") !== -1 || imageUrl.indexOf("errorpic") !== -1) imageUrl = "";
      addItem(this.fullUrl(link), name, imageUrl);
    }
    return items;
  }

  async getPopular(page) {
    const res = await new Client().get(this.base() + "/", this.headers());
    return { list: this.parseItems(res.body || ""), hasNextPage: false };
  }

  async getLatestUpdates(page) {
    return await this.getPopular(page);
  }

  async search(query, page, filters) {
    const url = this.base() + "/index.php/vod/search/wd/" + encodeURIComponent(query || "") + ".html";
    const res = await new Client().get(url, this.headers());
    return { list: this.parseItems(res.body || ""), hasNextPage: false };
  }

  async getDetail(url) {
    const res = await new Client().get(this.fullUrl(url), this.headers());
    const html = res.body || "";
    let name = "";
    const titleM = /<title>([^<]+)<\/title>/i.exec(html);
    if (titleM) {
      name = titleM[1].split("》")[0].replace(/《/g, "").trim();
      name = name.split("_")[0].trim();
    }
    let imageUrl = "";
    const og = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(html);
    if (og) imageUrl = og[1];
    if (!imageUrl) {
      const cov = /<img[^>]*data-original="([^"]+)"/i.exec(html);
      if (cov) imageUrl = cov[1];
    }
    let description = "";
    const meta = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
    if (meta) description = this.fixText(meta[1]);
    // 只取第一个播放列表（第一条线路），避免多线路重复
    const eps = [];
    const listM = /<div class="module-play-list-content[^"]*">([\s\S]*?)<\/div>/i.exec(html);
    if (listM) {
      const re = /<a[^>]*href="([^"]*\/vod\/play\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let a;
      while ((a = re.exec(listM[1])) !== null) {
        const epUrl = a[1];
        const epText = (a[2] || "").replace(/<[^>]+>/g, "").trim();
        if (!epUrl || !epText) continue;
        eps.push({ name: this.fixText(epText), url: epUrl });
      }
    }
    return {
      name: this.fixText(name || "FQDM"),
      imageUrl: imageUrl,
      description: description,
      genre: [],
      status: 3,
      episodes: eps
    };
  }

  // player_aaaa 里有嵌套的 vod_data，整段 JSON 不好直接切；只取 url/from/encrypt 三个字段
  extractPlayerUrl(html) {
    const idx = (html || "").indexOf("player_aaaa");
    if (idx < 0) return "";
    const seg = html.slice(idx, idx + 4000);
    const em = /"encrypt"\s*:\s*"?(\d+)"?/.exec(seg);
    const um = /"url"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(seg);
    if (!um) return "";
    let u = um[1] || "";
    const enc = em ? parseInt(em[1], 10) : 0;
    try {
      if (enc === 1) u = unescape(u);
      else if (enc === 2) u = unescape(this.b64decode(u));
    } catch (_) {}
    u = u.replace(/\\\//g, "/");
    return u;
  }

  b64decode(str) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "", i = 0;
    str = String(str || "").replace(/[^A-Za-z0-9+/=]/g, "");
    while (i < str.length) {
      const c1 = chars.indexOf(str.charAt(i++));
      const c2 = chars.indexOf(str.charAt(i++));
      const c3 = chars.indexOf(str.charAt(i++));
      const c4 = chars.indexOf(str.charAt(i++));
      if (c1 < 0 || c2 < 0) break;
      out += String.fromCharCode((c1 << 2) | ((c2 & 0x30) >> 4));
      if (c3 >= 0) out += String.fromCharCode(((c2 & 0x0F) << 4) | ((c3 & 0x3C) >> 2));
      if (c4 >= 0) out += String.fromCharCode(((c3 & 0x03) << 6) | c4);
    }
    return out;
  }

  // 内置浏览器兜底：解析器页跑完 JS 后从 <video> 读最终直链（并主动触发播放）
  async loadParserVideo(parserUrl) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = String.raw`(function(){
      if (window.__fqdmRead) return;
      window.__fqdmRead = true;
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
    // 1) 静态直链（播放页里直接嵌的 m3u8/mp4）
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
    // 2) player_aaaa 的 url（encrypt=0 是明文直链 m3u8）
    const purl = this.extractPlayerUrl(body);
    if (purl && (purl.indexOf(".m3u8") !== -1 || purl.indexOf(".mp4") !== -1 || purl.indexOf("http") === 0)) {
      return [{ url: purl, originalUrl: purl, quality: "Origin" }];
    }
    // 3) 解析器 iframe，走内置浏览器
    const iframe = body.match(/<iframe[^>]*src="([^"]+)"/i);
    if (iframe && iframe[1]) {
      const videoUrl = await this.loadParserVideo(iframe[1].replace(/&amp;/g, "&"));
      if (videoUrl) return [{ url: videoUrl, originalUrl: videoUrl, quality: "Origin" }];
    }
    return [];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "番茄动漫网址",
        "value": "https://www.fqdm.cc",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
