const mangayomiSources = [{
  "name": "giriGiriLove",
  "lang": "zh",
  "baseUrl": "https://ani.girigirilove.com",
  "apiUrl": "",
  "iconUrl": "https://ani.girigirilove.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "girigirilove.js"
}];

// giriGiriLove（ギリギリ爱 https://ani.girigirilove.com）。
// 纯 JSON API 站，不用解析 HTML：
//   搜索/列表：GET https://m3u8.girigirilove.com/api.php/Vod/get_list?vod_name=<关键词>&offset=0&limit=24
//     → {info:{total, rows:[{vod_id, vod_name, vod_pic, vod_remarks, ...}]}}；
//     空关键词返回最新（共 3797 部），给 getPopular 用。
//   详情：GET https://m3u8.girigirilove.com/api.php/Vod/get_detail?vod_id=<id>
//     → {info:{vod_name, vod_pic, vod_content, vod_play_from, vod_play_url, ...}}；
//     vod_play_from 用 $$$ 分线路（例：cht$$$chs），vod_play_url 用 $$$ 分线路、# 分集、$ 分“集名$地址”。
//   播放：剧集地址本身就是直链 m3u8（https://akua.girigirilove.com/.../playlist.m3u8，
//     已验证：播放列表 HTTP 200、首个 .ts 分片 HTTP 200 519KB），不用解析器、不用 WebView。
// 线路优先简体（chs，内地用户看简体字幕更顺），没有 chs 时用第一条线路。

const GG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const GG_API = "https://m3u8.girigirilove.com/api.php/Vod";

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
    return { "User-Agent": GG_UA, "Accept": "application/json, text/html, */*" };
  }

  // 搜索 API 返回的 rows → 列表条目；link 直接用 vod_id（数字字符串），getDetail 凭它调详情 API
  parseRows(rows) {
    const items = [];
    const seen = {};
    for (const r of (rows || [])) {
      const id = String(r.vod_id || "");
      const name = this.fixText(String(r.vod_name || "").trim());
      if (!id || !name || seen[id]) continue;
      seen[id] = true;
      items.push({
        name: name,
        imageUrl: String(r.vod_pic || ""),
        link: id
      });
    }
    return items;
  }

  async fetchList(vodName) {
    const url = GG_API + "/get_list?vod_name=" + encodeURIComponent(vodName || "") + "&offset=0&limit=24";
    const res = await new Client().get(url, this.headers());
    let data = null;
    try { data = JSON.parse(res.body || ""); } catch (_) { data = null; }
    const rows = (data && data.info && data.info.rows) ? data.info.rows : [];
    return { list: this.parseRows(rows), hasNextPage: false };
  }

  async getPopular(page) {
    return await this.fetchList("");
  }

  async getLatestUpdates(page) {
    return await this.fetchList("");
  }

  async search(query, page, filters) {
    return await this.fetchList(query || "");
  }

  async getDetail(url) {
    const id = String(url || "").replace(/[^0-9]/g, "");
    const res = await new Client().get(GG_API + "/get_detail?vod_id=" + id, this.headers());
    let info = null;
    try {
      const data = JSON.parse(res.body || "");
      info = (data && data.info) ? data.info : null;
    } catch (_) { info = null; }
    if (!info) {
      return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: [] };
    }
    const name = this.fixText(String(info.vod_name || "").trim());
    const imageUrl = String(info.vod_pic || "");
    const description = this.fixText(String(info.vod_content || "").replace(/<[^>]+>/g, "").trim());
    const genre = [];
    const cls = String(info.vod_class || "");
    if (cls) {
      for (const g of cls.split(",")) {
        const t = this.fixText(g.trim());
        if (t) genre.push(t);
      }
    }
    // 线路：vod_play_from 用 $$$ 分，vod_play_url 同样用 $$$ 分；每条线路内 # 分集、$ 分“集名$地址”
    const froms = String(info.vod_play_from || "").split("$$$");
    const urls = String(info.vod_play_url || "").split("$$$");
    let roadIdx = 0;
    for (let i = 0; i < froms.length; i++) {
      if (String(froms[i] || "").trim().toLowerCase() === "chs") { roadIdx = i; break; }
    }
    const eps = [];
    const road = urls[roadIdx] || urls[0] || "";
    const parts = road.split("#");
    for (const p of parts) {
      if (!p) continue;
      const dollar = p.indexOf("$");
      let epName = "", epUrl = "";
      if (dollar >= 0) {
        epName = p.slice(0, dollar).trim();
        epUrl = p.slice(dollar + 1).trim();
      } else {
        epUrl = p.trim();
        epName = "";
      }
      if (!epUrl) continue;
      if (!epName) epName = "第" + (eps.length + 1) + "集";
      eps.push({ name: this.fixText(epName), url: epUrl });
    }
    return {
      name: name,
      imageUrl: imageUrl,
      description: description,
      genre: genre,
      status: 3,
      episodes: eps
    };
  }

  // 剧集地址本身就是直链 m3u8，直接返回；不需要解析器
  async getVideoList(url) {
    const u = String(url || "").trim();
    if (!u) return [];
    return [{ url: u, originalUrl: u, quality: "Origin" }];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "giriGiriLove 网址",
        "value": "https://ani.girigirilove.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
