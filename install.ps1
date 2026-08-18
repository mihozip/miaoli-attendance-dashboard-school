#requires -Version 5.1
$ErrorActionPreference = 'Stop'

$Repo = 'mihozip/miaoli-attendance-dashboard-school'
$Branch = 'main'
$InstallDir = Join-Path $env:LOCALAPPDATA 'MiaoliAttendanceDashboardSchool'
$TempRoot = Join-Path $env:TEMP ('miaoli-attendance-dashboard-' + [Guid]::NewGuid().ToString('N'))
$ZipPath = Join-Path $TempRoot 'source.zip'
$ExtractDir = Join-Path $TempRoot 'source'
$ArchiveUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"

Write-Host ''
Write-Host '苗栗縣差勤系統請假人員看版-學校版' -ForegroundColor Cyan
Write-Host 'PowerShell 安裝 / 更新工具' -ForegroundColor Cyan
Write-Host ''

try {
    New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $ExtractDir -Force | Out-Null

    Write-Host '[1/4] 下載 GitHub 最新版本...'
    Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ZipPath -UseBasicParsing

    Write-Host '[2/4] 解壓縮...'
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

    $SourceDir = Get-ChildItem -Path $ExtractDir -Directory | Select-Object -First 1
    if (-not $SourceDir) {
        throw '找不到解壓縮後的原始碼資料夾。'
    }

    $Manifest = Join-Path $SourceDir.FullName 'manifest.json'
    if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
        throw '下載內容中找不到 manifest.json，已停止安裝。'
    }

    Write-Host '[3/4] 安裝到本機固定位置...'
    if (Test-Path -LiteralPath $InstallDir) {
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $SourceDir.FullName '*') -Destination $InstallDir -Recurse -Force

    Write-Host '[4/4] 開啟 Chrome 擴充功能頁與安裝資料夾...'
    Start-Process -FilePath explorer.exe -ArgumentList $InstallDir
    try { Set-Clipboard -Value $InstallDir } catch { }

    # PowerShell 管線若只回傳一筆資料，變數會成為單一字串；
    # 不可使用 $ChromeCandidates[0]，否則會取得路徑字串的第一個字元。
    $ChromePath = $null

    $ChromeCommand = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($ChromeCommand -and $ChromeCommand.Source -and (Test-Path -LiteralPath $ChromeCommand.Source -PathType Leaf)) {
        $ChromePath = $ChromeCommand.Source
    }

    if (-not $ChromePath) {
        $ChromeCandidates = @()

        if ($env:ProgramFiles) {
            $ChromeCandidates += (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')
        }

        $ProgramFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
        if ($ProgramFilesX86) {
            $ChromeCandidates += (Join-Path $ProgramFilesX86 'Google\Chrome\Application\chrome.exe')
        }

        if ($env:LOCALAPPDATA) {
            $ChromeCandidates += (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
        }

        $ChromePath = $ChromeCandidates |
            Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
            Select-Object -First 1
    }

    if ($ChromePath) {
        try {
            Start-Process -FilePath $ChromePath -ArgumentList 'chrome://extensions/'
        }
        catch {
            Write-Host "無法自動開啟 Chrome：$($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host '請手動開啟 Chrome 並輸入 chrome://extensions/' -ForegroundColor Yellow
        }
    }
    else {
        Write-Host '找不到 Chrome 執行檔，請手動開啟 Chrome 並輸入 chrome://extensions/' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host '下載與安裝資料準備完成。' -ForegroundColor Green
    Write-Host "資料夾：$InstallDir"
    Write-Host ''
    Write-Host '第一次使用請在 Chrome：' -ForegroundColor Yellow
    Write-Host '  1. 開啟「開發人員模式」'
    Write-Host '  2. 按「載入未封裝項目」'
    Write-Host "  3. 選擇：$InstallDir"
    Write-Host '     （安裝路徑已嘗試複製到剪貼簿，可直接貼上）'
    Write-Host ''
    Write-Host '如果已經安裝過，只要在 chrome://extensions 按「重新載入」即可。'
}
catch {
    Write-Host ''
    Write-Host ('安裝失敗：' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
finally {
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
