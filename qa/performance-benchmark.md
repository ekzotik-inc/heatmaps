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

## Production city-filter smoke test — 2026-08-14

The live popover opened with **19 options**: `Все города`, the 7 original Uzbek cities and all 11 newly added cities, including Gulistan, Denau, Jizzakh, Zarafshan, Qarshi, Namangan, Nukus, Termez, Urgench, Shahrisabz and Chirchiq. Selecting Tashkent and then Nukus kept the popover open for multi-select; the trigger showed `Ташкент + 1` with count `2`, the City tab rendered a combined summary for 2 cities, recommendations were limited to the selected cities, the point badge changed from 6,871 to 2,602, and the map refit to the selected territory.

The smoke test was closed safely by clearing the filter. After the batched save window, the live runtime reported `selectedCities: []`, trigger `Все города`, point badge `6 871`, local snapshot `selectedCities: []`, and a green sync badge (`Обновлено 14.08, 04:05`).
