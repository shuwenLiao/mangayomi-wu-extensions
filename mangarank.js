const mangayomiSources = [{
  "name": "漫画排行榜",
  "lang": "zh",
  "baseUrl": "https://www.manhuagui.com",
  "apiUrl": "",
  "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/zh.manhuagui.png",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "mangarank.js"
}];

// 漫画排行榜（漫画柜 https://www.manhuagui.com 的排行榜，信息 + 可读）。
// 排行榜页（已验证 HTTP 200）：
//   日排行 /rank/ ，周排行 /rank/week.html ，月排行 /rank/month.html ，总排行 /rank/total.html
//   每页 50 部，是一个 <table>：每行 <td class="rank-no">名次</td>
//   <td class="rank-title"><h5><a href="/comic/7580/">一拳超人</a></h5> [连载]</td>
//   <td class="rank-author">作者</td> <td class="rank-update">最新章节</td>
//   <td class="rank-time">更新时间</td> <td class="rank-score">9.3</td>。
//   排行榜页本身没有封面，但封面地址可由漫画 id 直接拼出来：
//   https://cf.mhgui.com/cpic/h/{comic_id}.jpg（已验证 /comic/7580/ 的封面就是这个格式）。
//   列表名字前加名次（"1. 一拳超人"），一眼看到排名。
// 排行榜类型切换：来源设置里的"排行榜类型"（日/周/月/总，默认总排行），
//   浏览页的筛选器也能切（search 空关键词时按筛选器的类型返回对应榜单）。
// 详情/章节：详情页用 Document 选择器取标题/封面/简介/作者/状态；章节目录按
// /comic/{id}/{chapter}.html 认链接（不按 class，站上已不用 status0）。
// 章节图片：2026-11-15 实测章节页是 JS 动态加载的空壳，静态 HTML 里没有图片地址，
// m2k3a 老代码的 packed-JS 解码在当前页面上找不到 packed 段——图片接口暂未打通，
// getPageList 会明说，读正文去动漫屋 / 漫画人搜同名。

LZString = function() {
  function o(o, r) {
    if (!t[o]) {
      t[o] = {};
      for (var n = 0; n < o.length; n++) t[o][o.charAt(n)] = n
    }
    return t[o][r]
  }
  var r = String.fromCharCode,
    n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
    e = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",
    t = {},
    i = {
      decompressFromBase64: function(r) {
        return null == r ? "" : "" == r ? null : i._decompress(r.length, 32, function(e) {
          return o(n, r.charAt(e))
        })
      },
      _decompress: function(o, n, e) {
        var t, i, s, p, u, c, a, l, f = [],
          h = 4,
          d = 4,
          m = 3,
          v = "",
          w = [],
          A = {
            val: e(0),
            position: n,
            index: 1
          };
        for (i = 0; 3 > i; i += 1) f[i] = i;
        for (p = 0, c = Math.pow(2, 2), a = 1; a != c;) u = A.val & A.position, A.position >>= 1, 0 == A.position && (A.position = n, A.val = e(A.index++)), p |= (u > 0 ? 1 : 0) * a, a <<= 1;
        switch (t = p) {
          case 0:
            for (p = 0, c = Math.pow(2, 8), a = 1; a != c;) u = A.val & A.position, A.position >>= 1, 0 == A.position && (A.position = n, A.val = e(A.index++)), p |= (u > 0 ? 1 : 0) * a, a <<= 1;
            l = r(p);
            break;
          case 1:
            for (p = 0, c = Math.pow(2, 16), a = 1; a != c;) u = A.val & A.position, A.position >>= 1, 0 == A.position && (A.position = n, A.val = e(A.index++)), p |= (u > 0 ? 1 : 0) * a, a <<= 1;
            l = r(p);
            break;
          case 2:
            return ""
        }
        for (f[3] = l, s = l, w.push(l);;) {
          if (A.index > o) return "";
          for (p = 0, c = Math.pow(2, m), a = 1; a != c;) u = A.val & A.position, A.position >>= 1, 0 == A.position && (A.position = n, A.val = e(A.index++)), p |= (u > 0 ? 1 : 0) * a, a <<= 1;
          switch (l = p) {
            case 0:
              for (p = 0, c = Math.pow(2, 8), a = 1; a != c;) u = A.val & A.position, A.position >>= 1, 0 == A.position && (A.position = n, A.val = e(A.index++)), p |= (u > 0 ? 1 : 0) * a, a <<= 1;
              f[d++] = r(p), l = d - 1, h--;
              break;
            case 1:
              for (p = 0, c = Math.pow(2, 16), a = 1; a != c;) u = A.val & A.position, A.position >>= 1, 0 == A.position && (A.position = n, A.val = e(A.index++)), p |= (u > 0 ? 1 : 0) * a, a <<= 1;
              f[d++] = r(p), l = d - 1, h--;
              break;
            case 2:
              return w.join("")
          }
          if (0 == h && (h = Math.pow(2, m), m++), f[l]) v = f[l];
          else {
            if (l !== d) return null;
            v = s + s.charAt(0)
          }
          w.push(v), f[d++] = s + v.charAt(0), h--, s = v, 0 == h && (h = Math.pow(2, m), m++)
        }
      }
    };
  return i
}();

class DefaultExtension extends MProvider {
  // 不用 this.source（本地其他扩展都不用它，是否由运行环境提供未经证实）：
  // 域名写死 + 可在来源设置里改，和 dm5.js 的做法一致。
  getBaseUrl() {
    try {
      const preference = new SharedPreferences();
      var base_url = preference.get("domain_url");
      if (base_url) {
        if (base_url.endsWith("/")) return base_url.slice(0, -1);
        return base_url;
      }
    } catch (_) {}
    return "https://www.manhuagui.com";
  }

  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
      "Referer": this.getBaseUrl() + "/"
    };
  }

  rankUrl(type) {
    if (type === "day") return "/rank/";
    if (type === "week") return "/rank/week.html";
    if (type === "month") return "/rank/month.html";
    return "/rank/total.html";
  }

  rankTypeFromPrefs() {
    try {
      const pref = new SharedPreferences();
      const t = pref.get("ranktype");
      if (t === "day" || t === "week" || t === "month" || t === "total") return t;
    } catch (_) {}
    return "total";
  }

  // 排行榜表格：每行 <tr> 里取 名次 / 漫画链接 / 名字 / 评分 / 更新时间
  async getRankList(type) {
    const url = this.getBaseUrl() + this.rankUrl(type);
    const res = await new Client().get(url, this.headers());
    const body = res.body || "";
    const items = [];
    const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(body)) !== null) {
      const row = m[1];
      const rankM = row.match(/<td class="rank-no"><span class="rank-no\d*">(\d+)<\/span><\/td>/);
      const titleM = row.match(/<td class="rank-title"><h5><a href="(\/comic\/(\d+)\/)">([^<]+)<\/a><\/h5>/);
      if (!rankM || !titleM) continue;
      const rank = rankM[1];
      const link = titleM[1];
      const comicId = titleM[2];
      const name = titleM[3].trim();
      const scoreM = row.match(/<td class="rank-score">([^<]*)<\/td>/);
      const score = scoreM ? scoreM[1].trim() : "";
      items.push({
        name: rank + ". " + name + (score ? "（" + score + "分）" : ""),
        imageUrl: "https://cf.mhgui.com/cpic/h/" + comicId + ".jpg",
        link: link
      });
    }
    return { list: items, hasNextPage: false };
  }

  async getPopular(page) {
    return await this.getRankList(this.rankTypeFromPrefs());
  }

  async getLatestUpdates(page) {
    // “最新”固定看周排行（本周热度），和“热门”（设置里的榜单，默认总排行）分开
    return await this.getRankList("week");
  }

  async getItems(url, p) {
    const res = await new Client().get(this.getBaseUrl() + url, this.headers());
    const doc = new Document(res.body);
    const mangas = [];
    const elements = doc.select(p);
    for (const element of elements) {
      const title = element.selectFirst("a").attr("title");
      const url = element.selectFirst("a").attr("href");
      var cover = element.selectFirst("img").attr("src");
      if (cover == "") {
        cover = element.selectFirst("img").attr("data-src");
      }
      cover = "https:" + cover;
      mangas.push({
        name: title,
        imageUrl: cover,
        link: url
      });
    }
    return {
      list: mangas,
      hasNextPage: true
    };
  }

  // 搜索：空关键词 + 选了排行榜筛选器 → 返回对应榜单；否则走站内搜索
  async search(query, page, filters) {
    const q = String(query || "").trim();
    // 直接搜“月榜/总榜/周榜/日榜”就返回对应榜单（搜站内同名漫画是搜不到的）
    const rankWords = { "月榜": "month", "月排行": "month", "总榜": "total", "总排行": "total", "周榜": "week", "周排行": "week", "日榜": "day", "日排行": "day" };
    if (rankWords[q]) return await this.getRankList(rankWords[q]);
    if (!q && filters) {
      for (const filter of filters) {
        if (filter["type"] == "ranktype") {
          const v = filter["values"][filter["state"]]["value"];
          if (v === "day" || v === "week" || v === "month" || v === "total") {
            return await this.getRankList(v);
          }
        }
      }
    }
    if (!q) return await this.getPopular(page);
    // 站内搜索：第 1 页是 /s/{关键词}.html，从第 2 页起才是 /s/{关键词}_p{页}.html
    // （_p1.html 是 404，2026-11-15 实测）
    const searchUrl = page > 1 ? `/s/${q}_p${page}.html` : `/s/${q}.html`;
    return await this.getItems(searchUrl, "div.book-result li");
  }

  async getDetail(url) {
    const res = await new Client().get(this.getBaseUrl() + url, this.headers());
    const doc = new Document(res.body);
    const title = doc.selectFirst("div.book-title h1").text;
    const cover = "https:" + doc.selectFirst("p.hcover img").attr("src");
    const desc = doc.selectFirst("div#intro-all").text;
    const info = doc.select("ul.detail-list li")[1].select("span");
    const authors = info[1].text.replace("漫画作者：", "");
    const genres = info[0].select("a").map(e => e.text);
    const status_str = doc.selectFirst("li.status span").text;
    var status;
    if (status_str == "已完结") {
      status = 1;
    } else {
      status = 0;
    }
    const eps = [];
    var chapter_html;
    if (res.body.search("请点击此处继续阅读！") == -1) {
      chapter_html = doc;
    } else {
      const text = LZString.decompressFromBase64(doc.selectFirst("input#__VIEWSTATE").attr("value"));
      chapter_html = new Document(text);
    }
    const ch_title = chapter_html.select("h4 span");
    const chapters = chapter_html.select("div.chapter-list")
    // 章节锚点按 href 认（/comic/{id}/{chapter}.html），不按 class 认：
    // 站上现在章节链接是 class="blue"，m2k3a 老代码用的 a.status0 在当前页面是 0 个，
    // 按 class 取会取到空目录（2026-11-15 实测 /comic/7580/）。
    // 页面是最新章在前，整体 reverse 一次，返回最旧章在前。
    var index = 0;
    const seenEp = {};
    for (const chs of ch_title) {
      if (!chapters[index]) break;
      const t = chs.text;
      for (const ch of chapters[index].select("ul")) {
        for (const c of ch.select("a")) {
          const href = c.attr("href") || "";
          if (!/\/comic\/\d+\/\d+\.html$/.test(href)) continue;
          if (seenEp[href]) continue;
          seenEp[href] = true;
          const nm = (c.text || c.attr("title") || "").trim();
          if (!nm) continue;
          eps.push({ name: `|${t}|` + nm, url: href });
        }
      }
      index = index + 1;
    }
    eps.reverse();
    return {
      name: title,
      imageUrl: cover,
      description: desc + "\n\n【本源说明】榜单与目录来自漫画柜；章节图片是漫画柜 JS 动态加载的，本源暂未打通图片接口，点章节会提示——读正文请去动漫屋 / 漫画人搜同名。",
      genre: genres,
      author: authors,
      status: status,
      episodes: eps,
      chapters: eps
    };
  }

  async getPageList(url) {
    // 2026-11-15 实测：漫画柜章节页是 8KB 空壳，图片地址不在静态 HTML 里，
    // 是外部 core_*.js 动态加载的；m2k3a 老代码的 packed-JS 解码在当前页面上
    // 找不到 packed 段，解不出来。先明说，不让用户点开看空白。
    throw new Error("漫画柜章节图暂未打通（图片是 JS 动态加载的）：读正文请去动漫屋 / 漫画人搜同名漫画。");
  }

  getFilterList() {
    return [{
      type: "ranktype",
      name: "排行榜",
      type_name: "SelectFilter",
      values: [{
          type_name: "SelectOption",
          name: "总排行",
          value: "total"
        },
        {
          type_name: "SelectOption",
          name: "日排行",
          value: "day"
        },
        {
          type_name: "SelectOption",
          name: "周排行",
          value: "week"
        },
        {
          type_name: "SelectOption",
          name: "月排行",
          value: "month"
        }
      ]
    }];
  }

  getSourcePreferences() {
    return [{
        "key": "domain_url",
        "editTextPreference": {
          "title": "Url",
          "summary": "漫画柜网址（换域名时改这里）",
          "value": "https://www.manhuagui.com",
          "dialogTitle": "URL",
          "dialogMessage": ""
        }
      },
      {
        "key": "ranktype",
        "listPreference": {
          "title": "排行榜类型",
          "summary": "热门/最新默认显示哪个榜单",
          "valueIndex": 3,
          "entries": ["日排行", "周排行", "月排行", "总排行"],
          "entryValues": ["day", "week", "month", "total"],
        }
      }
    ];
  }
}
