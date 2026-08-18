#!/usr/bin/env bash
set -euo pipefail

REPO="mihozip/miaoli-attendance-dashboard-school"
BRANCH="main"
INSTALL_DIR="$HOME/Library/Application Support/MiaoliAttendanceDashboardSchool"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/miaoli-attendance-dashboard.XXXXXX")"
ZIP_PATH="$TMP_ROOT/source.zip"
EXTRACT_DIR="$TMP_ROOT/source"
ARCHIVE_URL="https://github.com/$REPO/archive/refs/heads/$BRANCH.zip"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

printf '\n苗栗縣差勤系統請假人員看版-學校版\n'
printf 'macOS Bash 安裝 / 更新工具\n\n'

command -v curl >/dev/null 2>&1 || { echo '找不到 curl，無法下載。' >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo '找不到 unzip，無法解壓縮。' >&2; exit 1; }

mkdir -p "$EXTRACT_DIR"

echo '[1/4] 下載 GitHub 最新版本...'
curl -fL --retry 3 --connect-timeout 15 "$ARCHIVE_URL" -o "$ZIP_PATH"

echo '[2/4] 解壓縮...'
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"
SOURCE_DIR="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d -print -quit)"

if [[ -z "${SOURCE_DIR:-}" || ! -f "$SOURCE_DIR/manifest.json" ]]; then
  echo '下載內容中找不到 manifest.json，已停止安裝。' >&2
  exit 1
fi

echo '[3/4] 安裝到本機固定位置...'
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -R "$SOURCE_DIR"/. "$INSTALL_DIR"/

echo '[4/4] 開啟 Chrome 擴充功能頁與安裝資料夾...'
open "$INSTALL_DIR" >/dev/null 2>&1 || true
if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$INSTALL_DIR" | pbcopy
fi

if [[ -d '/Applications/Google Chrome.app' || -d "$HOME/Applications/Google Chrome.app" ]]; then
  open -a 'Google Chrome' 'chrome://extensions/' >/dev/null 2>&1 || true
else
  echo '找不到 Google Chrome，請安裝 Chrome 後手動開啟 chrome://extensions/'
fi

printf '\n下載與安裝資料準備完成。\n'
printf '資料夾：%s\n\n' "$INSTALL_DIR"
printf '第一次使用請在 Chrome：\n'
printf '  1. 開啟「開發人員模式」\n'
printf '  2. 按「載入未封裝項目」\n'
printf '  3. 選擇：%s\n' "$INSTALL_DIR"
printf '     （安裝路徑已嘗試複製到剪貼簿）\n\n'
printf '如果已經安裝過，只要在 chrome://extensions 按「重新載入」即可。\n'
