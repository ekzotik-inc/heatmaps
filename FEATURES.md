# Heatmap App — Feature Tracking Spreadsheet

> **Legend** — Status: ✅ OK · ❌ Bug · ⚠️ UX issue · 🔲 Not tested  
> Last updated: 2026-06-22

---

## AUTH

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| A1 | User opens app | Login screen shown; map hidden; body.overflow hidden | All | 🔲 | |
| A2 | User enters wrong creds | Red shake on fields, error msg 3 s, password cleared | All | 🔲 | |
| A3 | User enters correct creds | "Входим…" 320 ms, then map-picker screen | All | 🔲 | |
| A4 | Admin picks map (both enabled) | Both cards clickable; picking either unlocks map and calls startApp | Admin | 🔲 | |
| A5 | Comdep picks map | Only "Com Dep" card clickable; "Другая" is `.locked` + disabled | Comdep | 🔲 | |
| A6 | Other picks map | Only "Другая" card clickable; "Com Dep" is `.locked` + disabled | Other | 🔲 | |
| A7 | User refreshes page after login | Session restored from sessionStorage; correct map opens without re-login | All | 🔲 | |
| A8 | User clicks Logout | sessionStorage cleared, page reloaded, login screen shown | All | 🔲 | |
| A9 | Mode badge shown after login | Admin → "✏ Админ · [Map]" (blue); Viewer → "👁 [Map]" | All | 🔲 | |
| A10 | Viewer sees no Data tab | Tab "⚙ Данные" is hidden (`body.viewer`) | Viewer | 🔲 | |
| A11 | Viewer sees no upload/create/delete buttons | Upload btn, add-layer btn, layer delete btn, state import/export all hidden | Viewer | 🔲 | |

---

## DATA

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| D1 | Admin drags CSV/XLSX onto upload zone | File parsed; layer card appears; toast "Загружено N точек"; fname shows | Admin | 🔲 | |
| D2 | Admin clicks upload zone | File picker opens; same outcome as drag-drop | Admin | 🔲 | |
| D3 | Admin downloads template | Excel file downloads with columns: name, lat, lon, value | Admin | 🔲 | |
| D4 | Admin deletes a layer | Layer card removed; heat layer cleared from map; state saved | Admin | 🔲 | |
| D5 | Admin exports state | JSON file downloads with timestamp in filename | Admin | 🔲 | |
| D6 | Admin imports state JSON | State applied: all layers, settings restored; toast confirmation | Admin | 🔲 | |
| D7 | Admin exports recommendations | Excel downloads with rank, zone, city, coords, demand, distance | Admin | 🔲 | |
| D8 | Viewer tries to export recommendations | Button visible and functional (viewers can export recs) | Viewer | 🔲 | |

---

## MAP

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| M1 | Map loads | 2GIS tile layer renders; initial center [41,67] zoom 6 or fits data bounds | All | 🔲 | |
| M2 | User clicks city button (e.g. Ташкент) | Map flies to city bounds; heat/points/recs filtered to that city | All | 🔲 | |
| M3 | User clicks "Все" city button | All cities shown; map fits all data bounds | All | 🔲 | |
| M4 | Districts toggle ON | District polygons appear with fill + stroke; tooltip on hover | All | 🔲 | |
| M5 | Districts toggle OFF | Polygons removed from map | All | 🔲 | |
| M6 | Sidebar collapse button clicked | Sidebar slides out; reopen button floats on left edge | Desktop | 🔲 | |
| M7 | Reopen button clicked | Sidebar slides back in; reopen button hidden | Desktop | 🔲 | |
| M8 | Mobile: burger clicked | Sidebar opens; backdrop shown | Mobile | 🔲 | |
| M9 | Mobile: backdrop clicked | Sidebar closes | Mobile | 🔲 | |

---

## HEATMAP

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| H1 | Layer visibility checkbox toggled ON | Heat layer appears on map; legend updated | All | 🔲 | |
| H2 | Layer visibility checkbox toggled OFF | Heat layer removed from map; legend updated | All | 🔲 | |
| H3 | Opacity slider moved | Canvas opacity changes in real-time | All | 🔲 | |
| H4 | Intensity slider moved | Heat point scaling changes; re-renders immediately | All | 🔲 | |
| H5 | Color ramp changed | Heat gradient updates immediately | All | 🔲 | |
| H6 | "Custom" ramp selected | Color picker appears; hex color used for gradient | All | 🔲 | |
| H7 | Heat boost slider moved | Canvas brightness/saturation CSS filter updates | All | 🔲 | |
| H8 | Heat radius slider moved | Blur radius updates; heat spots larger/smaller | All | 🔲 | |
| H9 | Blend mode changed | Canvas mix-blend-mode updates immediately | All | 🔲 | |
| H10 | 2+ layers visible | Layer legend appears bottom-left with colored dots + names | All | 🔲 | |
| H11 | 1 or 0 layers visible | Legend hidden | All | 🔲 | |
| H12 | Admin adds new layer | Modal opens; name entered; layer card created with auto-color | Admin | 🔲 | |
| H13 | Point count badge | Shows "Точек на карте: N" correctly after data load | All | 🔲 | |

---

## POINTS

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| P1 | IQOS BR layer toggled ON | Teardrop markers appear on map | All | 🔲 | |
| P2 | IQOS SE layer toggled ON | Hex markers appear on map | All | 🔲 | |
| P3 | Point color changed | Markers re-render with new color immediately | All | 🔲 | |
| P4 | Point shape changed | Markers re-render with new shape immediately | All | 🔲 | |
| P5 | Point clicked | Popup shows: name, channel, city, address, hours | All | 🔲 | |
| P6 | Point hovered | Tooltip shows name + layer type | All | 🔲 | |
| P7 | Admin creates custom point layer | Modal; name + color; card appears in custom list | Admin | 🔲 | |
| P8 | Admin uploads custom point CSV | Points appear on map; count shows in card | Admin | 🔲 | |
| P9 | Custom point layer visibility toggled | Points appear/disappear | All | 🔲 | |
| P10 | Custom point layer color changed | Markers re-color | All | 🔲 | |
| P11 | Admin deletes custom point layer | Card removed; markers cleared from map | Admin | 🔲 | |
| P12 | Points tab badge | Shows "N/M" (visible/total layers) | All | 🔲 | |

---

## RECOMMENDATIONS

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| R1 | Recs basis changed (cig/sticks/combined) | Pins re-render; summary panel updates; list updates | All | 🔲 | |
| R2 | Coverage radius slider moved | Zones re-computed; summary updates | All | 🔲 | |
| R3 | Top-N slider moved | Pin count changes on map + in list | All | 🔲 | |
| R4 | Show-on-map toggle ON | Green numbered pins appear | All | 🔲 | |
| R5 | Show-on-map toggle OFF | Pins removed from map | All | 🔲 | |
| R6 | Rec item clicked in list | Map flies to zone; popup opens | All | 🔲 | |
| R7 | "Show N more" clicked | Hidden rec items expand with animation | All | 🔲 | |
| R8 | Rec pin clicked | Popup with zone name, demand, basis, distance, count | All | 🔲 | |
| R9 | Export recommendations | Excel downloaded; contains top-N rows with all columns | All | 🔲 | |
| R10 | City filter active | Recs show only zones in selected city | All | 🔲 | |
| R11 | Summary panel shows correct stats | Count, uncovered demand %, basis label all accurate | All | 🔲 | |

---

## ADDRESS PROGRAM

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| AP1 | Source dropdown changed | Step 3 (volume block) hidden if custom points selected | All | 🔲 | |
| AP2 | Reference layer changed | Distance calc uses selected reference layer | All | 🔲 | |
| AP3 | Distance operator + slider set | Filter uses operator (≤/≥/</>/=) + value | All | 🔲 | |
| AP4 | Volume mode = average | Threshold auto-computed from sample mean | All | 🔲 | |
| AP5 | Volume mode = custom | Input field shown; user enters manual threshold | All | 🔲 | |
| AP6 | Exclusion layer selected | Points within excl-radius of that layer removed from result | All | 🔲 | |
| AP7 | Preview button clicked | Orange markers + blue refs + dashed lines drawn on map | All | 🔲 | |
| AP8 | Export button clicked | Excel with results sheet + parameters sheet downloaded | All | 🔲 | |
| AP9 | City filter active | Address program respects city filter | All | 🔲 | |

---

## SYNC

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| S1 | App loads (server awake) | Badge: "Загрузка…" → "Обновлено HH:MM" within ~3 s | All | 🔲 | |
| S2 | App loads (server cold-start) | Badge: "Загрузка…" → "Сервер пробуждается…" after 5 s → "Обновлено" when done | All | 🔲 | |
| S3 | Admin changes any setting | State auto-saved to localStorage + pushed to server within 400 ms | Admin | 🔲 | |
| S4 | Sync success | Badge shows green dot + "Обновлено HH:MM DD.MM" | Admin | 🔲 | |
| S5 | Sync fails (network) | Badge shows red dot + "Сервер недоступен"; retries in 6 s | Admin | 🔲 | |
| S6 | Server empty, admin has local copy | Admin's local state pushed to server on load | Admin | 🔲 | |
| S7 | Viewer loads (server has data) | Server state applied; toast "Настройки загружены с сервера" | Viewer | 🔲 | |
| S8 | Viewer loads (server fails) | Falls back to localStorage; badge "Локальные данные" | Viewer | 🔲 | |
| S9 | Server times out (55 s) | Badge "Сервер не отвечает (перезагрузите)" | All | 🔲 | |

---

## UI/UX

| # | User Story | Expected Behaviour | Role | Status | Notes |
|---|---|---|---|---|---|
| U1 | Tab switching | Clicking tab makes that panel active; others hidden | All | 🔲 | |
| U2 | Toast notification | Appears bottom-centre; auto-dismiss 2.8 s; stacks correctly | All | 🔲 | |
| U3 | Range slider fill | Gradient fill shows filled vs unfilled portion in real-time | All | 🔲 | |
| U4 | Layer card expand | Clicking layer header expands controls (opacity, intensity, ramp) | All | 🔲 | |
| U5 | Info tooltip (tip-icon) | Hover shows explanation text; no overlap with UI | All | 🔲 | |
| U6 | District polygon tooltip | Hover shows district name + tier | All | 🔲 | |
| U7 | Map popup styling | Custom theme (dark bg, white text, rounded corners) | All | 🔲 | |
| U8 | City bar layout | Floating bar on map; city buttons + districts toggle side by side | All | 🔲 | |
| U9 | Map picker cards | Cards styled correctly; locked card visually greyed out | All | 🔲 | |
