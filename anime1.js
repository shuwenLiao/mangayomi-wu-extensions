const mangayomiSources = [{
  "name": "Anime1.me",
  "lang": "zh-TW",
  "baseUrl": "https://anime1.me",
  "apiUrl": "",
  "iconUrl": "https://anime1.me/favicon-32x32.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
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
// 備註：每集是獨立 post，getDetail 只回傳該集本身（單集條目），不做跨集分組。

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
    return {
      name: name || "Anime1.me",
      imageUrl: imageUrl,
      description: description,
      genre: [],
      status: 3,
      episodes: [{ name: name || "第1集", url: epUrl }]
    };
  }

  // 取直鏈：抓 <video data-apireq="...">，POST 到 v.anime1.me/api，取回 mp4。
  // 注意：mp4 直鏈被伺服器鎖定（需 API 回應的三個簽名 Cookie：e / p / h），
  // Mangayomi JS 拿不到 Set-Cookie，也推不出簽名，所以原生播放器直接取會 403。
  // 這裡仍回傳直鏈（帶 Referer + UA），手機端若能播就是賺到；
  // 播不了時請用內建瀏覽器（WebView）開本集頁面看，瀏覽器會自動帶上 Cookie。
  async getVideoList(url) {
    const epUrl = this.fullUrl(url);
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
