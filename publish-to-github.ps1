#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$RepoName = 'miaoli-attendance-dashboard-school'
$Description = '苗栗縣差勤系統請假人員看版-學校版｜Chrome Extension｜MIT'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw '找不到 git，請先安裝 Git。'
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw '找不到 GitHub CLI (gh)，請先安裝 GitHub CLI。'
}

gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'GitHub CLI 尚未登入，現在啟動登入流程。' -ForegroundColor Yellow
    gh auth login
}

if (-not (Test-Path '.git')) {
    git init -b main
}

git add manifest.json background.js content.js dashboard.html dashboard.js popup.html popup.js icon128.png README.md LICENSE install.ps1 uninstall.ps1 install.sh uninstall.sh .gitignore
if (-not (git diff --cached --quiet)) {
    git commit -m 'Initial open-source release v0.5.9'
}

$Login = gh api user --jq .login
$FullName = "$Login/$RepoName"
if (gh repo view $FullName 2>$null) {
    Write-Host "Repository 已存在：$FullName"
    if (-not (git remote get-url origin 2>$null)) {
        git remote add origin "https://github.com/$FullName.git"
    }
    git push -u origin main
}
else {
    gh repo create $RepoName --public --description $Description --source . --remote origin --push
}

Write-Host "完成：https://github.com/$FullName" -ForegroundColor Green
