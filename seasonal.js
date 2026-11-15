const mangayomiSources = [{
"name": "新番导视",
"lang": "zh",
"baseUrl": "https://api.bgm.tv",
"apiUrl": "",
"iconUrl": "https://bgm.tv/img/favicon.ico",
"typeSource": "single",
"itemType": 1,
"isNsfw": false,
"version": "0.0.3",
"dateFormat": "",
"dateFormatLocale": "",
"pkgPath": "seasonal.js"
}];

// 新番导视 v0.0.3（本季新番资讯指南 + PV + 按季度翻）。
// v0.0.3 修复（吴手机实测 2026-11-15：PV 有了但点开一直转圈 00:00 播不了；
// 炒翻天 的 PV 是错的——月亮计划十周年，和这部料理番没关系）：
// (1) getVideoList 返回的每个视频都带 headers（Referer: https://www.bilibili.com/ + 桌面 UA），
// B站直链（durl/dash）没有 Referer 会被 CDN 拒掉，播放器就一直转圈；
// 直链和页地址两条路都带 headers（fqdm.js v0.0.2 就是这么带 MVideo.headers 的）。
// 注意：页地址那条（B站视频页）本身不是视频流，headers 也救不了它，点开还是得用播放器里的
// 内置浏览器按钮看；headers 修复针对的是直链那条路。直链提没提到、提到了播不播得了，
// 只有吴手机能验证，服务器这边 B站页返回 412 测不出来。
// (2) PV 相关性收紧：视频标题必须和番名沾边（番名/别名完整出现，或与番名有 3 字以上公共片段，
// 或作者名含番名），否则不要——宁可没有 PV（回落到文字项），也不要放错的 PV。
// 炒翻天 的教训：B站搜 "炒翻天 PV" 前几条是月亮计划十周年（只因含 pv 二字），
// 旧版只看 PV 信号不看名字，就把错的放进来了。正确那条【2026年】炒翻天 先导PV 排在第 8，
// 旧版取满 3 条就停了，根本没扫到它；新版相关性过滤会把错的筛掉，继续往下扫到正确的。
// 数据：Bangumi 日历 API（本季）+ giriGiriLove（往季 + 评分/简介/更新状态）。
// 季度筛选：带年份+季节（2026年秋季/夏季/春季/冬季，2025年秋季……），默认当前季度。
// 1月=冬季、4月=春季、7月=夏季、10月=秋季。内部映射到 vod_area（一月/四月/七月/十月）+ vod_year。
// 本季走 Bangumi 日历（有评分/排名）；往季走 giriGiriLove get_list 按 vod_area+vod_year 服务端筛选
// （实测：七月 2026 共 66 部，四月 2026 共 71 部，一月 2026 共 66 部，十月 2025 共 58 部），按 vod_score 排序。
// 往季只有 giriGiriLove 数据，没有 Bangumi 评分/排名，类型只靠标题启发式（续集/重制）。
// 选集 = PV：每个番的详情页选集里是它的 PV（B站找的），不再是空的。
// 为什么用 B站找 PV、不用番剧官网：实测 学生会也有洞 官网 https://nama-anaru.com/
// （首页和 /movie、/pv、/special、/trailer）没有直接 mp4、没有 YouTube/B站嵌入、没有 <video> 标签。
// 官网本身不托管视频文件，PV 只是嵌 B站/YouTube 播放器或跳链接，走官网拿不到直链反而多一跳。
// B站才是视频实际所在的地方，而且 B站搜索 API 是通的（实测 HTTP 200）。
// 个别番官网确实有直接 mp4 时可作补充，但不以官网为主。
// PV 播放（吴要求"能直接播"）：
// 首选原生播放：getVideoList 先用 evaluateJavascriptViaWebview 打开 B站视频页，
// 从 window.__playinfo__ 里提直链（durl 或 dash 最高码率），提到了就返回直链，播放器直接播。
// 兜底：提不到（B站拦了内置浏览器、或页面没 __playinfo__）就返回 B站视频页地址，
// 点开后用播放器里的内置浏览器按钮看。
// 注意：服务器这边 B站 view 接口和视频页都返回 412（疑似机房 IP 被拦），手机 IP 未必被拦，
// 所以 WebView 提取在手机上可能行得通——不要因为服务器 412 就放弃这条路，
// 但在没手机实测前不要声称能直接播。
// B站搜索 API：GET https://api.bilibili.com/x/web-interface/search/all/v2?keyword=<番名>+PV
// → data.result 里 result_type=video 的 data 数组，各 {bvid, title, author, play}。
// 搜到的不全是 PV（有分集、OP/ED、合集），过滤规则见 isPVTitle：
// 强 PV 信号（PV/预告/特报/ティザー/先导PV/正式PV/第X弹/特別PV/本PV/Trailer）且不含分集特征才算；
// 实在没有强信号时再放宽到含"先行"但不含分集特征的；再没有就返回空，不编造 PV。
// 资讯帖（吴要求：导视要像小黑盒/微博那样的资讯 APP，详情页像一篇资讯帖）：
// 选集位置不空着：有 PV 就放 PV；没有 PV 就放文字项（信息写在选集项名字里，点开没有视频，
// getVideoList 对文字项返回 []，不报错、不返回假链接）。
// 文字项三类：改编来源（漫画《XXX》/轻小说/原创/续集/重制，详情里显眼标出）、
// 官方简介（简介摘录）、最新动态（更新集数/播出星期/评分）。
// 贴图：详情封面用 Bangumi images.large（或 giriGiriLove vod_pic）。
// 注意：Bangumi v0 详情的 images 只有同一张封面的不同尺寸（small/grid/large/medium/common），
// 没有别的海报/角色图；Mangayomi 详情页也只有一个 imageUrl 位置放不下多图，
// 所以封面就是详情里能带的图，角色图/海报不在接口里，带不上。
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

const BGM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BGM_API = "https://api.bgm.tv";
const GG_API = "https://m3u8.girigirilove.com/api.php/Vod";
const BILI_API = "https://api.bilibili.com/x/web-interface/search/all/v2";
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

// 季度映射：月份 → 季节名 + giriGiriLove 的 vod_area
const SEASON_BY_MONTH = {
1: { season: "冬季", area: "一月"},
4: { season: "春季", area: "四月"},
7: { season: "夏季", area: "七月"},
10: { season: "秋季", area: "十月"}
};

class DefaultExtension extends MProvider {
headers() {
return { "User-Agent": BGM_UA, "Accept": "application/json, text/html, */*"};
}

// B站请求头：直链和视频页都要带 Referer（B站 CDN 没 Referer 就拒掉，播放器转圈播不了）
// + 桌面 UA。只用于 B站（WebView 提直链、getVideoList 返回的视频项），不用于 Bangumi/giriGiriLove。
biliHeaders() {
return { "Referer": "https://www.bilibili.com/", "User-Agent": BGM_UA };
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

// 当前季度（由日期推导，不写死：1-3月→冬季/一月，4-6月→春季/四月，7-9月→夏季/七月，10-12月→秋季/十月）
currentQuarter() {
const d = new Date();
const y = d.getFullYear();
const m = d.getMonth() + 1;
let qm = 10;
if (m <= 3) qm = 1;
else if (m <= 6) qm = 4;
else if (m <= 9) qm = 7;
const info = SEASON_BY_MONTH[qm];
return { year: String(y), month: qm, season: info.season, area: info.area, label: y + "年" + info.season, value: y + "-" + qm, isCurrent: true};
}

// 季度选项：当前季度往前 8 个季度（当前 + 往前 7 个），每项 {label:"2026年秋季", value:"2026-10", year, area}
quarterOptions() {
const cur = this.currentQuarter();
const opts = [];
let y = parseInt(cur.year, 10);
let m = cur.month;
for (let i = 0; i < 8; i++) {
const info = SEASON_BY_MONTH[m];
opts.push({ label: y + "年" + info.season, value: y + "-" + m, year: String(y), area: info.area, isCurrent: i === 0});
m -= 3;
if (m < 1) { m += 12; y -= 1;}
}
return opts;
}

// 从筛选器里读选中的季度；没选或读不到就默认当前季度
quarterFromFilters(filters) {
const opts = this.quarterOptions();
if (filters) {
for (const f of filters) {
if (f && f["type"] === "quarter") {
const st = f["state"];
const vals = f["values"] || [];
if (typeof st === "number" && vals[st] && vals[st]["value"]) {
const v = String(vals[st]["value"]);
const parts = v.split("-");
if (parts.length === 2) {
const y = parts[0];
const m = parseInt(parts[1], 10);
const info = SEASON_BY_MONTH[m];
if (info) {
const cur = this.currentQuarter();
return { year: y, month: m, season: info.season, area: info.area, label: y + "年" + info.season, value: v, isCurrent: (y === cur.year && m === cur.month)};
}
}
}
}
}
}
return this.currentQuarter();
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

// 列表里的类型标签（续集/重制 + 改编来源，例：；
// 搜索结果里快照查不到的老番不硬标，只给标题启发式能定下来的）
typeLabel(show, forSearch) {
const name = (show.name_cn || "") + " " + (show.name || "");
const parts = [];
const t = this.titleType(name);
if (t) parts.push(t);
const adapt = this.adaptType(show);
if (adapt) parts.push(adapt);
if (parts.length) return "";
return forSearch? "": "";
}

verdict(score, votes, doing) {
if (score === null || score === undefined || score === "") return "暂无评分，先观望一两集再决定。";
const s = parseFloat(score);
if (isNaN(s)) return "暂无评分，先观望一两集再决定。";
if (votes!== null && votes!== undefined && votes < 50) return "刚开播不久，评分人数还少，先观望一两集再决定。";
if (s >= 8.0) return "本季值得追";
if (s >= 7.0) return "可看";
if (s >= 6.0) return "观望";
if (s < 6.0 && votes!== null && votes >= 500) return "评分两极但话题度很高，先看一集再决定。";
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
if (!it ||!it.id || seen[it.id]) continue;
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
const sa = (va >= 50 && a.rating && a.rating.score!== null && a.rating.score!== undefined)? parseFloat(a.rating.score): -1;
const sb = (vb >= 50 && b.rating && b.rating.score!== null && b.rating.score!== undefined)? parseFloat(b.rating.score): -1;
if (sb!== sa) return sb - sa;
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

// 往季：giriGiriLove 按 vod_area+vod_year 服务端筛选（实测支持），按评分排。
// 一个季度 60 部上下，limit=100 一调就够；total 超 100 时再翻页，上限 300 部。
async fetchGGLQuarter(year, area) {
const rows = [];
let offset = 0;
const limit = 100;
let total = 0;
do {
const url = GG_API + "/get_list?vod_name=&vod_area=" + encodeURIComponent(area) + "&vod_year=" + encodeURIComponent(year) + "&offset=" + offset + "&limit=" + limit;
let data = null;
try {
const res = await new Client().get(url, this.headers());
data = JSON.parse(res.body || "");
} catch (_) { data = null;}
const info = (data && data.info) || {};
total = info.total || 0;
const r = info.rows || [];
for (const row of r) rows.push(row);
offset += r.length;
if (r.length === 0) break;
} while (offset < total && offset < 300);
rows.sort((a, b) => {
const sa = parseFloat(a.vod_score || 0);
const sb = parseFloat(b.vod_score || 0);
if (sb!== sa) return sb - sa;
return (parseInt(b.vod_hits || 0, 10) - parseInt(a.vod_hits || 0, 10));
});
return rows;
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
const score = (show.rating && show.rating.score!== null && show.rating.score!== undefined)? parseFloat(show.rating.score): null;
const imageUrl = String((show.images && show.images.large) || "");
return {
name: label + name + ((score!== null &&!isNaN(score))? (" " + score.toFixed(1) + "分"): ""),
imageUrl: imageUrl,
link: "bgm:" + String(show.id || "")
};
}

// 往季列表项（giriGiriLove 行）：类型只靠标题启发式，评分用 giriGiriLove 分
toGGLItem(row) {
const name = String(row.vod_name || "").trim();
const t = this.titleType(name);
const label = t? (""): "";
const score = parseFloat(row.vod_score || 0);
return {
name: label + name + ((score &&!isNaN(score))? (" " + score.toFixed(1) + "分"): ""),
imageUrl: String(row.vod_pic || ""),
link: "ggl:" + String(row.vod_id || "")
};
}

// ---- PV 相关性（v0.0.3：标题必须和番名沾边，否则不要） ----
// 名字串归一化：繁→简，去标点空格，小写（和 normTitle 同一套路，但不过滤"第X季"）。
normName(s) {
let t = this.t2s(String(s || ""));
t = t.replace(/[^\w\u4e00-\u9fff\u3040-\u30ff]/g, "");
return t.toLowerCase();
}

// 最长公共子串长度（字符级）。标题和番名都是短串，O(m*n) 够用。
lcsLen(a, b) {
const m = a.length, n = b.length;
if (!m || !n) return 0;
let prev = new Array(n + 1).fill(0);
let best = 0;
for (let i = 1; i <= m; i++) {
const cur = new Array(n + 1).fill(0);
for (let j = 1; j <= n; j++) {
if (a[i - 1] === b[j - 1]) {
cur[j] = prev[j - 1] + 1;
if (cur[j] > best) best = cur[j];
}
}
prev = cur;
}
return best;
}

// 标题/作者是否和番名相关。nameStrs = [中文名，日文名，别名...]（已去重，短于 2 字的不要）。
// 通过条件（任一）：
// (a) 标题含完整番名/别名（例：【2026年】炒翻天 先导PV 含"炒翻天"）；
// (b) 标题与任一名字串的最长公共子串 >= 3 字（长名字才用，短名字必须完整出现防误判；
// 例：脑洞学生会 vs 学生会也有洞，公共片段"学生会" 3 字，通过）；
// (c) 作者名含番名/别名（上传者就是以番名命名的账号，近似"官方账号"）。
// 不通过例：月亮计划十周年新pv vs 炒翻天——标题、作者和番名/别名没有任何公共片段，筛掉。
// 注意：没有用"作者含官方"当通过条件——很多不相干的官方账号也会含"官方"二字，
// 光凭这个放行会把错的 PV 漏进来；作者必须含番名才算。
isRelevant(title, author, nameStrs) {
const t = this.normName(title);
const a = this.normName(author);
if (!t) return false;
for (const raw of (nameStrs || [])) {
const n = this.normName(raw);
if (!n || n.length < 2) continue;
if (t.indexOf(n) >= 0) return true;
if (n.length > 3 && this.lcsLen(t, n) >= 3) return true;
if (a && a.indexOf(n) >= 0) return true;
}
return false;
}

// Bangumi infobox 别名 → 字符串数组。别名可能是 [{v:"铁锅料理王"},...]、字符串或字符串数组，
// 都归一成字符串数组；只取 CJK/罗马字别名（不做翻译），供 PV 相关性判断用。
aliasesFromInfobox(infobox) {
const out = [];
try {
for (const e of (infobox || [])) {
if (e.key !== "别名") continue;
const v = e.value;
if (typeof v === "string") { if (v.trim()) out.push(v.trim()); }
else if (Array.isArray(v)) {
for (const it of v) {
if (typeof it === "string") { if (it.trim()) out.push(it.trim()); }
else if (it && typeof it.v === "string" && it.v.trim()) out.push(it.v.trim());
}
}
}
} catch (_) {}
return out;
}

// ---- PV（B站） ----
// 标题是不是 PV：先排除分集/合集/OP/ED/作画集锦/先行图，再看有没有 PV 信号。
// 强信号：PV/预告/特报/ティザー/先导PV/正式PV/第X弹/特別PV/特别PV/本PV/Trailer。
// 弱信号：含"先行"但不含分集特征（例如"先行PV"本身含 PV 已算强信号；纯"先行"只作第二梯队）。
isPVTitle(title, tier) {
const t = String(title || "");
if (/第\s*\d+\s*[话集話]|全\s*\d+\s*[话集]|合集|完整版|未删减|周更|\d+\s*-\s*\d+\s*[话集]|OP|ED|先行图|作画集锦|第\d+集|精彩作画|第\d+話/.test(t)) return false;
if (tier === 1) {
return /PV|预告|特报|ティザー|ティーザー|先导PV|正式PV|第[一二三四五]弹|特別PV|特别PV|本PV|トレーラー|Trailer/i.test(t);
}
return /先行/i.test(t);
}

// B站搜 PV：番名 + " PV"，没有强信号的再搜 " 预告"；每番最多 3 条，去重。
// v0.0.3：aliases 是 Bangumi infobox 别名（例：炒翻天 的"铁锅料理王"），只用来做相关性判断，
// 不单独拿去搜（实测搜别名会返回一堆不相干的视频，例如搜"铁锅料理王 PV"全是做菜视频）。
// 每条候选必须同时通过 isPVTitle（有 PV 信号、无分集特征）和 isRelevant（标题/作者和番名沾边），
// 否则跳过继续往下扫——不要取满 3 条就停在错的上面（炒翻天 的正确 PV 排第 8，错的三条排第 4-6）。
// 扫完所有查询、所有层级后仍不足 1 条就返回空，调用方回落到文字项，不编造、不放错的 PV。
async fetchBiliPVs(nameCn, name, aliases) {
const nameStrs = [];
const n1 = String(nameCn || "").trim();
const n2 = String(name || "").trim();
if (n1) nameStrs.push(n1);
if (n2 && n2!== n1) nameStrs.push(n2);
for (const al of (aliases || [])) {
const a = String(al || "").trim();
if (a && a!== n1 && a!== n2) nameStrs.push(a);
}
const queries = [];
if (n1) queries.push(n1 + " PV");
if (n2 && n2!== n1) queries.push(n2 + " PV");
if (n1) queries.push(n1 + " 预告");
const found = [];
const seen = {};
// 先扫强信号
for (let tier = 1; tier <= 2; tier++) {
if (found.length >= 3) break;
for (const q of queries) {
if (found.length >= 3) break;
let videos = [];
try {
const res = await new Client().get(BILI_API + "?keyword=" + encodeURIComponent(q), this.headers());
const data = JSON.parse(res.body || "");
const results = (data && data.data && data.data.result) || [];
for (const r of results) {
if (r.result_type === "video") { videos = r.data || []; break;}
}
} catch (_) { videos = [];}
for (const v of videos) {
if (found.length >= 3) break;
const bvid = String(v.bvid || "");
if (!bvid || seen[bvid]) continue;
const title = String(v.title || "").replace(/<[^>]+>/g, "");
if (!this.isPVTitle(title, tier)) continue;
if (!this.isRelevant(title, String(v.author || ""), nameStrs)) continue;
seen[bvid] = true;
found.push({ bvid: bvid, title: title, author: String(v.author || ""), pageUrl: "https://www.bilibili.com/video/" + bvid});
}
}
}
return found;
}

// WebView 提 B站直链：打开视频页，等 window.__playinfo__，取 durl（或 dash 最高码率）。
// 提不到返回 null（调用方退回页地址）。服务器 B站页返回 412，但手机 IP 未必被拦，手机上可能行得通。
async extractBiliDirect(pageUrl) {
if (typeof evaluateJavascriptViaWebview!== "function") return null;
const script = "(function(){var tries=0;var timer=setInterval(function(){tries++;var direct=null;try{var pi=window.__playinfo__;if(pi&&pi.data){var durl=pi.data.durl;if(durl&&durl.length&&durl[0].url){direct=durl[0].url;}else if(pi.data.dash&&pi.data.dash.video&&pi.data.dash.video.length){var vs=pi.data.dash.video.slice().sort(function(a,b){return (b.bandwidth||0)-(a.bandwidth||0);});direct=vs[0].baseUrl||vs[0].base_url||null;}}}catch(e){}if(direct||tries>24){clearInterval(timer);window.flutter_inappwebview.callHandler(\"setResponse\",JSON.stringify({direct:direct}));}},500);})()";
try {
const raw = await evaluateJavascriptViaWebview(pageUrl, this.biliHeaders(), script, 20);
const d = JSON.parse(raw || "{}");
if (d && d.direct) return String(d.direct);
} catch (_) {}
return null;
}

// PV 变成选集：每条 PV 一集，url 就是 B站视频页地址（getVideoList 再决定直链还是页地址）
pvEpisodes(pvs) {
const eps = [];
for (let i = 0; i < pvs.length; i++) {
const p = pvs[i];
eps.push({ name: "PV" + (i + 1) + " · " + p.title, url: p.pageUrl});
}
return eps;
}

// 改编来源行：漫画《XXX》/轻小说《XXX》/游戏改编/小说《XXX》/原创番，无原作/续集/重制。
// yuanzuo 是 Bangumi infobox 原作字段（作者+刊载，例如"むちまろ（講談社「週刊少年マガジン」連載）"）。
sourceLineText(primary, adapt, yuanzuo, nameCn) {
const y = String(yuanzuo || "").replace(/<[^>]+>/g, "").trim();
let base = "";
if (primary === "重制") base = "重制";
else if (primary === "续集") base = "续集";
else if (adapt === "漫画改编") base = "漫画《" + nameCn + "》";
else if (adapt === "轻小说改编") base = "轻小说《" + nameCn + "》";
else if (adapt === "游戏改编") base = "游戏改编";
else if (adapt === "小说改编") base = "小说《" + nameCn + "》";
else if (adapt === "原创" || primary === "原创") base = "原创番，无原作";
else if (adapt === "改编") base = "改编";
else base = "新番";
if (primary === "续集" && adapt && adapt !== "原创" && adapt !== "改编") base += " · " + adapt;
if (y && base.indexOf("原创") < 0) base += "（原作：" + y + "）";
return base;
}

// 文字选集（没有 PV 时用）：信息写在选集项名字里，点开没有视频（getVideoList 对 text: 返回 []）。
// 三类：改编来源、官方简介（摘录前 80 字）、最新动态（更新集数/播出星期/评分）。
textEpisodes(opts) {
const eps = [];
if (opts.sourceLine) eps.push({ name: "改编来源：" + opts.sourceLine, url: "text:source" });
if (opts.intro) {
const ex = String(opts.intro).replace(/\s+/g, " ").trim();
if (ex) eps.push({ name: "官方简介：" + ex.slice(0, 80) + (ex.length > 80 ? "……" : ""), url: "text:intro" });
}
if (opts.newsLine) eps.push({ name: "最新动态：" + opts.newsLine, url: "text:news" });
return eps;
}

// 选集：有 PV 放 PV，没有 PV 放文字项（不空着，不编造）
episodesFor(pvs, textOpts) {
const eps = this.pvEpisodes(pvs || []);
if (eps.length) return eps;
return this.textEpisodes(textOpts || {});
}

async getPopular(page, filters) {
const q = this.quarterFromFilters(filters);
if (q.isCurrent) {
const shows = await this.fetchCalendar();
this.guideSort(shows);
const items = [];
for (const s of shows) {
items.push(this.toItem(s, null, false));
if (items.length >= 60) break;
}
return { list: items, hasNextPage: false};
}
const rows = await this.fetchGGLQuarter(q.year, q.area);
const items = [];
for (const r of rows) {
items.push(this.toGGLItem(r));
if (items.length >= 60) break;
}
return { list: items, hasNextPage: false};
}

async getLatestUpdates(page, filters) {
const q = this.quarterFromFilters(filters);
if (q.isCurrent) {
// “最新” = 今天播出的本季番，按在追人数排
const shows = await this.fetchCalendar();
const jsDay = new Date().getDay();
const bgmDay = jsDay === 0? 7: jsDay;
const today = shows.filter(s => s.air_weekday === bgmDay);
today.sort((a, b) => (((b.collection && b.collection.doing) || 0) - ((a.collection && a.collection.doing) || 0)));
return { list: today.map(s => this.toItem(s, null, false)), hasNextPage: false};
}
// 往季没有"今天更新"，最新 = 该季度按评分排
const rows = await this.fetchGGLQuarter(q.year, q.area);
return { list: rows.slice(0, 60).map(r => this.toGGLItem(r)), hasNextPage: false};
}

async search(query, page, filters) {
const q = String(query || "").trim();
if (!q) return await this.getPopular(page, filters);
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

// 详情：实时调 Bangumi v0 详情核对类型 + 评分，再用 giriGiriLove 搜简介/更新状态，拼成推荐词；
// 选集 = B站搜到的 PV（最多 3 条），没有 PV 就空着，不编造。
async getDetail(url) {
const link = String(url || "").trim();
// giriGiriLove 往季番（link = ggl:<vod_id> 或纯数字）
if (/^ggl:\d+$/.test(link) || /^\d+$/.test(link)) {
const vid = link.replace(/^ggl:/, "").replace(/[^0-9]/g, "");
if (!vid) return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: []};
let info = null;
try {
const res = await new Client().get(GG_API + "/get_detail?vod_id=" + vid, this.headers());
const d = JSON.parse(res.body || "");
info = d && d.info? d.info: null;
} catch (_) { info = null;}
if (!info) return { name: "", imageUrl: "", description: "", genre: [], status: 3, episodes: []};
const name = String(info.vod_name || "").trim();
const primary = this.titleType(name) || "新番";
const score = parseFloat(info.vod_score || 0);
const lines = [];
lines.push("类型：" + primary + "（往季只有 giriGiriLove 数据，类型只靠标题判断，没有 Bangumi 评分/排名）");
if (score) lines.push("giriGiriLove " + score.toFixed(1) + "分" + (info.vod_hits? (" · " + info.vod_hits + "次点击"): "") + (info.vod_remarks? (" · " + String(info.vod_remarks)): ""));
lines.push("简介：" + String(info.vod_content || info.vod_blurb || "").replace(/<[^>]+>/g, "").trim());
lines.push("选集里是本番的 PV（B站搜的），点开后先试直接播，播不了就点播放器里的内置浏览器看。");
const pvs = await this.fetchBiliPVs(name, "", []);
const newsParts = [];
if (info.vod_remarks) newsParts.push(String(info.vod_remarks));
if (score) newsParts.push("giriGiriLove " + score.toFixed(1) + "分");
if (info.vod_hits) newsParts.push(info.vod_hits + "次点击");
const introText = String(info.vod_content || info.vod_blurb || "").replace(/<[^>]+>/g, "").trim();
return { name: "" + name, imageUrl: String(info.vod_pic || ""), description: lines.join("\n"), genre: [], status: 3, episodes: this.episodesFor(pvs, { sourceLine: this.sourceLineText(primary, "", "", name), intro: introText, newsLine: newsParts.join(" · ") })};
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
const rank = (subj.rating && subj.rating.rank!== null && subj.rating.rank!== undefined)? subj.rating.rank: null;
const doing = (subj.collection && subj.collection.doing!== null && subj.collection.doing!== undefined)? subj.collection.doing: null;
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
lines.push("" + verdict + (doing? ("（" + doing + "人在追）"): ""));
if (ggl) {
let g = "";
if (ggl.vod_score) g += "giriGiriLove " + ggl.vod_score + "分";
if (ggl.vod_hits) g += (g? " · ": "") + ggl.vod_hits + "次点击";
if (ggl.vod_remarks) g += (g? " · ": "") + String(ggl.vod_remarks);
if (g) lines.push(g);
}
if (weekday) lines.push("每周" + weekday + "播出");
lines.push("简介：" + intro);
lines.push("选集里是本番的 PV（B站搜的），点开后先试直接播，播不了就点播放器里的内置浏览器看。");
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
const aliases = this.aliasesFromInfobox(subj.infobox || []);
const pvs = await this.fetchBiliPVs(nameCn, subj.name || "", aliases);
let yuanzuo = "";
try {
const ib2 = {};
for (const e of (subj.infobox || [])) ib2[e.key] = e.value;
yuanzuo = String(ib2["原作"] || "");
} catch (_) {}
const newsParts = [];
if (ggl && ggl.vod_remarks) newsParts.push(String(ggl.vod_remarks));
if (weekday) newsParts.push("每周" + weekday + "播出");
if (score !== null) newsParts.push("Bangumi " + score + "分" + (total !== null? ("（" + total + "人评分）"): ""));
const srcLine = this.sourceLineText(primary, adapt, yuanzuo, nameCn);
return {
name: "" + nameCn,
imageUrl: (ggl && ggl.vod_pic)? String(ggl.vod_pic): String((subj.images && subj.images.large) || ""),
description: lines.join("\n"),
genre: genre,
status: 3,
episodes: this.episodesFor(pvs, { sourceLine: srcLine, intro: intro, newsLine: newsParts.join(" · ") })
};
}

// PV 播放：首选 WebView 提直链（原生播）；提不到就返回 B站视频页（内置浏览器看）。
// v0.0.3：返回的每个视频都带 headers（Referer: https://www.bilibili.com/ + 桌面 UA）——
// B站直链没有 Referer 会被 CDN 拒掉，播放器一直转圈 00:00 播不了（吴手机实测 2026-11-15）。
// 页地址那条也带 headers（无害；它本身不是视频流，点开还是得用播放器里的内置浏览器按钮看）。
// 注意：服务器 B站页返回 412，直链提取在服务器上测不出来，只能在手机上验证。
async getVideoList(url) {
const pageUrl = String(url || "").trim();
if (!pageUrl) return [];
// 文字项（改编来源/官方简介/最新动态）：没有视频，返回空，不报错、不给假链接
if (pageUrl.indexOf("text:") === 0) return [];
const headers = this.biliHeaders();
const direct = await this.extractBiliDirect(pageUrl);
if (direct) {
return [{ url: direct, quality: "PV直链", originalUrl: pageUrl, headers: headers}];
}
return [{ url: pageUrl, quality: "PV · 内置浏览器", originalUrl: pageUrl, headers: headers}];
}

getFilterList() {
const opts = this.quarterOptions();
const values = [];
for (const o of opts) {
values.push({ type_name: "SelectOption", name: o.label, value: o.value});
}
return [{
type: "quarter",
name: "季度",
type_name: "SelectFilter",
values: values
}];
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
