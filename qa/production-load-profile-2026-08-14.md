# Production load profile — 2026-08-14

Measured from the authenticated production browser on `app.js?v=20260814a`. Requests used `cache: no-store`; no application data or settings were changed.

| Endpoint | Sample | Network to response | Body read | JSON parse | JSON chars | HTTP |
|---|---:|---:|---:|---:|---:|---:|
| `/data` | 1 | 5,604.4 ms | 901.7 ms | 11.4 ms | 1,515,178 | 200 |
| `/data` | 2 | 1,168.4 ms | 698.5 ms | 12.9 ms | 1,515,178 | 200 |
| `/data` | 3 | 981.2 ms | 574.9 ms | 8.1 ms | 1,515,178 | 200 |
| `/state?map=comdep` | 1 | 1,215.4 ms | 757.6 ms | 29.1 ms | 4,041,217 | 200 |

The first `/data` sample represents residual service/cache warm-up; subsequent warm samples put the response-header time near 1.0–1.2 seconds. JSON parsing is negligible. The main remaining client-visible transfer cost is reading 1.52 MB of base data and 4.04 MB of saved state, particularly the latter, which contains six custom layers and 64,777 records. The live app has six layers, 64,777 heat records, and 6,871 visible points.

## Current frontend render timing

Measured on the live production state, without saving changes:

| Work | Production input | Time |
|---|---|---:|
| Cold `renderHeat()` | Visible `Точки с инвестициями`, 6,871 records | 24.8 ms |
| Warm cached `renderHeat()` | Same layer | 0.2 ms |
| `renderCustomPoints()` | 65 visible markers with radius + 38 hidden points | 16.5 ms |
| `renderRecs()` | `отгрузка | сигареты`, 10,608 records | 28.4 ms |
| `buildHeatUI()` + `buildCustomPtUI()` + `syncControls()` | 6 heat layers + 2 point layers | 7.0 ms |

The remaining delay is therefore overwhelmingly transfer/body-read time for authenticated payloads, not current heatmap, marker, recommendation, or UI rendering. The best next frontend gains come from retaining versioned local copies of `/data` and `/state`, avoiding unnecessary body re-downloads, and staging heavier invisible features after the first interactive paint.
