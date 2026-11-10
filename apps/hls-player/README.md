# HLS Inspector

The player at `hls-player.giorgi.app` also inspects HLS streams: master/media playlist metadata, renditions, manual/adaptive quality, audio tracks, current buffer ranges, Hls.js bandwidth estimates, live-edge latency, and a bounded request/event timeline. Native Safari playback is retained; native-managed requests and quality control are explicitly marked unavailable.

Streams are fetched directly in the browser, with request timeouts and cancellation. Source servers must permit browser CORS for manifest inspection and Hls.js playback. If inspection is blocked in a native HLS browser, its native player can still try the stream. There is no media proxy or server-side stream processing.

The URL input is the only place that retains a full user URL. Diagnostic exports and timeline entries contain source **origins only**, without paths, query strings, fragments, credentials, raw playlist contents, key URLs, or raw Hls.js error objects. Existing site analytics records only a generic page view and referring hostname, honoring DNT/GPC; stream URLs and playback diagnostics are never sent to analytics.

## Check

```bash
NX_DAEMON=false npx nx run-many -t lint,test,build -p hls-player --watch=false
python3 -m http.server 4301 --bind 127.0.0.1 --directory dist/apps/hls-player
HLS_URL=http://127.0.0.1:4301 node scripts/hls-inspector-browser.cjs
```

The browser script accepts `HLS_URL`, `CHROME_PATH`, and `PLAYWRIGHT_MODULE`. It can run against the deployed HTTPS app; stream requests are intercepted inside Playwright and fulfilled from local fixtures. Tests cover real H264/AAC playback, variants, quality selection, loaded segment metrics, redacted downloads, copy fallback, mobile layout, 404/retry, malformed playlists, cancellation, and live detection. The binary `.ts.bin` fixtures are FFmpeg-generated test-pattern/sine-wave MPEG-TS media, not executable TypeScript or third-party video. They are test-only and are excluded from the published static assets.

Report values reflect observed browser data. Missing bitrate/codecs, unknown live latency, native playback internals, and encrypted-media details remain unavailable rather than being inferred as successful measurements.
