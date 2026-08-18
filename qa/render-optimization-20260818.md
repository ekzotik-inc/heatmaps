# Render load optimization QA — 2026-08-18

## Scope

Commit `75a1f29` implements five cost/load reductions for the heatmaps stack:

1. Removed the GitHub Actions keep-warm workflow; `hm-server` remains on Render Starter.
2. Added a bounded 30-second server cache for first compact chunks (`offset=0`), keyed by map, revision, layer, offset, and limit.
3. Added server single-flight state reads so concurrent metadata/chunk requests for the same map share one PostgreSQL query.
4. Added client single-flight chunk requests and confirmed that `app_state.key` is already the PostgreSQL primary key; no redundant secondary index was added.
5. Added fingerprint-based autosave deduplication so identical admin state is not POSTed again, while local IndexedDB/localStorage cache updates still occur.

## Local checks

- `node --check app.js` — passed.
- `node --check server/server.js` — passed.
- `npm run lint` — passed.
- `git diff --check` — passed.
- GitHub CI — success.
- GitHub Pages build and deployment — success.

## Production deployment

Render service `hm-server` shows commit `75a1f29` as live. GitHub Pages serves `app.js?v=20260814f` and the bundle contains `_layerChunkInFlight` and `_lastServerStateFingerprint`; the old `app.js?v=20260814e` reference is absent.

Production health remained PostgreSQL-backed:

```json
{"ok":true,"storage":"postgresql","api":3,"authConfigured":true,"writeAuthConfigured":true}
```

## Read-only smoke test

The test used the existing KG account and did not call any state/data write endpoint:

| Check | Result |
|---|---:|
| `/auth/login` | 200 |
| Role | `kg` |
| `/state/meta?map=kg` | 200 |
| First compact chunk | 200, 4,000 records, 1,637 ms |
| Repeated identical first chunk | 200, 4,000 records, 1,008 ms |
| Revision equality | true |

No user data, layer contents, credentials, or Render environment variables were modified by the smoke test.
