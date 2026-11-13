const mangayomiSources = [{
  "name": "红果短剧",
  "lang": "zh",
  "baseUrl": "https://hongguoduanju.com",
  "apiUrl": "",
  "iconUrl": "https://hongguoduanju.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "hongguo.js"
}];

class DefaultExtension extends MProvider {
  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://hongguoduanju.com";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.getBaseUrl() + url;
    return this.getBaseUrl() + "/" + url;
  }

  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Referer": this.getBaseUrl() + "/",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
  }

  // 网页内嵌 JSON 里的转义（\u002F、\/ 等）还原
  unescapeJson(s) {
    if (!s) return "";
    return s.replace(/\\u002F/g, "/").replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\"/g, '"');
  }

  pickJsonString(body, key) {
    const m = body.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
    return m ? this.unescapeJson(m[1]) : "";
  }

  // 首页 / 分类页的卡片：链接都是 /detail?series_id=数字
  // 标题在 aria-label="查看XXX" 或后面 img 的 alt 里，封面在后面 img 的 src 里
  parseCards(body) {
    const items = [];
    const seen = {};
    const re = /href="\/detail\?series_id=(\d+)"/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const sid = m[1];
      if (seen[sid]) continue;
      seen[sid] = true;
      const before = body.slice(Math.max(0, m.index - 400), m.index);
      const after = body.slice(m.index, m.index + 2000);
      let name = "";
      const am = before.match(/aria-label="查看([^"]+)"/);
      if (am) {
        name = am[1];
      } else {
        const altm = after.match(/alt="([^"]+)"/);
        if (altm && altm[1]) name = altm[1];
      }
      let imageUrl = "";
      const imgm = after.match(/src="(https:[^"]*novel-pic[^"]*\.image)"/);
      if (imgm) {
        imageUrl = imgm[1];
      } else {
        const srcsetm = after.match(/srcSet="(https:[^"]*novel-pic[^"]*)"/);
        if (srcsetm) imageUrl = srcsetm[1].split(" ")[0];
      }
      if (!name) name = "未命名短剧";
      items.push({
        name: name.trim(),
        imageUrl: imageUrl,
        link: "/detail?series_id=" + sid
      });
    }
    return { list: items, hasNextPage: false };
  }

  async getPopular(page) {
    const res = await new Client().get(this.getBaseUrl() + "/", this.headers());
    return this.parseCards(res.body || "");
  }

  async getLatestUpdates(page) {
    const res = await new Client().get(this.getBaseUrl() + "/category/real-drama", this.headers());
    return this.parseCards(res.body || "");
  }

  async search(query, page, filters) {
    const p = page || 1;
    const res = await new Client().get(
      this.getBaseUrl() + "/api/search/result/?query=" + encodeURIComponent(query) + "&page=" + p,
      this.headers()
    );
    const items = [];
    let hasNextPage = false;
    try {
      const d = JSON.parse(res.body || "{}");
      const list = d.searchList || [];
      for (const it of list) {
        const vd = it.video_data || {};
        if (!vd.series_id || !vd.series_title) continue;
        items.push({
          name: vd.series_title,
          imageUrl: vd.series_cover || "",
          link: "/detail?series_id=" + vd.series_id
        });
      }
      hasNextPage = !!d.hasMore;
    } catch (e) { }
    return { list: items, hasNextPage: hasNextPage };
  }

  async getDetail(url) {
    const m = (url || "").match(/series_id=(\d+)/);
    const sid = m ? m[1] : "";
    const res = await new Client().get(
      this.getBaseUrl() + "/player/" + encodeURIComponent(sid),
      this.headers()
    );
    const body = res.body || "";
    const name = this.pickJsonString(body, "series_name") || "未命名短剧";
    const imageUrl = this.pickJsonString(body, "series_cover");
    const description = this.pickJsonString(body, "series_intro");
    const eps = [];
    const vm = body.match(/"vid_list"\s*:\s*\[([^\]]*)\]/);
    if (vm) {
      const vids = vm[1].split(",").map(function (s) {
        return s.trim().replace(/^"|"$/g, "");
      }).filter(function (s) { return /^\d+$/.test(s); });
      for (let i = 0; i < vids.length; i++) {
        eps.push({
          name: "第" + (i + 1) + "集",
          url: "/player/" + sid + "/" + vids[i]
        });
      }
    }
    return {
      name: name,
      imageUrl: imageUrl,
      description: description,
      genre: [],
      episodes: eps
    };
  }

  async getVideoList(url) {
    // 播放页 /player/{sid}/{vid} 对非首集会 302 跳回首集，页里内嵌的
    // contentUrl 永远是第 1 集的地址，不能拿来当分集地址。
    // 实测分集直链就是 https://hongguoduanju.com/video/public/{vid}/360p.mp4，
    // 直接按 vid 拼出来，不用再请求播放页。
    // 注意：每部剧只有前面几集（一般 5 集）免费，后面的集在公开地址上是 404，
    // 是红果的付费墙，扩展拿不到（要走 App 的签名+加密流，Mangayomi 做不了）。
    const m = (url || "").match(/\/player\/[^/]+\/(\d+)/);
    if (!m) return [];
    const videoUrl = "https://hongguoduanju.com/video/public/" + m[1] + "/360p.mp4";
    return [{ url: videoUrl, originalUrl: videoUrl, quality: "360p" }];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "红果短剧网址",
        "value": "https://hongguoduanju.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
