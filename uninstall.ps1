#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$InstallDir = Join-Path $env:LOCALAPPDATA 'MiaoliAttendanceDashboardSchool'

if (Test-Path -LiteralPath $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    Write-Host "已移除本機檔案：$InstallDir" -ForegroundColor Green
}
else {
    Write-Host '找不到本機安裝資料夾，無需移除。'
}

# PowerShell 管線若只回傳一筆資料，變數會成為單一字串；
# 不可再用 $ChromeCandidates[0]，否則會取得路徑字串的第一個字元。
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
        Write-Host 'Chrome 已開啟，請在擴充功能頁按「移除」。' -ForegroundColor Yellow
    }
    catch {
        Write-Host "無法自動開啟 Chrome：$($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host '請手動開啟 Chrome → chrome://extensions/，再按「移除」。' -ForegroundColor Yellow
    }
}
else {
    Write-Host '找不到 Chrome 執行檔。請手動開啟 Chrome → chrome://extensions/，再按「移除」。' -ForegroundColor Yellow
}
