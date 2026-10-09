# AI 辅助安装

适用于具有本机文件操作能力的 AI。纯网页聊天 AI 可以指导用户操作。

## Windows：准备文件

下载并阅读仓库的 `scripts/install.ps1`，使用当前用户权限运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

`Bypass` 仅应用于本次进程，不改系统执行策略。脚本下载本仓库最新 Release 安装包，保存到 `%LOCALAPPDATA%\BiliCompleteSearch\<版本>\extension`，打印并复制目录，打开 Chrome 扩展管理页。无需管理员权限；版本目录保留。

可指定安装根目录，或使用已经下载的本地 ZIP：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -InstallRoot "D:\Tools\BiliCompleteSearch"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ArchivePath "C:\Downloads\bilibili-complete-search-v1.1.1.zip"
```

`-NoOpenBrowser` 仅准备文件，稍后操作界面。

## 加载与验收

1. 打开 `chrome://extensions`。
2. 开启「开发者模式」，点击「加载已解压的扩展程序」。
3. 选择脚本输出的目录，目录内应直接有 `manifest.json`。
4. 确认扩展列表出现「B站搜索 · 完整包含」。
5. 打开 https://search.bilibili.com/video?keyword=payday ，确认过滤面板出现；关闭过滤恢复原始列表，再次开启继续核验。

有浏览器控制工具的 AI 可协助点击和选择目录。没有界面能力时，给用户精确目录与待点击按钮。**文件准备完成、管理页已加载、实际搜索页过滤**是三个阶段，应分别核验。

使用用户实际使用的 Chrome 配置。保留现有扩展与资料；不要为免点按钮而改 `Preferences`、`Secure Preferences`、注册表或系统策略。

macOS / Linux 可下载 ZIP，解压到固定目录后采用同样的 Chrome 界面步骤；Windows 脚本不适用这两种系统。
