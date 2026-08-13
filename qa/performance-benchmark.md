# Performance benchmark — 2026-08-13

The benchmark was rerun against the **fresh local working-tree bundle** (`app.js?v=20260813f`) rather than the older production bundle. It injected **8,695 controlled records** into one heat layer and kept the city selection at the canonical all-cities state (`selectedCities = []`). The layer remained attached to Leaflet, the normalized-point cache contained 8,695 points, the heat-max cache contained one zoom/radius entry, and the point badge displayed `8 695`.

| Metric | Result |
|---|---:|
| Cold render | 46.80 ms |
| Warm median across 30 redraws | 0.00 ms |
| Warm p95 | 0.10 ms |
| Warm min / max | 0.00 / 0.10 ms |

This is the intended hot path: repeated all-cities redraws reuse the existing layer and skip DOM/legend work. The cold render remains bounded to one initial point normalization and heat-cell calculation; the warm path no longer performs per-record filtering, sorting, canvas recreation, or repeated legend rebuilding. The benchmark did not call any write endpoint and did not persist data.

## Selection transition smoke test

A second browser test changed the same 8,695-record layer to a partial selection (`Ташкент`) and back to all cities. The partial render counted **4,348** records; the all-cities render restored **8,695**. The same Leaflet layer object was retained across both transitions, confirming the setLatLngs/setOptions update path rather than canvas recreation.
