# HST CC payload profile — 2026-08-14

## Production sample

The cached authenticated production HST CC layer has 39,525 records. Its source rows contain `lat`, `lon`, `vol` and `name`; address, code and hours are absent for this layer. The `name` field is categorical: all 39,525 rows use only 68 distinct values, with an average label length of 15.8 characters.

| Representation | Raw JSON | gzip body |
|---|---:|---:|
| Current object records | 2,592,893 chars | 107,080 B |
| Tuple `[lat, lon, vol, name]` | 1,604,768 chars | 96,277 B |
| Geometry/value tuple `[lat, lon, vol]` | 862,743 chars | 73,587 B |

The current server already enables Express compression. Therefore field packing alone is useful but cannot explain the entire observed 30.31-second HST `state/layer` request: the compressed body is already approximately 107 KB in the browser’s `CompressionStream` profile. The major perceived improvement should come from **progressive delivery**: send an immediate compact preview chunk, render it, and request remaining chunks in the background. A dictionary format can additionally encode the 68 repeated names once and reduce repeated string JSON.

## Recommended protocol

Use a new backward-compatible `GET /state/layer/chunk` endpoint protected by the existing session/map middleware. It accepts `map`, `layer`, `offset`, `limit` and `mode=compact`, returns `revision`, total/count/nextOffset and a dictionary-packed batch:

```json
{
  "_app": "hm-layer-chunk",
  "key": "custom_…",
  "revision": "…",
  "total": 39525,
  "offset": 0,
  "nextOffset": 4000,
  "names": ["…"],
  "rows": [[41.29912, 69.24081, 123.4, 3]]
}
```

The initial `limit` should be 4,000 records (about 10% of HST) and be spatially representative, using a deterministic stride/sample instead of taking only the first rows. The client expands tuple/dictionary rows, performs normal city/nearest-point enrichment, renders the preview immediately, then appends subsequent chunks through `requestIdleCallback`/small bounded batches. The existing full `/state/layer` endpoint remains for small layers and compatibility.

Full aggregate statistics continue to arrive in `/state/meta`, so legends, point counts and recommendation controls show correct layer totals before all HST records have arrived. Exact recommendations and exports should wait for the final chunk and show a clear non-blocking «Загружаем слой…» state while the progressive fetch completes.

## Local progressive client regression

Against an isolated authenticated server with 20,000 deterministic records, the new client requested five 4,000-record batches. The first batch became available to `ensureLayerRecords()` in **66.6 ms** and contained 4,000 records; all five requests completed within the 2-second observation window and the layer ended with `_recordsLoaded: true`, `_recordsLoading: false` and 20,000 expanded records. Local resource durations were 46.2 ms for the first chunk and 8.7–13.5 ms for subsequent chunks. The exact tuple/dictionary expansion restored `lat`, `lon`, `vol` and repeated `name` values; no full `/state/layer` request was used.

The local exactness check returned 20,000 records, 80 unique repeated names, first row `{lat:41.2, lon:69.1, name:"Outlet 00", vol:1}` and last row `{lat:41.2199, lon:69.1099, name:"Outlet 79", vol:500}`. All five chunk requests were present and the final layer flag was loaded.

## Production compact-chunk smoke test — 2026-08-14

After commit `6e36649`, production served `app.js?v=20260814d`. The cached full HST entry was removed only from the current browser’s IndexedDB; visibility and server state were not changed. The real HST CC layer then used ten compact `/state/layer/chunk` requests of 4,000 rows (the final batch had 3,525 rows). The first 4,000 records became available in **6.22 s**, while subsequent requests completed in **1.12–1.69 s** each; the layer reached `_recordsLoaded: true` with exactly **39,525** records. No full `/state/layer` request was made.

This is a clear first-use improvement over the previous single 30.31-second request: the map can show the first HST subset after the first chunk, and the remaining batches arrive progressively. The remaining 6.22-second first-chunk latency is dominated by Render/DB response time for the first batch and should be treated separately from client hydration.
