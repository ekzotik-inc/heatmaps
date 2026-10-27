# Project updates

## 2026-08-13 — City filter and map navigation

### Scope

The Uzbekistan city filter was extended with Gulistan, Denau, Jizzakh, Zarafshan, Qarshi, Namangan, Nukus, Termez, Urgench, Shahrisabz and Chirchiq. The visible labels intentionally remain in Russian: «Гулистан», «Денау», «Джизак», «Зарафшан», «Карши», «Наманган», «Нукус», «Термез», «Ургенч», «Шахрисабз», «Чирчик».

### Centroids

| City | Latitude | Longitude |
|---|---:|---:|
| Гулистан | 40.522 | 68.780 |
| Денау | 38.267 | 67.899 |
| Джизак | 40.133 | 67.823 |
| Зарафшан | 41.572 | 64.196 |
| Карши | 38.841 | 65.800 |
| Наманган | 41.000 | 71.673 |
| Нукус | 42.460 | 59.618 |
| Термез | 37.244 | 67.283 |
| Ургенч | 41.552 | 60.631 |
| Шахрисабз | 39.053 | 66.828 |
| Чирчик | 41.473 | 69.581 |

### Navigation behavior

Selecting a city now starts a short Leaflet `flyTo`/`flyToBounds` transition. The map stops an unfinished flight before starting the next one, uses a 620 ms duration with restrained easing, and applies padding so the city is not hidden under the floating top bar. A small focus pulse on the selected city button provides visual feedback without adding another blocking animation. The reduced-motion media preference disables that decorative pulse.

The expensive layer rebuild is scheduled after the first animation frame. This keeps the beginning of the flight responsive when a dataset is large and collapses repeated rapid clicks into the latest requested city.

### Correctness fixes

Uploaded custom-point layers now follow the selected city filter using the existing nearest-city rule with a 60 km guard. Their visible markers, coverage circles and bounds are filtered consistently. The «Все» mode still includes all heat and custom points and uses the same navigation helper for a complete fit.

### Coordinates and sources

Centroids were checked against [Wikipedia’s list of cities in Uzbekistan](https://en.wikipedia.org/wiki/List_of_cities_in_Uzbekistan), [d-maps’ Uzbekistan main-city map](https://www.d-maps.com/carte.php?num_car=108884&lang=ru), and [Orexca’s Denau guide](https://www.orexca.com/rus/uzbekistan/denau.htm). The raw geocoding output is retained in `city_geocode_results.json`; research notes are in `city_research.md`.

### Verification plan

Before publication, run JavaScript syntax checks, ESLint, a clean dependency installation, and a browser smoke test covering Tashkent, each newly added city, «Все», rapid city changes, and the mobile horizontal city bar. Confirm that the app still loads the protected data only after login.

### Local smoke test

The local browser test produced 19 Uzbekistan city buttons including all 11 requested cities. Tashkent became selected and triggered the `is-flying` focus state. A rapid sequence of Chirchiq → Tashkent → Nukus ended on Nukus, reached approximately 42.460, 59.618 at zoom 12, and cleared the focus pulse after the short animation window.

The style asset cache-buster was advanced to `20260813b` so the city-bar focus styling is fetched together with this release.

### Live smoke test

After GitHub Pages deployment for commit `39804a1`, the published page loaded the updated assets. The live browser test found 19 Uzbekistan city buttons with no missing requested cities. A rapid Tashkent → Chirchiq → Namangan sequence ended at Namangan (about 41.000, 71.673, zoom 12), and the focus pulse cleared as expected.

## 2026-08-13 — Basic city statistics

The City tab now contains baseline cards for all 11 newly added Uzbekistan cities. Each card includes population, estimated 21+ population, estimated smoker audience using the existing country-level smoking assumptions, regional average wage, region label and three neutral market-context notes.

Population values are city-level figures with the source/date shown in `popNote`. Regional wage is not presented as a city wage: it is the National Statistics Committee’s average monthly nominal accrued wage for the corresponding region for January–September 2025. Zarafshan is explicitly labelled as an estimate because a comparable current city-level official figure was not available in the consolidated source set. The source trail and selected values are recorded in `city_stats_research.md`.

The Uzbekistan wage label was also clarified from `сум/мес (2025)` to `сум/мес (янв–сен 2025)`, and the City-tab footnote now distinguishes city-level population sources from regional wage data.

### Statistics smoke test

The local browser test confirmed `allStats=true` for all 11 new cities and a population tile was rendered for every one. The initial check used `innerText` while the City tab was hidden, so it did not count the business-notes section even though the DOM was populated; the follow-up verification uses `textContent` and the visible-tab flow.

A follow-up DOM verification using `textContent` confirmed `allCards=true`: every new city renders three City-tab cards, including the population tile, the live points metric, the business-notes section and the source note.

The statistics release also advances the `app.js` cache-buster to `20260813c`; this is required because the previous navigation release used `20260813a` and a CDN could otherwise serve the older client bundle.

### Final live statistics test

After the cache-busting release `69de2d9`, the published browser bundle rendered complete City-tab cards for all 11 new cities. Every card contained a population block, business notes and the National Statistics Committee regional-wage source note; Zarafshan also retained its explicit estimate label.

### Multi-select smoke test

The local browser test confirmed: the compact city popover opens; 19 city options are available; Tashkent, Samarkand and Nukus can be selected together; the trigger shows `Ташкент + 2` with a count badge of `3`; the City tab renders a combined summary; the map frames the selected territory; and a click outside closes the popover.

The visual local check measured the city popover at 340×462 px on desktop. It stayed within the map viewport, presented all city options in a compact two-column scrollable list, and kept the trigger label `Ташкент + 2` readable while the map and summary remained visible.

## 2026-08-13 — Compact city multi-select

The overflowing one-row city pill strip was replaced by a compact `Города` trigger with a popover. The popover includes search, a two-column scrollable checkbox list, `Все города`, a selected-count badge, a clear action, Escape/outside-click closing and keyboard-readable ARIA state.

The filter now accepts any set of cities. Heat layers, recommendations, custom points, coverage circles, address-program input, exports, map bounds and City-tab statistics all use the same selected set. When several cities are selected, the City tab shows a population-weighted aggregate summary instead of an empty card. Export/import keeps `selectedCities` and remains compatible with old single-city files.

The control is compact on desktop and opens above the bottom toolbar on mobile; the horizontal city overflow strip is removed. The existing short map animation remains in place, while rapid selection updates continue to use the latest requested state.

After the final local cache-bust reload, the selection test still passed with 19 options, three selected cities, aggregate City-tab content, the compact label `Ташкент + 2`, and correct Russian pluralization (`5 городов`). Clear returned the label to `Все города` and the selection array to empty; the popover intentionally stays open so users can continue adjusting the filter.

The search/state test passed: searching `нук` leaves only Нукус visible; `selectedCities` is included in exports; multi-select restores as `Ташкент + Нукус`; and a legacy snapshot with `city: Самарканд` restores to a single selected city.

The multi-select release advances the asset versions to `app.js?v=20260813d` and `style.css?v=20260813c` to prevent the previous city-bar bundle or styles from being served from cache.

### Live multi-select test

After Pages deployment for commit `8313cef`, the published browser bundle passed the same scenario: 19 city options, Tashkent + Samarkand + Nukus selected together, count badge `3`, aggregate City-tab summary rendered, and clear returned the trigger to `Все города` with an empty selection.

### Frame and style regression test

The post-render framing test selected Tashkent, Termez and Nukus and confirmed all three city centroids were inside the final map bounds (`zoom 6.5`) after the deferred layer rebuild. Computed styles confirmed `Manrope`, a 100px native pill trigger radius, and the project card radius (16px) for the popover with the standard shadow token.

## 2026-08-13 — Multi-city framing and native visual language

The multi-city navigation now rebuilds filtered layers first and only then calculates map bounds. The frame includes all visible points plus the centroid of every selected city, so selected cities remain inside the viewport even when one of them has no loaded records. Rapid changes still use the latest render sequence and keep the short 620 ms animation.

The city selector was restyled to match the existing project language: Manrope typography, tokenized palette, native pill radius and active state, standard project shadow, card radius, border colors and teal accent. The previous stronger glassmorphism and bespoke rounded treatment were removed.

The final rapid-selection regression test ended on `Ташкент, Самарканд, Нукус, Термез`; all four centroids were inside the final map bounds at zoom 6.5. Computed styles remained `Manrope`, 11px trigger text and a 100px pill radius.

### Live framing/style test

After deployment of `3f44e75`, the live browser test selected Tashkent, Samarkand, Nukus and Termez. All four centroids were inside the final map bounds at zoom 6.5. Computed live styles remained `Manrope` at 11px, with a 100px pill trigger and 16px project card-radius popover.

## 2026-08-13 — All-cities heatmap performance check

A read-only benchmark used the real Com Dep production dataset: 5,071 cigarette records plus 3,624 sticks records, 8,695 records total, rendered into two Leaflet heat canvases. All 18 available Uzbekistan cities were selected simultaneously.

The combined city-selection update produced one `renderHeat` call of approximately 50 ms in the first run, one long task of 91 ms, a median RAF gap of 33.4 ms (~30 FPS), a 95th-percentile gap of 66.9 ms (~15 FPS) and a maximum observed gap of 66.9 ms during the 2.2-second observation window. Three direct `renderHeat` runs measured 54.0 ms, 34.8 ms and 30.5 ms (average 39.77 ms, maximum 54.0 ms). `renderCustomPoints` and `renderRecs` were below 1 ms in the combined run.

Conclusion: the all-cities scenario completes without a freeze, but the first full redraw causes a visible frame drop on the test browser. The primary cost is rebuilding two heat canvases and normalising their points; the current selector also performs a city-name membership check for every record. No production code was changed during this audit. The live session could not load `/data` because the cross-site HttpOnly session cookie was not retained in the browser, so the benchmark used a temporary localhost read-only harness fed by the same production JSON retrieved via a read-only authenticated request. This preserves the real dataset and avoids production writes.


## 2026-08-13 — All-cities render optimization, cross-site auth fallback and native city-filter polish

### Heatmap rendering

The all-cities state is now canonicalized to an empty `selectedCities` array, which makes the full-data path explicit and avoids repeated city-membership checks for every record. Heat layers reuse the existing Leaflet heat layer whenever the source records and visual/filter inputs are unchanged. On a cache miss, normalized points and heat-cell maxima are reused where possible, `d.stats.p90` is used for full-layer normalization, and the confirmed leaflet.heat 0.2.0 `setLatLngs`/`setOptions` API updates the existing canvas instead of rebuilding it.

The warm path also skips repeated point-count and legend DOM work when no layer state changed. The existing read-only production audit remains the baseline: 8,695 records (5,071 cigarette + 3,624 sticks) previously produced an approximately 50 ms render, one 91 ms long task and a median around 30 FPS. The fresh local bundle was then benchmarked with 8,695 controlled records: cold render 46.80 ms, warm median 0.00 ms, warm p95 0.10 ms, and warm maximum 0.10 ms across 30 redraws. A partial-selection transition counted 4,348 records, returned to 8,695 for all cities, and retained the same Leaflet layer object across both transitions. Detailed evidence is recorded in `qa/performance-benchmark.md`.

### GitHub Pages ↔ Render authorization

The server now accepts a signed short-lived session token from `Authorization: Bearer <token>` before falling back to the HttpOnly `hm_session` cookie. CORS explicitly allows the `Authorization` header, and `/auth/login` returns the token alongside the existing session cookie. The frontend stores the token only in `sessionStorage`, sends it through `authFetch` for `/auth/me`, `/data`, `/state` and other authenticated requests, and clears it on logout. The cookie path remains supported for same-site browsers.

An isolated local HTTP test passed the complete login → token response → bearer `/auth/me` flow and confirmed that the production data was not touched. The production login/data smoke test is part of the post-deploy verification because the real credentials are not stored in the repository.

### City-filter visual language

The city selector now uses the same Manrope, tokenized palette, 100px pill radius, 12px type, and 7px 14px padding as the existing `.cities button` controls. The separate kicker and checkbox icon treatment were removed; selected cities use the existing teal active-pill state, while search and popover surfaces retain the project card, border, radius and shadow tokens. Cache-busting was advanced to `style.css?v=20260813e` and `app.js?v=20260813f`.

### Pre-deploy verification

`node --check app.js`, `node --check server/server.js`, `npm run lint`, clean server dependency installation and `git diff --check` all passed. No production write endpoint was called during validation.

### Live deployment verification

Commit `097aeb4` (`Optimise heatmap render and add bearer auth fallback`) was published to `main`. GitHub CI and GitHub Pages both completed successfully. The published page serves `app.js?v=20260813f` and `style.css?v=20260813e`; computed live city-filter styles are Manrope, 12px, 7px 14px padding and a 100px pill radius, with no kicker element.

The Render health endpoint reported PostgreSQL storage and configured authentication. A cross-origin preflight from `https://ekzotik-inc.github.io` now returns `Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, Content-Encoding`, the GitHub Pages origin, credentials support and `GET, POST, OPTIONS`. No production login credentials or production write endpoint were used in this release session, so the normal user login → protected data smoke test remains a safe follow-up in an authenticated browser session.


### Final authenticated production smoke test — 2026-08-14

After the user opened the authenticated browser session, the live client retained a tab-scoped session token and read `/auth/me` and `/data` successfully with status 200. The runtime loaded 6 heat layers, 64,777 heat-layer records and all 18 configured Uzbekistan cities.

The city popover displayed 19 options including `Все города` and all 11 newly added cities. Tashkent and Nukus were selected together; the trigger displayed `Ташкент + 1` with count `2`, the City tab rendered a two-city aggregate, recommendations were limited to the selected cities, and the point badge changed to 2,602. Clearing the filter restored `Все города`, 6,871 visible points, an empty `selectedCities` snapshot and a green sync badge. The temporary UI selection was not left active.


## 2026-08-14 — Faster authenticated layer startup

### Root cause

Authenticated Com Dep startup was delayed by two large reads and a client-side hydration bottleneck. The browser measured a 1.52 MB `/data` payload and a 4.04 MB `/state` payload containing six custom layers and 64,777 heat records. The earlier path requested `/state` only after `/data` and the first local render. In addition, it recalculated the nearest own point (`nd`) and the local-demand density (`ld`/`lc`) for every saved record during each state hydration.

The nearest-point profiler found 12.64 seconds of CPU work for 64,777 records with 103 own points; 7.36 seconds belonged to the 39,525-record HST CC layer. The old grid fell back to long repeated Haversine scans for records far from the own-point network.

### Changes

`startApp()` now starts authenticated `/data` and `/state` reads in parallel after a map is chosen. The app still renders available local state first and retains the existing server/local timestamp resolution; only the network wait was removed from the critical path.

Nearest-own-point lookup now uses an exact VP-tree over the Haversine metric. The live validation compared every new `nd` value against the existing production values for all 64,777 records: zero mismatches, maximum delta 0, and 48.7 ms for the full pass after a 0.5 ms tree build. The local-demand grid is also finer (0.005°) and its calculated `ld`/`lc` values matched the previous exact 700 m result for all 39,525 HST CC records. Hydration defers that density work until a layer is selected as the recommendation basis, so hidden layers do not block first map paint.

### Live verification

Commit `555921f` was published successfully through GitHub CI and Pages. The live `app.js?v=20260814a` bundle loaded all six custom layers and 64,777 records. After the authentication response, `/data` and `/state?map=comdep` began together at approximately 5,847 ms and completed at 8,073 ms and 7,963 ms; the previous sequential startup could not overlap these large reads. The observed session then showed a started app with 6,871 visible points. Render wake-up time remains dependent on the Render free service, but data transfer and layer hydration no longer add the former long client-side computation.


## 2026-08-14 — Production load profile after Render Starter

Authenticated production was profiled on `app.js?v=20260814a` after the Render service moved to Starter. Three no-store reads of `/data` returned HTTP 200 with a 1,515,178-character JSON payload. The first response took 5,604 ms during residual warm-up; subsequent samples took 1,168 ms and 981 ms to response headers. Body reads took 575–902 ms and JSON parsing 8–13 ms.

The authenticated `/state?map=comdep` response returned HTTP 200 with 4,041,217 characters, six custom layers and a 1,215 ms response-header time; body read was 758 ms and JSON parsing 29 ms. The live client held 64,777 heat records and 6,871 visible points.

Client-side rendering is no longer the bottleneck: cold visible `renderHeat()` was 24.8 ms, warm cached redraw 0.2 ms, custom markers 16.5 ms, recommendations 28.4 ms and UI rebuild 7.0 ms. The next meaningful improvements are a safe versioned IndexedDB cache for `/data`/`/state`, avoiding duplicate local/server hydration when snapshots match, and optionally splitting large saved-layer payloads into a lightweight first-paint representation plus lazy metadata.


## 2026-08-14 — Metadata-first cache and lazy heat-layer loading

### Purpose

The authenticated client already rendered quickly after data reached the browser, but the protected startup still transferred a 1.52 MB `/data` object and a 4.04 MB full `/state` object on every new page load. This release replaces the state bootstrap with a revision-aware metadata manifest and on-demand layer records, while retaining the existing bearer/cookie authorization, legacy `/state` compatibility, exports and server-side state format.

### Read API and revision model

The server now exposes three protected read endpoints in addition to the unchanged legacy full-state route. `/data/meta` returns the dataset revision, `/state/meta?map=…` returns all UI settings, custom-point layers, heat-layer visual settings, stats and `recordCount` but omits every `recs` array, and `/state/layer?map=…&layer=…` returns records for exactly one saved heat layer. All three routes use `requireSession`; state routes retain `requireMapAccess`. The revision is the server `_savedAt` value, and the layer endpoint rejects keys not contained in the requested map’s saved `heatKeys`.

The client stores the authenticated read cache in `hm-read-cache-v2` IndexedDB. Entries are scoped by authenticated user and map. The cache has separate versioned entries for the dataset, state manifest and each loaded layer, so a revision mismatch cannot combine settings from one server snapshot with records from another.

### Startup and hydration behavior

A repeat visit applies the cached dataset and compact state manifest immediately, then performs only lightweight `/data/meta` and `/state/meta` revalidation. When revisions match, it does not apply the snapshot a second time and does not re-download `/data`, full `/state`, or any previously cached layer records. The first visit obtains the compact state manifest and hydrates only layers that are visible or selected as the recommendation basis. Hidden heat layers remain as cards with server-provided point count and statistics, but their records are fetched once only when the user enables the layer, isolates it with Solo, or selects it as a recommendation basis.

Autosave now keeps a compact manifest in localStorage for backward-compatible/offline fallback and writes full loaded layer arrays to IndexedDB. When an admin saves after a lazy startup, omitted records are explicitly marked. The server merges those omitted layers with its current state before writing, so changing a filter or UI setting cannot erase a hidden layer’s points. A successful save updates the local cache to the server-issued revision.

### Compatibility and verification

The full `/state` endpoint and full export/import snapshots are unchanged. Compact manifests preserve legacy visual defaults if an older layer omits an optional colour, ramp or opacity value. The asset cache-buster is now `app.js?v=20260814c`.

An isolated local authenticated regression server tested login, compact manifest content, per-layer access control, lazy-save merge and record preservation. A browser smoke test verified: initial manifest with one visible Alpha layer and one hidden Beta layer; Alpha’s two records appeared immediately while Beta had `_recordsLoaded: false` and zero in-memory records; toggling Beta fetched and rendered its one record; and after removing the legacy localStorage snapshot, a repeat load requested only `/auth/me`, `/state/meta` and `/data/meta`. It made no full `/data`, full `/state` or `/state/layer` request and did not repeat hydration for the matching revision. Detailed evidence is in `qa/lazy-startup-test.md`.

The client also prunes obsolete per-layer record entries for the current authenticated user/map whenever a newer state revision is cached, preventing retained multi-megabyte layers from accumulating across revisions.


### Final production verification — commit `873b149`

GitHub CI and Pages completed successfully, Render `/health` returned PostgreSQL-backed healthy status, and unauthenticated `/data/meta` and `/state/meta?map=comdep` correctly returned 401. The live bundle served `app.js?v=20260814c`.

On the first authenticated production run, `/state/meta?map=comdep` returned in 1.71 s and `/data` in 5.01 s. Only the visible `Точки с инвестициями` layer (6,871 records) and recommendation basis `отгрузка | сигареты` layer (10,608 records) were fetched through `/state/layer`; the other four layers remained deferred. No full `/state` request occurred.

The production repeat-load trace made only `/auth/login`, `/auth/me`, `/state/meta?map=comdep` and `/data/meta` requests. It made no full `/data`, full `/state` or `/state/layer` request. The two previously used layers were restored from IndexedDB, while the other four stayed unloaded. This confirms revision-based cache reuse and removal of duplicate hydration in the authenticated browser.

A read-only on-demand probe of HST CC confirmed that the 39,525-record payload still takes 30.31 s to transfer/read on selection; client hydration after arrival took 0.2 ms. The deferred design keeps that cost out of first paint, while payload splitting or a server-side compact representation remains the next separate optimization for users who explicitly enable HST CC.


## 2026-08-14 — Progressive compact delivery for large heat layers

### Payload profile

The production HST CC sample contains 39,525 rows with `lat`, `lon`, `vol` and `name`; address, code and hours are empty. Current object JSON measured 2,592,893 characters and approximately 107 KB gzip in the browser profile. Tuple packing reduced raw JSON to 1,604,768 characters, while geometry/value-only tuples measured 862,743 characters and 73.6 KB gzip. Because compression is already active, the dominant UX improvement comes from progressive delivery rather than a single smaller response.

### Protocol

The server now exposes an additive protected `GET /state/layer/chunk?map=…&layer=…&offset=…&limit=…` route. It returns `_app: "hm-layer-chunk"`, the state revision, total count, offset/nextOffset, per-batch dictionaries for repeated `name`/`addr`/`code`/`hours` values and rows encoded as `[lat, lon, vol, nameIndex, addrIndex, codeIndex, hoursIndex]`. The request is limited to 500–5,000 rows and the layer key must belong to the requested map. The original `/state/layer` object response is unchanged for legacy clients, exports and small-layer compatibility.

The client uses 4,000-record chunks for layers with at least 12,000 records. `ensureLayerRecords()` resolves after the first chunk is available, so a visible preview can render immediately; remaining chunks are requested through the same protected route with `requestIdleCallback`/timer yields between batches. Records are expanded back to the existing object shape before city filtering, nearest-point enrichment, recommendations or exports. Chunk payloads are stored in the revisioned IndexedDB cache and old layer/chunk revisions are pruned.

### Verification

The isolated API regression test passed compact response shape, `nextOffset`, dictionary indexes, exact row values and the existing lazy-save merge. A browser test against a 20,000-record fixture requested five 4,000-record chunks; the first 4,000 records became available in 66.6 ms, all five requests completed, the final layer contained exactly 20,000 records and 80 repeated names were reconstructed correctly. No full `/state/layer` request was used in the progressive path.


### Final production verification — commit `6e36649`

CI and GitHub Pages completed successfully, Render `/health` remained healthy, and the live client served `app.js?v=20260814d`. In a read-only authenticated browser test, the previously cached full HST record entry was removed only from that browser’s IndexedDB. The real HST CC layer then used ten protected `/state/layer/chunk` requests of 4,000 rows, with a final 3,525-row batch. The first 4,000 records became available after 6.22 seconds; subsequent batches completed in 1.12–1.69 seconds, and the final in-memory layer contained exactly 39,525 records. No full `/state/layer` request was made and no production write endpoint was called.

Compared with the previous 30.31-second single response, the compact progressive path improves time-to-first-use by allowing the first subset to render while the remaining records arrive. The remaining first-chunk delay is now primarily server/database response time, not JSON hydration; the client reconstructed and enriched the received rows without a client-side bottleneck.


## 2026-08-14 — Recovery for stale lazy-layer revisions

### Production incident

After the progressive chunk release, an open browser could retain an older metadata manifest while another session updated the shared map. The affected session held `_activeStateRevision = 2026-08-14T05:08:40.824Z`; the current `/state/meta?map=comdep` and `/state/layer?map=comdep&layer=custom_1785931072257` responses had revision `2026-08-14T05:39:22.038Z`. The layer endpoint itself returned HTTP 200 and all 6,871 records, but the strict client revision guard converted the valid response into `STALE_LAYER`, producing the toast «Не удалось загрузить данные слоя».

### Fix

The client now recognizes `STALE_LAYER` and `STALE_LAYER_CHUNK`, refreshes `/state/meta` once through a coalesced request, updates only the active revision and revisioned read cache, and retries the requested layer once. Current visibility, map position, city filter and other UI settings are not replaced during this recovery. The compact chunk path and the legacy small-layer path use the same bounded recovery policy; malformed responses and a second mismatch still fail normally instead of retrying indefinitely. The application cache-buster advances to `app.js?v=20260814e`.

The recovery path performs no save or write operation. A read-only production control scenario manually reconciled the stale manifest and successfully hydrated `Точки с инвестициями` with exactly 6,871 records. Detailed evidence is in `qa/lazy-layer-revision-regression.md`.


### Published recovery verification

CI succeeded for `b96e775`, and GitHub Pages served `app.js?v=20260814e`. A deliberate stale-revision test on `Точки с инвестициями` changed the active client revision back to `2026-08-14T05:08:40.824Z` while production was at `2026-08-14T05:39:22.038Z`. The client made the original layer request, fetched fresh `/state/meta`, retried once and hydrated exactly 6,871 records in 769 ms. A second test forced the same mismatch on HST CC; the compact path refreshed once, exposed the first 4,000 records progressively and completed the background load with exactly 39,525 records across offsets 0 through 36,000. No production write endpoint was called in either test.


## 2026-08-14 — Isolated Kyrgyzstan access reset

The server now supports an optional protected `KG_AUTH_USER_JSON` environment override. When present, startup removes any existing account with role `kg` from the base `AUTH_USERS_JSON` set and adds exactly one validated `kg` account from the override. This lets Render rotate the Kyrgyzstan credential without exposing or rewriting the shared admin/comdep/other account configuration. The password hash is stored only in Render Environment; no plaintext password or hash was committed to the repository.

The new override was configured in Render and the service was rebuilt from commit `947cb2e`. A production smoke test returned: login HTTP 200, bearer token issued, `/auth/me` HTTP 200 with role `kg`, `/state/meta?map=kg` HTTP 200, and `/state/meta?map=comdep` HTTP 403. The test did not call any write endpoint or modify map data.


## 2026-08-18 — Render PostgreSQL suspension caused layer outage

Production health reported `storage: file` instead of `storage: postgresql`. Render Projects showed only `hm-server` active; the existing PostgreSQL datastore `test_bd` was listed under Suspended (7) as `Suspended by you`. This was the dependency removed from the runtime path: the server fell back to ephemeral file storage, so persistent `/data` and `/state` layers were unavailable.

Recovery was performed without creating a new database: `test_bd` was resumed, reached `available`, and `hm-server` was redeployed so it re-read the existing `DATABASE_URL`. Health then returned `storage: postgresql`. Read-only production verification passed with KG login 200, `/auth/me` 200, `/data/meta` 200, `/state/meta?map=kg` 200, and a compact layer chunk 200. No write endpoint or map data was changed.


## 2026-08-18 — Reduce Render load for heatmap reads (`75a1f29`)

Implemented five load/cost optimizations without changing map data: removed the obsolete GitHub Actions keep-warm workflow now that `hm-server` runs on Starter; added a bounded 30-second server cache for first compact chunks; coalesced concurrent PostgreSQL state reads; added client single-flight chunk requests; and added fingerprint-based autosave deduplication for identical admin state.

The PostgreSQL schema uses `app_state.key` as its primary key, so the state query already has the correct index. No speculative or redundant secondary index was added. The server-side read coalescing reduces duplicate concurrent queries while preserving the existing revision and lazy-save semantics.

Local syntax, lint and whitespace checks passed. GitHub CI and Pages deployment passed. Render shows `75a1f29` live. Production health remains `storage: postgresql`. Read-only KG smoke test passed: login 200, `/state/meta?map=kg` 200, first compact chunk 200 with 4,000 records, repeated identical chunk 200 with 4,000 records, same revision. No write endpoint or Render data/configuration was changed during verification.


## 2026-08-18 — Replace deprecated 2GIS basemap tiles (`83ef06f`)

Production showed a 2GIS unsupported-service overlay because the application still used the legacy URL `https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1`. The current official 2GIS Raster Tiles API requires a versioned `/v2/tiles/{tileset}/{z}/{x}/{y}.png?key=...` endpoint and an API key.

For immediate recovery without adding a new secret or paid map API dependency, the basemap was moved to the standard OpenStreetMap XYZ endpoint with visible attribution. Heatmap layers, city filters, markers, map controls, state storage and all user data remained unchanged. The cache-buster was raised to `app.js?v=20260814g`.

Local syntax/lint checks passed, the OSM tile returned HTTP 200 with production Referer/User-Agent, GitHub CI and Pages passed, and live production shows OpenStreetMap tiles and attribution with no 2GIS unsupported-service overlay.


## 2026-08-18 — Startup latency measurement and dataset cache (`f84675c`)

A fresh unauthenticated production page reached DOMContentLoaded in about 355 ms and load in about 434 ms; visible OpenStreetMap tile requests were not the main bottleneck. The authenticated KG probe showed login about 1.84 s, parallel `/data` about 2.25 s for a 1.6 MB JSON payload, and `/state/meta` about 2.37 s on the first probe. Repeat calls were `/data` 1.19 s and `/state/meta` 0.49 s.

Added a five-minute in-memory cache for the dataset read in `hm-server`, while retaining 30-second state cache and invalidation after writes. Production health stayed PostgreSQL-backed; CI and Pages passed; read-only startup probe passed without modifying map data.


## 2026-08-18 — Defensive security audit

A read-only security audit confirmed that unauthenticated reads and writes are rejected, map roles are enforced, admin writes require both the admin role and `X-API-Key`, uploaded text is escaped before popups/tooltips, and no environment/secret files are tracked in Git. Dependency audit found no high or critical production vulnerabilities and one low body-parser advisory with an available fix.

The audit also found a high-priority production configuration issue: when `ALLOWED_ORIGINS` is empty, the CORS middleware reflects arbitrary origins while allowing credentials. A preflight from an unrelated origin received `Access-Control-Allow-Origin` for that origin and `Access-Control-Allow-Credentials: true`. The server should be restricted to the exact GitHub Pages origin before treating the dataset as strongly protected. No production configuration was changed during the audit.


## 2026-08-18 — Production CORS allowlist fix

Render `hm-server` environment was corrected to the exact production origin `ALLOWED_ORIGINS=https://ekzotik-inc.github.io`. No other environment variables were changed. The backend received a small CORS error handler in `0cfa146` so blocked origins return HTTP 403 with a generic JSON error instead of HTTP 500.

Production verification after redeploy: the GitHub Pages origin receives HTTP 204 with `Access-Control-Allow-Origin: https://ekzotik-inc.github.io` and credentials enabled; an unrelated `https://evil.example` origin receives HTTP 403 and no `Access-Control-Allow-Origin`. Health remains PostgreSQL-backed and auth configured. CI passed; no map data or write endpoints were changed.


## 2026-08-18 — API key and authorization token audit

A complete defensive audit of server-side credentials, browser session materials, admin write authorization, CORS/CSRF behavior, production responses, Git history and published assets was completed. The audit was read-only: it did not call a successful write endpoint, export data, guess passwords, replay copied tokens, or change Render secrets. Full redacted evidence and the prioritized risk register are in `qa/token-api-audit-20260818.md`.

Production probes confirmed login HTTP 200, an eight-hour signed session, `HttpOnly; Secure; SameSite=None` cookie flags, bearer `/auth/me` HTTP 200, cookie-only `/auth/me` HTTP 200, KG role isolation with non-KG map HTTP 403, missing API-key write rejection HTTP 401, tampered bearer rejection HTTP 401, exact GitHub Pages CORS HTTP 204 and foreign-origin rejection HTTP 403. A scan of published `index.html` and `app.js?v=20260814g` found no password hash, private key, provider token, or hardcoded secret signature. Current `npm audit --omit=dev` reports zero production vulnerabilities.

The remaining high-priority risks are browser-readable bearer/session material, the global admin API key in localStorage, absent login throttling/dummy-hash handling and the need to rotate the KG credential because it was previously shared in conversation context. Planned hardening items include SRI or self-hosting for the two cdnjs JavaScript libraries, staged CSP, server-side token revocation, explicit CSRF defense, constant-time API-key comparison, PostgreSQL certificate verification and reconciliation of `render.yaml` with the live Starter service. No optional code hardening was applied without a separate user confirmation.


## 2026-08-19 — P1 authentication hardening

Implemented the requested P1 controls without changing PostgreSQL data or Render secrets. `/auth/login` now applies a bounded in-memory limiter of five failed attempts within 15 minutes across normalized IP+username and normalized-username buckets, returns HTTP 429 with `Retry-After` after the limit, and prunes expired/overflow buckets. The account fallback bucket protects against managed proxy IP rotation. The limiter is intentionally process-local; a future multi-instance deployment should move counters to shared storage.

Unknown or malformed users now go through a startup-generated dummy scrypt verification with the same work factor as configured users before the generic 401 response. The login path no longer exposes browser-persistent bearer credentials: the HttpOnly cookie remains primary, the bearer fallback is page-memory-only, and legacy `hm_session_token` is removed at startup. The global admin `API_KEY` is also page-memory-only; legacy `hm_admin_key` is removed at startup and the UI tells the owner that re-entry is required after refresh. Non-secret UI state and dataset caches remain unchanged.

The app cache-buster advanced to `app.js?v=20260814h`. The user-facing hint, `FEATURES.md`, `CONTEXT.md` and the token audit risk register were updated. Local validation passed `node --check app.js`, `node --check server/server.js`, ESLint and `git diff --check`. An isolated regression passed valid login HTTP 200 with a cookie, cookie-only `/auth/me` HTTP 200, known/unknown invalid login HTTP 401, five normalized failed attempts HTTP 401, and the sixth attempt HTTP 429 with `Retry-After`; no token or cookie values were printed. An initial production probe exposed proxy-IP variation, so the account fallback bucket was added and locally re-tested before the follow-up deployment. The KG credential rotation remains a separate required operational step.

## 2026-08-19 — Unified layer and point controls

The «Точки» tab now uses the same accordion/card interaction model as heat layers. Each point layer has a consistent header switch for map visibility, expandable settings, rename, solo isolation, data refresh and delete actions. Point-specific controls remain available inside the shared card: color, icon shape, marker size, marker opacity and optional coverage radius with radius color/fill settings. Point-layer visibility is still rendered independently from `ourPts()` calculations, preserving the existing recommendation and city metrics semantics.

The point state snapshot remains backward-compatible: `size` and `opacity` default to 30 px and 100% when absent in older saved states. Frontend cache-busters were advanced to `app.js?v=20260814i` and `style.css?v=20260813f`.

## 2026-08-19 — Production points visibility/reload verification

Production read-only smoke on the Com Dep map confirmed four point layers with visibility `[false, false, false, true]`, badge `1/4` and 58 rendered markers before reload. After full reload, re-authentication and reopening Com Dep, runtime and DOM returned the same visibility vector, badge, layer ids, collapsed-card state and 58 markers. The points tab and map were synchronized.

The in-memory solo smoke also passed: four visible layers changed to `[true, false, false, false]` for the selected layer, the solo button became active, and the original visibility state was restored after disabling solo. Solo state is intentionally not serialized in the snapshot, so it resets after reload; the visibility result produced by solo remains the persisted state. Evidence: `qa/points-visibility-reload-20260819.md`.

## 2026-08-19 — Production layers/points synchronization verification

Read-only production verification confirmed that the shared layer/point state remains synchronized after the latest UI changes. On Com Dep, heat visibility was `[true, false, false, false, false, false]` with badge `1/6`, while point visibility was `[false, false, false, true]` with badge `1/4`; the visible point layer rendered 58 markers. Switching `Карта → Точки → Карта` preserved both visibility vectors, badges, and map rendering. The point-card visibility switch was separately distinguished from the green coverage-radius switch, and its `aria-checked` matched runtime for all four point layers.

After full reload, re-authentication and reopening Com Dep, the same heat/point vectors, badges, active tab and 58 markers were restored. No write/configuration action was performed. Evidence: `qa/layers-points-sync-20260819.md`.

## 2026-09-17 — Publish/refresh flow for viewers

Open tabs previously learned about a new owner publication only by reloading the page: `fetchFromServer()` ran once at startup and nothing polled afterwards. A new cheap `GET /state/revision` endpoint answers from the 30-second read cache, and clients poll it every 45 seconds plus on tab focus and on regaining network. When the server revision differs, a banner over the map offers «Обновить».

Applying the update is visible: the map desaturates and regains colour as a percentage climbs, driven by records hydrated against the record counts promised by the manifest, so the progress is real rather than a timed animation. Success reports the published version time; failure explains the cause — session expired, no map access, timeout, offline — with concrete next steps and a retry that re-reads the manifest from a clean revision. `applySnapshot` now drops derived heat caches for metadata-only manifests so a refresh cannot paint the previous revision over new records.

## 2026-09-17 — Layer palettes, colour sets and touchpoint tags

The palette picker became a grid of gradient chips instead of a text select, and six ramps were added including cividis for colourblind safety and a brand teal. A shared fourteen-colour swatch row now serves both the custom heat colour and point markers, with hues spaced apart so enabled layers stay distinguishable. Picking a point colour no longer rebuilds the whole card on every pointer move, which used to interrupt the drag.

A new «Ярлыки» button per heat layer draws that layer's own touchpoints over the heat; clicking one opens the card from the uploaded file. The overlay is viewport-scoped, canvas-rendered and capped at 1200 markers ordered by value, with an on-map note when capped, so a 50k-point layer stays usable. The legend shows each layer's actual gradient strip plus its point count.

The same commit restored the 2GIS basemap required by `CLAUDE.md`. It had been swapped for OpenStreetMap as a «deprecated endpoint»; the endpoint answered 200 with a 70 KB detailed tile over Tashkent, so the premise did not hold.

## 2026-09-22 — Manual trade points with photos

A new kind of point is entered one at a time rather than uploaded from a file: name, DMS code, installed equipment, up to three photos, coordinates, sales count and a comment. Coordinates can be typed or picked by clicking the map.

Photos never enter the map state. The state already weighs megabytes and is posted whole on every save, so three phone photos per point would have made it unsendable. The browser downscales to 1400 px at JPEG q82 and uploads to a new `photos` table; the state carries only ids. `POST /photo` is owner-only and per-map, rejects non-images and anything over 4 MB, and keys rows by a content hash so re-uploading the same file does not duplicate. `GET /photo/:id` serves it only to a session that may open that map, with a one-year immutable cache. The client loads photos lazily through `authFetch` into blob URLs rather than `<img src>`, since an image tag carries no Authorization header and the session may live in memory on the cross-origin frontend.

Verified end to end: upload, dedupe, admin read 200, other-map read 403, no session 401, non-image 415, malformed id 400.

## 2026-09-22 — Manual points live in ordinary point layers

Manually entered points initially sat in their own fixed block and could not be recoloured, reshaped, soloed or given a coverage radius the way uploaded layers can. They are now ordinary point layers carrying a `manual` flag. The point form picks a target layer or creates one inline, so several manual layers coexist alongside uploaded ones, and a manual layer's card gets «+ Точка» in place of «⬆ Данные» plus a list of its points. Legacy `retailPts` migrate into a «Торговые точки» layer on load, matched by point id so a state holding both shapes cannot duplicate them.

`stateFingerprint` now digests manual point fields. Editing a card does not change the point count, so the save was being skipped as unchanged — the same trap later caught per-point colour.

Follow-ups in the same week: an Excel export for manual points, with photo links since XLSX cannot embed images; and per-point colour, where an empty value means inherit from the layer, with marker icons cached per colour so a mixed-colour layer builds one SVG per distinct colour rather than one per point.

## 2026-09-22 — Write-key failures made legible

Photo upload reported «HTTP 401», which named neither of the server's two 401s: no write key, or no session. The key is memory-only by design and is wiped on every page refresh, so the real cause was a missing key. Upload errors now carry the server's reason mapped to plain Russian, the point form shows a persistent notice with a key field, and saving a point without a key says it stayed in this browser only. `pushToServer` used to return silently without a key, hiding that the owner's edits were not syncing at all; it now sets the sync badge.

## 2026-09-24 — Address program correctness

Three independent defects kept layers out of the exclusion list: `focusNewLayer` did not rebuild it, `rtExclLayerKeys` counted in-memory records which are zero for lazily unloaded layers, and — worst — a ticked but unloaded exclusion layer contributed nothing while reporting «исключено 0» without a word. Both callers now await the records first, and counting goes through the manifest's `stats.n`.

The exclusion step also explains itself: a live sentence states the outcome for the current settings, the «ближе чем» caption follows the operator since `>` and `≥` invert the rule, and a tooltip documents that a matching `code` column excludes an address regardless of distance. The address preview gained legend rows and an off switch: «На карте» toggles to «Убрать с карты».

## 2026-09-24 — Tashkent scope, unified counters, percent values

Selecting Tashkent always meant Tashkent plus the whole region, because membership was «nearest city centre within 60 km», which reaches Chirchiq and Angren. The city filter now offers «Город + область» and «Только город», the latter using the real boundary — the union of the district polygons already shipped for the «Районы» overlay. Heat records and point layers had been filtered by two independent paths; both now go through one predicate, `recInSelection`.

The three on-map counters meant three different things and never matched under a city filter: the badge summed filtered heat records only, the legend printed whole-layer sizes, and the tag note counted the viewport. Every layer now records how many points it actually drew; the badge equals the sum of the legend rows, and the tag note says «в этой области».

The `value` column accepts percentages such as «0,356%». The parser strips the sign and marks the layer, the unit travels with the map state, and Excel keeps the cell numeric with a percent display format so the column still sorts and sums. A follow-up fixed a deeper problem this exposed: exports rounded to a fixed decimal place, flattening small fractions into identical 0,001 values, and `toLocaleString` showed the same values as «0» on screen. Both now scale with magnitude.

## 2026-09-24 — Write key issued with the session

The owner had to paste the server API key after every refresh. The session already proves who the owner is; the shared secret was only still carrying its CSRF role, which a custom header fulfils. `/auth/login` and `/auth/me` now return a `writeKey` for admins, derived as `HMAC(SESSION_SECRET, "write|" + session token)`, so it cannot be computed without the server secret and is worthless on another session. `verifyKey` accepts either that token or the static `API_KEY`, keeping scripts working. Verified: admin gets a key, a viewer does not, writes succeed with no manual entry, `/auth/me` returns the same key after a refresh, another session's key is rejected, and a missing or forged key is refused.

## 2026-09-24 — Volume filter removed

Step «Объём точки» dropped every candidate below the sample average by default, silently halving the result set before distance and exclusions were considered. The step, its state, its fingerprint entry and its export settings row are gone; old saved states carrying the fields are ignored. The value itself stays in the export and on the point.

## 2026-09-29 — Multi-layer address program

Both selectors became toggle lists. Step 1 accepts several source layers at once, merging records by rounded coordinates so a point present in two layers is one address, keeping which layers it came from and the largest value among them. Step 2 accepts several reference layers, measuring distance to the nearest point across all of them, and a candidate's card names the layer its nearest reference actually belongs to. Exclusions now depend on any selected layer carrying values, and the percent cell format applies only when every value-carrying layer is a percent layer. States holding the old single keys migrate into lists.

## 2026-09-30 — Recommendations split into their own tab

Recommendations and the address program shared one tab, so the address program sat behind a collapsed disclosure. Recommendations moved to «Рекомен.» with their count badge; «Анализ» became «Адреска» and holds only the address program, unwrapped from the disclosure. Keyboard shortcuts extend to 1–6 and the tab strip tightens so six fit without wrapping. The app name also dropped «BR» from the sidebar, both login cards and the page title; BR is left alone where it is a business term.

## 2026-10-05 — Nearest reference named in the address export

The address export reported «До BR/IPSE, м» without saying which point the distance was measured to, so a candidate could only be checked against its nearest outlet by opening the preview and clicking the marker. The nearest reference is now named immediately after the distance column. Two further columns appear only when they carry information: the reference's code — or the DMS code for a manually entered point — when any reference has one, and its layer when more than one reference layer is selected. A reference with neither a name nor a code falls back to its coordinates, so the point is always identifiable. The recommendations sheet is unchanged: `enrichNd` discards the nearest-point reference and retaining it would add a field to every heat record.

## 2026-10-05 — 2GIS deprecates the old tile endpoint

2GIS began replacing tiles from `tile{s}.maps.2gis.com/tiles?x=&y=&z=&v=1` with a «service no longer supported» notice. The rollout is regional: the owner saw the notice in Tashkent while the same tiles fetched from the CI container still rendered a real map, and the HTTP status stayed 200 throughout — only the image content changed. Unlike the September claim that led to an unjustified swap to OpenStreetMap, this deprecation is genuine and comes from 2GIS itself.

The replacement is the 2GIS Raster Tiles API — the same provider on a supported endpoint — which requires an access key issued in Platform Manager and bills per tile request. The tile URL is now selected by `window._HM_2GIS_KEY` in `index.html`: with a key, tiles come from `/v2/tiles/online_hd/{z}/{x}/{y}.png` across five hosts; without one the old endpoint is kept, so the change was safe to deploy before a key existed. The v2 endpoint was verified to answer 403 without a key and with an invalid key. The owner opted to obtain a 2GIS key rather than switch providers, so the `CLAUDE.md` rule holds; that file now records both the September false alarm and the October genuine deprecation, with the lesson to inspect tile content rather than the HTTP status.

## 2026-10-06 — Basemap moved to OpenFreeMap

2GIS retired the old tile endpoint and its supported Raster Tiles API requires a paid key, so the owner directed a free replacement: «нет никаких ключей, делай бесплатно». The long-standing «2GIS only» rule is therefore superseded by this decision, and `CLAUDE.md` now records both the September false alarm and the October genuine deprecation.

Candidates were measured rather than assumed. OpenStreetMap's own tile servers return HTTP 403 «Access blocked — app is not following the tile usage policy». CARTO now serves an «API KEY REQUIRED» tile. MapTiler's free plan is «testing, PoC, prototyping, personal, or non-commercial use» and Stadia's states «Commercial use not allowed», both of which exclude this tool. Esri World Street Map works without a key but returns empty tiles at zoom 17 over Tashkent City, the Amir Temur centre and Sergeli — the zoom at which retail points are actually worked with — while rendering a single road in Yunusabad where 2GIS showed buildings, house numbers and a petrol station.

OpenFreeMap serves OpenStreetMap vector tiles with no key, no limits and commercial use explicitly allowed. Its planet build was dated 2026-10-04, two days before the switch, and it returned 217 KB of vector data over Tashkent City and 212 KB over central Bishkek against 0 bytes over empty desert, confirming the measurement was meaningful. Rendering goes through MapLibre GL embedded as a Leaflet layer by `maplibre-gl-leaflet`, so the rest of the map — panes, heat canvases, markers — is untouched.

`addBasemap()` picks 2GIS when `window._HM_2GIS_KEY` is set, OpenFreeMap otherwise, and falls back to raster OSM tiles if the vector layer has not rendered after twelve seconds, since a blank map is worse than any basemap. Browser verification in the sandbox confirmed MapLibre, the plugin and the GL canvas initialise, but tile rendering could not be screenshotted: the container's proxy drops connections to the CDNs, with the same `ERR_TOO_MANY_RETRIES` appearing for a known-good cdnjs asset.

## 2026-10-07 — Basemap no longer flickers on zoom

- **Symptom:** the map blinked on every zoom.
- **Cause 1:** `maplibre-gl-leaflet` 0.1.4 resets the CSS scale of the basemap
  canvas on the proxy's `transitionend`, which on real machines can arrive
  before Leaflet's zoom end. For one frame the canvas showed the *old* zoom
  unscaled, then jumped to the new one. Reproduced with a frame-by-frame trace:
  3 snap-back frames on 3 zooms before, 0 after.
- **Fix:** `patchGlLayer()` — container position, MapLibre view and transform
  reset happen in one task with a synchronous `redraw()`; `transitionend` is
  ignored, `zoomend` ends the zoom. Pinch zoom also repositions the container.
- **Cause 2:** the 12 s basemap watchdog used `isStyleLoaded()`, which is false
  while tiles are loading — zooming at the 12th second replaced the live vector
  basemap with raster tiles. Now it checks `style.load` + first loaded tile.
- Cache version `20261007a`.

## 2026-10-13 — Point names on the map without overlaps

- «Точки» tab: switch «Названия всех точек на карте» (all visible layers) and a
  per-layer switch «Названия на карте» (layer field `labels`, saved in state
  and in `stateFingerprint`).
- Greedy placement in `renderPointLabels()`: each point tries right, left,
  top, bottom of its marker; a label is drawn only where it does not touch
  another label, any marker, or the floating map panels (city bar, legend,
  counter, zoom). Order: manual layers first, then layer order, then name —
  stable while panning. Long names are cut to 28 chars (full name in the hover
  tooltip). Labels are hidden during the zoom animation and re-placed after.
- The note under the switch says how many names fit in the current view
  («Подписано N из M точек в этой области»).
- Verified in a browser on 400 test points: 0 label/label overlaps, 0
  label/marker overlaps, 0 labels under panels.
- Fixed in passing: `stateFingerprint` ignored marker size, opacity and all
  coverage-radius settings, so changing only those was never saved to the
  server. The small switch (radius toggle) had a knob larger than its track —
  new `.cbx.sm`.
- Cache version `20261013a`.

## 2026-10-22 — Maps are created and switched from the admin panel

- **Registry instead of hardcoded maps.** The server keeps a map registry in
  `app_state` (`maps`). Three base maps stay built in; new maps get an id
  `m<time><rand>`, name, description, icon, country (UZ/KG) and `viewers` —
  the existing user roles (Com Dep / Другая / KG) that may open the map. The
  owner sees every map. Access checks on state, layers, chunks and photos go
  through one predicate, `canAccessMap`.
- **Routes:** `GET /maps`, `POST /maps` (optionally a full copy of another
  map, manual-point photos duplicated under the new map), `POST /maps/update`,
  `POST /maps/delete` (custom maps only, confirmed by typing the name; deletes
  state and photos). Registry writes are serialized.
- **Admin UI («Данные» → «Карты»):** list with country, who sees the map,
  size, last save and photo count; create/edit form; open; delete.
- **Switching:** the map name under the app title and the badge in the map
  corner open a menu of all available maps. Switching waits for pending saves
  to reach the server, then reloads into the chosen map. The login map picker
  is built from the registry; a user with one map enters it directly.
- **Memory:** parsed map states are now evicted 30 s after last use. Before,
  every map read since restart stayed in RAM (~12 MB per Com Dep–sized map),
  which would have capped the server at roughly 10–15 maps.
- Compatible with the old server: without `/maps` the client falls back to the
  three base maps.
- Verified: 19 API checks against a local server (access by role, copy,
  duplicate names, delete guards, write key, registry survives restart) and a
  browser scenario (create with copy → opens, menu shows 4 maps, switch to KG
  sets country, Com Dep user sees only its maps and no admin controls, delete).
- Cache version `20261022a`. **Requires a Render redeploy.**

## 2026-10-23 — Heat-layer codes and addresses survive the upload

- **Symptom:** a layer uploaded with trade-point codes exported an empty «Код»
  column in the address program.
- **Cause:** `toRecs()` (heat-layer file parser) kept only name, coordinates
  and value. `code`, `addr` and `hours` were dropped at parse time, although
  `slimRecs`, the server's compact chunks, `expandLayerChunk`, the point card
  and the exports all carry them.
- **Fix:** heat layers and point layers share `recTextFields()`. Columns are
  matched by keyword priority (exact header first, then substring for words of
  3+ letters) and a column taken by one field is skipped for the next, so
  «Код точки» no longer becomes the name via «точк». Recognised code headers:
  code, код, id, dms, дмс, sap.
- The heat-layer template now has `code` and `addr` columns.
- Layers uploaded before this fix have no codes stored — they must be
  re-uploaded (layer card → «⬆ Данные»).
- Cache version `20261023a`.

## 2026-10-23 — «Только город» for Samarkand, Andijan, Kokand, Fergana, Bukhara

- The city filter's «Город + область / Только город» switch used to exist for
  Tashkent only (district polygons from `/data`). It now applies to every
  selected city that has a boundary.
- New static file `city-bounds.js` (`window.HM_CITY_BOUNDS`, 22 KB): official
  administrative city boundaries from OpenStreetMap («Samarqand shahri»,
  «Andijon shahri», «Qoʻqon shahri», «Fargʻona shahri», «Buxoro shahri»;
  relations 15589846, 15534510, 15537298, 15537982, 13070474), simplified to
  ~30 m, outer rings only, ODbL. Areas 63–110 km²; each city centre lies
  inside its boundary.
- `tashkentScope` → `cityScope` (old saved states are read); one mode for all
  selected bounded cities. The switch lists which cities it applies to and
  says which selected cities have no boundary (they keep the nearest-centre
  rule). Filter label shows «Самарканд (город)».
- Verified: 14 control points (centres, Registan, Lyabi-Hauz inside; Urgut,
  Kattakurgan, Margilan, suburbs outside; Navoi → no boundary) and a browser
  run: Samarkand region 3 points → city 2; Samarkand + Fergana city 3; mode
  saved in state.
- Cache version `20261023b`.

## 2026-10-23 — Collapsible point list in manual layers

- A manual layer card now has «Показать / Скрыть список точек» with the point
  count. Without a user choice, lists up to 5 points are open and longer ones
  are collapsed; an explicit choice is remembered per layer in this browser
  (`localStorage` `hm_rplist`, a per-viewer convenience, not map state).
- Collapsing happens in place and survives card rebuilds.
- Verified in a browser: 35-point list collapsed by default, 3-point list
  open, toggle both ways, state kept after rebuild and after reload.
- Cache version `20261023c`.

## 2026-10-23 — Paste photos from the clipboard into manual points

- The manual point form accepts images from the clipboard two ways: Ctrl+V /
  ⌘V anywhere in the open form (a paste carrying an image is taken as a
  photo; a text paste into a field is left alone), and a «📋 Вставить из
  буфера» button using the async Clipboard API, with clear fallbacks when the
  browser lacks it or denies permission.
- File picker, paste and button share `addRetailPhotos()`: the 3-photo limit,
  write-key check and single upload at a time apply to all of them.
- `compressImage()` paints a white background first, so transparent PNG
  screenshots no longer turn black in JPEG.
- Fixed in passing: `.rp-field input` stretched the custom colour swatch into
  an empty full-width bar; the swatch is 30 px again and shows its colour.
- Verified in a browser: synthetic image paste, real Ctrl+V and the button
  with a real clipboard each added a photo; a text paste into the name field
  was not intercepted; buttons hide at 3 photos; the transparent corner of a
  pasted PNG is white on the server copy.
- Cache version `20261023d`.

## 2026-10-23 — Hover menus with a safe triangle

- No menu in the app opened on hover, so a safe triangle had nothing to
  protect. On mouse devices (`(hover: hover) and (pointer: fine)`) the city
  filter, the map switcher (title and map-corner badge) and the «ⓘ» hints now
  open on hover after a short intent delay (160 ms; 80 ms for hints).
- `hoverMenu()` keeps the menu open while the pointer is on the trigger, on
  the menu, or inside the triangle from the point where it left the trigger to
  the near edge of the menu. Leaving the triangle closes after 260 ms; resting
  inside it closes after 420 ms. A click on the trigger, a click or keypress
  in the menu, or focus inside it pins the menu — then it closes only as
  before (outside click, Esc). Menus opened by click are not touched; touch
  devices keep click behaviour.
- Hover-opening does not move focus (no autofocus of the city search, no
  focus on the current map item) so it does not steal focus or pin itself.
- «ⓘ» hints moved from CSS `::after` to one body-level tooltip: no longer
  clipped by the sidebar scroll, reachable with the cursor, selectable,
  keyboard-focusable (Tab), Esc closes, tap toggles on phones.
- Modals (point form, new layer) and accordion cards open on click and are
  unchanged.
- Verified in a browser with real mouse paths: 18 checks — hover opens, focus
  stays, diagonal to the far edge keeps both menus open, click pins, outside
  click and Esc close, moving away closes, resting in the gap closes, hints
  reachable by cursor and by Tab.
- Cache version `20261023e`.

## 2026-10-23 — Point form survives a misclick; «Open in Yandex Maps»

- **Manual point form:** a click on the dimmed background no longer closes it
  (the card gives a short nudge and a hint says to use «Отмена» or Esc).
  Esc now closes the form too. «Отмена» and Esc ask for confirmation when
  anything was entered; an untouched form closes silently. Dirty state is a
  snapshot of all fields, colour and photo ids taken on open. The backdrop
  reacts to `pointerdown`, so a text selection released outside the card does
  not count either.
- New-layer and new-point-layer dialogs close on a background click only while
  their name field is empty.
- **Yandex Maps:** every point card has «Открыть в Яндекс Картах» (new tab;
  on phones the Yandex Maps app): heat-layer tags, file point layers, manual
  points, address-program results, recommendation zones and city cores. URL
  `https://yandex.ru/maps/?ll=lon,lat&z=17&pt=lon,lat&l=map` puts a marker on
  the exact coordinates. Yandex rate-limits the sandbox, so opening it could
  not be screenshotted; the URL format is Yandex's documented one and returned
  HTTP 200 with parameters intact.
- Popups now auto-pan clear of the city filter bar
  (`autoPanPaddingTopLeft` 16×84), since cards became taller.
- Verified in a browser: misclick keeps the form and its data, Esc/Cancel ask
  only when dirty, links present with correct coordinates and `noopener`.
- Cache version `20261023f`.

## 2026-10-24 — Ruler (hold Ctrl)

- Holding Ctrl turns the cursor into a ruler: clicks put points, each vertex
  shows the running distance, the last one the total (м / км), and a dashed
  line follows the cursor with the live distance. Releasing Ctrl keeps the
  measurement; the next Ctrl+click starts a new one; Esc or «×» on the total
  clears it. A ruler button under the zoom buttons does the same without Ctrl
  (touchpads, phones); pressing it again turns it off. Mac Ctrl+click (a
  context-menu event) is handled too.
- Clicks are taken on the map container in the capture phase, so points land
  on top of markers, districts or coverage circles without opening them;
  drags (>5 px) are not points. Ctrl inside inputs (Ctrl+C/V), with the point
  form open or while picking a point location does not start the ruler.
- Verified in a browser: Tashkent → Samarkand 268,1 км (map.distance), three
  points total 685,8 км, live segment, release keeps, new measurement,
  Esc, «×», ruler button, Ctrl in an input ignored.
- Cache version `20261024a`.

## 2026-10-24 — City summary moved onto the map

- The «Город» tab is gone. A «Город» button in the city bar (next to
  «Районы») opens the same summary in a popover below it: on hover with the
  safe triangle, pinned by click, Esc/outside click closes. It renders on
  open, so it always reflects the current city selection. Opening the city
  filter closes it and vice versa. Keyboard tab shortcuts are now 1–5.
- Cache version `20261024b`.

## 2026-10-24 — Admin panel: password management

- The «Данные» tab is now «Админ» with an «Админ панель» header. It stays
  hidden for every role except `admin` (CSS + keyboard shortcut skip), and all
  its actions are enforced on the server.
- New «Учётные записи» section: every login with its role and when its
  password was last changed; «Сменить пароль» opens an inline form (show,
  generate 12 characters, repeat, confirm). Works for the owner's own login.
- Server: `GET /auth/users` (admin, no hashes) and `POST /auth/password`
  (admin + write key). New scrypt hashes are stored in `app_state`
  (`auth_overrides`) and override `AUTH_USERS_JSON`; loaded at start-up.
  Tokens now carry `iat`; a password change revokes sessions issued before
  it. Changing one's own password returns a fresh token and write key, so the
  owner stays signed in.
- Verified: 13 API checks (no hashes in the list, non-admin blocked, length
  rules, unknown login, old session revoked, old password rejected, new
  password works, own change keeps the session and the write key, overrides
  survive restart) and a browser run (change Com Dep and own password from the
  UI, generator, Com Dep sees no admin tab and «5» does not open it).
- Cache version `20261024c`. Server changed — Render redeploys on push.

## 2026-10-24 — Layers tab redesign

- **Top switches** «Точки» (pins of all enabled layers, replaces per-layer
  «Ярлыки») and «Тепловая карта» (density spots on/off), with icons and
  one-line descriptions. Spot size and blend moved right under them. The
  global brightness control is gone (state value ignored, fixed at 1).
  Old states that had any layer's `showTags` turn «Точки» on.
- **Compact layer cards:** colour square, name with a pencil, on/off switch;
  second line with the point count and icons — Excel template, upload/update,
  delete, settings. Settings: pin icon (16 Lucide glyphs), intensity,
  opacity, the layer's fields, «Только этот».
- **Colour window:** four preset gradients or own colour — single or a
  two-colour gradient (`ramp: 'custom2'`, `color2`). Legacy palettes keep
  working and show as «current».
- **Pins:** one teardrop marker with a white glyph everywhere; canvas
  `PinMarker` for heat-layer points (up to 1 200, size shrinks with density),
  `pinSvg` for DOM markers.
- **«Создать слой»:** name + template columns (suggested and own fields) →
  step 2 «download template» / «upload filled file». Templates are .xlsx
  (Excel 2007+) with a «Как заполнить» sheet, latin file names.
- **Layer fields:** any non-standard column becomes a point field (`r.x`,
  `d.fields`), shown in point cards; carried through `slimRecs`, the server's
  compact chunks (`x` dictionary) and `expandLayerChunk`. Server changed.
- Verified in a browser (12 checks): fields as chips, template download with
  the right columns, filled file upload with fields, «Точки» shows 3 pins,
  heat off hides canvases, pin icon, preset and two-colour gradient, point
  card shows fields + Yandex link, fields survive the server round trip.
- Cache version `20261024d`.

## 2026-10-24 — Points tab on the same principle

- Point-layer cards use the same compact layout as heat layers: colour square
  (colour window: presets give a gradient pin, own single colour or
  gradient), name with a pencil, switch; count line with icons — template /
  upload for file layers, «+» and Excel export for manual layers, delete,
  settings. Settings: pin icon (16 glyphs), size, opacity, names on the map,
  coverage radius, fields, «Только этот». The manual point list stays
  collapsible under the card.
- Markers are the new teardrop pins (`pinSvg`), gradient when the layer has
  `color2`; a manual point with its own colour gets a solid pin. Label
  placement uses the pin's real box as an obstacle.
- «Создать слой» opens the same create window (columns: Название, Широта,
  Долгота, Адрес, Часы работы, Код + own fields); «Добавить точку вручную»
  stays. The «Названия точек» row became a full-width switch.
- New per-layer fields `icon`, `color2`, `fields` are saved and fingerprinted.
- Verified in a browser (9 checks): template columns and file name, upload
  with code/address/own field, two pins on the map, icon change, preset
  gradient pins, labels row, point card shows the own field, manual form.
- Cache version `20261024e`.

## 2026-10-24 — Address program: compact steps

- All three steps use one compact list (`pickListHtml`): a row per layer —
  check square, layer colour, name, point count. Only 3 rows are shown,
  selected layers first; «Ещё N слоёв» expands the rest, «Свернуть» folds
  it back with the selected rows still visible.
- Plain-language intro, sentence-case step titles with dark number badges,
  step 3 shortened to «Исключить, если рядом уже есть». Action buttons
  «Показать на карте» / «Скачать Excel» with icons.
- Removed dead marker code (`shp`, `SHAPES`, `starPath`) — all markers are
  pins now.
- Verified in a browser on 7 layers: 3 visible + «Ещё 4 слоя», expand shows
  7, selection works, collapsed list keeps selected rows, step 2 likewise.
- Cache version `20261024f`.

## 2026-10-24 — Map overlays and typography

- Font switched from Manrope to **Inter** (rsms/inter, OFL) app-wide, with
  `cv11`/`ss01` and tabular figures for numbers. Point-label measurement uses
  Inter too.
- The point counter and the save status are one frosted card in the top
  right: large number + «точек на карте» (proper Russian plural), status dot
  and «Сохранено / Обновлено …» under a hairline.
- Legend: frosted card with a header (count, fold chevron — remembered per
  browser), heat layers as gradient bars, point layers as their actual pins,
  counts in small pills, scrolls when long.
- Mode badge and tag note restyled to match. Label obstacles now include the
  new stat card and the ruler hint.
- Cache version `20261024g`.

## 2026-10-24 — Map Icons markers: shape + glyph

- Owner feedback: every marker was the same teardrop, only the glyph changed.
  Markers now come from Map Icons (github.com/scottdejonge/map-icons; code MIT,
  icons SIL OFL 1.1), chosen per layer in two independent rows:
  - **shape** — Капля, Табличка, Щит, Герб, Квадрат, Скруглённый;
  - **glyph** — 47 Map Icons glyphs for retail and city context (магазин,
    минимаркет, супермаркет, ТЦ, алкомаркет, АЗС, кафе, аптека, банк, склад,
    доставка, метро …) + «Табак» from Lucide (Map Icons has none) + «Без значка».
- New static file `marker-icons.js` (`window.HM_MARKERS`, 35 KB): shape paths
  anchored at the bottom tip and glyph paths — no icon font needed, the same
  paths draw on canvas (heat-layer pins) and in SVG (point layers, legend).
- Heat layers gain a `shape` field (saved, restored, fingerprinted); point
  layers reuse `shape`. Old Lucide icon ids and old shape names map to the
  nearest new ones (`markerIcon`, `markerShape`), so saved layers keep a
  sensible marker.
- Verified in a browser: 6 point layers with all six shapes and different
  glyphs/colours, 12 canvas pins of a heat layer, shape and glyph picking,
  legacy mapping; the layers and points regression runs pass.
- Cache version `20261024h`.

## 2026-10-25 — Markers trimmed to the business

- Owner: glyphs only for IQOS/cigarettes and kinds of trade points, plus a few
  classic shapes; everything else removed.
- Shapes: Капля (Map Icons pin, anchored at its tip), Квадрат, Круг, Звезда
  (anchored at their centre — new `ay` field). Shield, route and square pin
  are gone.
- Glyphs, in two groups in the picker:
  - «IQOS и сигареты»: IQOS (device with stick), Стик, Пачка — drawn for the
    project in the Lucide line style; Сигареты (Lucide); «Без значка».
  - «Торговые точки»: Киоск (Lucide), Магазин, Минимаркет, Супермаркет, ТЦ,
    Универмаг, Алкомаркет, АЗС, Кафе, Ресторан, Бар, Клуб, Отель (Map Icons).
- Removed shapes/glyphs map to the nearest remaining ones, so saved layers
  keep working. `marker-icons.js` shrank from 35 KB to 9.5 KB.
- Verified in a browser: all four shapes with IQOS/stick/cigarette/pack/
  gas-station glyphs on the map, picker groups, star + IQOS selection, 4
  shapes / 17 glyphs, legacy mapping.
- Cache version `20261025a`.


## 2026-10-25 — Inter only, droplet transitions, address layout

- Owner: every text element uses only Inter (rsms/inter); now a project rule
  in `CLAUDE.md`. A global `!important` rule covers form controls, Leaflet and
  MapLibre labels; the boot screen and the canvas point labels use Inter too.
- Droplet transitions: containers with `data-liquid` (side tabs, city scope,
  marker shape/glyph pickers) get a `.liquid` blob that flows to the active
  item, stretching on the way (WAAPI, 480 ms, overshoot easing). Buttons get a
  ripple drop on press, checkboxes squish. All of it is off under
  `prefers-reduced-motion`.
- The account label on the map is removed.
- Address program: long layer names no longer push rows past the card
  (`minmax(0,1fr)` grid track, `min-width:0`).
- Verified in a browser: 159 visible text nodes all in Inter, the blob lands
  under the active tab, ripple on press, no address rows overflow.
- Cache version `20261025b`.

## 2026-10-25 — «Границы»: districts and own zones, point selection by area

- The «Районы» button over the map is now «Границы» with a panel (hover with
  the safe triangle, click pins it; map clicks don't close it, so the selection
  can be watched live).
- Layers in the panel:
  - «Районы Ташкента» — the city districts from `/data` (UZ maps only), toggle
    and district list;
  - own boundaries — admin creates a layer (name + colour), then draws zones
    on the map (click = vertex, close with a click on the first vertex, double
    click or Enter; Backspace undo, Esc cancel) or uploads GeoJSON
    (Polygon/MultiPolygon with holes; names from `properties.name`). Rename,
    colour, delete layer or zone. Up to 20 000 vertices in total — the geometry
    travels with every state save.
- Clicking a zone on the map (or in the list) selects it; several can be
  selected. The selected zone gets a glowing outline in its own colour (SVG
  blur filter, a bright line with a light core, the outline draws itself in on
  selection and breathes softly); other zones dim slightly. The black square
  on click was the browser focus ring on the SVG path — removed.
- «Яркость заливки» slider for all boundaries (4–60 %).
- «Отбирать точки по выбранным зонам» + «Только внутри» / «Только снаружи»:
  heat layers, point layers, labels, recommendations, the address program and
  the counter all follow it via `recInSelection()`. A hidden layer's selection
  doesn't filter.
- Selection is by point-in-polygon on map click, not SVG events: the canvas of
  point labels lies above the boundary pane and would swallow the clicks. A
  click that closes a point card doesn't toggle a zone.
- State: `distOpacity`, `boundLayers`, `boundSel`, `boundFilter` in the
  snapshot, apply (reset to defaults when missing — map switch) and the
  fingerprint.
- Verified in a browser: district select by click, glow in the district
  colour, 6/10/5/15 points for A / A+B / outside / filter off, hiding the
  layer releases the filter, drawing a zone, list select, marker click doesn't
  toggle, brightness, snapshot round trip, server save + reload, viewer sees no
  edit buttons, GeoJSON with a hole, escaped names, Esc in drawing mode.
- Cache version `20261025c`.

## 2026-10-25 — Yandex location, circle tags, district areas, shapes, Excel

- «Открыть в Яндекс Картах» now opens the «Что здесь?» mode
  (`mode=whatshere&whatshere[point]=…`): the point is the selected location
  with its address card and Route/Share, not just a `pt` marker.
- Heat-layer tags are plain circles in the layer colour again (owner); the
  shape/glyph picker is gone from heat-layer cards, the canvas pin code
  (`PinMarker`, `drawCanvasPin`) removed. Point layers keep their markers.
- Legend: selected districts and zones under a thin grey «районы» separator —
  each with its area, and «Всего, N районов» with the sum. Area is spherical
  (Leaflet.draw formula), holes subtracted; the Границы status shows it too.
- Drawing a zone: «Точками» (free shape), «Прямоугольник» (two corners),
  «Круг» (centre + radius, stored as a 64-gon). Live size label (sides / R and
  area).
- Excel:
  - every heat and point layer card has «Выгрузить в Excel»: the template
    columns + the layer's own fields + columns that came with the file; the
    file uploads back into the same layer (percent layers write
    «Значение, %», and the parser now reads «%» from the header);
  - Границы → «Выгрузить точки внутри выбранных в Excel»: sheet «Районы»
    (area, points per layer, total) + a sheet per visible layer with its
    columns and «Район».
- Fixed: creating a heat layer from a file and uploading via «Данные» did not
  record the file's own columns as layer fields — they were missing from the
  template and the layer card. Both paths now merge `_fields`.
- Fixed: flying to a layer with a single point (or all points identical)
  threw «Invalid LatLng (NaN, NaN)» — the vector basemap has no max zoom, so a
  zero-size frame gave an infinite zoom. The map now has `maxZoom: 19`, layer
  flights stop at 16.
- Verified in a browser: whatshere link, 15 circle tags in layer colour,
  legend separator + 2 areas + total (14.9 km² for a 0.04° square at 41.3°N),
  rectangle and circle (area = πR² within 1 %), layer exports (heat with
  code/percent/own field, points with own field) re-parsed back, zone export
  sheets, new-layer fields, single-point layer flight.
- Cache version `20261025d`.

## 2026-10-25 — Viewer clean start, city zoom, typography, sliders, legend

- Opening a map zooms to the city the admin selected: its real boundary
  (Tashkent districts, `city-bounds.js`) or its centre. Before, a selected
  city skipped the initial framing altogether.
- Accounts other than admin always open the map clean
  (`applyViewerDefaults()` after every state apply): all heat and point layers
  off, «Точки» on in the layers tab, the address program reset (radius 1 km,
  exclusion 150 m, no exclusions; the base and reference lists still default
  to their first layer — the program needs at least one), the Tashkent
  districts on with the lightest fill (4 %) and no district selected. The
  admin's view is untouched.
- Typography: no more all-caps section labels — sentence case at 12px/600
  everywhere («Слои», «Свои границы», «Легенда», «Готовые наборы» …). Layer
  and zone names always start with a capital letter (`capFirst()` on create
  and rename, `::first-letter` for existing names) and use weight 600.
- Sliders: the fill now ends exactly under the thumb centre (`--f` fraction,
  CSS compensates for the 17px thumb). Several sliders — e.g. the boundary
  fill — never got a fill value and showed 50 %; a global input listener and
  a MutationObserver now keep every range input in sync.
- Legend: long layer names are cut with an ellipsis inside the frame (full
  name in the tooltip) instead of running past the border. The «Районы»
  separator is capitalised too.
- Verified in a browser: admin saves Samarkand + layers on; the viewer opens
  at zoom 12 over Samarkand with every layer off, «Точки» on, address reset,
  districts on at 4 %; all visible sliders filled by value; legend names
  inside the frame; no uppercase-transformed text on the page.
- Cache version `20261025e`.

## 2026-10-25 — «Границы» moved to the bottom navigation

- Owner: the boundaries control should not sit above the map. It is now a
  tab in the bottom navigation right after «Точки» (`#tab-bounds`, keyboard
  shortcut 3); the button and popover above the map are gone, the city bar
  keeps the city filter and «Город».
- The tab badge shows how many zones are selected. Drawing a zone on a phone
  slides the side panel away to free the map and brings the «Границы» tab
  back afterwards; on desktop the tab stays open while drawing.
- Six tabs fit at 360–390px: tighter tab padding on phones, labels are not
  truncated.
- Verified in a browser at 1300, 390 and 360px: tab order Карта · Точки ·
  Границы · Рекомен. · Адреска · Админ, districts listed, rectangle drawn from
  the tab, badge = 1 after selecting a district; the boundary, export,
  persistence, viewer and GeoJSON suites pass.
- Cache version `20261025f`.

## 2026-10-25 — Skills ui-ux-pro-max and 21st MCP; design system v2

- Added to the project:
  - `.claude/skills/ui-ux-pro-max/` — nextlevelbuilder/ui-ux-pro-max-skill
    (MIT, licence kept next to it): offline search over styles, palettes,
    typography and 119 UX rules; scripts reviewed — no network, no shell-outs;
    its test suite is not copied.
  - `.claude/skills/21st-ui/` + `.mcp.json` — 21st MCP (the former Magic MCP,
    21st-dev/magic-mcp, ISC). HTTP server `https://21st.dev/api/mcp`; the key
    is read from the `API_KEY_21ST` environment variable and is not in the
    repo. Without a key the server answers 401, so it was not used for this
    pass; its components are React/Tailwind and would be adapted by hand
    anyway.
- Design system generated by the skill (`--design-system`, analytics
  dashboard, variance 3 / motion 3 / density 8) and persisted to
  `design-system/heatmap/MASTER.md`, rewritten for the project: Minimalism &
  Swiss style taken; Fira fonts and the navy/amber palette replaced by the
  owner's rules (Inter only, brand teal); the landing-page pattern and GSAP
  scroll reveal dropped as not applicable.
- Measured with a browser audit script against the skill's checklist,
  before → after (all six tabs, 1300 px):
  - text contrast below 4.5:1: 19 → 0 (`--dim` #9AA5B8 → #647086,
    `--acc-d` #0E96A8 → #097382, green text #0E9463 → #0A7A52; white text on
    the brand teal moved to `--acc-d` fills);
  - text under 11 px: 17 → 0;
  - targets under 24 px: icon buttons 22 → 28 px (36 on touch), switches
    34×19 → 40×24 (44×26 on touch), links and chips ≥ 26 px;
  - emoji used as icons: 🗺 🗂 ✎ 📍 ⬇ ⬆ 📷 📏 📋 👁 → Lucide SVG; map icons keep
    their stored emoji ids for compatibility and are drawn by `mapIconHtml()`;
  - one visible keyboard focus ring for every control;
  - flatter Swiss cards (1px borders instead of shadows), one accent — slider
    values in ink instead of green/teal.
  The same audit is clean at 375, 768 and 1440 px; six tab labels fit without
  truncation at 360–1440 px.
- Cache version `20261025g`.

## 2026-10-26 — Density zones («как на погодной карте») for all layers

- Owner showed a weather dashboard with smooth nested contour zones and asked
  for the same effect on his layers, with a selectable palette.
- Heat layers: new «Вид: Пятна / Зоны» switch under «Размер пятна». In zones
  mode leaflet.heat spots are replaced by 6 nested smoothed bands of point
  density: a wide pale edge, a saturated core, soft fill (SVG blur) and thin
  outlines. Point layers: «Зона плотности» switch in the layer settings.
- How: Gaussian kernel density (d3-contour 4.0.2 + d3-array 3.2.4 from
  jsdelivr, 23 KB, loaded only when zones are on). Kernel = «Размер пятна» ×
  30 m, so shapes keep their geography when zooming. Thresholds run from 7 %
  to 85 % of the whole layer's peak density (binned estimate, not the visible
  part), so colours don't jump while panning; verified: same bands and
  colours at zoom 12 and 13. «Интенсивность» drives fill saturation.
- Palette: each layer's own — the 4 presets, own colour or own gradient. A
  fifth preset «Светофор» (green → yellow → orange → red, ColorBrewer RdYlGn)
  matches the reference picture. Point layers now remember a chosen preset
  (`ramp`) so their zone uses the full palette, not just two colours.
- Zones follow the city filter and «Границы» (same filtered records), the
  «Тепловая карта» switch and the blend mode; counters and legend unchanged.
- State: `heatStyle`, point layer `density` and `ramp` — snapshot, apply,
  fingerprint.
- Cache version `20261025h`.

## 2026-10-26 — Intensity scale for density zones

- As in the owner's reference: for every layer drawn with zones, a scale
  card above the legend — «Мало» … «Много» over a bar in the layer's band
  colours, and under it an ⓘ hint plus the layer name (long names end with
  an ellipsis, first letter capitalised). Several zone layers stack in one
  card; no zones — no card.
- The end labels take the palette's edge colours, darkened until they reach
  4.5:1 on white (measured 4.8–10.5). On phones the card sits above the city
  bar instead of the hidden legend.
- Verified in a browser at 1300 and 390 px: two scales for a heat layer and a
  point layer, no overlap with the legend or the city bar, scales follow the
  Пятна/Зоны switch and the «Зона плотности» toggle; UI audit stays clean.
- Cache version `20261025i`.

## 2026-10-26 — Address program: distances without limits

- Owner: «ближе чем» stopped at 1 km (and «Расстояние до» at 10 km) — no
  limits wanted.
- Both distances now have a number field with a unit (м / км) that takes any
  value above zero, plus a logarithmic slider from 10 m to 300 km (precise in
  metres, quick over long distances). A typed value beyond 300 km is kept and
  the slider simply sits at the end. Changing the unit re-reads the same
  number («2» + «км» = 2 km); zero or empty is not accepted and the field
  returns to the value in force.
- `fmtD` prints whole kilometres from 100 km up.
- Verified in a browser: defaults 1 km / 150 m, 25 km typed into «ближе
  чем», 1200 km accepted with the slider at the end, slider middle ≈ 1.75 km,
  left end 10 m, zero rejected, state keeps 1 200 000 m, the address filter
  runs; UI audit clean.
- Cache version `20261025j`.

## 2026-10-26 — Address program legend: references inside vs outside the city

- Owner's case: Tashkent in «Только город» mode; the address program used one
  reference point outside the city (the nearest Bonds point lay beyond the
  boundary). The legend showed «Bonds Touch Tashkent 10» (the layer, filtered
  to the city) and again «Bonds Touch Tashkent 11» (all references used),
  which read as a contradiction.
- Now the preview keeps the used references per layer, split by
  `recInSelection()`: those inside are already the layer's own row, so only
  the outside ones get a row — «Bonds Touch Tashkent» with «за городом»
  under it and their count (1). If the reference layer is switched off, its
  inside references get their own row as well (they are drawn only as blue
  dots then). The note reads «за городом» for the city filter, «вне выбранных
  зон» for «Границы».
- The toast says the same and with proper plurals: «На карте: 4 точки ·
  4 ориентира, из них 1 за городом».
- Verified in a browser (Samarkand, «Только город», a candidate at the edge
  whose nearest reference lies just outside): legend 4 / 4 / «за городом 1»,
  no row with 5; with the layer off — 3 + «за городом 1»; UI audit clean.
- Cache version `20261025k`.

## 2026-10-26 — Boundary export follows «Только внутри / Только снаружи»

- Owner: the boundary export always took the points inside the selected
  zones, ignoring the chosen condition.
- Now the export uses the same condition as the map. The button reads
  «Выгрузить точки внутри / снаружи выбранных в Excel» and switches with the
  mode.
  - Inside: as before — sheet «Районы» with area and points per layer per
    district, each layer sheet with a «Район» column; file
    `tochki_v_rayonah_<date>.xlsx`.
  - Outside: points outside all selected zones; sheet «Районы» gives the
    count per layer outside and lists the excluded districts with their area;
    layer sheets keep exactly the layer's template columns; file
    `tochki_vne_rayonov_<date>.xlsx`.
- The city filter applies in both modes.
- Verified in a browser: district A selected — inside 6 points with
  «Район», outside 9 points (equal to what the map shows), summary sheets as
  described; UI audit clean.
- Cache version `20261026a`.

## 2026-10-27 — Fresh city figures and current Tashkent district boundaries

- Owner: make sure city information and district boundaries are current.
- City reference (`UZ_STATS`, `KG_STATS`) — only official figures, dated:
  - Uzbekistan population: Tashkent 3 278 512 on 01.10.2026 including the
    2026 census; Namangan 731.3k, Samarkand 607.6k, Andijan 506.0k on
    01.04.2026; all other cities on 01.01.2026 from the Nacstat dataset
    2.01.02.0001 (siat.stat.uz). Gone: Wikipedia 2016/2024, GoldenPages and
    «оценка» values. The census added +2.1 % nationally; city-level census
    results (except Tashkent) are not published yet. Denau is not published
    separately — its card shows the urban population of Denau district and
    says so.
  - Uzbekistan wages: Jan–Jun 2026 by region (national 7.09 mln sum).
  - Kyrgyzstan: Bishkek 1 358.6k and Osh 484.9k on 01.01.2026; other towns
    keep the latest 2025 official estimates (2026 town figures not published,
    noted in the card); wages Jan–Aug 2026 by region.
  - Smoking: WHO 2024 estimates (2025 report) — unchanged, still the latest.
  - Fixed claims that became wrong: Samarkand is the 3rd city (after Tashkent
    and Namangan), not the 2nd; Bukhara's wage is above most regions but not
    «close to the national average»; Naryn's wage is 3rd among regions, not
    «above the national average».
- Tashkent districts: the polygons in `/data` predate the 2021–2022 city
  expansion (Sergeli 33 km² vs ~50 km² officially; the city 416 km² vs
  0.43 thousand km² by Nacstat for 2026). New `district-bounds.js` — current
  OSM boundaries of all 12 districts (simplified to ≈5 m, 438 km² in total,
  neighbours overlap < 0.1 km²) plus district population on 01.01.2026. They
  replace the base geometry in `applyData` by name; income tier stays from the
  base. The misspelt «Сергилийский» becomes «Сергелийский», saved selections
  are migrated. District tooltips show population. City boundaries in
  `city-bounds.js` were checked: OSM has not changed them since the
  23.10.2026 extract.
- Verified in a browser: all 12 districts take the new geometry, a point in
  the new part of Sergeli counts as «в городе», tooltip «178,7 тыс. жителей
  (01.01.2026)», selection migration, new figures in the city card; boundary,
  zone, export and address suites pass; UI audit clean.
- Cache version `20261027a`, `district-bounds.js?v=20261027a`.
