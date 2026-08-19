# API key and authorization token audit — 2026-08-18

## Scope

This is a defensive, read-only audit of the heatmaps frontend, Render Node/Express backend, PostgreSQL integration, Git history, browser storage, and production auth/CORS behavior. No password guessing, token replay, data export, or write endpoint was performed.

## Credential inventory

| Credential or material | Location | Purpose | Current exposure |
|---|---|---|---|
| `SESSION_SECRET` | Render Environment only | HMAC signing of session tokens | Server-side secret; not tracked |
| `AUTH_USERS_JSON` | Render Environment only | Usernames, roles, scrypt password hashes | Server-side secret; not tracked |
| `KG_AUTH_USER_JSON` | Render Environment only | Isolated KG credential override | Server-side secret; not tracked |
| `API_KEY` | Render Environment only; entered by owner into browser when needed | Gates admin writes | Not bundled, but stored in owner `localStorage` after entry |
| `DATABASE_URL` | Render Environment only | PostgreSQL connection | Server-side secret; not tracked |
| Signed session cookie `hm_session` | Browser cookie for Render origin | HttpOnly cross-site session fallback | `Secure`, `HttpOnly`, `SameSite=None`, 8-hour TTL |
| Signed bearer token | Login response JSON and tab `sessionStorage` | GitHub Pages to Render auth fallback | Readable by same-origin JavaScript/XSS; 8-hour TTL |
| Dataset/layer cache | IndexedDB and compact `localStorage` manifests | Faster startup/offline fallback | Readable by same-origin JavaScript; not encrypted at rest |

## Code and deployment observations

The backend signs tokens with HMAC-SHA256. Claims contain username, role, and expiration; every request rechecks the user and role against current `AUTH_USERS_JSON`. Map access is enforced server-side, not only by the UI. Reads require a valid session. Writes require both a valid admin session and `X-API-Key`.

The browser sends both credentials and bearer fallback. The bearer token is stored in `sessionStorage`, while the admin write key is stored in `localStorage`. Logout clears the browser cookie through `/auth/logout` and removes the bearer token, role, and map from session storage, but it cannot erase tokens or keys copied by a compromised script.

The frontend loads Leaflet and `leaflet.heat` from cdnjs without SRI, then dynamically loads the app bundle. There is no visible Content-Security-Policy. A compromise of a loaded script or same-origin XSS would therefore be able to inspect browser storage and issue authenticated requests.

The password hash generator uses scrypt with N=16384, r=8, p=1, a random 16-byte salt, and a 32-byte derived key. Git history scanning for common provider-token, private-key, and bearer-token signatures returned no matches outside documentation and the example configuration. `npm audit --omit=dev --audit-level=high` found no high or critical production vulnerabilities and one low body-parser advisory with a fix available.

The Render blueprint declares `API_KEY`, `SESSION_SECRET`, `AUTH_USERS_JSON`, and `ALLOWED_ORIGINS` as dashboard-only variables. It does not declare `KG_AUTH_USER_JSON` or `DATABASE_URL`, so Blueprint/configuration drift is possible if the service is recreated or re-synced without manual review.


## Production read-only probe

The KG credential smoke probe returned the following redacted results:

| Check | Result |
|---|---:|
| Login | HTTP 200; token issued; TTL 28,800 seconds |
| Session cookie | `HttpOnly`, `Secure`, `SameSite=None`, `Max-Age=28800`, `Path=/` |
| `/auth/me` with bearer | HTTP 200 |
| `/auth/me` without auth | HTTP 401 |
| KG role reading `kg` metadata | HTTP 200 |
| KG role reading `other` metadata | HTTP 403 |
| POST state without API key | HTTP 401 |
| Tampered bearer token | HTTP 401 |
| GitHub Pages CORS preflight | HTTP 204, exact allowlisted origin, credentials enabled |
| Foreign CORS preflight | HTTP 403, no allow-origin header |

The probe did not call any successful write endpoint, export data, or print a token/cookie value.


## External guidance used

OWASP Session Management guidance states that authentication tokens and session identifiers should not be stored in browser web storage when avoidable; it recommends protected cookie-based session handling, secure attributes, expiration, and invalidation. OWASP CSRF guidance notes that custom headers are a useful API defense because they trigger CORS preflight, but this protection depends on allowing only a small set of controlled origins and rejecting untrusted origins.


A separate cookie-only production probe returned login HTTP 200, a Set-Cookie header, `/auth/me` HTTP 200, and KG metadata HTTP 200 without sending an Authorization header. This confirms the HttpOnly cookie fallback is active and role-scoped.


## Residual lifecycle risks

The signed bearer token is self-contained and has no server-side session record or revocation identifier. A copied token remains valid until its eight-hour expiry, until the account role/password hash no longer matches, or until `SESSION_SECRET` is rotated. Logout clears the browser cookie and tab storage but cannot revoke a copied bearer token.

The write key is a single global secret for all owner browser sessions. It is not bundled, which is good, but once entered it is persisted in localStorage and is sent as `X-API-Key` on admin writes. Any same-origin XSS or compromised script can read it. The current write gate also uses direct string comparison; this is not a practical remote exploit by itself, but a constant-time comparison is preferable for defense in depth.

Login password verification uses synchronous scrypt and there is no visible IP/username rate limiter or lockout. A burst of invalid login requests can therefore consume Node event-loop/CPU capacity, and valid usernames may be distinguishable by work-factor timing. A dummy hash path and rate limiting are recommended.

CSRF posture is currently acceptable for the tested state writes because writes require the non-simple `X-API-Key` header in addition to admin session authorization, and production CORS now rejects untrusted origins. Logout remains cross-site-triggerable as a low-impact forced-logout action. A dedicated CSRF header/token would make the write contract explicit and provide defense in depth.


## Public asset scan

A production scan of `index.html` and `app.js?v=20260814g` found no scrypt hash marker, private-key marker, GitHub token signature, AWS access-key signature, OpenAI-style key signature, known test password, or `SESSION_SECRET=/AUTH_USERS_JSON=/API_KEY=` assignment. The public bundle contains only the expected Render API base URL and client-side names such as `SERVER_KEY`/`SESSION_TOKEN`, not secret values.

## Third-party script surface

`index.html` loads Leaflet 1.9.4 and leaflet.heat 0.2.0 from cdnjs without `integrity` or `crossorigin` attributes. It also loads the Manrope stylesheet from Google Fonts. The current SHA-384 fingerprints observed for the pinned JavaScript resources are:

| Resource | Observed SHA-384 SRI value |
|---|---|
| `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js` | `sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH` |
| `https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js` | `sha384-mFKkGiGvT5vo1fEyGCD3hshDdKmW3wzXW/x+fWriYJArD0R3gawT6lMvLboM22c0` |

These hashes should be re-verified immediately before any SRI deployment because CDN content or URL redirects can change. Self-hosting and pinning the exact files would reduce reliance on a runtime third party.

## Risk register

Priority meanings are **P1 — address before normal expansion or immediately after any credential exposure**, **P2 — planned hardening**, and **P3 — defense in depth / operational improvement**. The register below records the original findings and the current remediation status after the 2026-08-19 P1 hardening change.

| ID | Risk and observed condition | Priority | Impact | Recommended treatment and acceptance criterion |
|---|---|---:|---|---|
| R1 | Bearer session token was persisted in `sessionStorage`. | P1 — mitigated | A same-origin XSS can still read the in-memory fallback during the current page lifetime, but a refresh no longer restores a bearer token from storage. | Implemented cookie-first auth; bearer fallback is memory-only and legacy `hm_session_token` is removed at startup. Local regression passed cookie login and auth flow. Future improvement: remove bearer fallback after confirmed cross-site cookie compatibility. |
| R2 | The global owner `API_KEY` was persisted in `localStorage` and grants write access when combined with an admin session. | P1 — mitigated | A same-origin XSS can still read the in-memory key while the current page is open, but refresh no longer restores it. | Implemented memory-only admin key; legacy `hm_admin_key` is removed at startup and the UI states that re-entry is required after refresh. Future improvement: replace the global key with a server-side owner/admin session or scoped write capability. |
| R3 | Login password verification is synchronous scrypt and previously had no attempt limiter/dummy path. | P1 — mitigated | The current process now bounds repeated attempts and performs comparable scrypt work for unknown users. A multi-instance deployment would need shared limiter storage. | Implemented bounded in-memory limit: five failed attempts per 15 minutes across normalized IP+username and normalized-username buckets, `Retry-After` on HTTP 429, bounded bucket cleanup, and startup-generated dummy scrypt hash. Local regression passed 401×5 then 429, including case/whitespace variants. After the account fallback deployment, production passed five synthetic 401 responses followed by HTTP 429 with `Retry-After`. |
| R4 | The KG password was shared in conversation context and should be treated as exposed, even though the repository and public bundle do not contain it. | P1 | Anyone with access to that conversation or copied credentials could attempt KG login. | Rotate the KG password through the Render dashboard using a new scrypt hash; do not paste the replacement password into chat or commit it. Acceptance: new credential succeeds, old credential fails, and KG remains isolated to the KG map. |
| R5 | CDN Leaflet scripts are pinned by version but have no SRI; the app executes third-party JavaScript before login. | P2 | A modified CDN response or supply-chain incident could read browser storage and issue authenticated requests. | Add verified `integrity`/`crossorigin` attributes or self-host the exact assets. Acceptance: browser loads the assets with SRI and the map/login smoke test passes. |
| R6 | No Content-Security-Policy is visible on the GitHub Pages frontend. | P2 | A future injection flaw has fewer browser-enforced containment controls. | Introduce CSP in report-only mode, then enforce a policy compatible with the app’s inline boot/style code by using nonces/hashes or refactoring inline code. Acceptance: report-only violation review is clean, then enforced CSP blocks unauthorized script sources without breaking startup. |
| R7 | Signed tokens have no server-side session record or revocation identifier. | P2 | A copied bearer token is usable until expiry; logout cannot revoke a copied token. | Prefer short-lived access plus revocable HttpOnly refresh sessions, or add a server-side session identifier/revocation store. Rotate `SESSION_SECRET` after suspected compromise. Acceptance: logout/revocation invalidates a previously issued token without deleting data. |
| R8 | `render.yaml` is behind production: it omits `KG_AUTH_USER_JSON` and `DATABASE_URL`, and declares `plan: free` while production is intended to remain on Starter. | P2 | Blueprint resync/recreation can lose KG auth, database binding, or the non-sleeping plan. | Reconcile the Blueprint with the live service using dashboard-only `sync: false` entries for secrets and the correct Render database binding/plan. Do not put values in Git. Acceptance: a dry-run/review shows all required variables and the Starter plan before any resync. |
| R9 | PostgreSQL client configuration reportedly uses `rejectUnauthorized: false`. | P3 | TLS encryption may remain in place, but the client does not authenticate the database certificate. | Verify Render’s supported CA chain and enable certificate verification if the platform provides it. Acceptance: a staging/maintenance smoke test confirms database connectivity with verification enabled. |
| R10 | Direct string comparison is used for the global API key. | P3 | Timing leakage is theoretically possible, although not demonstrated as a practical remote exploit in this deployment. | Use a constant-time comparison after equal-length normalization and keep the key out of logs/errors. Acceptance: key behavior is unchanged and negative tests remain 401. |
| R11 | Cookie-based writes rely primarily on the custom `X-API-Key` preflight gate and strict CORS rather than a dedicated CSRF token. | P3 | A future endpoint that accepts a simple request or weakens CORS could reintroduce CSRF exposure. | Add an explicit CSRF header/token contract for state-changing routes and keep the exact origin allowlist. Acceptance: missing CSRF header is rejected while legitimate frontend writes pass. |

### Safe rotation and remediation order

The safest first action is credential hygiene without code changes: rotate the KG password and the global `API_KEY` through the Render dashboard, then validate only redacted status codes. Do not include replacement values in chat, Git, logs, screenshots, or QA evidence. Keep PostgreSQL `test_bd` active throughout this process.

The login throttling, dummy-hash path and browser credential storage mitigation were implemented as one compatible release. A production probe showed that the observed proxy IP could vary between requests, so the limiter was strengthened with a normalized-username fallback bucket and re-deployed. The follow-up production probe passed cookie-only auth, KG role isolation, unknown-user HTTP 401, five synthetic failed attempts HTTP 401 and the sixth HTTP 429 with `Retry-After`. The next hardening steps remain KG password rotation, removal of the in-memory bearer fallback after confirming cross-site cookie behavior, SRI/CSP, server-side token revocation and reconciliation of `render.yaml`. Do not resync the Blueprint blindly.

For any future `SESSION_SECRET` rotation, schedule a short re-login window: the rotation intentionally invalidates existing signed tokens, but it does not modify datasets. Validate login, `/auth/me`, role isolation, read metadata, and write authorization after the rotation. No successful write was used in this audit.

## References

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html "OWASP Session Management Cheat Sheet"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html "OWASP Cross-Site Request Forgery Prevention Cheat Sheet"
