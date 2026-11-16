const mangayomiSources = [{
"name": "经典电影",
"lang": "zh",
"baseUrl": "https://api.themoviedb.org",
"apiUrl": "",
"iconUrl": "https://www.themoviedb.org/favicon.ico",
"typeSource": "single",
"itemType": 1,
"isNsfw": false,
"version": "0.0.1",
"dateFormat": "",
"dateFormatLocale": "",
"pkgPath": "classicfilm.js"
}];

// 经典电影 v0.0.1（吴 2026-11-16 要求：经典外国电影，黑白片为主；要有榜单、评分、简介、主演单、能播）。
// 榜单/评分/简介/主演：TMDB API v3（api.themoviedb.org）。TMDB 是唯一同时满足
// “服务器能连上 + 有评分 + 有简介 + 有主演 + 有真实榜单”的源。
// 其它源实测都不行：豆瓣详情页 302 到 sec.douban.com（反爬）、搜索页无结构化结果；
// DopeBox/SFlix 服务器连不上（HTTP 000）；NetMirror 域名已挂牌出售；UHD Movies 连不上；
// Letterboxd 静态 HTML 里没有评分；vidsrc.sh 播放器是 webpack 打包的加密 JS，无直链。
// 播放：B站搜全片（片长 ≥60 分钟 + 标题相关），直链提取复用 seasonal.js 0.0.5
// 手机已验证的路子（WebView [script] 数组 + __playinfo__，再不行走 view→cid→playurl）。
// TMDB 需要免费 Key：用户在 themoviedb.org 免费注册 → 设置 → API → 申请 v3 Key，
// 粘贴到本源设置里的“TMDB API Key”。没有 Key 之前榜单/搜索用不了，
// getPopular 只返回一条说明项，点进去有申请步骤。

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_ICON = "https://www.themoviedb.org/favicon.ico";
const BILI_API_SEARCH = "https://api.bilibili.com/x/web-interface/search/all/v2?keyword=";
const BILI_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
// 经典片截止年份：1979 年底之前上映的才算“经典”。
const CLASSIC_MAX_YEAR = 1979;
// 全片判定：B站视频片长至少 60 分钟才可能是正片（预告/解说/剪辑都短得多）。
const FULL_FILM_MIN_SECONDS = 3600;
// 排除词：这些标题即使片长够也不是正片本身（同步评论、解说、影评、预告、混剪）。
const BILI_EXCLUDE = ["同步评论", "反应", "解说", "盘点", "预告", "剪辑", "混剪", "影评", "解析", "吐槽", "花絮", "幕后", "纪录片", "reaction", "react", "trailer", "review"];

class DefaultExtension extends MProvider {
headers() {
return { "User-Agent": BILI_UA};
}
biliHeaders() {
return { "Referer": "https://www.bilibili.com/", "User-Agent": BILI_UA};
}
apiKey() {
try {
const pref = new SharedPreferences();
const k = String(pref.get("tmdb_api_key") || "").trim();
return k;
} catch (_) { return "";}
}
tmdbUrl(path, extra) {
const key = this.apiKey();
let u = TMDB_API + path + "?api_key=" + encodeURIComponent(key) + "&language=zh-CN";
if (extra) u += "&" + extra;
return u;
}
async tmdbGet(path, extra) {
const key = this.apiKey();
if (!key) return null;
try {
const res = await new Client().get(this.tmdbUrl(path, extra), this.headers());
const d = JSON.parse(res.body || "");
if (!d || d.success === false) return null;
return d;
} catch (_) { return null;}
}
yearOf(releaseDate) {
const s = String(releaseDate || "");
const y = parseInt(s.slice(0, 4), 10);
return isNaN(y)? 0: y;
}
posterUrl(p) {
if (!p) return TMDB_ICON;
return TMDB_IMG + p;
}
// 列表项：中文名（原名） · 年份 ★评分（票数）
toItem(m) {
const title = String(m.title || m.original_title || "").trim();
const orig = String(m.original_title || "").trim();
const year = this.yearOf(m.release_date);
const score = parseFloat(m.vote_average || 0);
const votes = parseInt(m.vote_count || 0, 10);
let name = title;
if (orig && orig!== title) name += "（" + orig + "）";
if (year) name += " · " + year + "年";
if (score) name += " ★" + score.toFixed(1) + "分";
if (votes) name += "（" + votes + "人评分）";
return {
name: name,
link: "tmdb:" + m.id,
imageUrl: this.posterUrl(m.poster_path)
};
}
// 年代筛选：getFilterList 的 SelectFilter 值。
decadeFromFilters(filters) {
if (filters) {
for (const f of filters) {
if (f && f.type === "decade" && f.value) return String(f.value);
}
}
return "all";
}
decadeRange(decade) {
if (decade === "1950s") return ["1950-01-01", "1959-12-31"];
if (decade === "1960s") return ["1960-01-01", "1969-12-31"];
if (decade === "1970s") return ["1970-01-01", "1979-12-31"];
return ["1900-01-01", CLASSIC_MAX_YEAR + "-12-31"];
}
// 没 Key 时的说明项（点进去是申请步骤）。
noKeyItem() {
return {
name: "点这里看申请方法（免费，2 分钟）",
link: "nokey:",
imageUrl: TMDB_ICON
};
}
async getPopular(page, filters) {
if (!this.apiKey()) return { list: [this.noKeyItem()], hasNextPage: false};
const decade = this.decadeFromFilters(filters);
const range = this.decadeRange(decade);
const p = page && page > 0? page: 1;
const d = await this.tmdbGet("/discover/movie",
"sort_by=vote_average.desc&vote_count.gte=300&primary_release_date.gte=" + range[0] +
"&primary_release_date.lte=" + range[1] + "&page=" + p);
if (!d ||!d.results) return { list: [], hasNextPage: false};
const list = d.results.map(m => this.toItem(m));
return { list: list, hasNextPage:!!(d.page && d.total_pages && d.page < d.total_pages)};
}
async getLatestUpdates(page, filters) {
if (!this.apiKey()) return { list: [this.noKeyItem()], hasNextPage: false};
const decade = this.decadeFromFilters(filters);
const range = this.decadeRange(decade);
const p = page && page > 0? page: 1;
const d = await this.tmdbGet("/discover/movie",
"sort_by=popularity.desc&vote_count.gte=100&primary_release_date.gte=" + range[0] +
"&primary_release_date.lte=" + range[1] + "&page=" + p);
if (!d ||!d.results) return { list: [], hasNextPage: false};
const list = d.results.map(m => this.toItem(m));
return { list: list, hasNextPage:!!(d.page && d.total_pages && d.page < d.total_pages)};
}
async search(query, page, filters) {
const q = String(query || "").trim();
if (!q) return await this.getPopular(page, filters);
if (!this.apiKey()) return { list: [this.noKeyItem()], hasNextPage: false};
const p = page && page > 0? page: 1;
const d = await this.tmdbGet("/search/movie", "query=" + encodeURIComponent(q) + "&page=" + p + "&include_adult=false");
if (!d ||!d.results) return { list: [], hasNextPage: false};
// 搜索不过滤年份（用户明确搜的片可能不在 1979 年之前），按原顺序返回。
const list = d.results.map(m => this.toItem(m));
return { list: list, hasNextPage:!!(d.page && d.total_pages && d.page < d.total_pages)};
}
verdict(score) {
if (!score || isNaN(score)) return "";
if (score >= 8.5) return "必看经典";
if (score >= 8.0) return "强烈推荐";
if (score >= 7.5) return "值得一看";
if (score >= 7.0) return "可看";
return "观望";
}
async getDetail(url) {
const link = String(url || "").trim();
if (link === "nokey:") {
return {
name: "需要 TMDB API Key（免费）",
link: link,
imageUrl: TMDB_ICON,
description: "申请方法（免费，2 分钟）：\n1. 打开 https://www.themoviedb.org 注册一个免费账号；\n2. 点右上角头像 → 设置 → API；\n3. 点“申请 API Key”，选 Developer，填个用途就能拿到 v3 Key；\n4. 回到 Mangayomi，长按“经典电影”这个源 → 设置 → 把 Key 粘贴到“TMDB API Key”里，保存；\n5. 再进这个源，榜单、评分、简介、主演就全出来了。\n\n没有 Key 之前 TMDB 不给数据（会回 401），所以榜单和搜索都用不了，这不是源坏了。",
genre: [],
status: 3,
episodes: []
};
}
const m = link.match(/^tmdb:(\d+)$/);
if (!m) return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: []};
const id = m[1];
const d = await this.tmdbGet("/movie/" + id, "append_to_response=credits");
if (!d ||!d.id) return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: []};
const title = String(d.title || d.original_title || "").trim();
const orig = String(d.original_title || "").trim();
const year = this.yearOf(d.release_date);
const score = parseFloat(d.vote_average || 0);
const votes = parseInt(d.vote_count || 0, 10);
const runtime = parseInt(d.runtime || 0, 10);
const genres = (d.genres || []).map(g => g.name).filter(Boolean);
let director = "";
try {
const crew = (d.credits && d.credits.crew) || [];
const dirs = crew.filter(c => c.job === "Director").map(c => c.name);
director = dirs.join("、");
} catch (_) {}
let castLines = [];
try {
const cast = (d.credits && d.credits.cast) || [];
for (const c of cast.slice(0, 10)) {
const nm = String(c.name || "").trim();
const ch = String(c.character || "").trim();
if (nm) castLines.push(ch? (nm + " 饰 " + ch): nm);
}
} catch (_) {}
const lines = [];
if (score) {
let dl = "评分：" + score.toFixed(1) + "分";
if (votes) dl += "（" + votes + "人评分）";
const v = this.verdict(score);
if (v) dl += " · " + v;
lines.push(dl);
}
if (year) lines.push("上映：" + year + "年" + (d.release_date? ("（" + d.release_date + "）"): ""));
if (runtime) lines.push("片长：" + runtime + "分钟");
if (genres.length) lines.push("类型：" + genres.join("、"));
if (director) lines.push("导演：" + director);
if (castLines.length) lines.push("主演：\n" + castLines.join("\n"));
const overview = String(d.overview || "").trim();
lines.push("简介：" + (overview || "（TMDB 暂无中文简介，可在源设置里把语言改成英文再看）"));
lines.push("正片在 B站上：选集里只有“正片（B站）”这一集，点开直接播；播不了就是 B站这次没给直链，退出来就行，不要一直等转圈。");
const name = orig && orig!== title? (title + "（" + orig + "）"): title;
return {
name: name,
link: link,
imageUrl: this.posterUrl(d.poster_path),
description: lines.join("\n"),
genre: genres,
status: 3,
episodes: [{ name: "正片（B站）", url: "bili:" + id + ":" + title + ":" + orig + ":" + runtime}]
};
}
// ---- B站全片播放 ----
// “分:秒”或“时:分:秒”转秒数。
parseDuration(s) {
const parts = String(s || "").split(":").map(x => parseInt(x, 10));
if (parts.some(isNaN)) return 0;
if (parts.length === 2) return parts[0] * 60 + parts[1];
if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
return 0;
}
stripEm(s) {
return String(s || "").replace(/<[^>]+>/g, "").trim();
}
lcsLen(a, b) {
let best = 0;
for (let i = 0; i < a.length; i++) {
for (let j = 0; j < b.length; j++) {
let k = 0;
while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
if (k > best) best = k;
}
}
return best;
}
// 标题是否和片名沾边：片名完整出现，或有 3 字以上公共片段。
isRelevant(title, nameStrs) {
const t = String(title || "").toLowerCase();
for (const n of nameStrs) {
const nn = String(n || "").trim().toLowerCase();
if (!nn) continue;
if (t.indexOf(nn)!== -1) return true;
if (nn.length >= 3 && this.lcsLen(t, nn) >= 3) return true;
}
return false;
}
isExcluded(title) {
const t = String(title || "").toLowerCase();
for (const w of BILI_EXCLUDE) {
if (t.indexOf(w.toLowerCase())!== -1) return true;
}
return false;
}
// B站搜全片：返回最像正片的那条（片长 ≥60 分钟、标题相关、片长最接近 TMDB 片长）。
async findBiliFilm(titleZh, titleEn, runtimeMin) {
const nameStrs = [titleZh, titleEn].filter(Boolean);
const queries = [];
if (titleZh) queries.push(titleZh + " 电影");
if (titleEn && titleEn!== titleZh) queries.push(titleEn + " movie");
for (const q of queries) {
let data = null;
try {
const res = await new Client().get(BILI_API_SEARCH + encodeURIComponent(q), this.biliHeaders());
const d = JSON.parse(res.body || "");
data = d && d.data? d.data: null;
} catch (_) { data = null;}
if (!data ||!data.result) continue;
const cands = [];
for (const r of data.result) {
if (!r || r.result_type!== "video" ||!r.data) continue;
for (const v of r.data) {
const title = this.stripEm(v.title);
if (!title ||!v.bvid) continue;
if (this.isExcluded(title)) continue;
if (!this.isRelevant(title, nameStrs)) continue;
const dur = this.parseDuration(v.duration);
if (dur < FULL_FILM_MIN_SECONDS) continue;
let diff = 99999;
if (runtimeMin && runtimeMin > 0) diff = Math.abs(dur - runtimeMin * 60);
cands.push({ title: title, bvid: v.bvid, dur: dur, diff: diff, author: String(v.author || "")});
}
}
if (cands.length) {
cands.sort((a, b) => (a.diff - b.diff) || (b.dur - a.dur));
return cands[0];
}
}
return null;
}
// WebView 提 B站直链（和 seasonal.js 0.0.5 同一写法，手机已验证能播）。
async extractBiliDirect(pageUrl) {
if (typeof evaluateJavascriptViaWebview!== "function") return null;
const script = "(function(){var tries=0;var timer=setInterval(function(){tries++;var direct=null;try{var pi=window.__playinfo__;if(pi&&pi.data){var durl=pi.data.durl;if(durl&&durl.length&&durl[0].url){direct=durl[0].url;}else if(pi.data.dash&&pi.data.dash.video&&pi.data.dash.video.length){var vs=pi.data.dash.video.slice().sort(function(a,b){return (b.bandwidth||0)-(a.bandwidth||0);});direct=vs[0].baseUrl||vs[0].base_url||null;}}}catch(e){}if(direct||tries>24){clearInterval(timer);window.flutter_inappwebview.callHandler(\"setResponse\",JSON.stringify({direct:direct}));}},500);})()";
try {
const raw = await evaluateJavascriptViaWebview(pageUrl, this.biliHeaders(), [script], 20);
const d = JSON.parse(raw || "{}");
if (d && d.direct) return String(d.direct);
} catch (_) {}
return null;
}
// B站接口提直链：view 拿 cid → playurl 取 durl（服务器回 412，手机 IP 未必被拦）。
async extractBiliDirectViaApi(pageUrl) {
const m = String(pageUrl || "").match(/BV[0-9A-Za-z]+/);
if (!m) return null;
try {
const vres = await new Client().get("https://api.bilibili.com/x/web-interface/view?bvid=" + m[0], this.biliHeaders());
const vd = JSON.parse(vres.body || "");
const cid = vd && vd.data? vd.data.cid: null;
if (!cid) return null;
const res = await new Client().get("https://api.bilibili.com/x/player/playurl?bvid=" + m[0] + "&cid=" + cid + "&qn=80&fnval=0&fnver=0&fourk=1", this.biliHeaders());
const d = JSON.parse(res.body || "");
if (d && d.data && d.data.durl && d.data.durl.length && d.data.durl[0].url) return String(d.data.durl[0].url);
} catch (_) {}
return null;
}
async getVideoList(url) {
const m = String(url || "").match(/^bili:(\d+):([^:]*):([^:]*):(\d*)$/);
if (!m) return [];
const titleZh = m[2] || "";
const titleEn = m[3] || "";
const runtimeMin = parseInt(m[4] || "0", 10) || 0;
const film = await this.findBiliFilm(titleZh, titleEn, runtimeMin);
if (!film) return [];
const pageUrl = "https://www.bilibili.com/video/" + film.bvid + "/";
const headers = this.biliHeaders();
let direct = await this.extractBiliDirect(pageUrl);
if (!direct) direct = await this.extractBiliDirectViaApi(pageUrl);
if (!direct) return [];
return [{ url: direct, originalUrl: pageUrl, quality: "B站直链", headers: headers}];
}
getFilterList() {
return [{
type: "decade",
name: "年代",
type_name: "SelectFilter",
values: [
{ type_name: "SelectOption", name: "全部经典（1979年之前）", value: "all"},
{ type_name: "SelectOption", name: "1950年代", value: "1950s"},
{ type_name: "SelectOption", name: "1960年代", value: "1960s"},
{ type_name: "SelectOption", name: "1970年代", value: "1970s"}
]
}];
}
getSourcePreferences() {
return [{
"key": "tmdb_api_key",
"editTextPreference": {
"title": "TMDB API Key",
"summary": "免费 Key：themoviedb.org 注册 → 设置 → API 里申请，粘贴到这里",
"value": "",
"dialogTitle": "TMDB API Key",
"dialogMessage": "在 https://www.themoviedb.org 免费注册后，设置 → API 里申请 v3 Key，粘贴到这里。没有 Key 榜单和搜索都用不了。"
}
}];
}
}
