const mangayomiSources = [{
    "name": "多多影音",
    "lang": "zh",
    "baseUrl": "https://tv.yydsys.top",
    "apiUrl": "",
    "iconUrl": "https://tv.yydsys.top/template/DYXS2/static/picture/logo.png",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "version": "0.0.4",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/zh/yydsys.js"
}];
class DefaultExtension extends MProvider {
    patternQuark = /(https:\/\/pan\.quark\.cn\/s\/[^"]+)/;
    patternUc = /(https:\/\/drive\.uc\.cn\/s\/[^"]+)/;
    getHeaders(url) {
        throw new Error("getHeaders not implemented");
    }
    async getPopular(page) {
        const baseUrl = new SharedPreferences().get("url");
        const response = await new Client({ 'useDartHttpClient': true }).get(baseUrl, { "Referer": baseUrl });
        const elements = new Document(response.body).select("div.module-item");
        const list = [];
        for (const element of elements) {
            let oneA = element.selectFirst('.module-item-cover .module-item-pic a');
            const name = oneA.attr("title");
            const imageUrl = element.selectFirst(".module-item-cover .module-item-pic img").attr("data-src");
            const link = oneA.attr("href");
            list.push({ name, imageUrl, link });
        }
        return {
            list: list,
            hasNextPage: false
        }
    }
    async getLatestUpdates(page) {
        const baseUrl = new SharedPreferences().get("url");
        const response = await new Client({ 'useDartHttpClient': true }).get(baseUrl + `/index.php/vod/show/id/1/page/${page}.html`, { "Referer": baseUrl });
        const elements = new Document(response.body).select("div.module-item");
        const list = [];
        for (const element of elements) {
            let oneA = element.selectFirst('.module-item-cover .module-item-pic a');
            const name = oneA.attr("title");
            const imageUrl = element.selectFirst(".module-item-cover .module-item-pic img").attr("data-src");
            const link = oneA.attr("href");
            list.push({ name, imageUrl, link });
        }
        return {
            list: list,
            hasNextPage: true
        }
    }
    async search(query, page, filters) {
        const baseUrl = new SharedPreferences().get("url");
        if (query == "") {
            var categories;
            for (const filter of filters) {
                if (filter["type"] == "categories") {
                    categories = filter["values"][filter["state"]]["value"];
                }
            }
            const response = await new Client({ 'useDartHttpClient': true }).get(baseUrl + `/index.php/vod/show/id/${categories}/page/${page}.html`, { "Referer": baseUrl });
            const elements = new Document(response.body).select("div.module-item");
            const list = [];
            for (const element of elements) {
                let oneA = element.selectFirst('.module-item-cover .module-item-pic a');
                const name = oneA.attr("title");
                const imageUrl = element.selectFirst(".module-item-cover .module-item-pic img").attr("data-src");
                const link = oneA.attr("href");
                list.push({ name, imageUrl, link });
            }
            return {
                list: list,
                hasNextPage: true
            }
        } else {
            const response = await new Client({ 'useDartHttpClient': true }).get(baseUrl + `/index.php/vod/search/page/${page}/wd/${query}.html`, { "Referer": baseUrl });
            const elements = new Document(response.body).select(".module-search-item");
            const list = [];
            for (const element of elements) {
                let oneA = element.selectFirst('.video-info .video-info-header a');
                const name = oneA.attr("title");
                const imageUrl = element.selectFirst(".video-cover .module-item-cover .module-item-pic img").attr("data-src");
                const link = oneA.attr("href");
                list.push({ name, imageUrl, link });
            }
            return {
                list: list,
                hasNextPage: true
            }
        }
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
        const baseUrl = new SharedPreferences().get("url");
        let html = "";
        try {
            const response = await new Client({ 'useDartHttpClient': true }).get(baseUrl + url, { "Referer": baseUrl });
            html = response.body || "";
        } catch (_) { html = ""; }
        if (html.indexOf("video-cover") === -1 && html.indexOf("video-info") === -1) {
            const wv = await this.loadDetailHtmlViaWebview(baseUrl + url);
            if (wv) html = wv;
        }
        const document = new Document(html);
        const imageUrl = document.selectFirst("div.video-cover .module-item-cover .module-item-pic img").attr("data-src");
        const name = document.selectFirst("div.video-info .video-info-header h1").text;
        const description = document.selectFirst("div.video-info .video-info-content").text.replace("[收起部分]", "").replace("[展开全部]", "");
        const type_name = "电影";
        let quark_share_url_list = [], uc_share_url_list = []
        const share_url_list = document.select("div.module-row-one .module-row-info")
            .map(e => {
                const url = e.selectFirst(".module-row-title p").text;
                const quarkMatches = url.match(this.patternQuark);

                if (quarkMatches && quarkMatches[1]) {
                    quark_share_url_list.push(quarkMatches[1]);
                }
                const ucMatches = url.match(this.patternUc);
                if (ucMatches && ucMatches[1]) {
                    uc_share_url_list.push(ucMatches[1]);
                }
                return null;
            })
            .filter(url => url !== null);
        // v0.0.4 注：m2k3a 原版缺 quarkFilesExtractor/ucFilesExtractor 的定义，
        // 调用必崩（这就是它一直 0 集的原因之一）。先保护起来：有定义才调，
        // 没有就只返回网盘分享链接本身；看正片仍需夸克/UC 会员 Cookie。
        let quark_episodes = [];
        let uc_episodes = [];
        try {
            if (typeof quarkFilesExtractor === "function") quark_episodes = await quarkFilesExtractor(quark_share_url_list, new SharedPreferences().get("quarkCookie"));
        } catch (_) { quark_episodes = []; }
        try {
            if (typeof ucFilesExtractor === "function") uc_episodes = await ucFilesExtractor(uc_share_url_list, new SharedPreferences().get("ucCookie"));
        } catch (_) { uc_episodes = []; }
        let episodes = [...quark_episodes, ...uc_episodes];
        return {
            name, imageUrl, description, episodes
        };
    }
    // For anime episode video list
    async getVideoList(url) {
        const videos = [];
        const parts = url.split('++');
        const type = parts[0].toLowerCase();

        let vids;
        if (type === 'quark') {
            let cookie = new SharedPreferences().get("quarkCookie");
            if (cookie == "") {
                throw new Error("请先在本扩展设置中填写夸克Cookies, 需要夸克VIP账号 \n Please fill in the Quark Cookies in this extension settings first, you need a Quark VIP account");
            } else {
                vids = await quarkVideosExtractor(url, cookie);
            }
        } else if (type === 'uc') {
            let cookie = new SharedPreferences().get("ucCookie");
            if (cookie == "") {
                throw new Error("请先在本扩展设置中填写UC云盘Cookies \n Please fill in the UC Cloud Cookies in this extension settings first");
            } else {
                vids = await ucVideosExtractor(url, cookie);
            }
        } else {
            throw new Error("不支持的链接类型");
        }

        for (const vid of vids) {
            videos.push(vid);
        }
        return videos;
    }
    getFilterList() {
        return [{
            type: "categories",
            name: "影片類型",
            type_name: "SelectFilter",
            values: [
                { type_name: "SelectOption", value: "1", name: "电影" },
                { type_name: "SelectOption", value: "2", name: "剧集" },
                { type_name: "SelectOption", value: "4", name: "动漫" },
                { type_name: "SelectOption", value: "3", name: "综艺" },
                { type_name: "SelectOption", value: "5", name: "短剧" },
                { type_name: "SelectOption", value: "20", name: "纪录片" }
            ]
        }];
    }
    getSourcePreferences() {
        return [
            {
                "key": "quarkCookie",
                "editTextPreference": {
                    "title": "夸克Cookies",
                    "summary": "填写获取到的夸克Cookies",
                    "value": "",
                    "dialogTitle": "Cookies",
                    "dialogMessage": "",
                }
            },
            {
                "key": "ucCookie",
                "editTextPreference": {
                    "title": "UC云盘Cookies",
                    "summary": "填写获取到的UC云盘Cookies",
                    "value": "",
                    "dialogTitle": "Cookies",
                    "dialogMessage": "",
                }
            },
            {
                "key": "url",
                "listPreference": {
                    "title": "Website Url",
                    "summary": "",
                    "valueIndex": 0,
                    "entries": [
                        "https://tv.yydsys.top",
                        "https://tv.yydsys.cc",
                        "https://tv.214521.xyz"
                    ],
                    "entryValues": [
                        "https://tv.yydsys.top",
                        "https://tv.yydsys.cc",
                        "https://tv.214521.xyz"
                    ],
                }
            }
        ];
    }
}
