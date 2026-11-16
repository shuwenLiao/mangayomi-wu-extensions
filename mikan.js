const mangayomiSources = [{
  "name": "蜜柑计划",
  "lang": "zh",
  "baseUrl": "https://mikanani.me",
  "apiUrl": "",
  "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/zh.mikan.png",
  "typeSource": "torrent",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.4",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "anime/src/zh/mikan.js"
}];

class DefaultExtension extends MProvider {
  dateStringToTimestamp(dateString) {
    var parts = dateString.split('/');
    var year = parseInt(parts[2]);
    var month = parseInt(parts[0]) - 1;
    var day = parseInt(parts[1]);
    var date = new Date(year, month, day);
    var timestamp = date.getTime();
    return timestamp;
  }

  baseURL () {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (base_url.endsWith("/")) {
      base_url = base_url.slice(0, -1);
    }
    return base_url;
  }

  getHeaders(url) {
    throw new Error("getHeaders not implemented");
  }

  async getItems(url, cookies) {
    var res;
    if (cookies) {
      const identity = new SharedPreferences().get("cookies");
      res = await new Client().get(this.baseURL() + url, {
        Cookie: `.AspNetCore.Identity.Application=${identity}`
      });
      if (res.body.search("退出登录") == -1) {
        return {
          list: [{name: "请设置Cookies", link: "", imageUrl: "https://mikan.tangbai.cc/images/mikan-pic.png"}],
          hasNextPage: false
        }
      }
    } else {
      res = await new Client().get(this.baseURL() + url);
    }
    const doc = new Document(res.body);
    const items = [];
    const elements = doc.select("div.m-week-square");
    for (const element of elements) {
      const url = element.selectFirst("a").attr("href");
      if (url == "javascript:void(0);") {
        continue;
      }
      const title = element.selectFirst("a").attr("title");
      const cover = this.baseURL() + element.selectFirst("img").attr("data-src");
      items.push({
        name: title,
        imageUrl: cover,
        link: url
      });
    }
    return {
      list: items,
      hasNextPage: false
    };
  }

  async getPopular(page) {
    return await this.getItems("/Home/MyBangumi", true);
  }

  async getLatestUpdates(page) {
    return await this.getItems("", false);
  }

  async search(query, page, filters) {
    const res = await new Client().get(this.baseURL() + `/Home/Search?searchstr=${query}`);
    const doc = new Document(res.body);
    const items = [];
    const elements = doc.select("div.central-container ul.list-inline li");
    for (const element of elements) {
      const title = element.selectFirst("div.an-text").text;
      const cover = this.baseURL() + element.selectFirst("span").attr("data-src");
      const url = element.selectFirst("a").attr("href");
      items.push({
        name: title,
        imageUrl: cover,
        link: url
      });
    }
    return {
      list: items,
      hasNextPage: false
    };
  }


    // v0.0.x (Wu 自有版)：详情页直连被拦（手机上 0 集）时的兜底：
    // 内置浏览器打开详情页，等剧集内容出现后把整页 HTML 交回来再解析。
    async loadDetailHtmlViaWebview(url) {
        if (typeof evaluateJavascriptViaWebview !== "function") return "";
        const script = `(function(){
      if (window.__m2kDetailRead) return;
      window.__m2kDetailRead = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function poll() {
        var markup = "";
        try { markup = document.documentElement ? document.documentElement.outerHTML : ""; } catch (e) {}
        var guarded = /Just a moment|Checking your browser|Attention Required/i.test(String(document.title || "")) ||
          /cf-challenge|challenge-platform|cf-turnstile|_cf_chl/i.test(markup);
        if (!guarded && markup.length > 5000) {
          send({html: markup, error: ""});
          return;
        }
        if (Date.now() - started > 14500) send({html: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
        let result;
        try {
            result = await evaluateJavascriptViaWebview(url, {}, [script], 18);
        } catch (_) { return ""; }
        try {
            const data = JSON.parse(String(result || ""));
            return (data && data.html) ? data.html : "";
        } catch (_) { return ""; }
    }

  async getDetail(url) {
    const detailUrl = this.baseURL() + url;
    let html = "";
    try {
      const res = await new Client().get(detailUrl);
      html = res.body || "";
    } catch (_) { html = ""; }
    if (html.indexOf("m-bangumi-list-content") === -1) {
      const wv = await this.loadDetailHtmlViaWebview(detailUrl);
      if (wv) html = wv;
    }
    const doc = new Document(html);
    const cover = this.baseURL() + doc.selectFirst("div.content img").attr("src");
    const title = doc.selectFirst("p.title").text;
    const desc = doc.selectFirst("div.info").text;
    const eps = [];
    const lists = doc.select("div.m-bangumi-list-content");
    for (const list of lists) {
      //const header = list.selectFirst("span.title").text;
      for (const item of list.select("div.m-bangumi-item")) {
        const title = item.selectFirst("div.text").text;
        const url = this.baseURL() + item.selectFirst("div.right a").attr("href");
        const date = this.dateStringToTimestamp(item.selectFirst("div.date").text.split(" ")[0]);
        eps.push({
          name: title,
          url: url,
          dateUpload: date.toString()
        });
      }
    }
    //eps.reverse();
    return {
      name: title,
      imageUrl: cover,
      description: desc,
      episodes: eps
    };
  }


  getFilterList() {
    throw new Error("getFilterList not implemented");
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
          "title": "Url",
          "summary": "蜜柑计划网址",
          "value": "https://mikanani.me",
          "dialogTitle": "URL",
          "dialogMessage": "",
      }
    },{
      "key": "cookies",
      "editTextPreference": {
        "title": "用户Cookies（在webview中登陆则可不设）",
        "summary": "用于读取用户订阅的Cookies（.AspNetCore.Identity.Application）",
        "value": "",
        "dialogTitle": "Cookies",
        "dialogMessage": "",
      }
    }];
  }
}