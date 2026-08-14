# Render cold-start options — 2026-08-14

Official Render documentation states that a Free web service is spun down after 15 minutes without inbound HTTP/WebSocket traffic and takes about one minute to start after the next request. Render explicitly recommends upgrading the service instance type to remove Free-instance limitations; changing a workspace plan alone does not do so.

| Option | Official basis | Suitability for Heatmaps |
|---|---|---|
| Upgrade the existing web service to Starter | Paid instance types remove Free limitations; Starter is listed at $7/month with 512 MB RAM and 0.5 CPU | Recommended: no sleep, same URL/deployment flow, 5× free-tier CPU |
| Keep Free and warm it with external HTTP pings | Free services still spin down after 15 minutes of no inbound traffic; any HTTP request wakes them | Workaround only: adds dependency/traffic, not a production guarantee, and can consume limits |
| Move API to another always-on provider | Not covered by Render docs; requires service migration | Only if avoiding paid Render is a hard requirement |
| Improve frontend first-load behavior | Existing Heatmaps optimization overlaps `/data` and `/state` and reduces client CPU; it cannot wake a stopped service | Complementary, already deployed |

Sources:
- https://render.com/docs/free
- https://render.com/pricing
- https://render.com/docs/web-services
