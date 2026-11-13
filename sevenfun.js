const mangayomiSources = [{
  "name": "七色番",
  "lang": "zh",
  "baseUrl": "https://www.7sefun.top",
  "apiUrl": "",
  "iconUrl": "https://www.7sefun.top/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "sevenfun.js"
}];

class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) {
      return text;
    }
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      bytes.push(text.charCodeAt(i));
    }
    var charCodes = [];
    var i = 0;
    while (i < bytes.length) {
      var byte1 = bytes[i];
      var charCode;
      if (byte1 < 0x80) {
        charCode = byte1;
        i += 1;
      } else if (byte1 < 0xE0) {
        var byte2 = bytes[i + 1];
        charCode = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
        i += 2;
      } else if (byte1 < 0xF0) {
        var byte2 = bytes[i + 1];
        var byte3 = bytes[i + 2];
        charCode = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
        i += 3;
      } else {
        var byte2 = bytes[i + 1];
        var byte3 = bytes[i + 2];
        var byte4 = bytes[i + 3];
        charCode = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
        i += 4;
      }
      charCodes.push(charCode);
    }
    return String.fromCharCode.apply(null, charCodes);
  }

  // 不依赖 atob 的 base64 解码（运行环境可能没有 atob）
  b64decode(input) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    let i = 0;
    input = input.replace(/[^A-Za-z0-9+/=]/g, "");
    while (i < input.length) {
      const c1 = chars.indexOf(input.charAt(i++));
      const c2 = chars.indexOf(input.charAt(i++));
      const c3 = chars.indexOf(input.charAt(i++));
      const c4 = chars.indexOf(input.charAt(i++));
      const b1 = (c1 << 2) | (c2 >> 4);
      const b2 = ((c2 & 15) << 4) | (c3 >> 2);
      const b3 = ((c3 & 3) << 6) | c4;
      out += String.fromCharCode(b1);
      if (c3 !== -1 && c3 !== 64) out += String.fromCharCode(b2);
      if (c4 !== -1 && c4 !== 64) out += String.fromCharCode(b3);
    }
    return out;
  }

  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.7sefun.top";
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

  parseVideoItems(doc) {
    const items = [];
    const elements = doc.select("div.video");
    for (const el of elements) {
      const a = el.selectFirst("a.video-wrapper");
      const img = el.selectFirst("img.videoimg");
      if (!a) continue;
      let name = "";
      const nameEl = el.selectFirst("div.video-name");
      if (nameEl && (nameEl.text || "").trim()) name = nameEl.text.trim();
      if (!name) {
        const byEl = el.selectFirst("div.video-by");
        if (byEl && (byEl.text || "").trim()) name = byEl.text.trim();
      }
      if (!name && img) name = img.attr("alt") || "";
      const link = a.attr("href") || "";
      const imageUrl = img ? (img.attr("src") || "") : "";
      if (!name || !link) continue;
      items.push({
        name: this.stringUTF8(name.trim(), true),
        imageUrl: imageUrl,
        link: link
      });
    }
    return { list: items, hasNextPage: false };
  }

  async getPopular(page) {
    const res = await new Client().get(this.getBaseUrl() + "/");
    const doc = new Document(res.body);
    return this.parseVideoItems(doc);
  }

  async getLatestUpdates(page) {
    const res = await new Client().get(this.getBaseUrl() + "/");
    const doc = new Document(res.body);
    return this.parseVideoItems(doc);
  }

  async search(query, page, filters) {
    const res = await new Client().get(
      this.getBaseUrl() + "/vodsearch/-------------.html?wd=" + encodeURIComponent(query)
    );
    const doc = new Document(res.body);
    return this.parseVideoItems(doc);
  }

  async getDetail(url) {
    const res = await new Client().get(this.fullUrl(url));
    const doc = new Document(res.body);
    const titleEl = doc.selectFirst("title");
    let name = titleEl ? (titleEl.text || "") : "";
    name = name.split("简介")[0].replace(/[《》]/g, "").trim();
    const cover = doc.selectFirst("img.videoimg");
    const imageUrl = cover ? (cover.attr("src") || "") : "";
    const meta = doc.selectFirst('meta[name="description"]');
    const description = meta ? this.stringUTF8(meta.attr("content") || "", true) : "";
    // 取第一个有剧集的播放源，避免多个源重复
    const eps = [];
    const lists = doc.select("div.vod-play-list-container");
    for (const list of lists) {
      const links = list.select("a");
      if (!links || links.length === 0) continue;
      for (const a of links) {
        const epName = (a.text || "").trim();
        const epUrl = a.attr("href") || "";
        if (!epName || !epUrl) continue;
        eps.push({ name: this.stringUTF8(epName, true), url: epUrl });
      }
      break;
    }
    return {
      name: this.stringUTF8(name, true),
      imageUrl: imageUrl,
      description: description,
      genre: [],
      episodes: eps
    };
  }

  extractMediaUrls(body) {
    const found = [];
    const seen = {};
    const patterns = [
      /https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g,
      /\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g,
      /https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/g
    ];
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(body)) !== null) {
        let u = m[0];
        if (u.indexOf("//") === 0) u = "https:" + u;
        if (!seen[u]) {
          seen[u] = true;
          found.push(u);
        }
      }
    }
    return found;
  }

  async getVideoList(url) {
    const playUrl = this.fullUrl(url);
    const res = await new Client().get(playUrl);
    const body = res.body || "";
    // 1. 播放页直接有直链就用
    let urls = this.extractMediaUrls(body);
    if (urls.length > 0) {
      return urls.map(u => ({ url: u, originalUrl: u, quality: "Origin" }));
    }
    // 2. player_aaaa：url 字段是 base64(百分号编码后的真实地址)，encrypt=2
    const m = body.match(/player_aaaa\s*=\s*(\{[\s\S]*?\});/);
    if (m) {
      try {
        const cfg = JSON.parse(m[1]);
        let next = cfg.url || "";
        if (cfg.encrypt == 2 || cfg.encrypt === "2") {
          next = decodeURIComponent(this.b64decode(next));
        } else if (cfg.encrypt == 1 || cfg.encrypt === "1") {
          next = decodeURIComponent(next);
        }
        if (next) {
          if (next.indexOf(".m3u8") !== -1 || next.indexOf(".mp4") !== -1) {
            return [{ url: next, originalUrl: next, quality: "Origin" }];
          }
          // 解码得到的是另一层播放页，再抓一次直链
          const res2 = await new Client().get(next);
          const body2 = res2.body || "";
          urls = this.extractMediaUrls(body2);
          if (urls.length > 0) {
            return urls.map(u => ({ url: u, originalUrl: u, quality: "Origin" }));
          }
          // 第二层也可能是 player_aaaa，再解一层
          const m2 = body2.match(/player_aaaa\s*=\s*(\{[\s\S]*?\});/);
          if (m2) {
            try {
              const cfg2 = JSON.parse(m2[1]);
              let next2 = cfg2.url || "";
              if (cfg2.encrypt == 2 || cfg2.encrypt === "2") {
                next2 = decodeURIComponent(this.b64decode(next2));
              } else if (cfg2.encrypt == 1 || cfg2.encrypt === "1") {
                next2 = decodeURIComponent(next2);
              }
              if (next2 && (next2.indexOf(".m3u8") !== -1 || next2.indexOf(".mp4") !== -1)) {
                return [{ url: next2, originalUrl: next2, quality: "Origin" }];
              }
            } catch (e) { /* 忽略，继续返回空 */ }
          }
        }
      } catch (e) { /* 忽略，继续返回空 */ }
    }
    return [];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "七色番网址",
        "value": "https://www.7sefun.top",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }];
  }
}
