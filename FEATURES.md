# Heatmap App — Feature Tracking Spreadsheet

> **Legend** — Status: ✅ OK · ❌ Bug · ⚠️ UX issue · 🔲 Not tested  
> Last updated: 2026-08-14

---

## QA CYCLE LOG

**Phase 1 — Stories authored:** 90+ user stories across 9 categories (below).

**Phase 2 — Tested + documented (5 issues found):**
| ID | Type | Issue |
|---|---|---|
| A2 | ❌ Bug | Wrong-creds error had no shake animation |
| A11 | ⚠️ UX | Address-program export visible to viewers (decided: intentional, like rec export) |
| D1 | ⚠️ UX | Upload toast didn't tell user to press «Обновить карту» |
| D4 | ❌ Bug | Custom heat-layer delete didn't call saveState() |
| M3 | ⚠️ UX | "Все" didn't refit when combined data empty |

**Phase 3 — Fixed:**
- A2: added `@keyframes shake` + `animation: shake` on `.auth-field input.err`; reflow-retrigger so it re-fires on consecutive attempts
- D1: toast now reads "Загружено N точек — нажмите «Обновить карту»"
- D4: `saveState()` appended to delete handler
- M3: bounds now include own-points + `CC[city]` fallback
- A11: documented as intentional exception

**Phase 4 — Retested post-fix:** all 5 ✅ FIXED (verified by line). New features (coverage radius, solo isolate, keyboard shortcuts) ✅ correctly wired, no defects.

---

## NEW FEATURES (post-QA)

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| N1 | Toggle "Радиус охвата" on a point layer | Semi-transparent circle (default 1.5 km) drawn around each marker in `ptradius` pane | All | ✅ | |
| N2 | Adjust radius / fill opacity / radius color | Circles re-render live; persisted to server+localStorage | All | ✅ | |
| N3 | Click solo (◉) on heat layer | Isolates that layer; re-click restores prior visibility | All | ✅ | Fixes 2-3 layer overlap mush |
| N4 | Press keys 1-5 | Switches sidebar tabs (Карта/Точки/Анализ/Город/Данные); ignored while typing; skips hidden tabs | All | ✅ | Было 1-4 — вкладка «Город» была недостижима (исправлено 07.2026) |
| N6 | Tab/Space on a toggle | Custom `.cbx` switches are focusable (`role="switch"`), Space/Enter toggles, clicking the label works too | All | ✅ | a11y-проход 07.2026 |
| N7 | «По размеру» / стартовый вид | Frames the layers actually drawn; KG map still opens on Bishkek | All | ✅ | Раньше кадрировался по нерисуемому базовому датасету |
| N8 | Address program without reference points | Explicit toast «нет точек-ориентиров» instead of «нет точек по фильтрам» | All | ✅ | Проявлялось на карте KG |
| N5 | Mobile adaptation | Drawer width capped, larger touch targets, repositioned badges, safe-area, landscape | All | ✅ | |

---

## AUTH

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| A1 | User opens app | Login screen shown; map hidden; body.overflow hidden | All | ✅ | |
| A2 | User enters wrong creds | Red shake on fields, error msg 3 s, password cleared | All | ✅ | Fixed: added @keyframes shake to .auth-field input.err |
| A3 | User enters correct creds | "Входим…" 320 ms, then map-picker screen | All | ✅ | |
| A4 | Admin picks map (both enabled) | Both cards clickable; picking either unlocks map and calls startApp | Admin | ✅ | |
| A5 | Comdep picks map | Only "Com Dep" card clickable; "Другая" is `.locked` + disabled | Comdep | ✅ | |
| A6 | Other picks map | Only "Другая" card clickable; "Com Dep" is `.locked` + disabled | Other | ✅ | |
| A7 | User refreshes page after login | Session restored from the tab-scoped bearer token or retained cookie; correct map opens without re-login | All | ✅ | |
| A8 | User clicks Logout | sessionStorage cleared, page reloaded, login screen shown | All | ✅ | |
| A9 | Mode badge shown after login | Admin → "✏ Админ · [Map]" (blue); Viewer → "👁 [Map]" | All | ✅ | |
| A10 | Viewer sees no Data tab | Tab "⚙ Данные" is hidden (`body.viewer`) | Viewer | ✅ | |
| A11 | Viewer sees no upload/create/delete buttons | Upload btn, add-layer btn, layer delete btn, state import/export all hidden | Viewer | ✅ | Address program export intentionally visible to viewers (same as rec export) |
| A12 | GitHub Pages ↔ Render cookie is blocked | Login response token is kept in sessionStorage and sent as `Authorization: Bearer`; cookie remains a compatible fallback | All | ✅ | Local login → bearer `/auth/me` smoke test passed |

---

## DATA

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| D1 | Admin drags CSV/XLSX onto upload zone | File parsed; layer card appears; toast "Загружено N точек"; fname shows | Admin | ✅ | Fixed: toast now says "нажмите «Обновить карту»" to guide user |
| D2 | Admin clicks upload zone | File picker opens; same outcome as drag-drop | Admin | ✅ | |
| D3 | Admin downloads template | Excel file downloads with columns: name, lat, lon, value | Admin | ✅ | |
| D4 | Admin deletes a layer | Layer card removed; heat layer cleared from map; state saved | Admin | ✅ | Fixed: saveState() now explicitly called after layer delete |
| D5 | Admin exports state | JSON file downloads with timestamp in filename | Admin | ✅ | |
| D6 | Admin imports state JSON | State applied: all layers, settings restored; toast confirmation | Admin | ✅ | |
| D7 | Admin exports recommendations | Excel downloads with rank, zone, city, coords, demand, distance | Admin | ✅ | |
| D8 | Viewer tries to export recommendations | Button visible and functional (viewers can export recs) | Viewer | ✅ | |

---

## MAP

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| M1 | Map loads | 2GIS tile layer renders; initial center [41,67] zoom 6 or fits data bounds | All | ✅ | |
| M2 | User opens city filter and selects one or more cities | Compact popover with search and native pill multi-select; map uses a short smooth fly-to transition; heat/custom points/recs are filtered to the selected set | All | ✅ | Added 2026-08-13: Manrope/token-aligned pills, multi-select, 620 ms navigation, combined City summary, 60 km custom-point guard |
| M3 | User clears the city filter | All cities shown; compact trigger returns to «Все города»; map fits all heat and custom-point bounds using the same smooth navigation helper | All | ✅ | Fixed: bounds now include own-points so «Все города» always refits |
| M4 | Districts toggle ON | District polygons appear with fill + stroke; tooltip on hover | All | ✅ | |
| M5 | Districts toggle OFF | Polygons removed from map | All | ✅ | |
| M6 | Sidebar collapse button clicked | Sidebar slides out; reopen button floats on left edge | Desktop | ✅ | |
| M7 | Reopen button clicked | Sidebar slides back in; reopen button hidden | Desktop | ✅ | |
| M8 | Mobile: burger clicked | Sidebar opens; backdrop shown | Mobile | ✅ | |
| M9 | Mobile: backdrop clicked | Sidebar closes | Mobile | ✅ | |

---

## HEATMAP

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| H1 | Layer visibility checkbox toggled ON | Heat layer appears on map; legend updated; if records were intentionally deferred, they are fetched once before the layer becomes visible | All | ✅ | Lazy-on-toggle smoke test passed |
| H2 | Layer visibility checkbox toggled OFF | Heat layer removed from map; legend updated | All | ✅ | |
| H3 | Opacity slider moved | Canvas opacity changes in real-time | All | ✅ | |
| H4 | Intensity slider moved | Heat point scaling changes; re-renders immediately | All | ✅ | |
| H5 | Color ramp changed | Heat gradient updates immediately | All | ✅ | |
| H6 | "Custom" ramp selected | Color picker appears; hex color used for gradient | All | ✅ | |
| H7 | Heat boost slider moved | Canvas brightness/saturation CSS filter updates | All | ✅ | |
| H8 | Heat radius slider moved | Blur radius updates; heat spots larger/smaller | All | ✅ | |
| H9 | Blend mode changed | Canvas mix-blend-mode updates immediately | All | ✅ | |
| H10 | 2+ layers visible | Layer legend appears bottom-left with colored dots + names | All | ✅ | |
| H11 | 1 or 0 layers visible | Legend hidden | All | ✅ | |
| H12 | Admin adds new layer | Modal opens; name entered; layer card created with auto-color | Admin | ✅ | |
| H13 | Point count badge | Shows "Точек на карте: N" correctly after data load | All | ✅ | |
| H14 | All cities selected with a large dataset | Full selection uses canonical fast path, reuses normalized points/heat max and keeps warm redraws below 10 ms in the local 8,695-record benchmark | All | ✅ | Cold 46.80 ms; warm median 0.00 ms; warm p95 0.10 ms across 30 redraws |

---

## POINTS

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| P1 | ~~IQOS BR layer~~ | — | — | 🗑 | Закреплённый раздел «Наши точки · IQOS» удалён 07.2026 |
| P2 | ~~IQOS SE layer~~ | — | — | 🗑 | Все точки во вкладке «Точки» теперь и есть наши |
| P3 | Point color changed | Markers re-render with new color immediately | All | ✅ | |
| P4 | Point shape changed | Markers re-render with new shape immediately | All | ✅ | |
| P5 | Point clicked | Popup shows: name, address, hours, code | All | ✅ | |
| P6 | Point hovered | Tooltip shows name + layer name | All | ✅ | |
| P7 | Admin creates point layer | Modal; name + color; card appears in list | Admin | ✅ | |
| P8 | Admin uploads point CSV | Points appear on map; count shows in card; покрытие и рекомендации пересчитываются | Admin | ✅ | `reenrichAll()` |
| P9 | Custom point layer visibility toggled | Points appear/disappear | All | ✅ | |
| P10 | Custom point layer color changed | Markers re-color | All | ✅ | |
| P11 | Admin deletes point layer | Card removed; markers cleared; покрытие пересчитано | Admin | ✅ | |
| P12 | Points tab badge | Shows "N/M" (visible/total layers) | All | ✅ | |
| P13 | Точки удалены/добавлены | `nd` во всех тепловых слоях пересчитывается, рекомендации и метрика города обновляются | Admin | ✅ | Сверено с брутфорсом |
| P14 | Наших точек нет вообще | Расстояния «—», адресная сообщает «нет точек-ориентиров», метрика города «—» | All | ✅ | |

---

## RECOMMENDATIONS

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| R1 | Recs basis changed (cig/sticks/combined) | Pins re-render; summary panel updates; list updates; deferred records are fetched once before calculation | All | ✅ | |
| R2 | Coverage radius slider moved | Zones re-computed; summary updates | All | ✅ | |
| R3 | Top-N slider moved | Pin count changes on map + in list | All | ✅ | |
| R4 | Show-on-map toggle ON | Green numbered pins appear | All | ✅ | |
| R5 | Show-on-map toggle OFF | Pins removed from map | All | ✅ | |
| R6 | Rec item clicked in list | Map flies to zone; popup opens | All | ✅ | |
| R7 | "Show N more" clicked | Hidden rec items expand with animation | All | ✅ | |
| R8 | Rec pin clicked | Popup with zone name, demand, basis, distance, count | All | ✅ | |
| R9 | Export recommendations | Excel downloaded; contains top-N rows with all columns | All | ✅ | |
| R10 | City filter active | Recs show only zones in selected city | All | ✅ | |
| R11 | Summary panel shows correct stats | Count, uncovered demand %, basis label all accurate | All | ✅ | |

---

## ADDRESS PROGRAM

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| AP1 | Source dropdown changed | Step 3 (volume block) hidden if custom points selected | All | ✅ | |
| AP2 | Reference layer changed | Distance calc uses selected reference layer | All | ✅ | |
| AP3 | Distance operator + slider set | Filter uses operator (≤/≥/</>/=) + value | All | ✅ | |
| AP4 | Volume mode = average | Threshold auto-computed from sample mean | All | ✅ | |
| AP5 | Volume mode = custom | Input field shown; user enters manual threshold | All | ✅ | |
| AP6 | Exclusion layer selected | Points within excl-radius of that layer removed from result | All | ✅ | |
| AP7 | Preview button clicked | Orange markers + blue refs + dashed lines drawn on map | All | ✅ | |
| AP8 | Export button clicked | Excel with results sheet + parameters sheet downloaded | All | ✅ | |
| AP9 | City filter active | Address program respects city filter | All | ✅ | |

---

## SYNC

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| S1 | App loads (server awake) | Badge: "Загрузка…" → "Обновлено HH:MM" within ~3 s | All | ✅ | Authenticated requests use authFetch with bearer token when available and cookie fallback |
| S2 | App loads (server cold-start) | Badge: "Загрузка…" → "Сервер пробуждается…" after 5 s → "Обновлено" when done | All | ✅ | |
| S3 | Admin changes any setting | Compact manifest auto-saved to localStorage, loaded records stored versioned in IndexedDB, and shared state pushed to server | Admin | ✅ | Lazy omitted records are preserved server-side |
| S4 | Sync success | Badge shows green dot + "Обновлено HH:MM DD.MM" | Admin | ✅ | |
| S5 | Sync fails (network) | Badge shows red dot + "Сервер недоступен"; retries in 6 s | Admin | ✅ | |
| S6 | Server empty, admin has local copy | Admin's local state pushed to server on load | Admin | ✅ | |
| S7 | Viewer loads (server has data) | Server state applied; toast "Настройки загружены с сервера" | Viewer | ✅ | |
| S8 | Viewer loads (server fails) | Falls back to IndexedDB manifest/layer cache and compact localStorage compatibility snapshot; badge «Локальные данные» | Viewer | ✅ | |
| S9 | Server times out (55 s) | Badge "Сервер не отвечает (перезагрузите)" | All | ✅ | |
| S10 | Authenticated startup with large custom layers | `/data` and `/state` start concurrently; local state remains usable while the server snapshot hydrates; exact nearest-point lookup uses VP-tree and hidden-layer density is deferred | All | ✅ | Live bundle `20260814a`; 64,777 records loaded, 0 nearest-distance mismatches |
| S11 | Repeat authenticated startup | IndexedDB restores cached dataset, compact state manifest and already-used layers; server only revalidates `/data/meta` and `/state/meta` when revisions match | All | ✅ | Local end-to-end trace has no full `/data`, `/state` or `/state/layer` on repeat open |
| S12 | Map has hidden custom layers | `/state/meta` returns settings/stats only; records reach the browser only for visible layers, current recommendation basis, Solo or an explicit toggle | All | ✅ | Protected `/state/layer` and lazy save merge regression tests passed |
| S13 | User enables a large heat layer | Compact `/state/layer/chunk` batches return a first usable subset quickly, append in the background, preserve exact row values and finish with the full record count | All | ✅ | 20,000-record local fixture: first 4,000 in 66.6 ms, five chunks, exact 20,000 reconstruction |
| S14 | Legacy client requests full layer | Existing `/state/layer` remains available with the original object-record response | All | ✅ | Compact route is additive and protected by the same session/map access middleware |

---

## UI/UX

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| U1 | Tab switching | Clicking tab makes that panel active; others hidden | All | ✅ | |
| U2 | Toast notification | Appears bottom-centre; auto-dismiss 2.8 s; stacks correctly | All | ✅ | |
| U3 | Range slider fill | Gradient fill shows filled vs unfilled portion in real-time | All | ✅ | |
| U4 | Layer card expand | Clicking layer header expands controls (opacity, intensity, ramp) | All | ✅ | |
| U5 | Info tooltip (tip-icon) | Hover shows explanation text; no overlap with UI | All | ✅ | |
| U6 | District polygon tooltip | Hover shows district name + tier | All | ✅ | |
| U7 | Map popup styling | Custom theme (dark bg, white text, rounded corners) | All | ✅ | |
| U8 | City bar layout | Floating bar on map; city buttons + districts toggle side by side | All | ✅ | |
| U9 | Map picker cards | Cards styled correctly; locked card visually greyed out | All | ✅ | |
