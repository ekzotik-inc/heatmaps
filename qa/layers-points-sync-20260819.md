# Layers/Points state synchronization check — 2026-08-19

The production GitHub Pages shell loaded successfully. The existing browser session had a populated login form; the login action was initiated without recording credential values. No write or configuration action was performed. The comparison continues after map selection.


After login and opening Com Dep, the production UI loaded the shared map. The visible badges were `1/6` for heat layers and `1/4` for point layers; the map showed 178 rendered point markers. The layer sidebar and points list were both present and usable. No settings were changed.


The initial DOM/runtime snapshot showed `1/6` heat badge, `1/4` point badge, one rendered Leaflet canvas and 58 marker icons. The only storage key matching layer/state naming was the non-credential `hm_state_hm_root_comdep` local cache; sessionStorage had no matching entries. The shared `.lyr` selector included both heat and point cards, so a preliminary broad-card report appeared to disagree with `customPtLayers` for two point switches. This was treated as a selector ambiguity, not a defect, and requires a precise per-card switch inspection before scoring synchronization.


The precise inspection resolved the preliminary discrepancy. Each point card contains two switches: the first `data-cptoggle` switch controls layer visibility, while the second green switch controls the coverage-radius overlay. For all four point cards, the first switch's `aria-checked` matched `customPtLayers[].visible`: `[false, false, false, true]`. The broad selector had incorrectly counted the green radius switch for BR and IPSE.


After switching to `Точки`, the `Точки` tab became active while the `Карта` tab became inactive. The heat badge remained `1/6`, point badge remained `1/4`, all four point visibility switches matched runtime `[false, false, false, true]`, and the map retained 58 marker icons and one Leaflet canvas. The green coverage-radius states remained separate from visibility and did not alter the point visibility vector.


After switching back to `Карта`, the heat tab became active and the six heat visibility switches were `[true, false, false, false, false, false]`, with heat badge `1/6`. Point runtime/DOM remained `[false, false, false, true]`, with point badge `1/4`. The map retained 58 marker icons and one canvas. The round trip `Карта → Точки → Карта` did not change either layer family or their rendering.


A full reload returned the expected login shell and required the existing login/map-selection flow again, as in the prior reload check. This is an authentication/navigation behavior rather than a layers/points synchronization failure. No credentials were recorded and no write action was performed. The post-reload comparison will be taken after reopening Com Dep.


After the full reload, the existing login/map-selection flow reopened Com Dep successfully. The shared interface displayed heat badge `1/6`, point badge `1/4`, the same six heat cards and four point cards, and 178 map points in the visible shell. The final post-reload DOM/runtime state snapshot follows.


Final post-reload snapshot: heat visibility was `[true, false, false, false, false, false]`; point visibility was `[false, false, false, true]`, and each point `data-cptoggle` aria state matched runtime. Badges were `1/6` and `1/4`, `Карта` was active, the map had 58 markers and one Leaflet canvas. The only relevant storage entry was the non-credential local state cache `hm_state_hm_root_comdep`; no matching sessionStorage entries were present.

Conclusion: the shared layer/point state model is synchronized across tabs and survives the reload plus re-authentication/map-selection flow. No production write operation was performed.
