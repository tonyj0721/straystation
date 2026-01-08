# 影片硬浮水印（Cloud Functions + ffmpeg）

這個 functions 會在 **Cloud Storage 有影片上傳完成**時觸發，使用 ffmpeg 把浮水印「燒進影片檔案」，並 **覆寫回原本同一路徑**（URL 不用改）。

## 1) 放到你的 Firebase 專案
把本資料夾的 `functions/` 整個拷貝到你的 Firebase 專案根目錄。

## 2) 安裝依賴
在專案根目錄：
```bash
cd functions
npm i
```

## 3) 改 region（非常重要）
打開 `functions/index.js`，找到：
```js
region: "asia-east1",
```
把它改成你的 Storage bucket 所在 region（避免部署失敗或高延遲）。

## 4) 部署
```bash
firebase deploy --only functions:hardWatermarkVideo
```

## 5) 前端
前端照常把影片上傳到 `pets/{docId}/...` 就會自動硬浮水印（不需要前端轉檔）。

> 注意：Storage 事件觸發通常需要 Blaze 方案（以及 2026-02-02 前需升級以維持 default bucket 存取）。
