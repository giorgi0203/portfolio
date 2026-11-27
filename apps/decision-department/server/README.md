# Decision Department service

Runs on Node 24 using only `node:http`, `node:crypto`, and `node:sqlite`. The frontend and API must share an origin. SQLite keeps rooms, participants, choices, votes, and authoritative spin results across restarts.

```sh
HOST=127.0.0.1 PORT=3360 \
APP_ORIGIN=http://127.0.0.1:4206 \
DATABASE_PATH=/tmp/decision-department.sqlite \
node apps/decision-department/server/server.mjs

node --test apps/decision-department/tests/*.test.mjs
```

Production uses `APP_ORIGIN=https://decisions.giorgi.app` and an owned persistent database directory. Set `TRUST_PROXY=1` only behind the loopback Nginx proxy, which must overwrite `X-Real-IP`; otherwise rate limits use the socket address.

Invite links grant room access. This is a friendly decision tool, not a secure election: one browser credential has one advisory vote, but a person can join again in another browser. Every choice has equal chance on the wheel regardless of vote counts. The host alone can spin, lock, reset, and delete. Host and participant credentials are returned once, stored only as SHA-256 hashes by the service, and never exposed in public room reads. Losing the host credential loses host controls.

Rooms expire seven days after creation. A room allows 32 choices and 100 participant credentials. At most 2,000 rooms are retained; expired rooms are removed periodically and before creation. Creation is limited to 12 rooms per IP per hour; all API reads and writes have additional bounded in-memory rate limits. Inputs have byte/character limits. Writes require the exact configured Origin and JSON content type.

Spins last five seconds and freeze choice/vote changes during that interval. The server chooses a uniform cryptographic winner and stores a numbered result with a frozen choice snapshot. Polling clients display that same winner. Host deletion remains available during a spin so synthetic tests can always clean up.

The module exports `createDecisionServer({databasePath, origin, spinDurationMs, clock, trustProxy})`, returning `{server, close}` for isolated tests. The executable listens on loopback by default. `/health` reports readiness without exposing room contents or credentials. Logs omit request bodies, invite URLs, aliases, and credentials.

## Private menu photo analysis

Manual menu entry and budget combinations run in the browser. Photo analysis additionally uses the shared Giorgi identity service and an OpenAI vision model. Configure `AI_CONFIG_FILE` with a protected JSON file containing `apiKey`, `baseUrl` and `model`; the default provider/model are `https://api.openai.com/v1` and `gpt-4.1-mini`. `AI_API_KEY`, `AI_BASE_URL` and `AI_MODEL` can supply server environment values instead. Credentials are never sent to browser code. Missing AI configuration leaves the anonymous room and manual-menu flows available.

The central identity app registers the `decision-department` PKCE client at `https://decisions.giorgi.app/api/auth/sso/callback`. `AUTH_PUBLIC_URL` defaults to `https://auth.giorgi.app`; the trusted server-to-server `AUTH_INTERNAL_URL` defaults to `http://127.0.0.1:3100`. Production uses a host-only `__Host-giorgi_decisions` cookie with Secure, HttpOnly and SameSite=Lax. Each account lookup introspects its opaque grant centrally, including live email verification and shared-session revocation. Pending sign-in states are one-use, expire after ten minutes and bind to this browser's cookie. The return path is restricted to this app's home, a valid room path, or the fixed Split the Supra host through the reserved /supra return path. Signing out here revokes this app's grant.

Routes:

- `GET /api/menu/session`: current user or null, AI configuration state, limits, and the signed-in user's remaining scan attempts.
- `GET /api/auth/sso/start`: starts shared sign-in; optional `returnTo` is a constrained local path.
- `GET /api/auth/sso/callback`: exchanges the authorization code and redirects to the menu section without exposing the grant to JavaScript.
- `POST /api/menu/logout` with `{}`: same-origin sign-out for this app.
- `POST /api/menu/analyze` with `{image: "data:image/jpeg;base64,..."}`: requires a live, email-verified shared account. PNG and WebP are also supported. The response contains `currency`, `items` with decimal-string or null prices, `warnings`, and `remaining`.

Photos are limited to 1.5 MB decoded, a 2.2 MB JSON request, a 2,200-pixel longest edge and four megapixels. Byte signatures and dimensions are checked before requesting AI. Photos are held in request memory only, never written to disk or logs. Provider output is schema-checked, limited to 60 items and 128 KB of response data, and treats menu text as data rather than instructions. Unclear prices stay null for human correction. A 25-second deadline or client cancellation aborts provider work; no automatic paid retries occur.

SQLite persists three scan attempts per account and thirty globally in a rolling 24-hour window, with one attempt per account per minute. Failures and cancellations after reservation count because providers may charge for partial work. Concurrency is limited to one scan per account and two globally. Successful duplicate photos reuse that account's result for ten minutes in a bounded memory cache; the image itself is not cached. Account IDs are hashed in the attempt ledger. Expired attempt/state rows are pruned. The room write limit remains 8 KB; configure Nginx to allow 3 MB on `/api/menu/analyze`, a 40-second upstream read timeout and no access logging of authorization callback query parameters.

For isolated tests, `createDecisionServer` additionally accepts `menu: {identityFetch, providerFetch, ai, timeoutMs, limits}`. Fake fetch functions must return real `Response` objects; `ai` uses `{apiKey, baseUrl, model}` and `limits` may override `{daily, globalDaily}`. The `clock` supplied to the server also controls persisted quota windows, cache expiry and pending sign-in state expiry.


## Split the Supra

The same process serves persistent receipt tables through `/api/supra/rooms`, proxied on the Split the Supra host. A random table ID authorizes viewing its itemized bill and participants’ table names for seven days. The participant credential is returned only when creating or joining a table. Its hash authorizes changes to that diner’s shares, and the host can delete the table. The server allocates integer tetri and stores receipt lines and claims in SQLite. Table expiry removes associated rows.

The Split frontend also calls `GET /api/receipt/session` and `POST /api/receipt/analyze` on the Decision host with credentials. The credentialed CORS allowlist for these two routes is the exact `SUPRA_ORIGIN` (default `https://split-supra.giorgi.app`). Set a matching local origin when testing. Only the user's name and verification status are returned to the Split app. Shared sign-in accepts `returnTo=/supra` and redirects to the configured Split origin after the usual PKCE exchange. The receipt and menu scanners share the same paid quota, cooldown, concurrency and account verification checks. Successful scans are cached per account and document type. Nginx must allow 3 MB and a 40-second proxy timeout on both scan routes. Receipt scans return draft rows with printed quantities, unit prices, line totals, and warnings for review.
