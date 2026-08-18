#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$InstallDir = Join-Path $env:LOCALAPPDATA 'MiaoliAttendanceDashboardSchool'

if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
    Write-Host "已移除本機檔案：$InstallDir" -ForegroundColor Green
}
else {
    Write-Host '找不到本機安裝資料夾，無需移除。'
}

$ChromeCandidates = @(
    (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
) | Where-Object { $_ -and (Test-Path $_) }

if ($ChromeCandidates.Count -gt 0) {
    Start-Process $ChromeCandidates[0] -ArgumentList 'chrome://extensions/'
    Write-Host 'Chrome 已開啟，請在擴充功能頁按「移除」。' -ForegroundColor Yellow
}
else {
    Write-Host '請手動開啟 Chrome → chrome://extensions/，再按「移除」。' -ForegroundColor Yellow
}
