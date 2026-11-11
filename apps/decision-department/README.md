# The Decision Department

A small shared decision room for friends. Create a question, add choices, copy the public invite, and let friends join without accounts. Members can suggest choices and cast or change one vote. Votes are advisory: each choice gets an equal share of the wheel. The host starts a server-selected, cryptographically random spin; all browsers receive the same result and a five-second reveal window.

The browser animates the authoritative result. It never chooses a winner locally. Reduced-motion visits show the result without rotation. Polling pauses in background tabs, retries after outages, and preserves form input/focus. New suggestions after a completed spin replace the displayed wheel pool for the next decision.

Hosts can lock suggestions, start a new round, or close a room. Host and participant credentials are saved only in this browser’s local storage and sent in request headers. The public invite has no credentials. Host controls cannot be recovered if that browser’s storage is cleared; keep the original tab/browser available. Anyone holding an invite can join, so use nicknames and avoid private information. This is a low-stakes friends tool, not an identity-verified ballot. Rooms expire seven days after creation.

## Development

Run the backend using Node 24:

```sh
HOST=127.0.0.1 PORT=3360 APP_ORIGIN=http://127.0.0.1:4210 DATABASE_PATH=/tmp/decisions-dev.sqlite node apps/decision-department/server/server.mjs
```

In a second terminal:

```sh
npx nx serve decision-department
```

The Vite frontend runs on port 4210 and proxies API requests to port 3360. `APP_ORIGIN` must match the frontend’s exact origin. For deployment use `https://decisions.giorgi.app`.

```sh
npx nx build decision-department
npx nx test decision-department
npx tsc -p apps/decision-department/tsconfig.json
```

The build creates `dist/apps/decision-department/public` and `dist/apps/decision-department/server`. Nginx serves the frontend with SPA fallback for `/room/:id`; API traffic reaches the standalone Node server. Data is persisted in a dedicated SQLite file. API permissions, input limits, persistence, room isolation, concurrency and random-result consistency are tested against real HTTP clients.
