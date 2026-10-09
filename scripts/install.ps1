[CmdletBinding()]
param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'BiliCompleteSearch'),
    [string]$ArchivePath,
    [switch]$NoOpenBrowser,
    [switch]$NoClipboard
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$taskHeaders = @{ 'User-Agent' = 'BiliCompleteSearch-Installer'; 'Accept' = 'application/vnd.github+json' }
$taskRoot = [IO.Path]::GetFullPath($InstallRoot)
if (-not (Test-Path -LiteralPath $taskRoot)) { New-Item -ItemType Directory -Path $taskRoot | Out-Null }
$taskTemp = Join-Path $taskRoot ('download-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskTemp | Out-Null
if ($ArchivePath) {
    $taskArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
} else {
    $taskRelease = Invoke-RestMethod -Uri 'https://api.github.com/repos/nibushiyigeren123-bot/bilibili-complete-search/releases/latest' -Headers $taskHeaders
    $taskAsset = $taskRelease.assets | Where-Object { $_.name -like 'B站搜索完整包含_v*.zip' } | Select-Object -First 1
    if (-not $taskAsset) { throw 'The latest release has no extension ZIP asset.' }
    $taskArchive = Join-Path $taskTemp 'extension.zip'
    Invoke-WebRequest -Uri $taskAsset.browser_download_url -OutFile $taskArchive -UseBasicParsing
}
$taskExtract = Join-Path $taskTemp 'unpacked'
Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskExtract
$taskSource = Join-Path $taskExtract 'extension'
$taskManifest = Join-Path $taskSource 'manifest.json'
if (-not (Test-Path -LiteralPath $taskManifest -PathType Leaf)) { throw 'ZIP must contain extension/manifest.json.' }
$taskInfo = [IO.File]::ReadAllText($taskManifest, [Text.Encoding]::UTF8) | ConvertFrom-Json
if ($taskInfo.manifest_version -ne 3 -or $taskInfo.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected extension manifest.' }
$taskVersion = Join-Path $taskRoot ('v' + $taskInfo.version)
if (Test-Path -LiteralPath $taskVersion) { $taskVersion += '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6) }
New-Item -ItemType Directory -Path $taskVersion | Out-Null
$taskTarget = Join-Path $taskVersion 'extension'
Copy-Item -LiteralPath $taskSource -Destination $taskTarget -Recurse
if (-not (Test-Path -LiteralPath (Join-Path $taskTarget 'manifest.json'))) { throw 'Copy verification failed.' }
Write-Host "Extension directory: $taskTarget"
Write-Host 'Chrome: chrome://extensions > Developer mode > Load unpacked > select the directory above.'
if (-not $NoClipboard) {
    try { Set-Clipboard -Value $taskTarget; Write-Host 'The directory is copied to your clipboard.' } catch { Write-Host 'Clipboard unavailable; copy the printed directory manually.' }
}
if (-not $NoOpenBrowser) {
    $taskChromePaths = @((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'), (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'), (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))
    $taskChrome = $taskChromePaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if ($taskChrome) { Start-Process -FilePath $taskChrome -ArgumentList @('chrome://extensions') }
    else { Write-Host 'Chrome was not found. Open chrome://extensions yourself.' }
}
