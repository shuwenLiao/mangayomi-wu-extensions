const mangayomiSources = [{
"name": "经典电影",
"lang": "zh",
"baseUrl": "https://api.themoviedb.org",
"apiUrl": "",
"iconUrl": "https://www.themoviedb.org/favicon.ico",
"typeSource": "single",
"itemType": 1,
"isNsfw": false,
"version": "0.0.10",
"dateFormat": "",
"dateFormatLocale": "",
"pkgPath": "classicfilm.js"
}];

// 经典电影 v0.0.6（修 0.0.5 上手机后仍全错：Wu 2026-11-23 12:18 五张截图）。
// 截图实测：惊魂记正片1（94分钟）是国产现代剧不是 Psycho（标题撞片）；
// 十二怒汉正片1“蓝光完整版”实际只有 2:44，是反应视频；正片3“自制中字”实际只有约 4 分钟；
// 教父/教父2 都是 0 集。根因：
// 1. 多分P：十二怒汉“蓝光完整版” BV1uTxq6WE2t 有 36 个分P，搜索片长 96 分钟是
//    36 个分P的总和，第 1P 只有 2:44 的反应视频——扩展只播第 1P，所以全错。
//    B站搜索接口不给分P数，但 video 页 HTML 里有 "videos":N（七武士单P是 1，
//    十二怒汉是 36）。v0.0.6 并行抓 video 页，videos>2 的直接拒掉。
// 2. 已删：十二怒汉两条自制中字（BV1KBQtBQEC9 / BV1ZQXrBVEKF）都已删，
//    页面标题是“视频去哪了呢”，一并拒掉。抓不到/解析不到的放行（fail open）。
// 3. 撞片：惊魂记 94 分钟国产剧撞了 Psycho 的中文名（109-94=15 分钟刚好在容差内）。
//    搜索词里加年份（“惊魂记 1960 电影”）来消歧。
// 另外：Wu 问“没有其他播放源了吗”，已调研 YouTube / Dailymotion / 西瓜 /
// Internet Archive / OK.ru 等站。结论（2026-11-23，真实接口验证）：IA 是最值得接的
// 备用源——十二怒汉和七武士有实测可播的干净 mp4 直链（无水印，片长和 TMDB 完全吻合）。
// YouTube 有片但拿不到原生直链（只有 DASH 分离流）；Dailymotion 只有预告；西瓜无全片；
// OK.ru/VK 需登录。v0.0.7 把 IA 接进来（B站和 IA 并行搜，IA 干净直链排前面）。
// 水印：代码无法可靠识别水印，只能靠“优先干净片源标题 + 多集可换”来缓解。
// 榜单/评分/简介/主演：TMDB API v3（api.themoviedb.org）。TMDB 是唯一同时满足
// “服务器能连上 + 有评分 + 有简介 + 有主演 + 有真实榜单”的源。
// 其它源实测都不行：豆瓣详情页 302 到 sec.douban.com（反爬）、搜索页无结构化结果；
// DopeBox/SFlix 服务器连不上（HTTP 000）；NetMirror 域名已挂牌出售；UHD Movies 连不上；
// Letterboxd 静态 HTML 里没有评分；vidsrc.sh 播放器是 webpack 打包的加密 JS，无直链。
// 播放：B站搜全片，直链提取复用 seasonal.js 0.0.5 手机已验证的路子
// （WebView [script] 数组 + __playinfo__，再不行走 view→cid→playurl）。
// TMDB 需要免费 Key：用户在 themoviedb.org 免费注册 → 设置 → API → 申请 v3 Key，
// 粘贴到本源设置里的“TMDB API Key”。没有 Key 之前榜单/搜索用不了，
// getPopular 只返回一条说明项，点进去有申请步骤。

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_ICON = "https://www.themoviedb.org/favicon.ico";
const BILI_API_SEARCH = "https://api.bilibili.com/x/web-interface/search/all/v2?keyword=";
const BILI_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
// Internet Archive（v0.0.7 备用源）：advancedsearch 搜 title + mediatype:movies，
// metadata 取 mp4 文件名，直链 https://archive.org/download/<identifier>/<文件名>。
// mp4 大小过滤：100MB~3GB 才可能是全片（太小是片段/预告，太大是 mkv/合集）。
const IA_SEARCH = "https://archive.org/advancedsearch.php";
const IA_META = "https://archive.org/metadata/";
const IA_MIN_MP4_BYTES = 100 * 1024 * 1024;
const IA_MAX_MP4_BYTES = 3 * 1024 * 1024 * 1024;
// IA 排除：CD-ROM/光盘镜像/排行榜这类错标的条目。
// v0.0.8：Psycho CD ROM（identifier PsychoCDROM，里面是 Vocaloid 排行榜视频，
// 根本不是电影）曾被 isRelevant 放行（标题含 Psycho、year 为空），挑了个 90MB+
// 的 mp4 当正片。标题/identifier 含这些词直接拒。
// v0.0.9：再加三类——预告片、上色版、同人剪辑版。
// 惊魂记复现：加 year:1960 后搜出 3 条假货——psychose-colorized 是法语上色版
// （659MB，109 分钟，VF Colorisée）；psycho-hd-1080p 标题就是 Trailer，
// mp4 虽 1186MB 但 ffprobe 只有 389 秒=6.5 分钟，是预告；
// psycho-the-roger-ebert-cut-v-2 是 Roger Ebert 的同人重剪版（.ia.mp4 614MB）。
// 三者都不是原版正片，标题含这些词直接拒。
const IA_EXCLUDE = ["cd-rom", "cdrom", "cd rom", "disc image", "iso image", "vocaloid", "ranking",
"trailer", "预告", "colorized", "colorisée", "colorise", "colorised", "上色", "彩色",
"ebert cut", "fan edit", "fanedit", "recut", "re-cut"];
// v0.0.10：IA 英文别名。TMDB 的 original_title 有时是非拉丁文（切腹、七人の侍），
// 直接拿它搜 IA 搜不到英文标题的条目。切腹用英文搜 5 条全是正片；七武士日文搜
// 也能命中（Os Sete Samurais，葡语版全片），别名只在首选搜不到候选时才试。
const IA_ALIAS = {
"切腹": ["Harakiri", "Seppuku"],
"七人の侍": ["Seven Samurai"],
"七武士": ["Seven Samurai"],
"天国と地獄": ["High and Low"],
"天国与地狱": ["High and Low"]
};
// 经典片截止年份：1979 年底之前上映的才算“经典”。
const CLASSIC_MAX_YEAR = 1979;
// 全片判定：B站视频片长至少 60 分钟才可能是正片（预告/解说/剪辑都短得多）。
const FULL_FILM_MIN_SECONDS = 3600;
// v0.0.8：片长容差再收紧。v0.0.7 复现：惊魂记仍会挑中 94 分钟国产剧 BV1kCVU65EpH
// （标题就是“惊魂记”，94 分钟和 Psycho 的 109 分钟差 15 分钟，刚好卡在旧容差
// max(15分钟,15%)=16.35 分钟内）。新的 max(10分钟, 10%) 仍容纳不同剪辑版
// （黄金三镖客 161 vs 178 分钟差 17 分钟，容差 max(10,17.8)=17.8 分钟仍过），
// 但挡住了 15 分钟差的撞片国产剧。
const DUR_TOL_MIN = 10;
const DUR_TOL_RATIO = 0.10;
// 最多列几集（候选片源）。
const MAX_EPISODES = 4;
// 排除词：这些标题即使片长够也不是正片本身（有声书/舞台/游戏/原声/外语配音/上色版等）。
const BILI_EXCLUDE = ["同步评论", "反应", "解说", "盘点", "预告", "剪辑", "混剪", "影评", "解析", "吐槽", "花絮", "幕后", "纪录片", "reaction", "react", "trailer", "review", "特别收录", "一起看", "放映室", "授权章节", "网盘", "夸克", "quark", "pan.", "微信", "加微", "云盘", "百度云", "阿里云", "资源分享", "免费观看", "简史", "合集全集", "完整版合集", "中文配音", "国语配音", "国语版", "中配", "配音版", "中文版", "国语", "普通话配音", "中文对白", "国语对白", "国语发音",
"有声书", "有声小说", "朗读", "逐句", "舞台", "话剧", "戏剧", "徽剧", "京剧", "歌剧", "音乐剧", "游戏", "walkthrough", "gameplay", "longplay", "流程", "钢琴", "原声", "ost", "原声带", "hindi", "印地语", "粤语", "泰语", "越南语", "上色", "上色版", "特别收录内容", "蓝光花絮"];
// 降级词：不是错片，但是 Wu 不想要的版本（普通话配音、上色版/彩色版）。不硬拒，
// 只排到最后——如果只有这个版本，至少还能看，名字里会写清楚。
const BILI_DEMOTE = ["普通话", "配音", "国语", "粤语", "彩色版", "彩色", "上色"];
// 加分词：干净高清压制的标志，排前面。
const BILI_HD = ["4k", "2160", "蓝光", "1080p", "1080P", "2k", "修复", "未删减", "中英双字", "中字", "完整版", "高清", "超清", "BD"];

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
// v0.0.4：Key 已填但 TMDB 连不上/返回失败时的说明项（和 noKeyItem 区分开，
// 别让用户以为是没填 Key；点进去写清楚排查步骤）。
failItem() {
return {
name: "TMDB 暂时连不上，点这里看原因",
link: "tmdbfail:",
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
if (!d) return { list: [this.failItem()], hasNextPage: false};
if (!d.results) return { list: [], hasNextPage: false};
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
if (!d) return { list: [this.failItem()], hasNextPage: false};
if (!d.results) return { list: [], hasNextPage: false};
const list = d.results.map(m => this.toItem(m));
return { list: list, hasNextPage:!!(d.page && d.total_pages && d.page < d.total_pages)};
}
async search(query, page, filters) {
const q = String(query || "").trim();
if (!q) return await this.getPopular(page, filters);
if (!this.apiKey()) return { list: [this.noKeyItem()], hasNextPage: false};
const p = page && page > 0? page: 1;
const d = await this.tmdbGet("/search/movie", "query=" + encodeURIComponent(q) + "&page=" + p + "&include_adult=false");
if (!d) return { list: [this.failItem()], hasNextPage: false};
if (!d.results) return { list: [], hasNextPage: false};
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
if (link === "tmdbfail:") {
return {
name: "TMDB 暂时连不上",
link: link,
imageUrl: TMDB_ICON,
description: "Key 已经填了，但这次没拿到 TMDB 的数据（网络被拦、TMDB 抽风或 Key 失效都可能）。\n1. 下拉刷新再试一次；\n2. 换个网络/VPN 节点再试；\n3. 还不行就去 themoviedb.org → 设置 → API 检查 Key 是否还有效。\n\n榜单和简介都要走 TMDB，TMDB 不通就只能先看这条说明，这不是源坏了。",
genre: [],
status: 3,
episodes: []
};
}
const m = link.match(/^tmdb:(\d+)$/);
if (!m) return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: []};
const id = m[1];
const d = await this.tmdbGet("/movie/" + id, "append_to_response=credits");
if (!d ||!d.id) {
return {
name: "TMDB 暂时连不上",
link: link,
imageUrl: TMDB_ICON,
description: "这次没拿到这部片的 TMDB 数据（网络被拦或 TMDB 抽风）。下拉刷新/换网络节点后再点进来试试；Key 本身没问题的话，榜单页应该还能打开。",
genre: [],
status: 3,
episodes: []
};
}
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
// v0.0.7：B站片源 + Internet Archive 备用源。B站和 IA 并行搜，IA 的干净 mp4 直链
// 排前面（无水印、片长已验吻合），B站补后面，最多 4 集；两边都没有才显示“没找到”。
let episodes = [];
let biliNote = "";
try {
const results = await Promise.all([
this.findBiliFilms(title, orig, runtime, year).catch(() => []),
this.findIAFilms(title, orig, runtime, year).catch(() => [])
]);
const biliFilms = results[0] || [];
const iaFilms = results[1] || [];
const all = [];
for (const f of iaFilms) {
all.push({ kind: "ia", name: "正片" + (all.length + 1) + " · 档案馆 · " + this.shortTitle(f.title) + " · " + Math.round(f.size / 1048576) + "MB", url: "ia:" + f.identifier + ":" + encodeURIComponent(f.filename)});
}
for (const f of biliFilms) {
all.push({ kind: "bili", name: "正片" + (all.length + 1) + " · " + this.shortTitle(f.title) + " · " + Math.floor(f.dur / 60) + "分钟", url: "bili:" + f.bvid});
}
episodes = all.slice(0, MAX_EPISODES).map(e => ({ name: e.name, url: e.url}));
if (episodes.length) {
const iaN = iaFilms.length? ("其中档案馆直链 " + Math.min(iaFilms.length, MAX_EPISODES) + " 条（干净、无水印）"): "";
biliNote = "片源 " + episodes.length + " 条" + (iaN? ("，" + iaN): "") + "（已按干净优先排好）：第 1 条最推荐；播出来不对、模糊或有水印就退出来换下一条。";
} else {
biliNote = "B站和档案馆这次都没找到合适的正片（搜到的都是有声书/解说/舞台版/配音版等，已过滤掉，宁缺毋滥）。过段时间再来看看，或在 B站上手动搜一下。";
}
} catch (_) {
biliNote = "这次没搜到片源（网络问题），下拉刷新再进一次。";
}
lines.push(biliNote);
const name = orig && orig!== title? (title + "（" + orig + "）"): title;
return {
name: name,
link: link,
imageUrl: this.posterUrl(d.poster_path),
description: lines.join("\n"),
genre: genres,
status: 3,
episodes: episodes
};
}
// ---- B站全片播放（v0.0.5 多候选） ----
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
// 标题归一化：小写、标点变空格、多空格合并。只用于 isRelevant 的兜底比对。
normTitle(s) {
return String(s || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\s+/g, " ").trim();
}
// 标题是否和片名沾边：片名要作为独立词出现，不能是更长词的一部分。
// v0.0.6：之前用子串匹配，“小教父”会撞上“教父”（The Outsiders 当成 The Godfather）。
// 现在要求片名前后都是分隔符（空格/标点/括号/开头结尾），前面是汉字、后面是汉字/
// 字母/数字（教父2、前传）都不算。英文名同样处理（The Godfather Part II 不算 Part I）。
isRelevant(title, nameStrs) {
const t = String(title || "").toLowerCase();
const isWordChar = (ch) => {
if (!ch) return false;
const c = ch.charCodeAt(0);
if (c >= 0x4e00 && c <= 0x9fff) return true; // 汉字
if ((c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a)) return true; // 数字/字母
return false;
};
for (const n of nameStrs) {
const nn = String(n || "").trim().toLowerCase();
if (!nn) continue;
let idx = t.indexOf(nn);
while (idx!== -1) {
const before = idx > 0? t[idx - 1]: "";
const after = idx + nn.length < t.length? t[idx + nn.length]: "";
if (!isWordChar(before) &&!isWordChar(after)) {
// 再看后面是不是“续集/Part II”：The Godfather 后面跟 Part II 是另一部片，
// 教父后面跟 2/前传同理（中文名后跟数字/汉字已被 isWordChar 挡住，这里补英文名的情况）。
let j = idx + nn.length;
while (j < t.length && /[\s（(【\[·.,:;—-]/.test(t[j])) j++;
const rest = t.slice(j, j + 8);
if (!/^(part|ii|iii|iv|v|2|3|4|5|续|前传|外传|episode|chapter)/.test(rest)) return true;
}
idx = t.indexOf(nn, idx + 1);
}
}
// v0.0.10：标点归一化兜底。IA 标题常带冒号/逗号（"The Godfather: Part II"、
// "The Good, The Bad, And The Ugly"），精确子串匹配会漏掉。去掉标点再比一次，
// 续集守卫（Part II / 数字）同样在归一化串上做。精确匹配优先，兜底只补漏。
const nt = " " + this.normTitle(title) + " ";
for (const n of nameStrs) {
const nn = this.normTitle(n);
if (!nn) continue;
const padded = " " + nn + " ";
let idx = nt.indexOf(padded);
while (idx !== -1) {
const rest = nt.slice(idx + padded.length).replace(/^ +/, "").slice(0, 8);
if (!/^(part|ii|iii|iv|v|2|3|4|5|续|前传|外传|episode|chapter)/.test(rest)) return true;
idx = nt.indexOf(padded, idx + 1);
}
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
// 降级版本（配音/上色版）：不硬拒，但排最后。
isDemoted(title) {
const t = String(title || "").toLowerCase();
for (const w of BILI_DEMOTE) {
if (t.indexOf(w.toLowerCase())!== -1) return true;
}
return false;
}
// 高清标志个数（蓝光/4K/1080p/修复/未删减/中英双字等），越多越优先。
hdScore(title) {
const t = String(title || "").toLowerCase();
let s = 0;
for (const w of BILI_HD) {
if (t.indexOf(w.toLowerCase())!== -1) s++;
}
return s;
}
// 集名用的短标题：去掉多余空格/换行，截到 30 字。
shortTitle(title) {
let t = String(title || "").replace(/\s+/g, " ").trim();
if (t.length > 30) t = t.slice(0, 30) + "…";
return t || "正片";
}
// v0.0.6：video 页核查。B站搜索接口不给分P数，但 video 页 HTML 里有 "videos":N。
// 十二怒汉“蓝光完整版” BV1uTxq6WE2t 是 36 分P，搜索片长 96 分钟是 36 个分P的总和，
// 第 1P 只有 2:44 的反应视频——扩展只播第 1P，所以用户看到的全是错的。
// 另外自制中字那两条（BV1KBQtBQEC9 / BV1ZQXrBVEKF）已经删了，页面标题是“视频去哪了呢”。
// 核查：取前 12 个候选并行抓 video 页，删掉的（标题含“视频去哪了呢”）和多分P的
// （videos>2）直接拒掉；抓不到/解析不到的放行（fail open，不因为网络问题把好片源也杀了）。
async checkBiliPages(cands) {
const CHECK_N = 12;
const list = cands.slice(0, CHECK_N);
const results = await Promise.all(list.map(async (c) => {
try {
const res = await new Client().get("https://www.bilibili.com/video/" + c.bvid + "/", this.biliHeaders());
const html = res.body || "";
if (html.indexOf("视频去哪了呢")!== -1) return null;
const m = html.match(/"videos":(\d+)/);
if (m && parseInt(m[1], 10) > 2) return null;
return c;
} catch (_) { return c;}
}));
return results.filter(Boolean);
}
// B站搜全片：返回最多 MAX_EPISODES 个候选（已排序：干净高清优先、配音/上色版最后、
// 同档按片长与 TMDB 的差距从小到大；同一 bvid 只留一次）。
// v0.0.6：搜索词加年份消歧（“惊魂记 1960 电影”），再过 video 页核查（拒多分P/已删）。
async findBiliFilms(titleZh, titleEn, runtimeMin, year) {
const nameStrs = [titleZh, titleEn].filter(Boolean);
const queries = [];
const y = year? String(year): "";
if (titleZh) queries.push(titleZh + (y? " " + y: "") + " 电影");
if (titleEn && titleEn!== titleZh) queries.push(titleEn + (y? " " + y: "") + " movie");
const seen = {};
const cands = [];
for (const q of queries) {
let data = null;
try {
const res = await new Client().get(BILI_API_SEARCH + encodeURIComponent(q), this.biliHeaders());
const d = JSON.parse(res.body || "");
data = d && d.data? d.data: null;
} catch (_) { data = null;}
if (!data ||!data.result) continue;
for (const r of data.result) {
if (!r || r.result_type!== "video" ||!r.data) continue;
for (const v of r.data) {
const title = this.stripEm(v.title);
if (!title ||!v.bvid) continue;
if (seen[v.bvid]) continue;
seen[v.bvid] = true;
if (this.isExcluded(title)) continue;
if (!this.isRelevant(title, nameStrs)) continue;
const dur = this.parseDuration(v.duration);
if (dur < FULL_FILM_MIN_SECONDS) continue;
let diff = 99999;
if (runtimeMin && runtimeMin > 0) {
diff = Math.abs(dur - runtimeMin * 60);
// v0.0.5：容差 max(15分钟, 15%)。旧的 max(30分钟, 25%) 会把 147 分钟有声书
// 当成 175 分钟的教父；新的仍容纳不同剪辑版（黄金三镖客 161 vs 178 分钟）。
const tol = Math.max(DUR_TOL_MIN * 60, Math.floor(runtimeMin * 60 * DUR_TOL_RATIO));
if (diff > tol) continue;
}
cands.push({ title: title, bvid: v.bvid, dur: dur, diff: diff,
demoted: this.isDemoted(title), hd: this.hdScore(title), author: String(v.author || "")});
}
}
}
cands.sort((a, b) => {
if (a.demoted!== b.demoted) return a.demoted? 1: -1;
if (a.hd!== b.hd) return b.hd - a.hd;
return (a.diff - b.diff) || (b.dur - a.dur);
});
// v0.0.6：video 页核查（拒多分P/已删），再取前 MAX_EPISODES 条。
const verified = await this.checkBiliPages(cands);
return verified.slice(0, MAX_EPISODES);
}
// 旧版单挑（留作兼容：老版集地址 bili:<id>:<标题>:<原名>:<片长> 还会走这条）。
async findBiliFilm(titleZh, titleEn, runtimeMin, year) {
const list = await this.findBiliFilms(titleZh, titleEn, runtimeMin, year);
return list.length? list[0]: null;
}
// ---- Internet Archive 备用源（v0.0.7） ----
// advancedsearch 搜 title + mediatype:movies → 按标题+年份过滤 → 并行取 metadata，
// 挑大小在 100MB~3GB 的 mp4（太小是片段/预告，太大是 mkv/合集），返回直链信息。
// 实测：十二怒汉 12-angry-men-1957_202308（532MB，96.1分钟）、七武士
// seven-samurai-1954-4k（1136MB，207.2分钟），片长和 TMDB 完全吻合，无水印。
// v0.0.10：IA 请求失败重发一次。本机到 archive.org 的连接常被重置（fetch failed），
 // 单次失败就整部片返回空；只在抛错时重试一次，中间等 500ms（连续重发也常一起断），
 // 不重试 HTTP 错误状态。
async iaGet(url) {
try {
return await new Client().get(url, this.headers());
} catch (e) {
try { await new Promise(function (r) { setTimeout(r, 500); }); } catch (_) {}
return await new Client().get(url, this.headers());
}
}
async findIAFilms(titleZh, titleEn, runtimeMin, year) {
const qTitle = titleEn || titleZh;
if (!qTitle) return [];
// v0.0.10：别名只在首选搜不到候选时才试（切腹→Harakiri；七武士日文搜已能命中，
// 不触发）。别名也放进 nameStrs，否则 isRelevant 会把英文标题的条目拒掉。
const aliases = [];
for (const k of [titleZh, titleEn]) {
const a = k && IA_ALIAS[k];
if (a) for (const x of a) if (aliases.indexOf(x) === -1) aliases.push(x);
}
const nameStrs = [titleZh, titleEn].concat(aliases).filter(Boolean);
const queryTitles = [qTitle].concat(aliases);
let cands = [];
for (const qt of queryTitles) {
let docs = [];
try {
// v0.0.9：搜索词加年份（和 B站搜索保持一致）。不加年份时教父的前 10 条全是
// 游戏/采访等垃圾，AI 修复版那条进不了前 10；加 year:1972 后只剩 2 条，AI 修复
// 版就是其中之一。年份是 IA 的字段过滤，比 B站的模糊关键词可靠得多。
const q = year
? "title:(" + qt + ") AND year:" + year + " AND mediatype:movies"
: "title:(" + qt + ") AND mediatype:movies";
const url = IA_SEARCH + "?q=" + encodeURIComponent(q) + "&fl[]=identifier&fl[]=title&fl[]=year&rows=10&output=json";
const res = await this.iaGet(url);
const d = JSON.parse(res.body || "");
docs = (d && d.response && d.response.docs) || [];
} catch (_) { docs = [];}
cands = [];
for (const doc of docs) {
const id = String(doc.identifier || "").trim();
const t = String(doc.title || "").trim();
if (!id ||!t) continue;
const tl = t.toLowerCase();
const il = id.toLowerCase();
if (IA_EXCLUDE.some(w => tl.includes(w) || il.includes(w))) continue;
if (!this.isRelevant(t, nameStrs)) continue;
const y = parseInt(doc.year || "0", 10) || 0;
if (year && y && y!== year) continue;
cands.push({ identifier: id, title: t, year: y});
}
if (cands.length) break;
}
if (!cands.length) return [];
const CHECK_N = 5;
const list = cands.slice(0, CHECK_N);
const rt = parseInt(runtimeMin || "0", 10) || 0;
const results = await Promise.all(list.map(async (c) => {
try {
const res = await this.iaGet(IA_META + c.identifier);
const d = JSON.parse(res.body || "");
const files = (d && d.files) || [];
let best = null;
for (const f of files) {
const name = String(f.name || "");
if (!/\.mp4$/i.test(name)) continue;
const size = parseInt(f.size || "0", 10) || 0;
if (size < IA_MIN_MP4_BYTES || size > IA_MAX_MP4_BYTES) continue;
// v0.0.10：片长校验。IA 不验片长会把片段当正片：黄金三镖客的“墓园场景”
// 只有 6.8 分钟、139MB，0.0.9 会把它排成正片 1。mp4 自带 length（秒），
// 用 B站同一容差 max(10分钟,10%) 比 TMDB 片长；length 缺失（未知）才放行。
const len = parseFloat(f.length || "0") || 0;
if (len > 0) {
if (rt > 0) {
if (Math.abs(len / 60 - rt) > Math.max(DUR_TOL_MIN, rt * DUR_TOL_RATIO)) continue;
} else if (len < FULL_FILM_MIN_SECONDS) continue;
}
if (!best || size > best.size) best = { name: name, size: size, lengthSec: len};
}
if (!best) return null;
return { identifier: c.identifier, filename: best.name, size: best.size, title: c.title, lengthSec: best.lengthSec};
} catch (_) { return null;}
}));
const seen = {};
const out = [];
for (const r of results) {
if (!r || seen[r.identifier]) continue;
seen[r.identifier] = true;
out.push(r);
}
return out;
}
// v0.0.9：按路径段编码。教父 AI 修复版的 mp4 在子目录里，文件名含“/”
// （The-Godfather-I_..._BL/The-Godfather-I_..._BLUDUAINE/....mp4）；
// 旧写法对整个文件名 encodeURIComponent 会把“/”编成 %2F，链接就坏了。
// 现在按“/”切开、每段单独编码、再拼回去。十二怒汉的 530MB 2160p mp4 也在
// 子目录里，修了编码后同样可用。
iaDirectUrl(identifier, filename) {
const enc = String(filename || "").split("/").map(s => encodeURIComponent(s)).join("/");
return "https://archive.org/download/" + identifier + "/" + enc;
}
// WebView 提 B站直链（和 seasonal.js 0.0.5 同一写法，手机已验证能播）。
// v0.0.5：顺带回传 dash 最高分辨率（maxHeight），画质标签写真实分辨率。
async extractBiliDirect(pageUrl) {
if (typeof evaluateJavascriptViaWebview!== "function") return null;
const script = "(function(){var tries=0;var timer=setInterval(function(){tries++;var direct=null;var maxH=0;try{var pi=window.__playinfo__;if(pi&&pi.data){var durl=pi.data.durl;if(durl&&durl.length&&durl[0].url){direct=durl[0].url;}if(pi.data.dash&&pi.data.dash.video&&pi.data.dash.video.length){var vs=pi.data.dash.video.slice().sort(function(a,b){return (b.bandwidth||0)-(a.bandwidth||0);});if(!direct){direct=vs[0].baseUrl||vs[0].base_url||null;}for(var i=0;i<vs.length;i++){var h=vs[i].height||0;if(h>maxH)maxH=h;}}}}catch(e){}if(direct||tries>24){clearInterval(timer);window.flutter_inappwebview.callHandler(\"setResponse\",JSON.stringify({direct:direct,maxHeight:maxH}));}},500);})()";
try {
const raw = await evaluateJavascriptViaWebview(pageUrl, this.biliHeaders(), [script], 20);
const d = JSON.parse(raw || "{}");
if (d && d.direct) return { url: String(d.direct), height: parseInt(d.maxHeight || 0, 10) || 0};
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
if (d && d.data && d.data.durl && d.data.durl.length && d.data.durl[0].url) return { url: String(d.data.durl[0].url), height: 0};
} catch (_) {}
return null;
}
async getVideoList(url) {
const u = String(url || "");
// v0.0.7：档案馆直链 ia:<identifier>:<urlencoded filename>，直接返回 mp4 直链（原生可播，无需 WebView）。
let m = u.match(/^ia:([^:]+):(.+)$/);
if (m) {
let filename = "";
try { filename = decodeURIComponent(m[2] || "");} catch (_) { filename = m[2] || "";}
if (!filename) return [];
const direct = this.iaDirectUrl(m[1], filename);
return [{ url: direct, originalUrl: direct, quality: "档案馆直链 · mp4", headers: this.headers()}];
}
// 新版集地址：bili:<bvid>，直接提这条的直链。
m = u.match(/^bili:(BV[0-9A-Za-z]+)$/);
if (m) {
const pageUrl = "https://www.bilibili.com/video/" + m[1] + "/";
const headers = this.biliHeaders();
let got = await this.extractBiliDirect(pageUrl);
if (!got) got = await this.extractBiliDirectViaApi(pageUrl);
if (!got ||!got.url) return [];
const quality = got.height? ("B站直链 · " + got.height + "p"): "B站直链";
return [{ url: got.url, originalUrl: pageUrl, quality: quality, headers: headers}];
}
// 老版集地址：bili:<tmdbId>:<标题>:<原名>:<片长>，走旧的搜索挑第一条。
m = u.match(/^bili:(\d+):([^:]*):([^:]*):(\d*)$/);
if (!m) return [];
let titleZh = "", titleEn = "";
try { titleZh = decodeURIComponent(m[2] || "");} catch (_) { titleZh = m[2] || "";}
try { titleEn = decodeURIComponent(m[3] || "");} catch (_) { titleEn = m[3] || "";}
const runtimeMin = parseInt(m[4] || "0", 10) || 0;
const film = await this.findBiliFilm(titleZh, titleEn, runtimeMin);
if (!film) return [];
const pageUrl = "https://www.bilibili.com/video/" + film.bvid + "/";
const headers = this.biliHeaders();
let got = await this.extractBiliDirect(pageUrl);
if (!got) got = await this.extractBiliDirectViaApi(pageUrl);
if (!got ||!got.url) return [];
const quality = got.height? ("B站直链 · " + got.height + "p"): "B站直链";
return [{ url: got.url, originalUrl: pageUrl, quality: quality, headers: headers}];
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
