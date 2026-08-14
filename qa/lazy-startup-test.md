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
