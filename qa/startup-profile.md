# Authenticated startup profile — 2026-08-14

The production browser session was already authenticated through the tab-scoped bearer token. Read-only timings show that the initial visible wait is dominated by sequential network calls and the large saved state payload, not JSON parsing.

| Request | Network to response | Body read | JSON parse | Payload chars |
|---|---:|---:|---:|---:|
| `/auth/me` (resource timing) | 3,605.2 ms | — | — | unavailable due cross-origin timing policy |
| `/data` (direct measurement) | 3,231.4 ms | 234.6 ms | 12.4 ms | 1,515,178 |
| `/state?map=comdep` (direct measurement) | 1,551.6 ms | 136.9 ms | 41.1 ms | 4,041,217 |

The Com Dep state carries 6 custom heat layers and 64,777 points. Current startup runs `ensureData()` before requesting `/state`, so network latency is additive; it also renders once from local state/defaults and then performs a second full UI/layer render after server state arrives. The priority optimization is to overlap the authenticated `/data` and `/state` reads and defer non-visible layers until the interactive first layer is ready.

## CPU findings

A clone of the 39,525-record `HST CC` layer confirmed that the new 0.005° density grid gives **zero** `ld` and `lc` mismatches against the current exact 700 m calculation, while computing the layer in 1,733.8 ms.

However, profiling the proposed deferred hydration path revealed that the dominant startup cost is still `enrichNd`: 12,639.4 ms across 64,777 records, including 7,355.3 ms for the 39,525-record layer. The current grid index falls back to repeated Haversine scans when a nearest own point is far away. The next optimization must accelerate exact nearest-own-point lookup before the deferred-density path can materially improve first load.

## Exact nearest-point validation

The VP-tree was evaluated against the existing production `nd` values for **all 64,777 records** and 103 own points. It produced **0 mismatches** and a maximum rounded-distance delta of `0`; the complete nearest-distance pass took **48.7 ms** after a 0.5 ms tree build. This replaces the previously profiled 12.6-second nearest-point hydration cost while preserving exact result values.
