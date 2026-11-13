const mangayomiSources = [{
  "name": "PimpBunny",
  "lang": "all",
  "baseUrl": "https://pimpbunny.com",
  "apiUrl": "",
  "iconUrl": "https://pimpbunny.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": true,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "pimpbunny.js"
}];

// PimpBunny：Bunny Shield 会拦扩展的普通请求（403），视频地址也不在页面源码里。
// 所以这个源走内置浏览器（WebView）拿页面：列表/搜索/详情都能看；
// 播放没有原生直链，点开视频后在内置浏览器里用网站自己的播放器看。
// （WebView 是真浏览器，能过盾；原生播放器拿不到地址是硬限制。）

const PB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
  base() { return "https://pimpbunny.com"; }

  headers() {
    return { "User-Agent": PB_UA, "Accept": "text/html,application/xhtml+xml" };
  }

  isShieldPage(body, statusCode) {
    const s = String(body || "");
    if ([403, 429, 503].includes(Number(statusCode))) return true;
    return /Establishing a secure connection|bunny-shield|Just a moment|Checking your browser|Attention Required|cf-challenge|challenge-platform/i.test(s);
  }

  // 在内置浏览器里打开页面，等视频卡片出现后把整页 HTML 交回来
  async loadViaWebview(url) {
    if (typeof evaluateJavascriptViaWebview !== "function") {
      throw new Error("PimpBunny：当前 Mangayomi 不支持内置浏览器取页；请在详情页手动用内置浏览器打开网站");
    }
    const script = String.raw`(function(){
      if (window.__pbRead) return;
      window.__pbRead = true;
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
          var guarded = /Just a moment|Checking your browser|Attention Required|Establishing a secure connection|安全驗證|請稍候/i.test(title) ||
            /cf-challenge|challenge-platform|cf-turnstile|_cf_chl|bunny-shield/i.test(markup);
          if (!guarded && document.querySelector('a[href*="/videos/"]')) {
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
      throw new Error("PimpBunny：内置浏览器载入失败：" + String(err));
    }
    let data;
    try { data = JSON.parse(String(result || "")); }
    catch (_) { throw new Error("PimpBunny：内置浏览器没有取得有效网页；请在详情页手动用内置浏览器打开网站"); }
    if (!data || !data.html) {
      throw new Error("PimpBunny：网站需要验证，内置浏览器没能自动通过；请在详情页手动用内置浏览器打开网站");
    }
    return data.html;
  }

  async fetchHtml(url) {
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    if (res && res.body && !this.isShieldPage(res.body, res.statusCode)) return res.body;
    return this.loadViaWebview(url);
  }

  parseCards(html) {
    const items = [];
    const seen = {};
    const re = /<a[^>]*href="([^"]*?\/videos\/([^"\/]+)\/)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html || "")) !== null) {
      const href = m[1];
      const slug = m[2];
      if (/^\d+$/.test(slug)) continue; // 纯数字是分页链接（/videos/2/），不是视频
      const inner = m[3] || "";
      const img = /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/i.exec(inner) ||
                  /<img[^>]*alt="([^"]*)"[^>]*src="([^"]+)"/i.exec(inner);
      let name = "", imageUrl = "";
      if (img) {
        // 两种捕获顺序都要处理：src 在前或 alt 在前
        if (img[1].indexOf("http") === 0) { imageUrl = img[1]; name = img[2] || ""; }
        else { name = img[1] || ""; imageUrl = img[2] || ""; }
      }
      if (!name) {
        name = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          .replace(/\d{1,2}:\d{2}\s*$/g, "").trim();
      }
      const link = href.indexOf("http") === 0 ? href : this.base() + href;
      if (!link || seen[link] || !name) continue;
      seen[link] = true;
      items.push({ name: name, imageUrl: imageUrl, link: link });
    }
    return items;
  }

  async getPopular(page) {
    const p = page || 1;
    const url = p <= 1 ? this.base() + "/videos/" : this.base() + "/videos/" + p + "/";
    const html = await this.fetchHtml(url);
    const list = this.parseCards(html);
    const hasNextPage = new RegExp('/videos/' + (p + 1) + '/"').test(html);
    return { list: list, hasNextPage: hasNextPage };
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const url = this.base() + "/search/" + encodeURIComponent(query) + "/";
    const html = await this.fetchHtml(url);
    return { list: this.parseCards(html), hasNextPage: false };
  }

  async getDetail(url) {
    const html = await this.fetchHtml(url);
    let name = "", imageUrl = "";
    const ogTitle = /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i.exec(html);
    const ogImage = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(html);
    if (ogTitle) name = ogTitle[1];
    if (ogImage) imageUrl = ogImage[1];
    if (!name) {
      const t = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
      if (t) name = t[1].replace(/\s*-\s*PimpBunny.*$/i, "").trim();
    }
    return {
      name: name || "PimpBunny",
      imageUrl: imageUrl,
      description: "本站视频没有原生直链：打开后请用详情页的内置浏览器（WebView）观看，网站自己的播放器可以直接播。",
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
        "summary": "PimpBunny 网址",
        "value": "https://pimpbunny.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
