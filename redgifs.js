const mangayomiSources = [{
  "name": "RedGifs",
  "lang": "all",
  "baseUrl": "https://www.redgifs.com",
  "apiUrl": "https://api.redgifs.com",
  "iconUrl": "https://www.redgifs.com/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": true,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "redgifs.js"
}];

// RedGifs API v2。视频是明文 MP4 直链，不用解密。
// 临时 token 绑定请求时的 IP + User-Agent，所以 token 请求和业务请求
// 必须用同一个 UA，且 token 失效（401）时要立刻重新拿一个再试一次。
let rgToken = null;
const RG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

class DefaultExtension extends MProvider {
  apiBase() {
    return "https://api.redgifs.com";
  }

  headers(withAuth) {
    const h = {
      "User-Agent": RG_UA,
      "Accept": "application/json"
    };
    if (withAuth && rgToken) h["Authorization"] = "Bearer " + rgToken;
    return h;
  }

  async fetchToken() {
    const res = await new Client().get(this.apiBase() + "/v2/auth/temporary", this.headers(false));
    try {
      const d = JSON.parse(res.body || "{}");
      if (d.token) {
        rgToken = d.token;
        return rgToken;
      }
    } catch (e) { }
    rgToken = null;
    return null;
  }

  // 带 token 的 API 请求；401 就换一个新 token 再试一次
  async apiGet(path) {
    if (!rgToken) await this.fetchToken();
    let res = await new Client().get(this.apiBase() + path, this.headers(true));
    if (res.statusCode === 401) {
      rgToken = null;
      await this.fetchToken();
      res = await new Client().get(this.apiBase() + path, this.headers(true));
    }
    return res;
  }

  mapGif(g) {
    if (!g) return null;
    const tags = g.tags || [];
    const user = g.user || {};
    const name = tags.length > 0 ? tags.slice(0, 4).join(", ") : (user.name || g.id || "RedGifs");
    const urls = g.urls || {};
    return {
      name: name,
      imageUrl: urls.poster || urls.thumbnail || "",
      link: g.id || ""
    };
  }

  parseList(body) {
    const items = [];
    try {
      const d = JSON.parse(body || "{}");
      const gifs = d.gifs || [];
      for (const g of gifs) {
        const it = this.mapGif(g);
        if (it && it.link) items.push(it);
      }
      return { list: items, hasNextPage: items.length >= 20 };
    } catch (e) {
      return { list: [], hasNextPage: false };
    }
  }

  async getPopular(page) {
    const p = page || 1;
    const res = await this.apiGet("/v2/gifs/trending?order=trending&count=20&page=" + p);
    return this.parseList(res.body || "");
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const p = page || 1;
    const res = await this.apiGet(
      "/v2/gifs/search?search_text=" + encodeURIComponent(query) +
      "&order=trending&count=20&page=" + p
    );
    return this.parseList(res.body || "");
  }

  async getDetail(url) {
    const id = (url || "").replace(/^https?:\/\/[^/]+\/watch\//, "").trim();
    if (!id) return { name: "", imageUrl: "", description: "", genre: [], episodes: [] };
    const res = await this.apiGet("/v2/gifs/" + encodeURIComponent(id));
    let g = null;
    try {
      g = JSON.parse(res.body || "{}").gif || null;
    } catch (e) { }
    if (!g) return { name: "", imageUrl: "", description: "", genre: [], episodes: [] };
    const tags = g.tags || [];
    return {
      name: tags.slice(0, 4).join(", ") || g.id,
      imageUrl: (g.urls || {}).poster || (g.urls || {}).thumbnail || "",
      description: tags.join(", "),
      genre: tags.slice(0, 5),
      status: 3,
      episodes: [{ name: "播放", url: g.id }]
    };
  }

  async getVideoList(url) {
    const id = (url || "").replace(/^https?:\/\/[^/]+\/watch\//, "").trim();
    if (!id) return [];
    const res = await this.apiGet("/v2/gifs/" + encodeURIComponent(id));
    let g = null;
    try {
      g = JSON.parse(res.body || "{}").gif || null;
    } catch (e) { }
    if (!g) return [];
    const urls = g.urls || {};
    const out = [];
    if (urls.hd) out.push({ url: urls.hd, originalUrl: urls.hd, quality: "HD" });
    if (urls.sd) out.push({ url: urls.sd, originalUrl: urls.sd, quality: "SD" });
    return out;
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "RedGifs 网址",
        "value": "https://www.redgifs.com",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
