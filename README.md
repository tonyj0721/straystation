
# 浪浪轉運站 × 台中簡媽媽狗園 — Firebase 版本

- Firebase 專案 ID：`straystation-18e8c`
- 已嵌入 GA 測量 ID：`G-JTTJH33M4X`（於所有頁面 `<head>`）
- GitHub Actions：`.github/workflows/firebase-hosting.yml`（自動部署）

## 如何自動部署（不用命令列）
1. 把整包專案上傳到 GitHub repo（例如 `straystation`），預設分支 `main`。
2. 到 Firebase Console → Hosting → Connect to GitHub，選擇該 repo。
3. Firebase 會自動在 GitHub Secrets 建立 `FIREBASE_SERVICE_ACCOUNT_STRAYSTATION_18E8C`，
   並推送 workflow（若已存在則沿用）。
4. 從現在起，只要 push 到 `main` 就會自動部署到：  
   `https://straystation-18e8c.web.app`

## Google Analytics
- 你的 GA 測量 ID：`G-JTTJH33M4X` 已嵌入。
- 可於 GA4 查看即時報表驗證是否成功收數據。

