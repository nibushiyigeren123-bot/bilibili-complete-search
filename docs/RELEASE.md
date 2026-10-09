合并视频标题与真实标签，只显示完整覆盖搜索词的结果。

- 中文与数字完整匹配，如「黑色行动7」「BO7」。
- 英文灵活词块匹配，如 `payday` 可匹配 `pay … day`。
- 开关、实时统计、翻页跟踪、失败原因与重新核验。
- 手动安装：下载 ZIP → 解压 → Chrome 开发者模式 → 加载 `extension` 文件夹。
- AI 辅助安装：仓库 `docs/AI-INSTALL.md` 与 `scripts/install.ps1`。

`bilibili-complete-search-v1.0.0.zip` 是扩展安装包。无需 Node 或 Python。

展示视频、字幕和封面将作为本 Release 的附件提供。视频只展示网页内容，无浏览器侧边栏。

只筛选 B站已返回的视频；建议使用视频搜索标签。详细规则、权限及源代码见仓库 README。
