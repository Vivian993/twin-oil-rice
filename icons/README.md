# 雙子油飯記帳 App

一個免安裝、可放在手機桌面、資料會自動儲存在手機本機的記帳小工具。

## 這個資料夾裡有什麼

```
twin-oil-rice/
├── index.html          ← 打開這個檔案就能用（GitHub Pages 也是抓這個當首頁）
├── app.js              ← 主程式（原本的記帳 App 邏輯）
├── manifest.json        ← 讓手機可以「加到主畫面」的設定
├── service-worker.js    ← 離線快取，開過一次後沒網路也能打開
├── icons/               ← 可愛的油飯碗 App 圖示
└── README.md             ← 就是你現在看的這份說明
```

⚠️ 儲存方式說明：資料存在**每支手機、每個瀏覽器自己的 localStorage**裡，
不會自動同步到別支手機或別人那邊。也就是說：
- 老闆用自己手機記帳 → 資料只存在老闆的手機裡
- 分享連結給朋友 → 朋友打開會是**空白的帳本**，他記的帳只存在他自己手機裡
- 清瀏覽器資料/砍掉 App 快取，資料可能會不見，建議報表頁面的「匯出備份 CSV」偶爾按一下備份

如果之後想要「大家看到同一份帳本、互相同步」，需要換成雲端資料庫（例如 Firebase），
這個我也可以幫你做第二版，先抓這版能不能滿足你日常記帳的需求。

---

## 一、放到 GitHub，變成一個網址

1. 去 [github.com](https://github.com) 註冊/登入帳號
2. 右上角「+」→「New repository」
   - Repository name：例如 `twin-oil-rice`
   - 設為 **Public**（Public 才能用免費的 GitHub Pages）
   - 建立 repository
3. 進入這個新 repository，點 **Add file → Upload files**
4. 把這個資料夾裡的**所有檔案跟 `icons` 資料夾**整個拖進去上傳（保持原本的檔案結構）
5. 按下方綠色 **Commit changes**

## 二、開啟 GitHub Pages（讓它變成一個網址）

1. 在 repository 頁面，點上方 **Settings**
2. 左側選單找到 **Pages**
3. 「Build and deployment」→ Source 選 **Deploy from a branch**
4. Branch 選 `main`，資料夾選 `/ (root)`，按 **Save**
5. 等 1～2 分鐘，重新整理這個頁面，會出現一個網址，長得像：
   ```
   https://你的帳號.github.io/twin-oil-rice/
   ```
   這就是你以後要打開、要分享的網址。

## 三、加到手機桌面

**iPhone（Safari）**
1. 用 Safari 打開上面那個網址
2. 點下方分享圖示（方框+箭頭）
3. 選「加入主畫面」

**Android（Chrome）**
1. 用 Chrome 打開上面那個網址
2. 點右上角「⋮」選單
3. 選「加到主畫面」或「安裝應用程式」

加好之後桌面會出現一個油飯碗圖示，點下去會像 App 一樣全螢幕打開，
不會看到瀏覽器網址列。

## 四、分享給朋友

直接把 `https://你的帳號.github.io/twin-oil-rice/` 這個網址傳給朋友，
他打開後也可以照上面步驟「加到主畫面」。記得跟他說：**帳目是各存各的**，
不是同一份帳本（見上面說明）。

## 五、之後想修改內容怎麼辦？

之後如果想加減進貨品項、改顏色、加功能，把新版檔案再上傳蓋掉舊檔即可
（Upload files 選同名檔案，GitHub 會問要不要覆蓋）。存檔後 GitHub Pages
會自動在 1 分鐘內更新，手機上開啟時可能要下拉重新整理一次才會抓到最新版本。
