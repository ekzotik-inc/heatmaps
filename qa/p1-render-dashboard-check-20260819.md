# Render dashboard check — 2026-08-19

The Render service URL `https://dashboard.render.com/web/srv-d8kjs23bc2fs73clsqlg` was opened after the user enabled Browser access. The page title was `Render · The Easiest Cloud For All Your Apps`, but both the initial navigation and subsequent page view exposed no interactive elements. The first screenshot upload failed; the second view produced a blank white dashboard screenshot and saved raw HTML at `/home/ubuntu/browser_html/dashboard_render_com_srv-d8kjs23bc2fs73clsqlg_1787116337646.html`.

No redeploy or configuration action was performed. Production health remains the previously observed PostgreSQL-backed response; the next step is to inspect the saved DOM or wait for dashboard rendering before considering a redeploy.


A console check found no console output/errors. DOM inspection returned `readyState: interactive`, `#root` child count `0`, and empty `bodyText`. Therefore the Render dashboard shell loaded but its authenticated app did not render; no deploy controls were available for a safe click. No cookies, secrets, or storage values were read.


The alternative Render root URL `https://dashboard.render.com/` rendered a dashboard shell with `hm-server`, Projects, Search, New and navigation controls. An attempted click using the initial element index failed because the DOM snapshot became stale before the click; no action was submitted. A fresh page view is required before interacting.


The browser briefly returned to `about:blank`, then the Render Dashboard root was reopened successfully. The service table shows `hm-server` as **Deployed**, Node, Oregon, updated about 2 minutes ago, and `test_bd` as **Available**, PostgreSQL 18. Clicking the service-selector button refreshed the dashboard and exposed the service table, including a clickable `hm-server` row (element index 42 in that snapshot). No redeploy was initiated yet.


The `hm-server` service route opened successfully and shows Dashboard, Events, Settings, Logs, Metrics, Environment and other service navigation entries. After waiting, the main service content remained `Loading...`; no deployed commit or Manual Deploy control was exposed in the visible DOM. No configuration or deployment action was performed.


A safe DOM inspection of the fully loaded service page found `WEB SERVICE hm-server`, plan `Starter`, `Blueprint managed`, service ID `srv-d8kjs23bc2fs73clsqlg`, and the production URL. The event list shows `Deploy started for 8aad44d` manually triggered via Dashboard at 05:11 and `Deploy live for 8aad44d` at 05:11. Therefore the requested Render redeploy has completed; no further deploy click was needed.


After pushing `9ef58a7`, the Render service page shows an auto-deploy for `9ef58a7` started at 05:18 AM with a visible `Cancel deploy` control. The previous `8aad44d` deployment remains the latest live deployment until this build finishes. No cancellation or duplicate manual deploy was triggered.


After the 9ef58a7 deployment became available, production health returned HTTP 200 with PostgreSQL storage and auth/write auth configured. The final redacted probe passed: KG login 200, cookie-only `/auth/me` 200, KG metadata 200, cross-map access 403, unknown-user login 401, five synthetic failed attempts 401, and the sixth synthetic attempt 429 with `Retry-After`. No token/cookie value, write endpoint, or dataset mutation was performed.
