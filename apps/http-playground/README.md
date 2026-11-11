# HTTP Playground

An interactive, browser-only learning simulator for an HTTP/1.1 + TLS 1.3 request. The UI explicitly distinguishes simulated timing from measured network activity. It never fetches the supplied path or connects to the illustrative example.invalid hostname.

Explore cold visits, cached DNS, fresh GET responses, stale ETag validation/304, GET versus POST, round-trip latency, API processing delay, DNS failure, untrusted certificates, client timeouts, HTTP500, and offline behavior. The trace and request/response inspector reveal only the completed stages. Next steps support keyboard-paced exploration; background tabs pause playback.

```sh
npx nx build http-playground
npx nx serve http-playground # 127.0.0.1:4206
node --test apps/http-playground/tests/*.test.mjs
node_modules/.bin/tsc -p apps/http-playground/tsconfig.json
```

The pure engine's elapsed clock is illustrative and deterministic. Playback delay is a teaching aid and is intentionally separate from the virtual timing values. Real HTTP/2 or HTTP/3, connection reuse, service workers, CDNs and parallel work can change an actual browser journey; stage explanations state those limits.
