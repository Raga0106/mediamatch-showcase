# MediaMatch 專案展示網站

這份檔案用來對朋友、工程師、設計師與潛在協作者展示 MediaMatch 的產品願景。

## 線上展示

- 網站：<https://raga0106.github.io/mediamatch-showcase/>
- 儲存庫：<https://github.com/Raga0106/mediamatch-showcase>
- 部署來源：`main` 分支根目錄，透過 GitHub Pages 發布；更新 `index.html` 並推送後會自動更新網站。
- 分享網址已設定。聯絡信箱尚未填寫，訪客仍可複製參與訊息。

## 如何開啟

將 `index.html`、`creators.js`、`creators.css` 放在同一個資料夾，直接雙擊 `index.html` 即可，無需 npm、API Key 或資料庫。手機與電腦都支援。設計靈感區的官方參考連結需要網路連線。

## 如何分享成真正網址（GitHub Pages）

1. 新增一個公開的 GitHub 儲存庫（例如 `mediamatch-showcase`）。
2. 將 `index.html`、`creators.js`、`creators.css` 和 `.nojekyll` 上傳到儲存庫 `main` 分支根目錄。
3. 打開 Settings → Pages → Build and deployment → Deploy from a branch，選擇 `main` / `(root)`。
4. 網站上線後，將網址貼給朋友或放到社群簡介。

## 可選設定：聯絡方式

分享網址已設定。在 `index.html` 的靠近底部搜尋 `PROJECT_CONFIG`，可按需補上聯絡信箱：

```javascript
const PROJECT_CONFIG = {
  contactEmail: '你的聯絡信箱',
  projectUrl: 'https://你的展示網站網址',
  githubUrl: 'https://github.com/你的專案網址'
};
```

- 設定 `contactEmail` 後，點擊「一起打造」會出現可直接寄信的按鈕。
- 如果沒有設定聯絡信箱，訪客仍可產生並複製參與訊息，透過你傳送此頁面的管道回覆。
- `projectUrl` 會用於分享與複製參與訊息。設定後才能讓本機開啟的網頁分享正式網址。
- `githubUrl` 為保留的設定欄位，未連接到對外按鈕；如需放出程式碼頁面請另行新增連結。

## 目前功能的真實狀態

- 網頁內的配對卡片可點擊、左右拖曳，並可更新示意偏好分數、收藏統計、撤銷與本輪探索回顧；卡片可直接查看或追蹤創作者。
- 創作者探索提供主題、平台、語言篩選、追蹤／取消追蹤、已追蹤清單及代表作品的讀後回饋。
- 偏好分數僅示意個人與來源的適合程度，不是客觀品質、專業度或內容可信度評分。
- 七張內容卡片的順序固定。探索比例滑桿只更新預期組合說明，不會改變排序。
- 顯示的是**前端概念 Demo**；卡片資料是示意文案，不是真實平台 API 內容。
- 尚未有使用者登入、正式推薦後端、跨平台抓取服務。
- 所有操作只存在於本次頁面記憶體；重新整理即重設，不會送出或持久化訪客資料。
- MediaMatch 內的追蹤與第三方平台訂閱分開；本頁不會操作外部帳號。

## 產品方向更新

參考[專案構想討論](https://chatgpt.com/share/6ad90a00-68c8-83ec-8a8b-28506db93530)，將主題、創作者與單篇作品的偏好分開呈現，加入創作者探索、讀後收穫回饋，以及配對產品與來源閱讀工具的設計借鏡。開發路線先驗證無 API Key 的 Demo，再串接真實資料；每日精選與進階偏好問答保留在後續階段。

## 適合招募哪些夥伴

- Frontend / UI・UX
- Backend / Data
- Recommendation / ML
- Product / Content / Growth

如需調整首頁文案、Roadmap 與角色卡片，直接修改 `index.html` 的中文內容即可。
