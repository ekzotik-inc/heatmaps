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
