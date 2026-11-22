const mangayomiSources = [{
  "name": "Anime1.me",
  "lang": "zh-TW",
  "baseUrl": "https://anime1.me",
  "apiUrl": "",
  "iconUrl": "https://anime1.me/favicon-32x32.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.3",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime1.js"
}];

// Anime1.me（https://anime1.me/，繁中動畫線上看）。
// 每篇 post 是一集（例如 /30729 是「七葉樹王國的七名騎士 [08]」）。
// 播放器是 video.js，點播放時才向 https://v.anime1.me/api POST data-apireq 取直链：
//   POST https://v.anime1.me/api, body "d=<url-encoded JSON>", Content-Type: application/x-www-form-urlencoded
//   → {"s":[{"src":"//hinata.v.anime1.me/2019/8b.mp4","type":"video/mp4"}]}
// 直链是 mp4，無解析器、無廣告注入。已驗證：POST 返回 200，src 為真實 mp4。
// 列表/搜索：首頁列出最新劇集（/<postId>）；搜索用 WordPress ?s=關鍵詞。
// 備註：每集是獨立 post。v0.0.3 起 getDetail 按整部劇分組：
//   從本集頁抓「全集連結」/?cat=N（或 data-apireq 的 "c"），
//   再抓分類頁 + 站內搜索，合併去重後列出該劇的劇集（按集數升序）。
//   誠實上限（2026-11-22 實測）：本站分類頁只給最新 8 集，站內搜同名也只給最新 8 條，
//   分頁全是壞的（/page/2/、?paged=2 不是 404 就是回最新內容，posts_per_page 參數被忽略，
//   wp-json 401 被禁，分類 feed 404），所以長番只能列出最新 8 集
//   （例：黑色五葉草 第二季 [171]–[178]），8 集以內的番才能列全。
//   原生播放仍以 v0.0.2 的 WebView 路線為準（手機實測為準）。

const A1_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const A1_BASE = "https://anime1.me";

class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) return text;
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

  fixText(text) {
    if (!text) return "";
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(text)) return text;
    return this.stringUTF8(text, true);
  }

  headers() {
    return { "User-Agent": A1_UA, "Accept": "text/html,application/json,*/*" };
  }

  fullUrl(u) {
    if (!u) return "";
    if (u.indexOf("http") === 0) return u;
    if (u.charAt(0) === "/") return A1_BASE + u;
    return A1_BASE + "/" + u;
  }

  // 首頁 / 搜索結果：<a href="https://anime1.me/30729">七葉樹王國的七名騎士 [08]</a>
  // 只取站內數字 post 連結，排除導航/分類/關於等頁面。
  parseList(html) {
    html = html || "";
    const items = [];
    const seen = {};
    const re = /<a[^>]+href="(https?:\/\/anime1\.me\/(\d+)\/?)"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = m[1];
      const title = this.fixText((m[3] || "").trim());
      if (!url || !title || seen[url]) continue;
      if (title.length < 2) continue;
      seen[url] = true;
      items.push({ name: title, imageUrl: "", link: url });
    }
    return items;
  }

  async getPopular(page) {
    let res = null;
    try { res = await new Client().get(A1_BASE + "/", this.headers()); } catch (e) { res = null; }
    const list = this.parseList(res ? (res.body || "") : "");
    return { list: list, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const url = A1_BASE + "/?s=" + encodeURIComponent(query || "");
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    const list = this.parseList(res ? (res.body || "") : "");
    return { list: list, hasNextPage: false };
  }

  // 集數：標題尾巴的 [178] → 178；沒有就回 -1。
  epNum(title) {
    const m = /\[(\d+)\]\s*$/.exec(title || "");
    return m ? parseInt(m[1], 10) : -1;
  }

  // 劇名：去掉標題尾巴的 [178]，例「黑色五葉草 第二季 [178]」→「黑色五葉草 第二季」。
  seriesName(title) {
    return (title || "").replace(/\s*\[\d+\]\s*$/, "").trim();
  }

  // 從一頁 HTML 裡挑出屬於該劇的劇集（標題須是「劇名 [數字]」；側欄最新文章等雜項會被濾掉）。
  collectSeriesEpisodes(html, series) {
    const out = [];
    const seen = {};
    const items = this.parseList(html || "");
    for (let i = 0; i < items.length; i++) {
      const t = items[i].name || "";
      const n = this.epNum(t);
      if (n < 0) continue;
      if (this.seriesName(t) !== series) continue;
      if (seen[items[i].link]) continue;
      seen[items[i].link] = true;
      out.push({ num: n, name: "第" + n + "集", url: items[i].link });
    }
    return out;
  }

  // v0.0.3：按整部劇分組。先抓本集頁拿劇名 + 分類 id，再抓分類頁（最新 8 集）
  // 與站內搜索（最新 10 條）合併去重、按集數升序。兩路都失敗時退回單集。
  async getDetail(url) {
    const epUrl = this.fullUrl(url);
    let res = null;
    try { res = await new Client().get(epUrl, this.headers()); } catch (e) { res = null; }
    const html = res ? (res.body || "") : "";
    let name = "";
    const t = /<title>([^<]+)<\/title>/i.exec(html);
    if (t) name = this.fixText(t[1].replace(/&#8211;.*$/, "").replace(/–.*$/, "").trim());
    let imageUrl = "";
    const og = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(html);
    if (og) imageUrl = og[1];
    let description = "";
    const meta = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
    if (meta) description = this.fixText(meta[1]);

    const series = this.seriesName(name);
    let episodes = [{ name: name || "第1集", url: epUrl }];
    if (series) {
      // 分類 id：優先「全集連結」/?cat=N，退路是 data-apireq 裡的 "c":"N"。
      let catId = "";
      const cl = /href="\/\?cat=(\d+)"/i.exec(html);
      if (cl) catId = cl[1];
      if (!catId) {
        const aq = /data-apireq="([^"]+)"/i.exec(html);
        if (aq) {
          try {
            const decoded = decodeURIComponent(aq[1].replace(/&amp;/g, "&"));
            const cj = JSON.parse(decoded);
            if (cj && cj.c) catId = String(cj.c);
          } catch (_) {}
        }
      }
      const merged = {};
      const addAll = (list) => {
        for (let i = 0; i < list.length; i++) merged[list[i].url] = list[i];
      };
      // 1) 分類頁（最新 8 集）
      if (catId) {
        try {
          const cr = await new Client().get(A1_BASE + "/?cat=" + catId, this.headers());
          addAll(this.collectSeriesEpisodes(cr ? (cr.body || "") : "", series));
        } catch (e) {}
      }
      // 2) 站內搜索（最新 8 條，同名）
      try {
        const sr = await new Client().get(A1_BASE + "/?s=" + encodeURIComponent(series), this.headers());
        addAll(this.collectSeriesEpisodes(sr ? (sr.body || "") : "", series));
      } catch (e) {}
      const list = Object.keys(merged).map((k) => merged[k]);
      list.sort((a, b) => a.num - b.num);
      if (list.length > 0) {
        episodes = list.map((e) => ({ name: e.name, url: e.url }));
      }
    }
    return {
      name: series || name || "Anime1.me",
      imageUrl: imageUrl,
      description: description,
      genre: [],
      status: 3,
      episodes: episodes
    };
  }

  // v0.0.2：先走 WebView——把本集頁面放進後台瀏覽器，點播放讓 video.js 去 POST
  // 取直鏈（瀏覽器會自動帶上 API 回應的三個簽名 Cookie：e / p / h，HttpOnly，
  // JS 讀不到也帶不走）。取到直鏈後交給原生播放器：如果原生播放器與 WebView
  // 共用 Cookie 庫，就能播；不共用的話仍會轉圈（手機實測為準）。
  // WebView 拿不到直鏈時，兜底走裸 HTTP API（v0.0.1 的做法）。
  async loadEpisodeVideo(epUrl) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = String.raw`(function(){
      if (window.__a1Read) return;
      window.__a1Read = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function tryPlay() {
        var btns = document.querySelectorAll(".vjs-big-play-button, .vjs-play-control, [class*='play-button']");
        for (var j = 0; j < btns.length; j++) {
          try { btns[j].click(); } catch (e) {}
        }
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          try { videos[i].muted = true; var p = videos[i].play(); if (p && p.catch) p.catch(function(){}); } catch (e) {}
        }
      }
      function poll() {
        tryPlay();
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          var v = videos[i];
          var src = v.currentSrc || v.src || "";
          if (!src) continue;
          if (src.indexOf("blob:") === 0 || src.indexOf("data:") === 0) continue;
          if (/\.mp4(\?|$)/.test(src) || /\.m3u8(\?|$)/.test(src)) {
            send({url: src, error: ""});
            return;
          }
        }
        try {
          var entries = performance.getEntriesByType("resource") || [];
          for (var k = 0; k < entries.length; k++) {
            var name = entries[k].name || "";
            if (name.indexOf(".mp4") !== -1 && name.indexOf("anime1.me") === -1) {
              send({url: name, error: ""});
              return;
            }
            if (name.indexOf(".mp4") !== -1) {
              send({url: name, error: ""});
              return;
            }
          }
        } catch (e) {}
        if (Date.now() - started > 30000) send({url: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(epUrl, this.headers(), [script], 35);
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

  // 取直鏈：先 WebView（v0.0.2），拿不到再走裸 HTTP API（v0.0.1）。
  // 注意：mp4 直鏈被伺服器鎖定（需 API 回應的三個簽名 Cookie：e / p / h，皆 HttpOnly，
  // JS 讀不到，Client 也拿不到 Set-Cookie），原生播放器直接取會 403。
  // WebView 路線是賭原生播放器與 WebView 共用 Cookie 庫；手機實測為準。
  async getVideoList(url) {
    const epUrl = this.fullUrl(url);
    // 1) WebView 先取直鏈
    let wvUrl = "";
    try { wvUrl = await this.loadEpisodeVideo(epUrl); } catch (e) { wvUrl = ""; }
    if (wvUrl) {
      let src = String(wvUrl);
      if (src.indexOf("//") === 0) src = "https:" + src;
      return [{ url: src, originalUrl: src, quality: "Origin", headers: { "Referer": epUrl, "User-Agent": A1_UA } }];
    }
    // 2) 兜底：裸 HTTP API
    let res = null;
    try { res = await new Client().get(epUrl, this.headers()); } catch (e) { res = null; }
    const html = res ? (res.body || "") : "";
    if (!html) return [];
    const m = /data-apireq="([^"]+)"/i.exec(html);
    if (!m) return [];
    const apireq = m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    let apiRes = null;
    try {
      apiRes = await new Client().post("https://v.anime1.me/api", {
        "User-Agent": A1_UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Referer": epUrl,
        "Origin": A1_BASE
      }, "d=" + apireq);
    } catch (e) { return []; }
    let data = null;
    try { data = JSON.parse(apiRes.body || ""); } catch (_) { return []; }
    const s = (data && data.s) || [];
    if (!s.length || !s[0].src) return [];
    let src = String(s[0].src || "");
    if (src.indexOf("//") === 0) src = "https:" + src;
    if (src.indexOf(".mp4") === -1 && src.indexOf(".m3u8") === -1) return [];
    return [{ url: src, originalUrl: src, quality: "Origin", headers: { "Referer": epUrl, "User-Agent": A1_UA } }];
  }

  getSourcePreferences() {
    return [];
  }
}
