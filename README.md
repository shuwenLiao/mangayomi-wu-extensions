# Mangayomi 扩展仓库（Wu 专用）

自己的三个库：漫画 343 个源、动漫 78 个源、小说 5 个源。仓库是公开的，三个地址分别加进 Mangayomi 就能用。

## 三个仓库地址

| 库 | 地址 | 在 Mangayomi 里怎么加 |
|---|---|---|
| 漫画 | `https://raw.githubusercontent.com/shuwenLiao/mangayomi-wu-extensions/main/manga_index.json` | 更多 → 浏览 → 漫画扩展仓库 → 添加（+），粘贴地址 |
| 动漫 | `https://raw.githubusercontent.com/shuwenLiao/mangayomi-wu-extensions/main/anime_index.json` | 更多 → 浏览 → 动漫扩展仓库 → 添加（+），粘贴地址 |
| 小说 | `https://raw.githubusercontent.com/shuwenLiao/mangayomi-wu-extensions/main/novel_index.json` | 更多 → 浏览 → 小说扩展仓库 → 添加（+），粘贴地址 |

一键加动漫库：

`mangayomi://add-repo?repo_name=wu-extensions&repo_url=https://github.com/shuwenLiao/mangayomi-wu-extensions&anime_url=https://raw.githubusercontent.com/shuwenLiao/mangayomi-wu-extensions/main/anime_index.json`

## 动漫（78 个源：m2k3a 全文 64 个 + 自己写的 14 个独有）

| 源 | 语言 | 内容 | 状态 |
|---|---|---|---|
| AGE动漫 | 中文 | 日漫（agedm.io） | v0.0.4。搜索/详情/剧集已验证，列表已能出结果。**根因已修：agedm.io 对不带 User-Agent 的请求返回 403，扩展现在所有请求都带桌面 Chrome UA**；播放用内置浏览器去解析器页拿直链；v0.0.4 加强了播放触发（解析器在手机上默认不自动播放，每轮主动点播放器+调 play，超时放宽到 28 秒）；列表页静态拿不到时自动走内置浏览器兜底；名字乱码已修。**播放仍需手机实测** |
| DM84 | 中文 | 日漫（动漫巴士，dmbus.cc） | v0.0.1 新加。搜索/详情/剧集实测通过（JOJO 搜到 6 部，剧集 38 集）；播放页只嵌解析器 iframe（hhjx.hhplayer.com），用内置浏览器拿直链（带播放触发）；列表页静态拿不到时自动走内置浏览器兜底。**仍需手机实测** |
| aafun | 中文 | 日漫（月之祠，moonci.com） | v0.0.1 新加。搜索/详情/剧集实测通过（JOJO 搜到 8 部，剧集 26 话）；播放链路：播放页 player_aaaa 解出下一跳播放页（next.xifanacg.com），再抓直链，抓不到用内置浏览器拿。**下一跳站从服务器打不开，手机上能不能打开是关键，仍需手机实测** |
| giriGiriLove | 中文 | 日漫（ani.girigirilove.com） | v0.0.1 新加。**纯 JSON API，直链 m3u8**（akua.girigirilove.com，播放列表+分片都验证过 HTTP 200）；搜索/详情/剧集全部实测通过（JOJO 搜到 8 部，飙马野郎 9 集）；繁/简两条线路，扩展优先简体字幕。不用解析器、不用 WebView |
| ANi | 中文 | 日漫（open.ani.rip，当季新番） | v0.0.2。**Resources Core RSS 直链 MP4**（1080P，Baha，繁中字幕）；搜索/详情/剧集全部实测通过（RSS 52 部番）。**v0.0.2：直链固定 301 到 cloud.ani-download.workers.dev，扩展直接给最终地址 + Referer/UA 头。限制：RSS 只覆盖最近一周的更新，没有分页和搜索接口，老番搜不到**（比如 JOJO 不在 feed 里）；看当季新番够用 |
| FQDM | 中文 | 日漫（番茄动漫，fqdm.cc） | v0.0.2。**player_aaaa 明文直链 m3u8**（xluuss/hn.bfvvs，AES-128 HLS）；搜索/详情/剧集全部实测通过（JOJO 搜到 16 部，飙马野郎 8 集）。**注意：分片 CDN 用非标准端口（线路2/3 是 g.xlzyd.com:9999，线路1 是 hnts.ymuuy.com:65），手机网络可能拦端口导致播不出；v0.0.2 返回全部线路（各标线路号）+ Referer/UA 头，播不动就换一条线再试** |
| LMM | 中文 | 日漫（路漫漫，lmm22.com） | v0.0.1 新加。搜索/详情/剧集实测通过（JOJO 搜到 6 部，飙马野郎 9 集）；播放走 yunbox 解析器（yun.92cj.com），需带 Referer，用内置浏览器拿直链。**播放需手机实测** |
| MX动漫 | 中文 | 日漫（dcc3.com） | 全部验证通过，播放页直接有 m3u8 |
| 七色番 | 中文 | 日漫（7sefun.top） | 搜索/详情/剧集已验证；播放地址要解码跳转，最后一跳没验证 |
| 红果短剧 | 中文 | 竖屏短剧（hongguoduanju.com） | 搜索/浏览/详情/分集全部实测通过；**每部剧只有前面几集（一般 5 集）能播，后面的集是红果付费墙，公开地址 404，扩展拿不到**；画质只有 360p；想看全集用桐溪观影厅（合集版）或电脑上的红果桌面端 |
| 桐溪观影厅 | 中文 | 短剧镜像站（fentiny.com） | 浏览/详情/播放全部实测通过，m3u8 直链，标准 HLS 加密、播放器原生支持，**整部剧合并成一个“全集”视频，没有分集**；搜索可能被 Cloudflare 拦（手机端实测）；站里不一定有最新季（比如《重生，他只做创一代》只有第一季合集，没有第三季分集版） |
| RedGifs | 全部 | 成人短视频（redgifs.com，NSFW） | 走官方 API v2，明文 MP4 直链（HD/SD），不用解密；临时 token 绑定设备 IP+UA，扩展每次自动拿新 token、401 自动刷新；**没法在这台服务器上完整实测（出口 IP 每次都变，token 总是报 WrongSender），手机上 IP 稳定，理论上能用，需要实测** |
| PimpBunny | 全部 | 成人视频（pimpbunny.com，NSFW） | **内置浏览器（WebView）取页**：普通请求被 Bunny Shield 拦（403），视频地址不在页面源码里；列表/搜索/详情走 WebView 拿，**播放没有原生直链，点开视频后在内置浏览器里用网站自己的播放器看** |
| Stripchat | 全部 | 成人直播（zh.stripchat.com，NSFW） | **内置浏览器（WebView）取页**：直播流是 MOUFLON 加密（要解密代理+手动密钥），扩展解不了；房间列表走 WebView 拿，**播放没有原生直链，点开房间后在内置浏览器里用网站自己的播放器看**（网站自己的播放器会解密）；未完成年龄验证前缩略图是模糊的 |
| DopeBox | 英文 | 英美电影+剧集 | m2k3a 原版，直接引用 |
| SFlix | 英文 | 英美电影+剧集 | m2k3a 原版，直接引用 |
| NetMirror | 全部 | 电影+剧集 | m2k3a 原版，直接引用 |
| KissKH | 英文 | 韩剧、日剧、泰剧、中剧 | m2k3a 原版，直接引用 |
| Wiflix | 法文 | 法国电影+剧集 | m2k3a 原版，直接引用 |

AGE、MX动漫、七色番、DM84、aafun、giriGiriLove、ANi、FQDM、LMM 是新写的 JS 扩展（照 m2k3a 的樱花动漫扩展格式），规则来自 Kazumi 的 Predidit/KazumiRules（XPath 选择器 + 站点地址已实测）。另外 5 个是 m2k3a 仓库里现成的，index 里直接引用原地址，不用重复写。

## 漫画（343 个源：m2k3a 333 + 自写 10）

`manga_index.json` 是 m2k3a 漫画索引的全文复制（335 条里有 2 条是完全相同的重复条目，已去掉，剩 333 个源），再加 10 个按 Yokai 列表自写的中文漫画源。中文和日文的源都在里面：

| 源 | 语言 | 内容 |
|---|---|---|
| 动漫之家 | 中文 | dmzj.com |
| 拷贝漫画 | 中文 | mangacopy.com |
| 新新漫画 | 中文 | 77mh.xyz |
| 包子漫画 | 中文 | baozimh.com |
| 古风漫画 | 中文 | gufengmh.com |
| 如漫画 | 中文 | rumanhua1.com |
| 漫画柜 | 中文 | manhuagui.com |
| Webtoons | 中文 | webtoons.com |
| MangaDex | 中文/日文 | mangadex.org（两个语言各一个入口） |
| Mangafire | 日文 | mangafire.to |

其余 323 个是英文、法文、西班牙文、印尼文等其他语言的源，也都原样在里面，没删。注意：**动漫之家在任何 Mihon/Yokai 扩展仓库里都没有**，只有 m2k3a 这个 Mangayomi 版有。个别源的站可能已经挂了（比如天空资源网这类），挂了的在 app 里会显示无结果，忽略就行。

### 自写的 10 个中文漫画源（2026-11-14 新增，全部实测+模拟测试通过）

| 源 | 内容 | 状态 |
|---|---|---|
| 漫画人 | manhuaren.com | 搜索/详情/章节实测通过（火影 553 章，章节 44 图）；章节图在 packed JS 里，扩展内置无 eval 解包器 |
| 动漫屋 | dm5.com | 搜索/详情/章节实测通过（死神 619 章）；章节图调 chapterfun.ashx，每页 2 图逐页拉，手机上偏慢 |
| 再漫画 | manhua.zaimanhua.com | 纯 JSON API，搜索/详情/章节实测通过；搜索不能带 source 参数 |
| 92漫画 | 92mh.com | 搜索/详情/章节实测通过；章节图直链 |
| 嬉皮漫画 | m.hipmh.com | API 全套实测通过；图片加密串已按站方算法在 JS 里解密（与原版解码器逐字节比对一致）；**含成人内容，标了 NSFW** |
| 瓜子漫画 | guazimanhua.com | 搜索/详情/章节实测通过（详情 42 章，章节 32 张直链图） |
| 漫蛙漫画 | manwadz.cc | JSON API 全套实测通过（《一人之下》921 章）；**含成人内容，标了 NSFW** |
| 腾讯动漫 | ac.qq.com | 网页直出，搜索/详情/章节实测通过（详情 681 话，第 1 话 36 图）；VIP 话无图时明确报错 |
| 爱奇艺动漫 | manhua.iqiyi.com | 签名接口免登录可用，搜索/详情/章节实测通过（详情 114 话，第 1 话 53 图） |
| GoDa漫画 | godamh.com | 搜索/详情/章节实测通过（第 1 话 119 图）；图片密文已逆向；图片 CDN 在机房 IP 被 Cloudflare 拦，**手机上要实测** |

没建成的 9 个：漫画屋（站死了）、包子漫画Plus（和包子漫画同一服务，重复）、vomic漫（章节要登录）、哔哩漫画（搜索和章节图走 WASM 签名+AES，JS 复现不了）、优酷漫画（站不可达）、東立（只卖书，无免费章节）、無限動漫（章节图要 VIP）、18漫画/禁漫天堂（同一平台，章节图片服务器端切条打乱，JS 扩展没有像素操作能力，解不开）。

## 小说（5 个源）

| 源 | 语言 | 内容 | 状态 |
|---|---|---|---|
| 笔趣阁 | 中文 | 网络小说转载（8tsw.com） | 搜索/详情/章节/正文全部实测通过；**个别书不全**（实测《诡秘之主》只到第 777 章，《大主宰》《斗破苍穹》是全的）；站是 GBK 编码，扩展内置了 GBK 码表自己转码 |
| 笔趣阁TW | 中文 | 网络小说转载（biquge.com.tw） | 搜索/详情/章节/正文全部实测通过；**《诡秘之主》1398 章全本**（原著 1394 章+番外）；正文是 base64 包起来的，扩展自己解；章节目录要翻 15 页，打开书时稍慢 |
| 稷下書院 Novel543 | 中文 | 轻小说（novel543.com） | novel543 原版，直接引用 |
| 嗶哩輕小說（繁體） | 中文 | 轻小说繁体（tw.linovelib.com） | novel543 原版，直接引用 |
| 真白萌 Masiro | 中文 | 轻小说（masiro.me） | novel543 原版，直接引用，**要登录** |

## 已知问题（实话）

- **笔趣阁：个别书不全。**
  搜、看、读都通，但这是转载站，不同书的完整度不一样：
  实测《大主宰》1551 章全、《斗破苍穹》1648 章全，《诡秘之主》只到第 777 章（原著 1394 章）。
  **同一本书如果在这个源不全，换“笔趣阁TW”那个源再搜一次**——实测《诡秘之主》在那边是 1398 章全本。
  站点换域名是常事，如果哪天打不开了，在 Mangayomi 的扩展设置里改网址（domain_url）就行。
  起点/番茄/七猫/书旗没有现成的 Mangayomi 扩展，要新写；七猫最容易（全站免费），
  起点只能做免费章，书旗反爬严，番茄有字体加密加人机验证，最难。
- **红果短剧：只能看前面几集。**
  搜索、浏览、详情、分集列表都是官网公开接口，实测全通。
  但每部剧只有前面几集免费（实测《重生，他只做创一代第三季》前 5 集能播，第 6 集起公开地址 404），
  后面的集要走红果 App 的签名+加密流，Mangayomi 扩展做不了，只能用官方 App 看。
  另外官网只给 360p，没有更高画质。
- **七色番：播放地址要解一层。**
  播放页里的 `player_aaaa` 的 url 是 base64 + 百分号编码，
  解出来是一个跳转播放页（比如 lmm85.com），再从那页提 m3u8。
  解码逻辑已写进扩展并验证过（能解出真地址），
  但跳转那一页我这边打不开（lmm85.com 连接失败），手机上可能能打开，实测为准。
- **80tv、libvio 没做。**它俩的 Kazumi 规则本身已标记废弃，
  80tv 搜不到结果，libvio.cc 打不开，做不了。
- 分页没做：搜索和浏览只返回第一页结果。源站换域名的话，
  在 Mangayomi 的扩展设置里改网址（domain_url）就行，不用重新装。

## 更新扩展

改了某个 `.js` 后，把对应 index 里那个源的 `version` 加 0.0.1（比如 0.0.1 → 0.0.2），
Mangayomi 里就会提示更新。
