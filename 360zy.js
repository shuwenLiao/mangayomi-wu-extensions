const mangayomiSources = [{
    "name": "360资源",
    "lang": "zh",
    "baseUrl": "https://360zy.com",
    "apiUrl": "",
    "iconUrl": "https://360zy.com/favicon.ico",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "version": "0.0.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/zh/360zy.js"
}];

class DefaultExtension extends MProvider {
    dict = new Map([
        ["&nbsp;", " "],
        ["&quot;", '"'],
        ["&lt;", "<"],
        ["&gt;", ">"],
        ["&amp;", "&"],
        ["&sdot;", "·"],
    ]);
    text(content) {
        if (!content) return "";
        const str =
            [...content.matchAll(/>([^<]+?)</g)]
                .map((m) => m[1])
                .join("")
                .trim() || content;
        return str.replace(/&[a-z]+;/g, (c) => this.dict.get(c) || c);
    }
    async request(url) {
        const preference = new SharedPreferences();
        return (await new Client({ 'useDartHttpClient': true }).get(preference.get("url") + "/api.php/provide/vod?ac=detail" + url, { "Referer": preference.get("url") })).body;
    }
    getHeaders(url) {
        throw new Error("getHeaders not implemented");
    }
    async getPopular(page) {
        // let genres = [];
        // const gen = JSON.parse(await this.request("&ac=list"));
        // gen.class.forEach((e) => {
        //     genres.push({
        //         type_name: "SelectOption",
        //         value: e.type_id,
        //         name: e.type_name
        //     });
        // });
        // console.log(genres)
        const res = JSON.parse(await this.request(`&pg=${page}`));
        return {
            list: res.list.map((e) => ({
                link: "&ids=" + e.vod_id,
                imageUrl: e.vod_pic,
                name: e.vod_name
            })),
            hasNextPage: true
        };
    }
    async getLatestUpdates(page) {
        const h = (new Date().getUTCHours() + 9) % 24;
        const res = JSON.parse(await this.request(`&pg=${page}&h=${h || 24}`));
        return {
            list: res.list.map((e) => ({
                link: "&ids=" + e.vod_id,
                imageUrl: e.vod_pic,
                name: e.vod_name
            })),
            hasNextPage: true
        };
    }
    async search(query, page, filters) {
        var categories;
        for (const filter of filters) {
            if (filter["type"] == "categories") {
                categories = filter["values"][filter["state"]]["value"];
            }
        }
        const res = JSON.parse(await this.request(`&wd=${query}&t=${categories ?? ""}&pg=${page}`));
        return {
            list: res.list.map((e) => ({
                link: "&ids=" + e.vod_id,
                imageUrl: e.vod_pic,
                name: e.vod_name
            })),
            hasNextPage: true
        };
    }

    // v0.0.x (Wu 自有版)：详情 API 直连被拦（手机上 0 集）时的兜底：
    // 内置浏览器打开同一 API 地址，等 body 里出现 vod_name 再把 JSON 交回来。
    async loadDetailJsonViaWebview(apiUrl) {
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
        var t = "";
        try { t = document.body ? document.body.innerText : ""; } catch (e) {}
        if (t && (t.indexOf("vod_name") !== -1 || t.indexOf("\"list\"") !== -1)) {
          send({json: t, error: ""});
          return;
        }
        if (Date.now() - started > 14500) send({json: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
        let result;
        try {
            result = await evaluateJavascriptViaWebview(apiUrl, { "Referer": apiUrl }, [script], 18);
        } catch (_) { return ""; }
        try {
            const data = JSON.parse(String(result || ""));
            return (data && data.json) ? data.json : "";
        } catch (_) { return ""; }
    }

    async getDetail(url) {
        let desc = "无";
        let detailJson = "";
        try { detailJson = await this.request(url); } catch (_) { detailJson = ""; }
        if (!detailJson || detailJson.indexOf("vod_name") === -1) {
            const pref = new SharedPreferences();
            const apiUrl = (pref.get("url") || "") + "/api.php/provide/vod?ac=detail" + url;
            const wv = await this.loadDetailJsonViaWebview(apiUrl);
            if (wv) detailJson = wv;
        }
        const anime = JSON.parse(detailJson).list[0];
        const blurb = this.text(anime.vod_blurb);
        const content = this.text(anime.vod_content);
        desc = desc.length < blurb?.length ? blurb : desc;
        desc = desc.length < content.length ? content : desc;
        const urls = anime.vod_play_url
            .split("#")
            .filter((e) => e)
            .map((e) => {
                const s = e.split("$");
                return { name: s[0], url: s[1] };
            });
        return {
            name: anime.vod_name,
            imageUrl: anime.vod_pic,
            description: desc,
            episodes: urls
        };
    }
    // For anime episode video list
    async getVideoList(url) {
        return [{
            url: url,
            originalUrl: url,
            quality: "HLS"
        }];
    }
    // For manga chapter pages
    async getPageList() {
        throw new Error("getPageList not implemented");
    }
    getFilterList() {
        return [{
            type: "categories",
            name: "影片類型",
            type_name: "SelectFilter",
            values: [
                // { type_name: "SelectOption", value: "1", name: "电影" },
                // { type_name: "SelectOption", value: "2", name: "连续剧" },
                // { type_name: "SelectOption", value: "3", name: "综艺" },
                { type_name: "SelectOption", value: "", name: "全部" },
                { type_name: "SelectOption", value: "5", name: "伦理片" },
                { type_name: "SelectOption", value: "6", name: "动作片" },
                { type_name: "SelectOption", value: "7", name: "喜剧片" },
                { type_name: "SelectOption", value: "8", name: "爱情片" },
                { type_name: "SelectOption", value: "9", name: "科幻片" },
                { type_name: "SelectOption", value: "10", name: "恐怖片" },
                { type_name: "SelectOption", value: "11", name: "剧情片" },
                { type_name: "SelectOption", value: "12", name: "战争片" },
                { type_name: "SelectOption", value: "13", name: "国产剧" },
                { type_name: "SelectOption", value: "14", name: "香港剧" },
                { type_name: "SelectOption", value: "15", name: "韩国剧" },
                { type_name: "SelectOption", value: "16", name: "欧美剧" },
                { type_name: "SelectOption", value: "17", name: "体育" },
                { type_name: "SelectOption", value: "18", name: "NBA" },
                { type_name: "SelectOption", value: "20", name: "惊悚片" },
                { type_name: "SelectOption", value: "21", name: "家庭篇" },
                { type_name: "SelectOption", value: "22", name: "古装片" },
                { type_name: "SelectOption", value: "23", name: "历史片" },
                { type_name: "SelectOption", value: "24", name: "悬疑片" },
                { type_name: "SelectOption", value: "25", name: "犯罪片" },
                { type_name: "SelectOption", value: "26", name: "灾难片" },
                { type_name: "SelectOption", value: "27", name: "纪录片" },
                { type_name: "SelectOption", value: "28", name: "短片" },
                { type_name: "SelectOption", value: "29", name: "动画片" },
                { type_name: "SelectOption", value: "30", name: "台湾剧" },
                { type_name: "SelectOption", value: "31", name: "日本剧" },
                { type_name: "SelectOption", value: "32", name: "海外剧" },
                { type_name: "SelectOption", value: "33", name: "泰国剧" },
                { type_name: "SelectOption", value: "34", name: "大陆综艺" },
                { type_name: "SelectOption", value: "35", name: "港台综艺" },
                { type_name: "SelectOption", value: "36", name: "日韩综艺" },
                { type_name: "SelectOption", value: "37", name: "欧美综艺" },
                { type_name: "SelectOption", value: "38", name: "国产动漫" },
                { type_name: "SelectOption", value: "39", name: "欧美动漫" },
                { type_name: "SelectOption", value: "40", name: "日韩动漫" },
                { type_name: "SelectOption", value: "41", name: "足球" },
                { type_name: "SelectOption", value: "42", name: "篮球" },
                { type_name: "SelectOption", value: "43", name: "未分类" },
                { type_name: "SelectOption", value: "45", name: "西部片" },
                { type_name: "SelectOption", value: "46", name: "爽文短剧" },
                { type_name: "SelectOption", value: "47", name: "现代都市" },
                { type_name: "SelectOption", value: "48", name: "脑洞悬疑" },
                { type_name: "SelectOption", value: "49", name: "年代穿越" },
                { type_name: "SelectOption", value: "50", name: "古装仙侠" },
                { type_name: "SelectOption", value: "51", name: "反转爽剧" },
                { type_name: "SelectOption", value: "52", name: "女频恋爱" },
                { type_name: "SelectOption", value: "53", name: "成长逆袭" }
            ]
        }];
    }
    getSourcePreferences() {
        return [
            {
                "key": "url",
                "listPreference": {
                    "title": "Website Url",
                    "summary": "",
                    "valueIndex": 0,
                    "entries": ["360zycom", "360zynet", "360zytop", "360zytv"],
                    "entryValues": ["https://360zy.com", "https://360zy.net", "https://360zy.top", "https://360zy.tv"],
                }
            }
        ];
    }
}
