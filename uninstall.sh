#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/MiaoliAttendanceDashboardSchool"

if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  printf '已移除本機檔案：%s\n' "$INSTALL_DIR"
else
  echo '找不到本機安裝資料夾，無需移除。'
fi

if [[ -d '/Applications/Google Chrome.app' || -d "$HOME/Applications/Google Chrome.app" ]]; then
  open -a 'Google Chrome' 'chrome://extensions/' >/dev/null 2>&1 || true
  echo 'Chrome 已開啟，請在擴充功能頁按「移除」。'
else
  echo '請手動開啟 Chrome → chrome://extensions/，再按「移除」。'
fi
