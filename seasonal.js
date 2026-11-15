const mangayomiSources = [{
"name": "新番导视",
"lang": "zh",
"baseUrl": "https://api.bgm.tv",
"apiUrl": "",
"iconUrl": "https://bgm.tv/img/favicon.ico",
"typeSource": "single",
"itemType": 1,
"isNsfw": false,
"version": "0.0.1",
"dateFormat": "",
"dateFormatLocale": "",
"pkgPath": "seasonal.js"
}];

// 新番导视（本季新番资讯指南，只做资讯、不放视频）。
// 数据全部实时取自公开 API，新番一上架就能看到，比等导视视频更快：
// Bangumi 日历：GET https://api.bgm.tv/calendar
// → 7 个 weekday 对象，各 {weekday:{cn}, items:[{id, name, name_cn, rating:{score,total}, rank, summary, images:{large}, air_date, air_weekday}]}
/// 本季 2026 Q4 共 112 部，99 部有评分。无须鉴权，但要带 UA，否则 403。
// giriGiriLove：GET https://m3u8.girigirilove.com/api.php/Vod/get_list?vod_name=&offset=0&limit=100
// → {info:{total:3797, rows:[{vod_id, vod_name, vod_pic, vod_score, vod_hits, vod_blurb, vod_remarks, vod_area, vod_year}]}}
// vod_area + vod_year 是季度（本季：十月 2026），前 100 条里已有全部 63 部本季番。
// 类型标注（每部番必须标出类型，用户在列表一眼区分）：
// 续集 / 重制：标题启发式（第X季/第二季/第三季/S2/S3/第X期/续篇；重制/Remake），运行时判断，任何季度都适用。
// 漫画改编 / 轻小说改编 / 游戏改编 / 小说改编 / 原创：
// 2026-11-15 实测 Bangumi v0 详情接口（infobox 原作字段 + 用户标签）逐部核对后生成的快照
// TYPE_MAP（bangumiId → 类型码），只覆盖本季 112 部；下季新番不在表里时回退到标题启发式 + "新番"。
// 详情页（getDetail）一定实时调 v0 详情接口再核对一次，所以详情里的类型永远是最新的。
// 类型码：M=漫画改编 L=轻小说改编 G=游戏改编 N=小说改编 O=原创 A=改编（有原作但来源不明）。
// 推荐词写法（学泛式导视的路子，但不编造评价）：
// 开头一句按 Bangumi 评分给的 verdict（>=8.0 本季值得追 / 7-8 可看 / 6-7 观望 / <6 谨慎 / 无评分 暂无评分），
// 再给简介 + 数据行（Bangumi 分 / 评分人数 / 本季排名 / giriGiriLove 分 / 点击 / 更新集数 / 播出星期）。
// 所有数字都来自接口实测，不编造、不引用泛式的原话。
// 注意：这是资讯源，getVideoList 永远返回 []，点开只有介绍、没有播放。

const BGM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BGM_API = "https://api.bgm.tv";
const GG_API = "https://m3u8.girigirilove.com/api.php/Vod";
// 本季：只留 2026-09-01 之后开播的番。Bangumi 日历含航海王（1999）、柯南（1996）
// 这种长寿番，不过滤的话它们会按评分霸占导视榜首。
const SEASON_FROM = "2026-09-01";

// 繁→简最小映射（只覆盖本季标题里出现的 48 个繁体字，每对“繁+简”）。
const T2S = "偵侦備备傭佣僕仆別别劇剧動动問问場场師师強强東东棲栖殺杀滸浒無无現现異异盜盗約约結结統统絶绝編编聖圣華华蓮莲術术見见計计記记謳讴貸贷質质賭赌車车軍军輩辈輪轮遊游達达選选還还録录間间陽阳騎骑麗丽";

// 类型快照（2026-11-15 实测 Bangumi v0 详情生成，112 部；M=漫画改编 L=轻小说改编 G=游戏改编 N=小说改编 O=原创 A=改编）。
const TYPE_MAP = {
  "899":"M","975":"M","390200":"O","393010":"L","412008":"M","418229":"L","449346":"O","456078":"L",
  "471844":"M","486456":"L","498559":"O","499474":"M","502123":"M","505550":"O","507820":"N","511936":"M",
  "513878":"G","536270":"L","537738":"L","538631":"O","541538":"G","542007":"M","544378":"O","548156":"M",
  "551304":"L","554779":"M","555605":"M","559080":"M","563508":"M","567896":"M","568244":"L","568525":"M",
  "573707":"O","576783":"M","577237":"L","584847":"M","586255":"M","589775":"M","590553":"O","593565":"M",
  "593863":"O","596771":"L","605533":"M","606716":"M","613256":"L","614640":"M","616808":"L","617273":"M",
  "617948":"M","621073":"M","621108":"M","622288":"M","623249":"M","624085":"L","624923":"M","625799":"M",
  "630160":"M","632061":"M","632817":"O","634210":"O","634587":"M","634708":"M","635258":"O","636023":"M",
  "636058":"M","636512":"O","637206":"A","637802":"M","638081":"M","646154":"M","646586":"O","647220":"M",
  "654294":"M","654678":"O","656083":"M","657084":"M","657656":"O","657778":"O","664389":"M","664395":"M",
  "665014":"O","665390":"M","688204":"M","688797":"O","694622":"A","698032":"O","698981":"O","700127":"O",
  "700678":"O","701310":"O","701565":"O","701779":"A","701782":"O","702192":"M","704737":"O","705980":"O",
  "707667":"O","708080":"O","708612":"O","709326":"O","709475":"O","710874":"O","712000":"N","712500":"M",
  "712926":"N","713219":"M","713654":"O","715907":"O","716251":"O","716367":"A","716967":"O","717907":"O"
};
const TYPE_NAME = {"M":"漫画改编","L":"轻小说改编","G":"游戏改编","N":"小说改编","O":"原创","A":"改编"};

class DefaultExtension extends MProvider {
headers() {
return { "User-Agent": BGM_UA, "Accept": "application/json, text/html, */*"};
}

t2s(s) {
let out = "";
for (const ch of String(s || "")) {
const i = T2S.indexOf(ch);
out += (i >= 0 && i % 2 === 0)? T2S[i + 1]: ch;
}
return out;
}

// 标题归一化：繁→简，去掉 第X季/第X期，去标点空格，小写
normTitle(s) {
let t = this.t2s(String(s || ""));
t = t.replace(/第[一二三四五六七八九十\d]+季/g, "");
t = t.replace(/第[一二三四五六七八九十\d]+期/g, "");
t = t.replace(/[^\w\u4e00-\u9fff\u3040-\u30ff]/g, "");
return t.toLowerCase();
}

// 标题启发式：续集 / 重制（运行时判断，任何季度都适用）
titleType(name) {
const n = String(name || "");
if (/重制|重製|Remake|リメイク/i.test(n)) return "重制";
if (/第[一二三四五六七八九十\d]+季|第[一二三四五六七八九十\d]+期|\bS[2-9]\b|Season\s*[2-9]|第二季|第三季|第四季|第五季|续篇|最终季| [2-9]$/.test(n)) return "续集";
return "";
}

// 当前季度（由日期推导，不写死：1-3月→一月，4-6月→四月，7-9月→七月，10-12月→十月）
currentSeason() {
const d = new Date();
const y = d.getFullYear();
const m = d.getMonth();
let area;
if (m <= 2) area = "一月";
else if (m <= 5) area = "四月";
else if (m <= 8) area = "七月";
else area = "十月";
return { year: String(y), area: area};
}

// 原作字段 → 改编类型（与生成快照时用的同一套规则；详情页实时核对用）
adaptFromYuanzuo(yuan, tags) {
const y = String(yuan || "");
const tagset = tags || [];
const hasTag = (t) => tagset.indexOf(t) >= 0;
if (!y) return "原创";
if (/STUDIO|スタジオ|Pictures|フィルム|制作|Team|Project|GOOD SMILE|ライデンフィルム|MOZU|Pierrot|バンダイナムコフィルム|BN Pictures|エポック|トミーテック/.test(y)
&&!/漫画|マンガ|連載|コミックス|コミック|ジャンプ|マガジン|サンデー|文庫|ライトノベル|ノベル|BOOKS/.test(y)) return "原创";
if (hasTag("原创") &&!/漫画|マンガ|連載|コミックス|文庫|ライトノベル|ゲーム|CD Projekt|Cyberpunk|2077/.test(y)) return "原创";
if (/漫画|マンガ|連載|コミックス|コミック|ジャンプ|マガジン|サンデー|なかよし|りぼん|ちゃお|花とゆめ|LaLa|ヤング|月刊|週刊|WEBTOON|webtoon|集英社|講談社|小学館|白泉社|秋田書店|双葉社|芳文社|竹書房|一迅社|スクウェア・エニックス|D&C WEBTOON/.test(y) || hasTag("漫画改")) return "漫画改编";
if (/文庫|ライトノベル|ノベル|BOOKS|電撃|ファンタジア|オーバーラップ|MF文庫|GA文庫|HJ文庫|アース・スター|小説家になろう|カクヨム|スニーカー文庫|富士見/.test(y) || hasTag("轻小说改")) return "轻小说改编";
if (/ゲーム|CD Projekt|コナミ|任天堂|セガ|カプコン|Cyberpunk|2077/.test(y)) return "游戏改编";
if (/《[^》]+》/.test(y) || hasTag("小说改") || hasTag("网文改")) return "小说改编";
return "改编";
}

// 主类型：续集/重制优先，其次快照里的改编类型，最后是"新番"
primaryType(show) {
const t = this.titleType((show.name_cn || "") + " " + (show.name || ""));
if (t) return t;
const code = TYPE_MAP[String(show.id || "")];
if (code && TYPE_NAME[code]) return TYPE_NAME[code];
return "新番";
}

// 改编类型（用于详情里写"续集 · 漫画改编"这种完整类型）
adaptType(show) {
const code = TYPE_MAP[String(show.id || "")];
return (code && TYPE_NAME[code])? TYPE_NAME[code]: "";
}

// 列表里的类型标签（续集/重制 + 改编来源，例：【续集·漫画改编】；
// 搜索结果里快照查不到的老番不硬标，只给标题启发式能定下来的）
typeLabel(show, forSearch) {
const name = (show.name_cn || "") + " " + (show.name || "");
const parts = [];
const t = this.titleType(name);
if (t) parts.push(t);
const adapt = this.adaptType(show);
if (adapt) parts.push(adapt);
if (parts.length) return "【" + parts.join("·") + "】";
return forSearch? "": "【新番】";
}

verdict(score, votes, doing) {
if (score === null || score === undefined || score === "") return "暂无评分，先观望一两集再决定。";
const s = parseFloat(score);
if (isNaN(s)) return "暂无评分，先观望一两集再决定。";
if (votes !== null && votes !== undefined && votes < 50) return "刚开播不久，评分人数还少，先观望一两集再决定。";
if (s >= 8.0) return "本季值得追";
if (s >= 7.0) return "可看";
if (s >= 6.0) return "观望";
if (s < 6.0 && votes !== null && votes >= 500) return "评分两极但话题度很高，先看一集再决定。";
return "谨慎";
}

async fetchCalendar() {
const res = await new Client().get(BGM_API + "/calendar", this.headers());
let shows = [];
try {
const data = JSON.parse(res.body || "");
if (Array.isArray(data)) {
for (const wd of data) {
for (const it of (wd.items || [])) shows.push(it);
}
}
} catch (_) {}
// 只留本季（2026-09-01 后开播），去重
const out = [];
const seen = {};
for (const it of shows) {
if (!it || !it.id || seen[it.id]) continue;
if (String(it.air_date || "") < SEASON_FROM) continue;
seen[it.id] = true;
out.push(it);
}
return out;
}

// 有把握的（评分人数>=50）按评分排；没把握的沉底，按在追人数排
guideSort(shows) {
shows.sort((a, b) => {
const va = (a.rating && a.rating.total) || 0;
const vb = (b.rating && b.rating.total) || 0;
const sa = (va >= 50 && a.rating && a.rating.score !== null && a.rating.score !== undefined)? parseFloat(a.rating.score): -1;
const sb = (vb >= 50 && b.rating && b.rating.score !== null && b.rating.score !== undefined)? parseFloat(b.rating.score): -1;
if (sb !== sa) return sb - sa;
const da = (a.collection && a.collection.doing) || 0;
const db = (b.collection && b.collection.doing) || 0;
return db - da;
});
return shows;
}

// giriGiriLove 列表（前 100 条，含全部本季番）→ 按归一化标题建索引
async fetchGGLIndex() {
const url = GG_API + "/get_list?vod_name=&offset=0&limit=100";
const res = await new Client().get(url, this.headers());
const index = {};
try {
const data = JSON.parse(res.body || "");
const rows = (data && data.info && data.info.rows)? data.info.rows: [];
for (const r of rows) {
const key = this.normTitle(r.vod_name || "");
if (key &&!index[key]) index[key] = r;
}
} catch (_) {}
return index;
}

matchGGL(index, show) {
if (!index) return null;
const a = this.normTitle(show.name_cn || "");
if (a && index[a]) return index[a];
const b = this.normTitle(show.name || "");
if (b && index[b]) return index[b];
return null;
}

// 列表项：名字里带类型标签 + 评分，列表一眼区分 漫画改编/重制/续集/原创番
toItem(show, ggl, forSearch) {
const label = this.typeLabel(show, forSearch);
const name = (show.name_cn || show.name || "").trim();
const score = (show.rating && show.rating.score !== null && show.rating.score !== undefined)? parseFloat(show.rating.score): null;
const imageUrl = String((show.images && show.images.large) || "");
return {
name: label + name + ((score !== null && !isNaN(score))? (" " + score.toFixed(1) + "分"): ""),
imageUrl: imageUrl,
link: "bgm:" + String(show.id || "")
};
}

async getPopular(page) {
const shows = await this.fetchCalendar();
this.guideSort(shows);
const items = [];
for (const s of shows) {
items.push(this.toItem(s, null, false));
if (items.length >= 60) break;
}
return { list: items, hasNextPage: false};
}

async getLatestUpdates(page) {
// “最新” = 今天播出的本季番，按在追人数排
const shows = await this.fetchCalendar();
const jsDay = new Date().getDay();
const bgmDay = jsDay === 0? 7: jsDay;
const today = shows.filter(s => s.air_weekday === bgmDay);
today.sort((a, b) => (((b.collection && b.collection.doing) || 0) - ((a.collection && a.collection.doing) || 0)));
return { list: today.map(s => this.toItem(s, null, false)), hasNextPage: false};
}

async search(query, page, filters) {
const q = String(query || "").trim();
if (!q) return await this.getPopular(page);
const url = BGM_API + "/search/subject/" + encodeURIComponent(q) + "?type=2&responseGroup=small&max_results=20";
const res = await new Client().get(url, this.headers());
const items = [];
try {
const data = JSON.parse(res.body || "");
const list = (data && data.list)? data.list: [];
for (const s of list) {
items.push(this.toItem(s, null, true));
}
} catch (_) {}
return { list: items, hasNextPage: false};
}

// 详情：实时调 Bangumi v0 详情核对类型 + 评分，再用 giriGiriLove 搜简介/更新状态，拼成推荐词
async getDetail(url) {
const link = String(url || "").trim();
// 搜索走 giriGiriLove 数字 id 的回退（暂不常用，search 用的是 Bangumi）
if (/^\d+$/.test(link)) {
const res = await new Client().get(GG_API + "/get_detail?vod_id=" + link, this.headers());
let info = null;
try { const d = JSON.parse(res.body || ""); info = d && d.info? d.info: null;} catch (_) {}
if (!info) return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: []};
const name = String(info.vod_name || "").trim();
const primary = this.titleType(name) || "新番";
const desc = "类型：" + primary + "\n简介：" + String(info.vod_content || "").replace(/<[^>]+>/g, "").trim();
return { name: "" + name, imageUrl: String(info.vod_pic || ""), description: desc, genre: [], status: 3, episodes: []};
}
const bgmId = link.replace(/^bgm:/, "").replace(/[^0-9]/g, "");
if (!bgmId) return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: []};
// v0 详情（类型权威来源）
let subj = null;
try {
const res = await new Client().get(BGM_API + "/v0/subjects/" + bgmId, this.headers());
subj = JSON.parse(res.body || "");
} catch (_) { subj = null;}
// 日历（算本季排名 + 播出星期；v0 详情里没有 air_weekday）
let seasonRank = "";
let calWeekday = 0;
try {
const shows = await this.fetchCalendar();
const rated = shows.filter(s => s.rating && s.rating.score!== null && s.rating.score!== undefined);
rated.sort((a, b) => parseFloat(b.rating.score) - parseFloat(a.rating.score));
for (let i = 0; i < rated.length; i++) {
if (String(rated[i].id) === bgmId) { seasonRank = "本季第" + (i + 1) + "名"; calWeekday = rated[i].air_weekday || 0; break;}
}
} catch (_) {}
// giriGiriLove 简介/更新状态
let ggl = null;
if (subj) {
const nameCn = subj.name_cn || subj.name || "";
try {
const res = await new Client().get(GG_API + "/get_list?vod_name=" + encodeURIComponent(nameCn) + "&offset=0&limit=5", this.headers());
const data = JSON.parse(res.body || "");
const rows = (data && data.info && data.info.rows)? data.info.rows: [];
for (const r of rows) {
if (this.normTitle(r.vod_name || "") === this.normTitle(nameCn) || this.normTitle(r.vod_name || "") === this.normTitle(subj.name || "")) { ggl = r; break;}
}
// 注意：不匹配就不取——之前“没匹配到就拿第一条”会把别家番的简介/封面贴过来
} catch (_) {}
}
if (!subj) {
return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: []};
}
const nameCn = (subj.name_cn || subj.name || "").trim();
const primary = this.titleType(nameCn + " " + (subj.name || "")) || this.adaptType({ id: bgmId}) || "新番";
// 详情实时核对改编类型（快照之外的番、或快照有误时以实时为准）
let adapt = this.adaptType({ id: bgmId});
try {
const ib = {};
for (const e of (subj.infobox || [])) ib[e.key] = e.value;
const tags = (subj.tags || []).map(t => t.name);
const live = this.adaptFromYuanzuo(ib["原作"], tags);
if (live && live!== "未知") adapt = live;
} catch (_) {}
const typeParts = [];
if (primary) typeParts.push(primary);
if (adapt && adapt!== primary) typeParts.push(adapt);
const typeLine = "类型：" + (typeParts.length? typeParts.join(" · "): "未标（Bangumi 数据里没写）");
const score = (subj.rating && subj.rating.score!== null && subj.rating.score!== undefined)? subj.rating.score: null;
const total = (subj.rating && subj.rating.total!== null && subj.rating.total!== undefined)? subj.rating.total: null;
const rank = (subj.rating && subj.rating.rank !== null && subj.rating.rank !== undefined)? subj.rating.rank: null;
const doing = (subj.collection && subj.collection.doing !== null && subj.collection.doing !== undefined)? subj.collection.doing: null;
const verdict = this.verdict(score, total, doing);
const weekday = ["", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"][calWeekday || 0] || "";
const blurb = ggl? String(ggl.vod_blurb || "").trim(): "";
const summary = String(subj.summary || "").trim();
const intro = blurb || summary || "暂无简介。";
const lines = [];
lines.push(typeLine);
let dataLine = "";
if (score!== null) dataLine += " Bangumi " + score + "分";
if (total!== null) dataLine += "（" + total + "人评分）";
if (seasonRank) dataLine += " · " + seasonRank;
if (rank!== null) dataLine += " · Bangumi 总排名第" + rank + "位";
lines.push(dataLine);
lines.push("【一句话】" + verdict + (doing? ("（" + doing + "人在追）"): ""));
if (ggl) {
let g = "";
if (ggl.vod_score) g += "giriGiriLove " + ggl.vod_score + "分";
if (ggl.vod_hits) g += (g? " · ": "") + ggl.vod_hits + "次点击";
if (ggl.vod_remarks) g += (g? " · ": "") + String(ggl.vod_remarks);
if (g) lines.push(g);
}
if (weekday) lines.push("每周" + weekday + "播出");
lines.push("简介：" + intro);
lines.push("资讯来源：Bangumi 日历 + giriGiriLove，数据实时更新，新番一上架就能看到，比等导视视频更快。");
const genre = [];
try {
for (const t of (subj.tags || [])) {
const gn = String(t.name || "").trim();
if (!gn || gn === "TV" || gn === "WEB" || gn === "OVA" || gn === "ONA" || gn === "日本" || gn === "中国" || /^\d{4}$/.test(gn) || /^\d{4}年\d+月$/.test(gn)) continue;
if (genre.indexOf(gn) < 0) genre.push(gn);
if (genre.length >= 8) break;
}
} catch (_) {}
return {
name: "" + nameCn,
imageUrl: (ggl && ggl.vod_pic)? String(ggl.vod_pic): String((subj.images && subj.images.large) || ""),
description: lines.join("\n"),
genre: genre,
status: 3,
episodes: []
};
}

// 资讯源，没有视频
async getVideoList(url) {
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
"summary": "Bangumi 网址",
"value": "https://api.bgm.tv",
"dialogTitle": "URL",
"dialogMessage": ""
}
}];
}
}
