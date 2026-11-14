const mangayomiSources = [{
  "name": "LMM",
  "lang": "zh",
  "baseUrl": "https://www.lmm22.com",
  "apiUrl": "",
  "iconUrl": "https://www.lmm22.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "lmm.js"
}];

// LMM（路漫漫在线动漫 https://www.lmm22.com，Apple-CMS 站）。
// 搜索：GET /index.php/ajax/suggest?mid=1&wd=<关键词>
//   → JSON {list:[{id, name, ...}]}（空关键词也返回最新，给 getPopular 用）。
// 详情：GET /index.php/vod/detail/id/<id>.html，剧集在 div.module-player-list 里
//   （链接 /play/<id>_<sid>_<nid>.html），只取第一条线路，避免多线路重复。
// 播放：播放页里有 player_aaaa JSON（encrypt=0 明文）；from=vxdev 时，播放器把
//   https://yun.92cj.com/yunbox/?type=vxdev&vid=<url>&referer=<播放页> 装进 iframe，
//   yunbox 页用 DPlayer + hls.js 跑 JS 后才出视频地址，静态拿不到直链——
//   改走内置浏览器：直接打开 yunbox 页（需带 Referer 头，否则只返回 3 字节 "pir"），
//   主动触发播放后从 <video> 读最终直链。
//   ⚠️ 播放是 WebView 路径，需手机实测（AGE 的 jx.wuzhoupai 解析器已被证实后台抓不到，
//   yunbox 是另一个解析器，未在手机上验证过）。列表/搜索/详情是静态的，已验证。

const LMM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const LMM_API = "https://www.lmm22.com";

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

  headers() {
    return { "User-Agent": LMM_UA, "Accept": "application/json, text/html, */*" };
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return LMM_API + url;
    return LMM_API + "/" + url;
  }

  parseSuggestList(list) {
    const items = [];
    const seen = {};
    for (const r of (list || [])) {
      const id = String(r.id || "");
      const name = this.fixText(String(r.name || "").trim());
      if (!id || !name || seen[id]) continue;
      seen[id] = true;
      items.push({
        name: name,
        imageUrl: String(r.pic || ""),
        link: id
      });
    }
    return items;
  }

  async fetchSuggest(wd) {
    const url = LMM_API + "/index.php/ajax/suggest?mid=1&wd=" + encodeURIComponent(wd || "");
    const res = await new Client().get(url, this.headers());
    let data = null;
    try { data = JSON.parse(res.body || ""); } catch (_) { data = null; }
    const list = (data && data.list) ? data.list : [];
    return { list: this.parseSuggestList(list), hasNextPage: false };
  }

  async getPopular(page) {
    // suggest API 空关键词返回“参数错误”，用常见字母 a 拿最新 20 条
    return await this.fetchSuggest("a");
  }

  async getLatestUpdates(page) {
    return await this.fetchSuggest("a");
  }

  async search(query, page, filters) {
    return await this.fetchSuggest(query || "");
  }

  async getDetail(url) {
    const id = String(url || "").replace(/[^0-9]/g, "");
    const res = await new Client().get(LMM_API + "/index.php/vod/detail/id/" + id + ".html", this.headers());
    const html = res.body || "";
    let name = "";
    const titleM = /<title>([^<]+)<\/title>/i.exec(html);
    if (titleM) {
      name = titleM[1].split("《")[1] || titleM[1];
      name = name.split("》")[0].trim();
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
    // 剧集：直接扫全页的 /play/<id>_<sid>_<nid>.html，按 sid 分组取第一条线路
    // （module-player-list 是多层嵌套 div，正则切块不可靠）
    const eps = [];
    const bySid = {};
    const sidOrder = [];
    const re = /<a[^>]*href="(\/play\/\d+_(\d+)_(\d+)\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
    let a;
    while ((a = re.exec(html)) !== null) {
      const epUrl = a[1];
      const sid = a[2];
      const nid = a[3];
      let epText = (a[4] || "").replace(/<[^>]+>/g, "").trim();
      if (!epText) {
        const titleAttr = /title="([^"]*)"/i.exec(a[0] || "");
        if (titleAttr) {
          const tm = titleAttr[1].match(/第(.+?)集/);
          if (tm) epText = "第" + tm[1] + "集";
        }
      }
      if (!epText) epText = "第" + nid + "集";
      if (!bySid[sid]) { bySid[sid] = []; sidOrder.push(sid); }
      bySid[sid].push({ name: this.fixText(epText), url: epUrl, nid: parseInt(nid, 10) || 0 });
    }
    if (sidOrder.length > 0) {
      const first = bySid[sidOrder[0]].slice().sort(function(x, y) { return x.nid - y.nid; });
      const seenUrl = {};
      for (const e of first) {
        if (seenUrl[e.url]) continue;  // 同一集可能有两个链接（一个没名字），按 URL 去重
        seenUrl[e.url] = true;
        eps.push({ name: e.name, url: e.url });
      }
    }
    return {
      name: this.fixText(name || "LMM"),
      imageUrl: imageUrl,
      description: description,
      genre: [],
      status: 3,
      episodes: eps
    };
  }

  // player_aaaa 的 from/url；url 里的 \\/ 还原成 /
  extractPlayer(html) {
    const idx = (html || "").indexOf("player_aaaa");
    if (idx < 0) return null;
    const seg = html.slice(idx, idx + 4000);
    const fm = /"from"\s*:\s*"([^"]*)"/.exec(seg);
    const um = /"url"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(seg);
    const em = /"encrypt"\s*:\s*"?(\d+)"?/.exec(seg);
    if (!um) return null;
    let u = (um[1] || "").replace(/\\\//g, "/");
    const enc = em ? parseInt(em[1], 10) : 0;
    try {
      if (enc === 1) u = unescape(u);
      else if (enc === 2) u = unescape(this.b64decode(u));
    } catch (_) {}
    return { from: fm ? fm[1] : "", url: u };
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

  // 内置浏览器打开 yunbox 页：主动触发播放后从 <video> 读最终直链
  async loadYunboxVideo(yunboxUrl, referer) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = String.raw`(function(){
      if (window.__lmmRead) return;
      window.__lmmRead = true;
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
        var btns = document.querySelectorAll(".dplayer-play-icon, .dplayer-mobile-play, [class*='play']");
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
          if (!src) {
            var s = v.querySelector("source");
            if (s) src = s.src || "";
          }
          if (!src) continue;
          if (src.indexOf("adposter") !== -1) continue;
          if (src.indexOf("blob:") === 0 || src.indexOf("data:") === 0) continue;
          var dur = v.duration;
          if (/\.m3u8(\?|$)/.test(src) || /\.mp4(\?|$)/.test(src) ||
              (typeof dur === "number" && !isNaN(dur) && dur > 30)) {
            send({url: src, error: ""});
            return;
          }
        }
        if (Date.now() - started > 25000) send({url: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(yunboxUrl, {
        "User-Agent": LMM_UA,
        "Referer": referer || LMM_API + "/"
      }, [script], 28);
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
    const playUrl = this.fullUrl(url);
    const res = await new Client().get(playUrl, this.headers());
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
    // 2) player_aaaa → yunbox（vxdev 线路），走内置浏览器
    const player = this.extractPlayer(body);
    if (player && player.url) {
      if (player.url.indexOf(".m3u8") !== -1 || player.url.indexOf(".mp4") !== -1) {
        return [{ url: player.url, originalUrl: player.url, quality: "Origin" }];
      }
      if (player.from === "vxdev") {
        const yunbox = "https://yun.92cj.com/yunbox/?type=vxdev&vid=" + encodeURIComponent(player.url) + "&referer=" + encodeURIComponent(playUrl);
        const videoUrl = await this.loadYunboxVideo(yunbox, playUrl);
        if (videoUrl) return [{ url: videoUrl, originalUrl: videoUrl, quality: "Origin" }];
      }
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
        "summary": "路漫漫动漫网址",
        "value": "https://www.lmm22.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
