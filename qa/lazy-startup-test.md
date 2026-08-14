# Metadata-first lazy startup test — 2026-08-14

An isolated local Express server with a temporary `tester` admin user and a two-layer Com Dep fixture was started on port 3312. Login succeeded from the local frontend build on port 4180. The next validation step is map selection, followed by inspection of manifest caching and lazy record hydration. No production endpoint, state or credential was used.

The first local metadata-first bootstrap exposed a compatibility issue in the minimal fixture: layer metadata without an explicit `ramp`/valid custom color caused the existing gradient preview helper to receive an undefined color. This is a legacy/defaulting regression in `applySnapshot`/`buildHeatUI`, not an API or cache failure. The next edit will preserve existing visual defaults when compact metadata omits optional palette fields.

After preserving visual defaults for optional manifest fields, the local Com Dep startup completed successfully. The compact manifest rendered the two layer cards, the configured visible/recommendation layers hydrated, recommendations rendered, and the map showed the expected records. The earlier fixture save had intentionally changed both layer visibility values, so both records were correctly treated as eager in this run; a separate hidden-layer fixture will verify lazy-on-toggle behavior.

With a fresh manifest revision where Alpha is visible and Beta is hidden, startup rendered Alpha and its recommendations while Beta remained off-map. The map badge and legend reflected Alpha only. The next check inspects the runtime record flags and enables Beta to confirm its points are requested only on demand.

Runtime inspection confirmed that initial IndexedDB entries contained the dataset, state manifest and only `custom_alpha`; `custom_beta` had `_recordsLoaded: false` and zero in-memory records. Enabling Beta triggered its on-demand layer fetch, increased map points from 2 to 3, and added Beta to the legend. The lazy-on-toggle path therefore works end-to-end.

For the repeat-load test, the legacy localStorage snapshot was removed while IndexedDB remained intact. Reloading the same map restored Alpha from the cached manifest/layer entry and kept Beta lazy/off-map. The resulting visible points and recommendation output matched the first hidden-layer startup, demonstrating cache-first restoration without a second full-state hydration.

The repeat-load resource trace contained only `/auth/me`, `/state/meta?map=comdep` and `/data/meta`. It made no full `/data`, full `/state`, or `/state/layer` request. Runtime state retained Alpha as loaded with two records and Beta as unloaded with zero records. This confirms the versioned IndexedDB cache, lightweight revalidation, and no-repeat-hydration path.

The final local bundle (`20260814c`) repeated the same cache-first result: startup completed with Alpha loaded (2 records), Beta lazy (0 in memory), and only `/auth/me`, `/state/meta`, `/data/meta` in the API resource trace. This validates the final write-path update as well as the no-repeat-hydration behavior.

After adding revision-retention cleanup for IndexedDB, the final local repeat test remained correct: only `/auth/me`, `/state/meta?map=comdep` and `/data/meta` were requested; Alpha was loaded and Beta remained deferred. Old record revisions are now pruned per authenticated user/map when a newer state revision is cached.

## Production smoke test — 2026-08-14

After commit `873b149` deployed, the authenticated GitHub Pages bundle reported `app.js?v=20260814c` and `appStarted: true`. The first post-deploy production run used the new routes: `/auth/me` 5,899 ms, `/state/meta?map=comdep` 1,710 ms, `/data` 5,006 ms, and two `/state/layer` reads for the visible investment layer and recommendation-basis shipment-cigarette layer (3,409 ms and 4,445 ms). The browser did not request full `/state`.

All six production layer cards were present with server metadata and record counts. Only `отгрузка | сигареты` (10,608 records) and `Точки с инвестициями` (6,871 records) were hydrated; Re-TRAFFIC (1,524), sticks (5,224), HST CC (39,525) and Blands (1,025) remained `_recordsLoaded: false` with zero in-memory records. The production cache contained exactly the two loaded layer entries under revision `2026-08-14T04:51:19.101Z`.

A read-only production probe of the deferred 39,525-record HST CC layer exceeded the browser console task’s 30-second evaluation limit and was cancelled by the browser context before returning. This did not change visibility or invoke any write endpoint. The initial production startup remains verified; the HST on-demand path needs a separate longer-duration network/body measurement before claiming its user-perceived timing.

The asynchronous production HST probe completed: `/state/layer?map=comdep&layer=custom_1783079190431` took **30,310 ms** for the 39,525-record payload; after the body reached the browser, the client-side `ensureLayerRecords`/hydration path completed in **0.2 ms** in the probe callback. This confirms that deferred loading removes HST from first paint, but selecting HST still has a large network/body-read cost that would be the next optimization target (payload splitting or server-side compression/serialization).

A repeat production navigation returned to the login screen despite the prior tab session; the already-confirmed browser action resubmitted the prefilled credentials. No data write was initiated. The next check will inspect whether the authenticated repeat startup uses only metadata revalidation and cached layer entries.

The repeat production browser session was re-authenticated and Com Dep reopened successfully. The same six layer cards, Tashkent filter, recommendations and 2,335 visible points were restored, with no user data changes.

The repeat production trace confirmed the cache win: after login (2,413 ms) and session check (15,007 ms), only `/state/meta?map=comdep` (619 ms) and `/data/meta` (651 ms) were requested. There was no full `/data`, full `/state` or `/state/layer` request. The shipment-cigarette layer (10,608 records) and investment layer (6,871 records) were restored from IndexedDB; the other four remained deferred. The production bundle remained `app.js?v=20260814c` and `_activeStateRevision` matched `2026-08-14T04:51:19.101Z`.
