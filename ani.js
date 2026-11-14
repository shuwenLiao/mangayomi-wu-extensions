const mangayomiSources = [{
  "name": "ANi",
  "lang": "zh",
  "baseUrl": "https://open.ani.rip",
  "apiUrl": "",
  "iconUrl": "https://open.ani.rip/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.2",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "ani.js"
}];

// ANi（open.ani.rip，Telegram 频道 t.me/channel_ani）。
// 唯一公开 API 是 Resources Core 的 RSS：https://api.ani.rip/ani-download.xml
// （官网 open.ani.rip 被 Cloudflare 挡，API 子域名可直接访问）。
// 每条 <item> = 一集：
//   <title><![CDATA[[ANi] 番名 - 06 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4]]></title>
//   <link>https://resources.ani.rip/2026-10/...mp4?d=mp4</link>  ← 直链 MP4，HEAD 验证过：HTTP 200，Content-Type: video/mp4
//   <category><![CDATA[<番剧 UUID>]]></category>  ← 同一部番共用一个 UUID，当番剧 id 用
//   <pubDate>…</pubDate>  <anime:size>15.1 MB</anime:size>
// 播放：剧集地址本身就是直链 MP4，不用解析器、不用 WebView。
// 限制（写清楚，不藏着）：RSS 是固定的一份“最近更新”，约 53 条、52 部番、只覆盖最近一周，
//   没有分页、没有搜索接口（?page=2、?limit=200 返回同一份）；所以搜索只能在最近一周的番里找，
//   老番（比如 JOJO）不在 feed 里就搜不到；详情也只有 feed 里那几集。看当季新番够用，补老番得用别的源。
// 种子 API（ani-torrent.xml）只有 .torrent 文件，不能原生播，不做。

const ANI_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ANI_RSS = "https://api.ani.rip/ani-download.xml";

class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) return text;
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
    return { "User-Agent": ANI_UA, "Accept": "application/rss+xml, application/xml, text/xml, */*" };
  }

  // RSS 用正则解析（Mangayomi 的 Document 是 HTML 解析器，XML 用正则更稳）。
  // 标题格式：[ANi] 番名 - 06 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4
  parseRss(xml) {
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml || "")) !== null) {
      const body = m[1] || "";
      const titleM = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(body);
      const linkM = /<link>([\s\S]*?)<\/link>/i.exec(body);
      const catM = /<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/i.exec(body);
      if (!titleM || !linkM) continue;
      const rawTitle = (titleM[1] || "").trim();
      const link = (linkM[1] || "").trim();
      const uuid = catM ? (catM[1] || "").trim() : "";
      // 去掉 [ANi] 前缀和 .mp4 后缀，再拆“番名 - 集数”
      let t = rawTitle.replace(/^\[ANi\]\s*/i, "").replace(/\.mp4\s*$/i, "");
      let animeName = t, epNum = "";
      const dash = t.match(/^(.*)\s+-\s+(\d+(?:\.\d+)?)\s*\[/);
      if (dash) {
        animeName = dash[1].trim();
        epNum = dash[2];
      } else {
        const dash2 = t.match(/^(.*)\s+-\s+(\d+(?:\.\d+)?)\s*$/);
        if (dash2) { animeName = dash2[1].trim(); epNum = dash2[2]; }
      }
      if (!animeName || !link) continue;
      items.push({
        animeName: this.fixText(animeName),
        epNum: epNum,
        epName: epNum ? ("第" + epNum + "集") : rawTitle,
        link: link,
        uuid: uuid
      });
    }
    return items;
  }

  async fetchRss() {
    const res = await new Client().get(ANI_RSS, this.headers());
    return this.parseRss(res.body || "");
  }

  // 按番剧 UUID 分组，一部番一条；link 用 "ani:<uuid>"，getDetail 凭它过滤
  groupByAnime(items) {
    const map = {};
    const order = [];
    for (const it of items) {
      const key = it.uuid || ("name:" + it.animeName);
      if (!map[key]) {
        map[key] = { name: it.animeName, imageUrl: "", link: "ani:" + key, count: 0 };
        order.push(key);
      }
      map[key].count += 1;
    }
    return order.map(function(k) { return map[k]; });
  }

  async getPopular(page) {
    const items = await this.fetchRss();
    return { list: this.groupByAnime(items), hasNextPage: false };
  }

  async getLatestUpdates(page) {
    return await this.getPopular(page);
  }

  // 只能在 RSS 最近一周的番里搜，老番搜不到（见文件头说明）
  async search(query, page, filters) {
    const q = String(query || "").trim().toLowerCase();
    const items = await this.fetchRss();
    const filtered = q ? items.filter(function(it) {
      return it.animeName.toLowerCase().indexOf(q) !== -1;
    }) : items;
    return { list: this.groupByAnime(filtered), hasNextPage: false };
  }

  async getDetail(url) {
    const key = String(url || "").replace(/^ani:/, "");
    const items = await this.fetchRss();
    const eps = [];
    for (const it of items) {
      const k = it.uuid || ("name:" + it.animeName);
      if (k !== key) continue;
      eps.push({ name: it.epName, url: it.link, _num: it.epNum });
    }
    // 按集数升序
    eps.sort(function(a, b) {
      const na = parseFloat(a._num || "0"), nb = parseFloat(b._num || "0");
      if (na !== nb) return na - nb;
      return a.name < b.name ? -1 : 1;
    });
    const name = eps.length > 0 ? "" : "";
    let animeName = "";
    for (const it of items) {
      const k = it.uuid || ("name:" + it.animeName);
      if (k === key) { animeName = it.animeName; break; }
    }
    return {
      name: animeName,
      imageUrl: "",
      description: "",
      genre: [],
      status: 3,
      episodes: eps.map(function(e) { return { name: e.name, url: e.url }; })
    };
  }

  // v0.0.2：resources.ani.rip 的直链固定 301 到 cloud.ani-download.workers.dev
  // （同路径，只换域名），播放器跟重定向不可靠，直接给最终地址；
  // 另带 Referer + UA 头。
  // 剧集地址本身就是直链 MP4，直接返回；质量标 1080P（RSS 标题里即是）
  async getVideoList(url) {
    const u = String(url || "").trim();
    if (!u) return [];
    const finalUrl = u.replace(/^https:\/\/resources\.ani\.rip\//, "https://cloud.ani-download.workers.dev/");
    return [{ url: finalUrl, originalUrl: finalUrl, quality: "1080P", headers: { "Referer": "https://open.ani.rip/", "User-Agent": ANI_UA } }];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "ANi 网址",
        "value": "https://open.ani.rip",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
