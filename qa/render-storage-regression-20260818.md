# Render storage regression — 2026-08-18

## Read-only production evidence

`GET https://hm-server-xpg0.onrender.com/health` returned HTTP 200 with:

```json
{"ok":true,"storage":"file","api":3,"authConfigured":true,"writeAuthConfigured":true}
```

This is a regression relative to the known healthy state, which reported `"storage":"postgresql"`. The server code selects PostgreSQL only when `DATABASE_URL` is present and the connection succeeds; otherwise it explicitly falls back to local file storage. The repository documentation states that without `DATABASE_URL`, state is written to a file and is ephemeral.

Unauthenticated read probes returned the expected HTTP 401 for `/data/meta`, `/state/meta?map=kg`, and `/state/layer/chunk?...`, confirming the web service and auth middleware are alive. No write endpoint was called and no Render configuration was changed during this check.

## Likely Render-side cause

The `DATABASE_URL` row is still visible in the Render Environment UI, but the live health signal proves the variable is currently empty/invalid or the linked PostgreSQL resource is unavailable. The most likely removed dependency is the PostgreSQL datastore or its service link/connection configuration. The application is therefore serving the ephemeral file fallback, so persisted datasets/layers are not available after restart and lazy layer reads can fail or return incomplete state.


## Recovery verification

Render Projects showed only `hm-server` active and the existing PostgreSQL service `test_bd` under `Suspended (7)` with status `Suspended by you`. The database was resumed; it reached `available` status. `hm-server` was then redeployed from the current repository commit so the process re-read the existing `DATABASE_URL` instead of retaining the earlier file fallback.

Post-recovery health returned:

```json
{"ok":true,"storage":"postgresql","api":3,"authConfigured":true,"writeAuthConfigured":true}
```

A read-only production smoke test then returned login 200 with role `kg`, `/auth/me` 200, `/data/meta` 200, `/state/meta?map=kg` 200, and the first compact layer chunk 200 with records. No POST/write endpoint was called; existing PostgreSQL and map data were preserved.
