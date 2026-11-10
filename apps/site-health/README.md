# Site Health

Public availability dashboard for Giorgi's first-party apps. Monitoring is deliberately limited to the eight hosts in `server/monitor.mjs`; no request parameter or frontend input can add targets.

## Build and check

```bash
node apps/site-health/build.mjs
node --test apps/site-health/tests/*.test.mjs
node scripts/health-browser.cjs
```

Nx equivalents: `npx nx build site-health` and `npx nx test site-health`.

The build produces `dist/apps/site-health/public/` and `dist/apps/site-health/server/`. The backend uses only Node built-ins and can serve both directories itself:

```bash
HOST=127.0.0.1 PORT=3350 HEALTH_DATA_DIR=/var/lib/giorgi-health HEALTH_RELEASE=<git-sha> node dist/apps/site-health/server/server.mjs
```

For a user-owned local test, choose a writable `HEALTH_DATA_DIR`. The production account should own only that directory; application files can stay read-only. Suggested systemd memory limit: 96 MB. No npm install is needed on the droplet.

## Routes and deployment

- `GET /health`: health of this monitor process, with no recursive probing.
- `GET /api/status`: stored public observations, incident transitions, TLS expiry, and aggregate response/uptime history. Snapshot computation is cached for five seconds.
- All other `/api/*` paths are 404, and non-read methods are 405.
- Static files are served from the sibling `public` directory. Nginx may instead serve that directory and proxy `/api/status` and `/health` to loopback port 3350.
- Nginx should forward `POST /api/analytics/event` to the existing central collector, like the other apps. The browser sends only a page-view event and referrer hostname, respecting DNT/GPC. No check target, response body, input or credentials are sent to analytics.

TLS is verified using `tls.connect` with the exact SNI hostname, then an HTTPS GET is checked against the same known service. A single five-second deadline bounds each full probe, including DNS and TLS. Redirects count as an available HTTP response but are not followed. Checks run every minute with concurrency two; cycles never overlap. Response bodies are not retained or downloaded in full.

Minute samples and bounded incident transitions are atomically persisted to `history.json`, retaining seven days of observations. Uptime means successful observations divided by actual observations, rather than invented coverage for time the monitor was not running. Charts leave gaps for unobserved buckets. Initial state is unknown. API exposes only a sanitized error category, public service metadata, measurements, timestamps and optional monitor build SHA.

## Browser verification

`node scripts/health-browser.cjs` starts a local server with deterministic observations, including downtime, stale data and a certificate warning; no external checks are run. It exercises detail selection, day/week ranges, real fixture history, expiry/incident presentation, mobile sizing and failed-fetch recovery.

For deployment verification against actual monitoring, set `HEALTH_URL=https://status.giorgi.app`. This skips fixtures and allows honest unknown/collecting-history states. The script supports `PLAYWRIGHT_MODULE=/path/to/playwright` and `CHROME_PATH=/usr/bin/google-chrome`.
