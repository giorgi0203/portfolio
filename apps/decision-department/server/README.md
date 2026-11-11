# Decision Department service

Runs on Node 24 using only `node:http`, `node:crypto`, and `node:sqlite`. The frontend and API must share an origin. SQLite keeps rooms, participants, choices, votes, and authoritative spin results across restarts.

```sh
HOST=127.0.0.1 PORT=3360 \
APP_ORIGIN=http://127.0.0.1:4206 \
DATABASE_PATH=/tmp/decision-department.sqlite \
node apps/decision-department/server/server.mjs

node --test apps/decision-department/tests/server.test.mjs
```

Production uses `APP_ORIGIN=https://decisions.giorgi.app` and an owned persistent database directory. Set `TRUST_PROXY=1` only behind the loopback Nginx proxy, which must overwrite `X-Real-IP`; otherwise rate limits use the socket address.

Invite links grant room access. This is a friendly decision tool, not a secure election: one browser credential has one advisory vote, but a person can join again in another browser. Every choice has equal chance on the wheel regardless of vote counts. The host alone can spin, lock, reset, and delete. Host and participant credentials are returned once, stored only as SHA-256 hashes by the service, and never exposed in public room reads. Losing the host credential loses host controls.

Rooms expire seven days after creation. A room allows 32 choices and 100 participant credentials. At most 2,000 rooms are retained; expired rooms are removed periodically and before creation. Creation is limited to 12 rooms per IP per hour; all API reads and writes have additional bounded in-memory rate limits. Inputs have byte/character limits. Writes require the exact configured Origin and JSON content type.

Spins last five seconds and freeze choice/vote changes during that interval. The server chooses a uniform cryptographic winner and stores a numbered result with a frozen choice snapshot. Polling clients display that same winner. Host deletion remains available during a spin so synthetic tests can always clean up.

The module exports `createDecisionServer({databasePath, origin, spinDurationMs, clock, trustProxy})`, returning `{server, close}` for isolated tests. The executable listens on loopback by default. `/health` reports readiness without exposing room contents or credentials. Logs omit request bodies, invite URLs, aliases, and credentials.
