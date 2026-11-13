# Mangayomi 扩展仓库（Wu 专用）

一个 Mangayomi 动漫扩展仓库，8 个源。加一个仓库地址，8 个源全进来。

## 包含的源

| 源 | 语言 | 内容 | 状态 |
|---|---|---|---|
| AGE动漫 | 中文 | 日漫（AGE，agedm.io） | 搜索/详情/剧集已验证；**播放地址是 JS 动态加载的，静态抓不到，播不播得了要实测** |
| MX动漫 | 中文 | 日漫（dcc3.com） | 全部验证通过，播放页直接有 m3u8 |
| 七色番 | 中文 | 日漫（7sefun.top） | 搜索/详情/剧集已验证；播放地址要解码跳转，最后一跳没验证 |
| 红果短剧 | 中文 | 竖屏短剧（hongguoduanju.com） | 搜索/浏览/详情/分集全部实测通过；**每部剧只有前面几集（一般 5 集）能播，后面的集是红果付费墙，公开地址 404，扩展拿不到**；画质只有 360p |
| DopeBox | 英文 | 英美电影+剧集 | m2k3a 原版，直接引用 |
| SFlix | 英文 | 英美电影+剧集 | m2k3a 原版，直接引用 |
| NetMirror | 全部 | 电影+剧集 | m2k3a 原版，直接引用 |
| KissKH | 英文 | 韩剧、日剧、泰剧、中剧 | m2k3a 原版，直接引用 |
| Wiflix | 法文 | 法国电影+剧集 | m2k3a 原版，直接引用 |

AGE、MX动漫、七色番是新写的 JS 扩展（照 m2k3a 的樱花动漫扩展格式），
规则来自 Kazumi 的 Predidit/KazumiRules（XPath 选择器 + 站点地址已实测）。
另外 5 个是 m2k3a 仓库里现成的，index 里直接引用原地址，不用重复写。

## 用法（仓库已建好，只剩两步）

### 第 1 步：把仓库改成公开（必须）

现在仓库是私人的，Mangayomi 拿不到里面的文件，会一直失败。
改公开：打开 https://github.com/shuwenLiao/mangayomi-wu-extensions/settings
拉到最下面 Danger Zone → Change visibility → Make public。

### 第 2 步：把这 4 个文件传到仓库根目录

在仓库页面点 Add file → Upload files，把下面 4 个文件一起传上去
（都在仓库根目录，不用建文件夹）：
- `anime_index.json`
- `age.js`
- `mxdm.js`
- `sevenfun.js`

传完后在 Mangayomi 里加这个地址：

`https://raw.githubusercontent.com/shuwenLiao/mangayomi-wu-extensions/main/anime_index.json`

加法：Mangayomi 里 更多 → 浏览 → 动漫扩展仓库 → 添加（+），粘贴地址。
加完后在动漫扩展列表里安装你要的源（先装 MX动漫 试）。

也可以点这个一键链接：

`mangayomi://add-repo?repo_name=wu-extensions&repo_url=https://github.com/shuwenLiao/mangayomi-wu-extensions&anime_url=https://raw.githubusercontent.com/shuwenLiao/mangayomi-wu-extensions/main/anime_index.json`

注意：如果建库时分支不是 `main`，把上面地址里的 `main` 换成你的分支名。

## 已知问题（实话）

- **红果短剧：只能看前面几集。**
  搜索、浏览、详情、分集列表都是官网公开接口，实测全通。
  但每部剧只有前面几集免费（实测《重生，他只做创一代第三季》前 5 集能播，第 6 集起公开地址 404），
  后面的集要走红果 App 的签名+加密流，Mangayomi 扩展做不了，只能用官方 App 看。
  另外官网只给 360p，没有更高画质。
- **AGE动漫：能搜、能看详情和剧集列表，但播放不一定能播。**
  它的播放地址是 JS 动态加载的，页面源码里没有直链，
  app.js、foot.js 里也没有视频接口，我没拿到。
  如果点开剧集提示找不到视频，把现象告诉我，我用浏览器抓它播放时的真实请求再修。
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

改了 `age.js` / `mxdm.js` / `sevenfun.js` 后，
把 `anime_index.json` 里对应源的 `version` 加 0.0.1（比如 0.0.1 → 0.0.2），
Mangayomi 里就会提示更新。
