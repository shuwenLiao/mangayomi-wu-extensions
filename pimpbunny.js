const mangayomiSources = [{
  "name": "PimpBunny",
  "lang": "all",
  "baseUrl": "https://pimpbunny.com",
  "apiUrl": "",
  "iconUrl": "https://pimpbunny.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": true,
  "version": "0.0.2",
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
  // v0.0.2：以前任何一步失败都直接 throw，Bunny Shield 把后台 WebView 也拦住时
  // getPopular/getDetail 会直接崩到界面；现在失败返回 ""，调用方按空结果处理
  // （列表空着、详情只留“在网页中观看”那一集，用户还能手动用内置浏览器打开）。
  // readySelector：详情页不一定有 /videos/ 卡片链接，调用方可以传自己的就绪条件。
  async loadViaWebview(url, readySelector) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const sel = readySelector || 'a[href*="/videos/"]';
    const script = String.raw`(function(){
      if (window.__pbRead) return;
      window.__pbRead = true;
      var done = false, started = Date.now(), interval;
      var READY = ${JSON.stringify(sel)};
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
          if (!guarded && document.querySelector(READY)) {
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
      return "";
    }
    let data;
    try { data = JSON.parse(String(result || "")); }
    catch (_) { return ""; }
    if (!data || !data.html) return "";
    return data.html;
  }

  async fetchHtml(url, readySelector) {
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    if (res && res.body && !this.isShieldPage(res.body, res.statusCode)) return res.body;
    return this.loadViaWebview(url, readySelector);
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
    // 详情页不一定有 /videos/ 卡片链接，等 og:title 出现就算就绪
    const html = await this.fetchHtml(url, 'meta[property="og:title"], a[href*="/videos/"]');
    let name = "", imageUrl = "";
    const ogTitle = /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i.exec(html);
    const ogImage = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(html);
    if (ogTitle) name = ogTitle[1];
    if (ogImage) imageUrl = ogImage[1];
    if (!name) {
      const t = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
      if (t) name = t[1].replace(/\s*-\s*PimpBunny.*$/i, "").trim();
    }
    // 页面完全没拿到时（盾把 WebView 也拦了），用地址里的 slug 当名字，别只剩 "PimpBunny"
    if (!name) {
      const sm = /\/videos\/([^\/]+)\/?$/.exec(String(url || ""));
      if (sm) {
        try { name = decodeURIComponent(sm[1]).replace(/-/g, " "); } catch (_) { name = sm[1].replace(/-/g, " "); }
      }
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
