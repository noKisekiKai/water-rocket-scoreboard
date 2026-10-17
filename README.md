# 水火箭定點射擊記錄站

供香港小學科學體驗日使用的老師共用工作台。React + Vinext，Cloudflare D1 持久化資料庫；GitHub 僅保存原始碼，不保存學生姓名、成績、活動密碼或雲端資料庫。

## 使用

1. 建立活動（活動密碼至少 10 字元），或輸入活動代碼與密碼加入。
2. 在「設定及備份」匯入本次 JSON 名單。原始 Excel 可用 `scripts/prepare-roster.py` 在本機轉換；產生的名單必須留在專案外，不要提交 Git。
3. 選組別，點選學生切換在場／缺席；學生名單頁可新增、改名、轉組、移除或復原。
4. 記錄每次發射是否命中，可選填分數、偏離距離（米）、老師及備註。可修改及軟刪除舊記錄。
5. 成績總覽可調整排序優先次序，獎項由老師手動確認。相同成績並列，未輸入不作 0 分，未發射組不排名。
6. 活動後匯出完整 JSON 備份、總表及逐次發射 CSV。

## 保存及多人使用

- 每次修改先把記錄及待送佇列寫入此裝置 localStorage，再送至雲端。雲端每 4 秒更新；界面分開顯示「已同步」「待同步」「暫未連線」。
- 同一活動代碼及密碼可讓多位老師共用資料。不要把密碼公開張貼。裝置會記住活動密碼，共用裝置使用後請登出。
- 不同老師同時改同一記錄時，以資料版本阻止靜默覆寫；衝突修改會嘗試下載為備份，老師核對後再改。
- 沒有網絡時，已載入頁面可繼續暫存修改；恢復網絡後重送。若離線時整個重新載入網站，仍需網絡載入程式，這不是完整離線安裝版。
- 更換裝置、私密瀏覽或清除瀏覽器資料會失去裝置暫存；已同步雲端資料可重新登入讀取。尚未同步的資料請先下載 JSON。
- 備份檔含學生個人資料，請妥善保管。CSV 已防止公式注入。

## 計分方式

程式沒有假設大會每次命中的分數。分數可由裁判自行輸入。預設以命中次數、最高分、最短偏離距離排序；可改成分數或距離優先。發射成績以組別為單位，並保存當次在場學生快照。

## 開發及部署

Node.js 22.13+，pnpm 11.25。

```sh
pnpm install
pnpm exec drizzle-kit generate
pnpm exec tsc --noEmit
node --experimental-strip-types tests/model.test.ts
pnpm run build
```

`.openai/hosting.json` 宣告 D1 `DB`，生產資料由 Sites 管理；`drizzle/` 是資料庫遷移。部署到其他 Cloudflare 帳戶時，需自行設定 D1 binding 及套用遷移。GitHub Pages 單獨不能執行此後端，不能提供多人同步。

本機預覽需套用遷移（先 build 取得設定）：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_*.sql
pnpm run dev
```

遷移命令中的檔名請換成實際生成檔名。不要把 `.wrangler/`、`.sites-runtime/`、學生名單、活動密碼、資料庫或本機測試輸出上載 GitHub。
