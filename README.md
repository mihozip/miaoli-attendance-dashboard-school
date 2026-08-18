# 苗栗縣差勤系統請假人員看版-學校版

Chrome Extension · Manifest V3 · MIT License

本擴充功能用於苗栗縣差勤系統的「學校端」當日人力看版，將各處室請假、出差、外出等差勤資訊整理成適合辦公室大屏或快速檢視的處室區塊。

目前版本：**v0.5.9**

## 功能

- 全校當日出缺席彙整
- 依處室顯示大方塊
- 顯示完整姓名、處室、職稱與差勤時段
- 標示目前不在原因，例如休假、事假、加班補休、公假、出差、外出
- 結束時間達 16:00 或之後時顯示「至下班」
- 顯示接下來的離開／返回人力異動
- 同一時段不同假別可合併呈現
- 不顯示差勤申請中的私人文字事由 `req_reason`
- 自動快取處室 mapping，降低重複探測
- 以首頁處室人數校驗全校彙整結果

## 適用環境

- Windows 10 / 11，或 macOS
- Google Chrome
- 苗栗縣差勤系統：`https://mswebitr.mlc.edu.tw/`
- 使用者需自行具有合法的差勤系統登入權限

## Windows：PowerShell 一鍵安裝／更新

以一般使用者身分開啟 PowerShell，貼上：

```powershell
irm https://raw.githubusercontent.com/mihozip/miaoli-attendance-dashboard-school/main/install.ps1 | iex
```

腳本會自動：

1. 下載 GitHub `main` 最新版本。
2. 安裝／更新至 `%LOCALAPPDATA%\MiaoliAttendanceDashboardSchool`。
3. 開啟 Chrome 擴充功能管理頁。
4. 開啟已下載的擴充功能資料夾，並嘗試把路徑複製到剪貼簿。

### Windows 較安全的執行方式

若不希望直接使用 `irm ... | iex`，可先下載並檢查腳本：

```powershell
Invoke-WebRequest `
  https://raw.githubusercontent.com/mihozip/miaoli-attendance-dashboard-school/main/install.ps1 `
  -OutFile .\install.ps1

notepad .\install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

## macOS：Bash 一鍵安裝／更新

開啟「終端機 Terminal」，貼上：

```bash
curl -fsSL https://raw.githubusercontent.com/mihozip/miaoli-attendance-dashboard-school/main/install.sh | bash
```

腳本會自動：

1. 下載 GitHub `main` 最新版本。
2. 安裝／更新至 `~/Library/Application Support/MiaoliAttendanceDashboardSchool`。
3. 以 Finder 開啟擴充功能資料夾。
4. 開啟 Chrome 的 `chrome://extensions/`。
5. 嘗試把安裝路徑複製到剪貼簿。

不需要 `sudo`，也不會寫入 macOS 系統目錄。

### macOS 較安全的執行方式

若想先閱讀腳本：

```bash
curl -fsSL \
  https://raw.githubusercontent.com/mihozip/miaoli-attendance-dashboard-school/main/install.sh \
  -o install.sh

less install.sh
bash install.sh
```

## 第一次安裝最後一步

Chrome 基於安全限制，不允許一般未上架 Chrome Web Store 的擴充功能由 PowerShell 或 Bash 完全靜默安裝。因此第一次仍需：

1. 在 `chrome://extensions/` 開啟「開發人員模式」。
2. 按「載入未封裝項目」。
3. 選擇安裝資料夾：
   - Windows：`%LOCALAPPDATA%\MiaoliAttendanceDashboardSchool`
   - macOS：`~/Library/Application Support/MiaoliAttendanceDashboardSchool`

之後更新只要重新執行同一條 PowerShell 或 Bash 安裝指令，再到 `chrome://extensions/` 按本擴充功能的「重新載入」即可。

## 移除

### Windows

```powershell
irm https://raw.githubusercontent.com/mihozip/miaoli-attendance-dashboard-school/main/uninstall.ps1 | iex
```

### macOS

```bash
curl -fsSL https://raw.githubusercontent.com/mihozip/miaoli-attendance-dashboard-school/main/uninstall.sh | bash
```

移除腳本會刪除本機安裝資料夾並開啟 `chrome://extensions/`；最後請在 Chrome 擴充功能頁按「移除」。

## 手動安裝

1. 下載本 repository ZIP。
2. 解壓縮到固定資料夾。
3. Chrome 開啟 `chrome://extensions/`。
4. 開啟「開發人員模式」。
5. 選擇「載入未封裝項目」。
6. 指向包含 `manifest.json` 的資料夾。

## 使用方式

1. 登入苗栗縣差勤系統。
2. 保持差勤首頁至少有一個已登入分頁開啟。
3. 點 Chrome 工具列中的擴充功能圖示。
4. 按「立即同步」。
5. 開啟 Dashboard 檢視全校當日人力異動。

第一次全校同步可能較慢；成功建立處室 mapping 後，後續同步會減少不必要的探測。

## 隱私與安全

本專案原始碼公開，建議自行審閱後再安裝。

- 擴充功能主機權限僅設定於苗栗縣差勤系統與苗栗 SSO 網域。
- 登入憑證／Bearer Token 由擴充功能在瀏覽器工作階段中使用，不應寫入原始碼或 Git repository。
- 看版會顯示教職員姓名與差勤類型，應僅於校內業務需要的裝置與畫面使用。
- 本專案不應用來繞過帳號權限、擷取未授權資料，或公開揭露個人差勤資訊。

## 版本紀錄

### v0.5.9

- 處室大方塊內標示所有目前不在人員的差勤假別／原因。
- 「下一個人力異動」及各處室「接下來」同步標示原因。
- 同一合併時段存在不同假別時，以 `休假／事假不在` 類型呈現。
- 不顯示 `req_reason` 私人文字事由。
- GitHub 開源版加入 Windows PowerShell 與 macOS Bash 一鍵安裝／更新工具。

### v0.5.8

- Dashboard 改為處室大方塊版。
- 顯示目前不在人員、返回時間與稍後異動。
- 16:00 之後的結束時間顯示為「至下班」。

### v0.5.7

- 全校出缺席畫面顯示完整姓名。
- 簡化 Dashboard，優先完整呈現全校資料。

### v0.5.6

- 改為三段式處室 discovery。
- 增加全校人數校驗。
- 避免部分資料被誤判為完整同步。

## 開源授權

本專案採用 [MIT License](LICENSE)。

歡迎依 MIT License 使用、修改與再散布；若應用於正式校務環境，請自行確認資訊安全、個資保護及機關內部規範。
