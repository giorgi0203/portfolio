/** Real playback + diagnostics checks. Fixtures are generated test patterns, served only inside this browser. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const base = (process.env.HLS_URL || 'http://127.0.0.1:4301').replace(/\/$/, '');
const fixtures = path.resolve(__dirname, '../apps/hls-player/test-fixtures');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  let releaseSlow;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    let recovered = false;
    await context.route('**/__inspector-fixtures/**', async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      if (name === 'slow.m3u8') { await new Promise(resolve => { releaseSlow = resolve; }); return route.abort().catch(() => undefined); }
      if (name === 'missing.m3u8' || (name === 'recover.m3u8' && !recovered)) return route.fulfill({ status: 404, body: 'Not found', headers: { 'Access-Control-Allow-Origin': '*' } });
      if (name === 'not-playlist.m3u8') return route.fulfill({ status: 200, body: '<html>not HLS</html>' });
      const file = name === 'recover.m3u8' ? 'master.m3u8' : name.endsWith('.ts') ? name + '.bin' : name;
      if (!/^[a-z0-9.-]+$/.test(file) || !fs.existsSync(path.join(fixtures, file))) return route.fulfill({ status: 404, body: 'Missing fixture' });
      await route.fulfill({ status: 200, body: fs.readFileSync(path.join(fixtures, file)), contentType: file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'HLS Inspector.', exact: true }).waitFor();
    const load = async name => {
      await page.getByLabel('HLS stream URL', { exact: true }).fill(base + '/__inspector-fixtures/' + name);
      await page.getByRole('button', { name: 'Inspect & load', exact: false }).click();
    };
    await load('master.m3u8?token=DO-NOT-EXPORT-THIS-TOKEN');
    await page.waitForFunction(() => document.querySelectorAll('.renditions tbody tr').length === 2);
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v.readyState >= 2 && v.buffered.length > 0; });
    assert.equal(await page.getByLabel('Quality', { exact: true }).isEnabled(), true);
    await page.getByLabel('Quality', { exact: true }).selectOption('0');
    await page.evaluate(async () => { const v = document.querySelector('video'); v.muted = true; await v.play(); });
    await page.waitForFunction(() => document.querySelector('video').currentTime > .1);
    await page.waitForFunction(() => [...document.querySelectorAll('.timeline tbody tr')].some(row => row.textContent.includes('Segment') && row.textContent.includes('Loaded')));
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
    const download = await downloadEvent;
    const output = path.join(os.tmpdir(), 'hls-inspector-browser-report.json'); await download.saveAs(output);
    const text = fs.readFileSync(output, 'utf8'), report = JSON.parse(text);
    assert.equal(report.product, 'Giorgi HLS Inspector'); assert.ok(report.network.loadedSegments >= 1);
    assert.ok(report.network.segmentBytes > 0); assert.equal(report.media.type,'VOD'); assert.ok(report.media.listedSegments>0); assert.equal(report.playback.selectedQuality, 0);
    assert.ok(report.events.some(event => event.kind === 'Segment' && event.bytes > 0 && event.milliseconds >= 0));
    assert.ok(!text.includes('DO-NOT-EXPORT-THIS-TOKEN')); assert.ok(!text.includes('__inspector-fixtures')); assert.ok(!text.includes('master.m3u8'));
    await page.getByRole('button', { name: 'Copy report', exact: true }).click();
    await page.getByText(/Redacted report copied|Clipboard unavailable/).waitFor();
    await page.screenshot({ path: '/tmp/hls-inspector-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '/tmp/hls-inspector-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await load('missing.m3u8'); await page.getByRole('alert').getByText(/HTTP 404/).waitFor();
    await load('recover.m3u8'); await page.getByRole('alert').getByText(/HTTP 404/).waitFor();
    recovered = true; await page.getByRole('button', { name: 'Retry stream', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.renditions tbody tr').length === 2);
    assert.equal(await page.getByRole('alert').count(), 0);
    await load('not-playlist.m3u8'); await page.getByRole('alert').getByText(/not an HLS playlist/).waitFor();
    await load('slow.m3u8'); await page.getByText('Reading the playlist… requests time out automatically.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Stop / cancel', exact: true }).click();
    if (releaseSlow) releaseSlow();
    await page.getByText('Stopped', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    await load('live.m3u8');
    await page.locator('.manifest-summary dd').getByText('Live', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS real HLS playback, variants, quality control, buffer/network diagnostics, privacy-safe export, mobile layout, 404 recovery, malformed playlist, cancellation and live detection');
  } finally { if (releaseSlow) releaseSlow(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
