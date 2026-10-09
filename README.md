# B站搜索 · 完整包含

搜索「黑色行动7」，结果却只包含「黑色行动」？搜索 `payday`，又不想漏掉写成 `pay … day` 的视频？

这个 Chrome 扩展合并每条视频的**标题与真实标签**，只保留完整覆盖搜索内容的结果。原版搜索结果仍可一键恢复。

[下载最新安装包](https://github.com/nibushiyigeren123-bot/bilibili-complete-search/releases/latest) · [AI 辅助安装](docs/AI-INSTALL.md) · [详细规则](extension/使用说明.md)

## 效果与规则

| 搜索内容 | 标题和标签中的内容 | 结果 |
| --- | --- | --- |
| 黑色行动7 | 标题「黑色行动玩法」，标签「7」 | 保留 |
| 黑色行动7 | 只有「黑色行动」，缺少「7」 | 隐藏 |
| BO7 | 标题「BO 攻略」，标签「7」 | 保留 |
| BO7 | 只有「BO6」 | 隐藏 |
| payday | `PAYDAY`、`pay … day` | 保留 |
| payday | 标题有 `day`，标签有 `pay` | 保留 |
| payday | 只有 `pay` | 隐藏 |

中文、数字片段分别连续匹配。英文忽略大小写，允许拆成至少两个连续字母的词块，词块顺序不限。这是灵活的文本词块覆盖，并非词典分词：`pa + yday` 也可匹配 `payday`。标题已满足时直接显示，否则读取标签进一步确认；简介、UP 主昵称、评论不算匹配依据。游戏名称仅作为搜索词例子。

## 方式一：自己动手安装（主动 / 手动安装）

1. 到 [Releases](https://github.com/nibushiyigeren123-bot/bilibili-complete-search/releases/latest) 下载 `bilibili-complete-search-v1.0.0.zip` 并解压，也可下载源码 ZIP。
2. 将文件保存在固定目录，保留其中的 `extension` 文件夹。
3. Chrome 地址栏输入 `chrome://extensions`，打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择**直接包含 `manifest.json` 的 `extension` 文件夹**。
5. 打开或刷新 [B站视频搜索](https://search.bilibili.com/video?keyword=payday)，右下角出现过滤面板即表示页面脚本已加载。

不用 Node、Python 或 npm。未发布到 Chrome 应用商店，采用 [Chrome 官方本地加载方式](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)。更新文件后，在扩展管理页重新加载，再刷新搜索页。

## 方式二：让 AI 帮你安装

把以下内容发给有本机文件操作能力的 AI，例如 Codex。完整指南见 [AI-INSTALL.md](docs/AI-INSTALL.md)。

```text
请帮我安装 https://github.com/nibushiyigeren123-bot/bilibili-complete-search
到本机 Chrome。先阅读 README 和 docs/AI-INSTALL.md。
下载最新 Release 安装包，解压到固定目录，确认 extension/manifest.json 存在。
Windows 可运行仓库的 scripts/install.ps1 准备文件并打开扩展管理页。
请保留已有扩展与浏览器资料，使用开发者模式「加载已解压的扩展程序」。
若你有浏览器界面操作能力，协助选择目录；若需我点按钮，明确给出目录。
最后用 B站视频搜索 payday 验证过滤面板出现，不要只凭文件下载成功声称安装完成。
```

Windows 脚本负责下载、解压、检查文件并打开管理页；Chrome 加载目录仍通过浏览器界面完成。

## 使用与权限

右下角显示保留、隐藏、核验中、待核验数量，支持关闭过滤与重新核验。搜索词改变、翻页、新视频插入时自动评估。

建议在「视频」搜索标签下使用。只过滤 B站已返回的视频，不会扩大搜索召回；综合页中的用户、直播、番剧模块不在过滤范围。标签请求失败的结果先隐藏并显示原因，成功标签缓存 24 小时。

Manifest V3；只在 `search.bilibili.com` 注入脚本，只请求 `api.bilibili.com` 视频标签。不申请所有网站、浏览记录、下载或 Cookie 读取权限；请求可使用已有 B站登录状态。不上传搜索词到第三方，不包含远程执行代码。安装脚本另会访问 GitHub 下载本仓库 Release 文件。

## 开发与验证

```sh
npm ci
npm test
python build.py
```

扩展没有运行时 npm 依赖。40 项自动化测试通过；2026-10-09 在独立 Edge Chromium 配置加载扩展并访问真实 `payday` 视频搜索，42 条中保留 33 条、隐藏 9 条，见 [验证记录](verification/验证记录.md)。搜索结果随时间、登录状态变化。

MIT 许可，非 B站官方产品。可提交 [Issue](https://github.com/nibushiyigeren123-bot/bilibili-complete-search/issues)。
