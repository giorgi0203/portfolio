# HTTP Playground and The Decision Department

- https://http-playground.giorgi.app is a browser-only learning simulation. Its illustrative DNS/TCP/TLS/cache/API timings are not a packet capture or real network measurement. No arbitrary outbound requests or AI credits are used.
- https://decisions.giorgi.app provides real guest rooms. Invite links allow reading/joining; host and participant credentials stay in each browser and are sent only in same-origin request headers. No signup is required. Votes are advisory; the host's server-authoritative spin gives every current choice an equal chance. These are casual decision rooms, not verified-identity elections.

Rooms expire seven days after creation. They persist across server restarts in `/var/lib/giorgi-decisions/rooms.sqlite`, separate from the existing identity/task database. Keep the host browser's site data to retain host controls; the public invite does not grant those controls. Hosts can delete rooms. Room HTML uses no-store/noindex and no-referrer. The site itself does not load Google Analytics.

`giorgi-decisions.service` runs Node 24 on loopback port 3360 as an isolated system user, limited to 128MB. Nginx handles HTTPS, static files, and the same-origin API. The simulator is static. Existing services and the parked cat remain unchanged.

## Release

1. Build/test the portfolio and both new projects with `NX_DAEMON=false npx nx run-many -t lint,test,build -p portfolio,http-playground,decision-department --parallel=2`.
2. Run `node scripts/new-apps-browser.cjs` (two real browser contexts and isolated SQLite) and `node scripts/seo-analytics-browser.cjs`.
3. Commit source, then run `python3 scripts/package-fun-apps.py`. Publish its archive on `deploy/fun-apps-artifacts` and pin its immutable commit/checksum in `.github/workflows/fun-apps-deploy.yml`.
4. The scoped installer stages disk-backed releases under `/var/www/giorgi-fun-apps`, preserves room data, provisions the two hosts' ACME certificate, verifies service/HTTPS, and restores previous service/static configuration on failure.
5. Publish a separately built portfolio artifact and update its scoped workflow after the new apps pass public checks.

The deploy workflow runs the same browser journeys over public HTTPS and deletes its synthetic room afterward. It never prints room credentials. The simulator's deterministic engine tests cover cache/fault semantics; backend HTTP tests cover persistence, authorization, race handling, limits and expiry. Browser room tests create no account or email and incur no AI charges.
