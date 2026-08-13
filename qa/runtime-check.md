# Runtime check — 2026-08-13

Production page loaded at `https://ekzotik-inc.github.io/heatmaps/` and showed the login screen while the application shell and Leaflet map were initialized. The runtime exposes `renderHeat` as a function, `DS` with `cig` and `sticks` layers, a Leaflet `map`, and `L`; `heatKeys` and `CITIES` are empty before authenticated data loading. This confirms the app can be instrumented after injecting controlled test data, but the real production dataset remains protected behind `/auth/login`.
