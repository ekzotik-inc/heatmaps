# Startup latency verification — 2026-08-18

## Findings

A fresh unauthenticated GitHub Pages session completed DOMContentLoaded in approximately 355 ms and load in approximately 434 ms. The Leaflet basemap requested 24 visible OpenStreetMap tiles; a browser-like tile request returned HTTP 200 in approximately 96 ms from the sandbox. The basemap is not the main startup bottleneck.

The authenticated KG production probe after commit `f84675c` returned:

| Request | First probe | Repeat probe |
|---|---:|---:|
| `/auth/login` | 1.84 s | — |
| `/data` (1,605,157 bytes after JSON read) | 2.25 s | 1.19 s |
| `/state/meta?map=kg` (3,221 bytes) | 2.37 s | 0.49 s |

The requests were performed in parallel after login and were read-only. Production health remained PostgreSQL-backed. The repeat state metadata response demonstrates the existing state/read cache path; the dataset cache reduces repeated database work but the 1.6 MB response still has network and JSON transfer cost.

## Change

`f84675c` added a five-minute server memory TTL for the immutable dataset read while retaining the 30-second state TTL and write invalidation behavior. The result is safer repeated startup without changing records or the client protocol.
