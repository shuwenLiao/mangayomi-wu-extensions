const mangayomiSources = [{
  "name": "漫画排行榜",
  "lang": "zh",
  "baseUrl": "https://www.manhuagui.com",
  "apiUrl": "",
  "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/zh.manhuagui.png",
  "typeSource": "single",
  "itemType": 0,
  "isNsfw": false,
  "version": "0.0.3",
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
// v0.0.2 备用链（2026-11-15：吴的手机上漫画柜一直被拦，榜单空白）：
//   getRankList 按顺序试：①漫画柜直连 → ②拷贝漫画排行榜
//   （https://www.mangacopy.com/rank，日榜；周/月/总榜是
//   /rank?type=male&table=week|month|total，四者 2026-11-15 均实测 HTTP 200，
//   每页 50 部，行结构 <li class="col-4">，名次在 .ranking-all-icon，
//   链接是 /comic/{slug}，封面在 img.lazyload 的 data-src，
//   热度在火焰图标后如 1660.1W）→ ③内置浏览器加载漫画柜排行页。
//   哪一级备用榜出了数据，只在第一条名字前标注来源（【拷贝漫画】/
//   【漫画柜·浏览器】），其余条目不变。备用榜条目的 link 是拷贝漫画的
//   /comic/{slug}，getDetail 有专门分支：读标题/封面/状态，不展开章节目录，
//   说明去「拷贝漫画」源搜同名看正文（拷贝漫画详情页是 JS 空壳，章节目录
//   不在静态 HTML 里）。漫画柜直连的条目仍走原来的 getDetail。
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

  // 漫画柜排行榜表格：每行 <tr> 里取 名次 / 漫画链接 / 名字 / 评分
  parseManhuaguiRank(body) {
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
    return items;
  }

  async fetchManhuaguiRank(type) {
    const url = this.getBaseUrl() + this.rankUrl(type);
    const res = await new Client().get(url, this.headers());
    return this.parseManhuaguiRank(res.body || "");
  }

  // 拷贝漫画排行榜地址：日榜是 /rank；周/月/总榜是查询参数（路径 /rank/week 等是 404）
  copyRankUrl(type) {
    if (type === "week") return "/rank?type=male&table=week";
    if (type === "month") return "/rank?type=male&table=month";
    if (type === "total") return "/rank?type=male&table=total";
    return "/rank";
  }

  // 拷贝漫画排行行：<li class="col-4">，名次在 .ranking-all-icon，
  // 链接 /comic/{slug}，标题在 p.threeLines 的 title 属性，封面在
  // img.lazyload 的 data-src，热度在火焰图标后（如 1660.1W）
  parseCopyRank(body) {
    const items = [];
    const rowRe = /<li class="col-4">([\s\S]*?)<\/li>/g;
    let m;
    while ((m = rowRe.exec(body)) !== null) {
      const row = m[1];
      const rankM = row.match(/ranking-all-icon[^>]*>(\d+)</);
      const linkM = row.match(/href="(\/comic\/[a-z0-9_-]+)"/i);
      if (!rankM || !linkM) continue;
      const rank = rankM[1];
      const link = linkM[1];
      let name = "";
      const titleM = row.match(/<p class="threeLines"[^>]*title="([^"]+)"/);
      if (titleM) name = titleM[1].trim();
      if (!name) {
        const textM = row.match(/<p class="threeLines"[^>]*>([^<]+)<\/p>/);
        if (textM) name = textM[1].trim();
      }
      if (!name) continue;
      let cover = "";
      const imgM = row.match(/<img[^>]*data-src="([^"]+)"/);
      if (imgM) cover = imgM[1];
      if (!cover) {
        const srcM = row.match(/<img[^>]*src="(https:[^"]+)"/);
        if (srcM) cover = srcM[1];
      }
      const heatM = row.match(/flameIcon allIcon"><\/span>([^<]+)</);
      const heat = heatM ? heatM[1].trim() : "";
      items.push({
        name: rank + ". " + name + (heat ? "（" + heat + "）" : ""),
        imageUrl: cover,
        link: link
      });
    }
    return items;
  }

  async fetchCopyRank(type) {
    const url = "https://www.mangacopy.com" + this.copyRankUrl(type);
    const res = await new Client().get(url, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
      "Referer": "https://www.mangacopy.com/"
    });
    return this.parseCopyRank(res.body || "");
  }

  // 内置浏览器加载漫画柜排行页（最后手段）：等 td.rank-no 出现就把整页 HTML
  // 交回来解析；验证页/超时返回空串。沿用 pimpbunny.js 的写法。
  async loadManhuaguiViaWebview(type) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const url = this.getBaseUrl() + this.rankUrl(type);
    const script = String.raw`(function(){
      if (window.__mrRead) return;
      window.__mrRead = true;
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
          if (!guarded && document.querySelector('td.rank-no')) {
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
    } catch (_) {
      return "";
    }
    let data;
    try { data = JSON.parse(String(result || "")); } catch (_) { return ""; }
    if (!data || !data.html) return "";
    return data.html;
  }

  // 排行榜备用链：漫画柜直连 → 拷贝漫画 → 内置浏览器加载漫画柜。
  // 哪一级出了数据就用哪一级；备用榜只在第一条名字前标注来源。
  async getRankList(type) {
    try {
      const items = await this.fetchManhuaguiRank(type);
      if (items.length > 0) return { list: items, hasNextPage: false };
    } catch (_) {}
    try {
      const items = await this.fetchCopyRank(type);
      if (items.length > 0) {
        items[0].name = "【拷贝漫画】" + items[0].name;
        return { list: items, hasNextPage: false };
      }
    } catch (_) {}
    try {
      const html = await this.loadManhuaguiViaWebview(type);
      if (html) {
        const items = this.parseManhuaguiRank(html);
        if (items.length > 0) {
          items[0].name = "【漫画柜·浏览器】" + items[0].name;
          return { list: items, hasNextPage: false };
        }
      }
    } catch (_) {}
    return { list: [], hasNextPage: false };
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
    // 备用榜（拷贝漫画）的条目是 /comic/{slug}，不是漫画柜的数字 id：
    // 走拷贝漫画详情分支，只读标题/封面/状态，不展开章节目录。
    if (/^\/comic\/[a-z][a-z0-9_-]*$/i.test(url)) {
      return await this.getCopyDetail(url);
    }
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

  // 拷贝漫画详情页是 15KB 左右的 JS 空壳：标题在 <h6>，封面在 img.lazyload
  // 的 data-src，章节目录不在静态 HTML 里（只有“開始閱讀”一个链接）。
  // 所以只返回标题/封面/状态/类型，章节列表为空，说明去「拷贝漫画」源
  // 搜同名看正文。

  // v0.0.3：拷贝漫画章节/图片是 AES 加密的，照抄 m2k3a copymanga.js 的解码
  //（cryptoHandler 是 Mangayomi 桥提供的全局，拷贝漫画源一直在用）。
  base64encode(str) {
    const base64EncodeChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var out, i, len;
    var c1, c2, c3;
    len = str.length;
    i = 0;
    out = "";
    while (i < len) {
      c1 = str.charCodeAt(i++) & 0xff;
      if (i == len) {
        out += base64EncodeChars.charAt(c1 >> 2);
        out += base64EncodeChars.charAt((c1 & 0x3) << 4);
        out += "==";
        break;
      }
      c2 = str.charCodeAt(i++);
      if (i == len) {
        out += base64EncodeChars.charAt(c1 >> 2);
        out += base64EncodeChars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
        out += base64EncodeChars.charAt((c2 & 0xF) << 2);
        out += "=";
        break;
      }
      c3 = str.charCodeAt(i++);
      out += base64EncodeChars.charAt(c1 >> 2);
      out += base64EncodeChars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
      out += base64EncodeChars.charAt(((c2 & 0xF) << 2) | ((c3 & 0xC0) >> 6));
      out += base64EncodeChars.charAt(c3 & 0x3F);
    }
    return out;
  }

  decode(result) {
    var iv = result.substring(0, 16);
    result = result.replace(iv, "");
    const bytes = [];
    for (var i = 0; i < result.length; i = i + 2) {
      bytes.push(parseInt(result.substr(i, 2), 16));
    }
    var charString = String.fromCharCode.apply(null, bytes);
    const data = this.base64encode(charString);
    const text = cryptoHandler(data, iv, "xxxmanga.woo.key", false);
    return text;
  }

  async getCopyDetail(url) {
    const res = await new Client().get("https://www.mangacopy.com" + url, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
      "Referer": "https://www.mangacopy.com/"
    });
    const body = res.body || "";
    let name = "";
    const h6M = body.match(/<h6[^>]*>([^<]+)<\/h6>/);
    if (h6M) name = h6M[1].trim();
    if (!name) {
      const tM = body.match(/<title>\s*([^\-<]+)/);
      if (tM) name = tM[1].trim();
    }
    let cover = "";
    const imgM = body.match(/<img[^>]*data-src="(https:[^"]+cover[^"]*)"/);
    if (imgM) cover = imgM[1];
    const titleTag = body.match(/<title>([\s\S]*?)<\/title>/);
    const titleText = titleTag ? titleTag[1].replace(/\s+/g, " ").trim() : "";
    const genres = [];
    const genreM = titleText.match(/-(連載中|已完結)-([^-\n]+)-在线阅读/);
    if (genreM) {
      for (const g of genreM[2].split(",")) {
        const gg = g.trim();
        if (gg) genres.push(gg);
      }
    }
    const status = /已完結/.test(titleText) ? 1 : 0;
    const latestM = titleText.match(/第(\d+)话/);
    // v0.0.3：章节目录走 /comicdetail/{slug}/chapters（和拷贝漫画源同一接口），
    // 解码后展开；解不开就保持 0 章（不抛错，榜单本身还能看）。
    const slug = String(url || "").split("/").filter(Boolean).pop() || "";
    const episodes = [];
    try {
      const chRes = await new Client().get("https://www.mangacopy.com/comicdetail/" + slug + "/chapters", {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
      });
      const chText = JSON.parse(chRes.body || "{}")["results"] || "";
      const chapterDatas = JSON.parse(this.decode(chText));
      const list = (chapterDatas && chapterDatas.groups && chapterDatas.groups.default && chapterDatas.groups.default.chapters) || [];
      for (const ch of list) {
        if (!ch || !ch.id) continue;
        episodes.push({ name: String(ch.name || "").trim() || ("第" + (episodes.length + 1) + "话"), url: slug + "|" + ch.id });
      }
      episodes.reverse();
    } catch (_) { /* 解不开就 0 章，榜单照常显示 */ }
    return {
      name: name || url,
      imageUrl: cover,
      description: "【拷贝漫画榜单】本条来自拷贝漫画排行榜（漫画柜被拦时的备用榜）。" + (latestM ? "最新第" + latestM[1] + "话。" : "") + (episodes.length ? "" : "章节目录暂时拉不到。"),
      genre: genres,
      author: "",
      status: status,
      episodes: episodes,
      chapters: episodes
    };
  }

  async getPageList(url) {
    // v0.0.3：拷贝漫画章节（slug|id）走 contentKey 解码（照抄 copymanga.js）。
    const parts = String(url || "").split("|");
    if (parts.length === 2 && parts[0] && parts[1]) {
      const res = await new Client().get("https://www.mangacopy.com/comic/" + parts[0] + "/chapter/" + parts[1], {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
      });
      const m = (res.body || "").match(/contentKey="(.*)"/);
      if (!m) throw new Error("章节图片取不到（contentKey 缺失）。");
      const results = JSON.parse(this.decode(m[1]));
      return results.map(e => e["url"]);
    }
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
