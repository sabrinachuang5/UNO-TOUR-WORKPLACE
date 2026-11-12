# UNO TOUR Workplace

個人工作管理平台（GitHub Pages 靜態網站）。

## 功能
- 團體總表：新增／編輯團體、搜尋、Google Sheets 小表連結、正式 Excel ITIN 連結
- Deadline：依出發日預設計算 QTN -20 天、說明會資料 -7 天、初版 ITIN -6 天、團表表 -4 天、交接 -1 天；可逐團修改
- 說明會日期由使用者手動填寫
- 虛擬卡刷卡紀錄：原幣及台幣金額
- 共同匯款歷史紀錄：供應商、送單日、匯款日、多團／負責人／金額、Bank fee、合計
- JSON 備份與還原

## 部署
1. 將本資料夾內所有內容（包含 `.github`）上傳到 GitHub repository 根目錄。
2. Repository → Settings → Pages → Source 選 GitHub Actions。
3. 等待 Actions 部署完成。
4. 網址格式：`https://你的GitHub帳號.github.io/Repository名稱/`

## 重要資料提醒
此版本使用瀏覽器 localStorage 儲存資料，不會跨裝置同步。請定期匯出 JSON 備份。
GitHub Pages 網站是公開網站，請勿在網站程式或頁面放入旅客個資、公司機密、信用卡號、完整付款憑證等敏感資訊。Google Sheets 與 Excel 請使用公司核准的共用連結及權限。
UNO TOUR Workplace update
