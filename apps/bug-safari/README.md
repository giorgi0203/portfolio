# Bug Safari

A browser-only JavaScript debugging field guide at https://bug-safari.giorgi.app/.

Six expeditions cover pagination boundaries, numeric sorting, unintended mutation, closures, asynchronous response races, and event-listener cleanup. Each includes editable starter code, actual behavior checks, observed output, progressive hints and a worked explanation. Tests execute in a fresh, disposable Web Worker, terminated after a 1.5-second deadline. No learner code is evaluated in the page.

The field journal stores drafts, selected challenge, discoveries and hint counts in localStorage, with best-effort handling when storage is unavailable. Revealing a solution marks subsequent passing results as guided discoveries; passing still requires running actual checks. Code does not run automatically when the page loads. Links use only a challenge identifier in the URL hash; code and drafts are not put in URLs.

This is a learning game, not a tamper-resistant certification platform. User code must be served in a worker with its dedicated network-blocking CSP. The scoped deployment installer owns that header for `/runner.js`; the page itself does not require unsafe-eval. User-controlled output is rendered as literal text.

## Development and checks

```sh
NX_DAEMON=false npx nx build bug-safari
node_modules/.bin/tsc -p apps/bug-safari/tsconfig.json
node --test apps/bug-safari/testsengine/*.test.mjs
NX_DAEMON=false npx nx serve bug-safari
```

The Vite dev server uses port 4211. Production output is `dist/apps/bug-safari`, including the fixed runner script from `public/`. The root browser harness exercises starter failures, real repairs, hints, guided discoveries, persistence, timeouts, stale-run cancellation and responsive layouts. Storage is local to each browser; no sign-in, backend database, AI service or paid API is required.
