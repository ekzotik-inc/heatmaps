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
