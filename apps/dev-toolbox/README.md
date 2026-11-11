# Dev Toolbox

A static, browser-only developer utility app for https://toolbox.giorgi.app/.

- JSON formatting, minification and validation with useful syntax errors. Unsafe integers and non-finite numbers are rejected rather than silently rounded or converted to null.
- Semantic JSON comparison, ignoring object key order and formatting while retaining array positions and precise property paths.
- TypeScript type inference from nested JSON, including optional fields in heterogeneous object arrays, nullable values, and nested arrays. These declarations describe samples; they do not validate data at runtime.
- Epoch seconds/milliseconds and ISO dates with explicit timezone offsets, shown in UTC and the browser's local timezone.
- URL inspection and editable, correctly encoded query strings, including repeated keys and blank values. No inspected URL is visited.
- JavaScript regex matches, capture groups, named groups and error messages. Matching runs in a fresh Web Worker, terminated after one second. Limits: 5,000-character pattern, 200,000-character input, 1,000 matches.

Inputs remain in browser memory. Copy and download require explicit actions. Only a fixed anonymous page-view event (kind, label, referring hostname) is sent to `/api/analytics/event`, respecting DNT/GPC. Source text, expressions, URLs and tool outputs are never sent or saved in browser storage.

## Build and check

```sh
npx nx build dev-toolbox
node_modules/.bin/tsc -p apps/dev-toolbox/tsconfig.json
npx eslint apps/dev-toolbox/src
node --test scripts/toolbox-core.test.mjs
```

Output: `dist/apps/dev-toolbox/`. To browse locally, serve that directory on port 4204 or run `npx nx serve dev-toolbox`.

```sh
TOOLBOX_URL=http://127.0.0.1:4204/ node scripts/toolbox-browser.cjs
```

`PLAYWRIGHT_MODULE` and `CHROME_PATH` can point to an installed Playwright package and Chromium/Chrome executable. The same script can check the production HTTPS site. It covers all tools, downloads, clipboard, invalid input, a regex timeout, responsive layout, and absence of payload transmission.
