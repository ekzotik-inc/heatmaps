# Security audit — 2026-08-18

## Initial production checks

Read-only endpoint checks showed:

- Unauthenticated `/data`, `/data/meta`, `/state/meta`, and `/state/layer/chunk` return HTTP 401.
- POST `/state` without `X-API-Key` returns HTTP 401.
- Production health remains PostgreSQL-backed and auth configured.
- CORS preflight with the allowed GitHub Pages origin returns HTTP 204 and the expected `Access-Control-Allow-Origin`.
- **CORS preflight with an unrelated origin (`https://evil.example`) also returned HTTP 204 and `Access-Control-Allow-Origin: https://evil.example`, with `Access-Control-Allow-Credentials: true`.**

The code explicitly allows all origins when `ALLOWED_ORIGINS` is empty. Because production cookies use `SameSite=None; Secure` and CORS allows credentials, this is a high-priority configuration vulnerability: a malicious website could potentially make credentialed cross-site requests and read responses while a user has an active cookie session. The bearer token in sessionStorage is origin-isolated, but the HttpOnly cookie is not sufficient protection when permissive credentialed CORS is active.

## Code-level surfaces requiring review

- Login returns a signed bearer token in JSON and the frontend stores it in sessionStorage; an XSS can read it during the 8-hour TTL.
- Admin `API_KEY` is stored in localStorage when entered in the Data tab; an XSS can read it and attempt owner writes.
- External CDN scripts are loaded without SRI/CSP protection.
- No visible rate limiting is configured for login or API routes.
- Read routes are session-protected and map-scoped; write routes additionally require the admin role and `X-API-Key`.


## Reference guidance

OWASP WSTG documents dynamic CORS reflection with `Access-Control-Allow-Credentials: true` as a sensitive-data exposure pattern when an attacker-controlled Origin is reflected. The production preflight result matches that pattern because the server reflects `https://evil.example` while credentials are enabled.


## Headers

The backend currently returns `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`. GitHub Pages provides HSTS. The backend response did not expose an application Content-Security-Policy or HSTS header in the read-only header check; this is a hardening gap, although TLS is still provided by the Render HTTPS endpoint.


## Dependencies and overall posture

The tracked repository contains no `.env`, private key, PEM, or secret-like file. `npm audit --omit=dev --audit-level=high` found no high or critical production vulnerabilities; it reported one low-severity `body-parser` advisory with an available fix.

The current positive controls are meaningful: all data reads require a signed session, map roles are checked against the requested map, writes require both an authenticated admin role and `X-API-Key`, the API key is not embedded in the repository, uploaded text is escaped before popups/tooltips, and the backend disables `x-powered-by` and sets basic security headers.

The dominant issue is not password cracking or an exposed PostgreSQL port. It is the production credentialed CORS configuration, followed by token/key exposure if an XSS or compromised third-party script occurs, absent login rate limiting, and the relaxed PostgreSQL certificate verification setting.
