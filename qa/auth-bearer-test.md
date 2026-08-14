# Bearer authorization test — 2026-08-13

An isolated local server on port 3311 used a temporary scrypt user and test-only session secret. The HTTP test passed:

| Check | Result |
|---|---|
| `POST /auth/login` with valid test credentials | `200`; `ok: true`; token present; `expiresIn: 28800` |
| `GET /auth/me` with `Authorization: Bearer <token>` | `200`; correct username and role |
| CORS preflight from `http://127.0.0.1:4173` | Allows origin, credentials, `GET/POST/OPTIONS`, and `Authorization` header |
| `GET /auth/me` with invalid bearer | `401 Authentication required` |
| Production data/write endpoints | Not called; no production state changed |

## Production smoke test — 2026-08-14

After the user opened the authenticated browser session, the live runtime confirmed a tab-scoped session token without exposing its value. A read-only browser check returned `meStatus: 200` and `dataStatus: 200` with the bearer header, `DATA._loaded: true`, 6 loaded heat layers, 18 available cities, 64,777 heat-layer records and `selectedCities: []`.
