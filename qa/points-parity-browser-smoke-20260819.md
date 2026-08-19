# Points/layers parity browser smoke — 2026-08-19

A local static smoke was served from `/home/ubuntu/heatmaps` on port 4174. The frontend title loaded as `Heat Map · Сигареты + Стики · BR`; the page exposed the login shell, map controls, heat boost/radius/blend controls, tabs `Карта`, `Точки`, `Анализ`, `Город`, `Данные`, and Leaflet map controls. Browser console inspection returned no console output/errors. No credentials were entered and no production read/write endpoint was called.

The dynamic point-card behavior requires an authenticated state with point layers; structural regression checks separately verified the unified card markers, state defaults, solo/rename/update controls, cache-busters and CSS parity.


A synthetic DOM smoke was attempted without credentials. The current browser page context did not expose `applySnapshot`, `buildCustomPtUI`, `renderCustomPoints` or `customPtLayers`, and `#custom-pt-list` was absent, so the dynamic point-card assertion was not treated as passed. This is a page-context/loading limitation rather than a production result; the saved structural regression and static bundle checks remain the authoritative pre-deploy checks. No credentials or production endpoints were used.


After reloading the local page, the app context exposed the expected helpers. A synthetic state with two point layers was applied locally without credentials. The DOM smoke passed: 2 cards, 2 accordion headers, 2 unified visibility switches, 2 solo controls, 2 rename controls, 2 data-update controls, 2 size sliders, 2 opacity sliders; the hidden layer switch was off and cards were collapsed by default. No production endpoint or credential was used.


The local solo interaction smoke passed with both synthetic layers initially visible: visibility changed from `[true, true]` to `[true, false]` for the selected layer, then returned to `[true, true]` after toggling solo off. The test temporarily replaced `saveState` with a no-op and restored it afterward; it did not call production or mutate server data.
