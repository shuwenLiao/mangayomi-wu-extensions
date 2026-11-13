const mangayomiSources = [{
  "name": "Stripchat",
  "lang": "all",
  "baseUrl": "https://zh.stripchat.com",
  "apiUrl": "",
  "iconUrl": "https://zh.stripchat.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": true,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "stripchat.js"
}];

// Stripchat 直播：直播流是 MOUFLON 加密的，需要解密代理 + 手动密钥，
// 扩展只能给播放器一个链接，解不了；而且接口和首页都会被反爬拦。
// 所以这个源走内置浏览器（WebView）拿房间列表：选房间、看房间信息都能做；
// 播放没有原生直链，点开房间后在内置浏览器里用网站自己的播放器看
// （网站自己的播放器会自己解密，WebView 里能直接看）。

const SC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
  base() { return "https://zh.stripchat.com"; }

  headers() {
    return { "User-Agent": SC_UA, "Accept": "text/html,application/xhtml+xml" };
  }

  isShieldPage(body, statusCode) {
    const s = String(body || "");
    if ([403, 418, 429, 503].includes(Number(statusCode))) return true;
    return /Just a moment|Checking your browser|Attention Required|cf-challenge|challenge-platform|Establishing a secure connection/i.test(s);
  }

  // 在内置浏览器里打开首页，等房间缩略图出现后把整页 HTML 交回来
  async loadViaWebview(url) {
    if (typeof evaluateJavascriptViaWebview !== "function") {
      throw new Error("Stripchat：当前 Mangayomi 不支持内置浏览器取页；请在详情页手动用内置浏览器打开网站");
    }
    const script = String.raw`(function(){
      if (window.__scRead) return;
      window.__scRead = true;
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
          var title = String(document.title || "");
          var markup = document.documentElement.outerHTML || "";
          var guarded = /Just a moment|Checking your browser|Attention Required|安全驗證|請稍候/i.test(title) ||
            /cf-challenge|challenge-platform|cf-turnstile|_cf_chl/i.test(markup);
          if (!guarded && document.querySelector('img[src*="doppiocdn"]')) {
            send({html: markup, error: ""});
            return;
          }
        }
        if (Date.now() - started > 14500) send({html: "", error: "verification_or_page_timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(url, this.headers(), [script], 18);
    } catch (err) {
      throw new Error("Stripchat：内置浏览器载入失败：" + String(err));
    }
    let data;
    try { data = JSON.parse(String(result || "")); }
    catch (_) { throw new Error("Stripchat：内置浏览器没有取得有效网页；请在详情页手动用内置浏览器打开网站"); }
    if (!data || !data.html) {
      throw new Error("Stripchat：网站需要验证，内置浏览器没能自动通过；请在详情页手动用内置浏览器打开网站");
    }
    return data.html;
  }

  async fetchHtml(url) {
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    if (res && res.body && !this.isShieldPage(res.body, res.statusCode)) return res.body;
    return this.loadViaWebview(url);
  }

  // 房间卡 = <a href="/{username}">，里面有一张 doppiocdn 的缩略图；
  // 分类/导航链接里没有这种图，正好可以过滤掉
  parseCards(html) {
    const items = [];
    const seen = {};
    const re = /<a[^>]*href="\/([A-Za-z0-9_-]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html || "")) !== null) {
      const username = m[1];
      const inner = m[2] || "";
      const img = /<img[^>]*src="([^"]*doppiocdn[^"]*)"/i.exec(inner);
      if (!img) continue;
      const alt = /<img[^>]*alt="([^"]*)"/i.exec(inner);
      let text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      text = text.replace(/现场性爱视讯表演/g, "").replace(/\s+/g, " ").trim();
      let name = username;
      if (text && text !== username) name = (username + " " + text).slice(0, 80);
      else if (alt && alt[1]) name = alt[1].replace(/现场性爱视讯表演/g, "").trim() || username;
      const link = this.base() + "/" + username;
      if (seen[link]) continue;
      seen[link] = true;
      items.push({ name: name, imageUrl: img[1], link: link });
      if (items.length >= 80) break;
    }
    return items;
  }

  async getPopular(page) {
    const html = await this.fetchHtml(this.base() + "/");
    return { list: this.parseCards(html), hasNextPage: false };
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    // 本站没有可用的搜索地址，搜索请在内置浏览器里做
    return { list: [], hasNextPage: false };
  }

  async getDetail(url) {
    const html = await this.fetchHtml(url);
    let name = "";
    const m = /\/([A-Za-z0-9_-]+)\/?$/.exec(url);
    if (m) name = m[1];
    const ogTitle = /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i.exec(html);
    if (ogTitle && ogTitle[1]) name = ogTitle[1].replace(/\s*-\s*Stripchat.*$/i, "").trim() || name;
    const ogImage = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(html);
    return {
      name: name || "Stripchat",
      imageUrl: ogImage ? ogImage[1] : "",
      description: "直播没有原生直链（MOUFLON 加密）：打开后请用详情页的内置浏览器（WebView）观看，网站自己的播放器可以直接播。注意：未完成年龄验证前缩略图是模糊的。",
      genre: [],
      status: 3,
      episodes: [{ name: "在网页中观看", url: url }]
    };
  }

  async getVideoList(url) {
    // 没有可交给原生播放器的直链；播放请走详情页的内置浏览器
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
        "summary": "Stripchat 网址",
        "value": "https://zh.stripchat.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
