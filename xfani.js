const mangayomiSources = [{
  "name": "Xfani",
  "lang": "zh",
  "baseUrl": "https://next.xifanacg.com",
  "apiUrl": "",
  "iconUrl": "https://next.xifanacg.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "xfani.js"
}];

// Xfani（稀饭动漫 next.xifanacg.com）。旧版扩展已死：站改成 Next.js 后，
// 它原来调的 JSON 接口现在返回 HTML（Unexpected JSON token 报错）。
// 新版直接调站本身用的 Supabase 接口：
//   列表/搜索：POST api.xifanacg.com/rest/v1/rpc/search_animes
//   首页推荐：POST api.xifanacg.com/rest/v1/rpc/get_homepage_full
//   最近更新：POST api.xifanacg.com/rest/v1/rpc/get_recently_updated_animes
//   详情剧集：番剧页 HTML 是服务端渲染的，直接解析剧集链接
//   播放：POST api.xifanacg.com/functions/v1/issue-web-playback
//        body {"action":"fallback","episode_id":…}，返回直链 mp4/m3u8。
// apikey 是网站前端公开的 publishable key（写在其 JS 里），
// 和网站本身调的是同一个接口、同一把钥匙。

const XF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const XF_API = "https://api.xifanacg.com";
const XF_API_KEY = "sb_publishable_OBIVAWACIX6lPXrO98_z24_HcsmalkA";

class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) return text;
    for (var j = 0; j < text.length; j++) {
      if (text.charCodeAt(j) > 255) return text;
    }
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

  base() { return "https://next.xifanacg.com"; }

  headers() {
    return { "User-Agent": XF_UA, "Accept": "text/html,application/xhtml+xml" };
  }

  apiHeaders() {
    return {
      "Content-Type": "application/json",
      "apikey": XF_API_KEY,
      "Authorization": "Bearer " + XF_API_KEY,
      "User-Agent": XF_UA
    };
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.base() + url;
    return this.base() + "/" + url;
  }

  // Supabase RPC：POST /rest/v1/rpc/<name>，body 为参数 JSON
  async rpc(name, params) {
    const res = await new Client().post(
      XF_API + "/rest/v1/rpc/" + name,
      this.apiHeaders(),
      JSON.stringify(params || {})
    );
    return JSON.parse(res.body || "null");
  }

  toItem(row) {
    if (!row || !row.id) return null;
    return {
      name: this.fixText(row.title || ""),
      imageUrl: row.cover_url || "",
      link: "/anime/" + row.id
    };
  }

  toList(rows) {
    const list = [];
    const seen = {};
    for (const row of rows || []) {
      const it = this.toItem(row);
      if (!it || !it.name || seen[it.link]) continue;
      seen[it.link] = true;
      list.push(it);
    }
    return list;
  }

  // 首页推荐（get_homepage_full 的 recommended 列表）
  async getPopular(page) {
    if (page && page > 1) return { list: [], hasNextPage: false };
    let data = null;
    try { data = await this.rpc("get_homepage_full", {}); } catch (e) { data = null; }
    const list = this.toList(data && data.recommended);
    return { list: list, hasNextPage: false };
  }

  // 最近更新
  async getLatestUpdates(page) {
    if (page && page > 1) return { list: [], hasNextPage: false };
    let data = null;
    try { data = await this.rpc("get_recently_updated_animes", {}); } catch (e) { data = null; }
    const list = this.toList(data);
    return { list: list, hasNextPage: false };
  }

  async search(query, page, filters) {
    const p = page || 1;
    let data = null;
    try {
      data = await this.rpc("search_animes", {
        search_term: query,
        page_number: p,
        items_per_page: 20
      });
    } catch (e) { data = null; }
    const list = this.toList(data);
    let hasNext = false;
    if (data && data.length) {
      const total = data[0].total_count || 0;
      hasNext = total > p * 20;
    }
    return { list: list, hasNextPage: hasNext };
  }

  stripTags(s) {
    return (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  async getDetail(url) {
    let html = "";
    try {
      const res = await new Client().get(this.fullUrl(url), this.headers());
      html = res.body || "";
    } catch (_) { html = ""; }
    let name = "";
    const t = /<title>([^<]+)<\/title>/i.exec(html);
    if (t) name = t[1].split("·")[0].replace(/\(20\d\d\)/g, "").trim();
    let imageUrl = "";
    const cov = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(html);
    if (cov) imageUrl = cov[1];
    let description = "";
    const meta = /<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i.exec(html);
    if (meta) description = this.fixText(meta[1]);
    // 剧集：服务端渲染的链接 /anime/<id>/play/<episodeId>?source=<code>
    const eps = [];
    const re = /<a[^>]*href="\/anime\/\d+\/play\/(\d+)\?source=([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let a;
    while ((a = re.exec(html)) !== null) {
      const epName = this.stripTags(a[3]);
      // 只保留剧集链接（"第 01 集 …"）；排除顶部的"立即观看"按钮
      if (!epName || !/第\s*\d+\s*[集话]/.test(epName)) continue;
      eps.push({
        name: this.fixText(epName),
        url: "/anime/" + (this._detailId(url) || "") + "/play/" + a[1] + "?source=" + a[2]
      });
    }
    return {
      name: this.fixText(name || "Xfani"),
      imageUrl: imageUrl,
      description: description,
      genre: [],
      status: 3,
      episodes: eps
    };
  }

  _detailId(url) {
    const m = String(url || "").match(/\/anime\/(\d+)/);
    return m ? m[1] : "";
  }

  // 播放：调 issue-web-playback 拿直链（主链 + 各线路 candidates）
  async getVideoList(url) {
    const m = String(url || "").match(/\/play\/(\d+)/);
    if (!m) return [];
    let data = null;
    try {
      const res = await new Client().post(XF_API + "/functions/v1/issue-web-playback", this.apiHeaders(),
        JSON.stringify({ action: "fallback", episode_id: parseInt(m[1], 10) }));
      data = JSON.parse(res.body || "");
    } catch (e) {
      return [];
    }
    if (!data || !data.ok) return [];
    const items = [];
    const seen = {};
    const push = function (u, q) {
      if (!u || seen[u]) return;
      seen[u] = true;
      items.push({ url: u, originalUrl: u, quality: q || "Origin" });
    };
    if (data.url) {
      let q = "Origin";
      if (Array.isArray(data.candidates)) {
        for (const c of data.candidates) {
          if (c && c.url === data.url && c.source_name) { q = c.source_name; break; }
        }
      }
      push(data.url, q);
    }
    if (Array.isArray(data.candidates)) {
      for (const c of data.candidates) {
        if (c && c.url) push(c.url, c.source_name || "Origin");
      }
    }
    return items;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "Xfani 网址",
        "value": "https://next.xifanacg.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
