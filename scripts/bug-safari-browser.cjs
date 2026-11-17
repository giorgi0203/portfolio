const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

// Serve exactly the production bundle and the worker's stricter response CSP.
// BUG_SAFARI_URL exercises the same user journeys over public HTTPS in CI.
const workerPolicy =
  "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'";
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
let fixture;
async function baseURL() {
  if (process.env.BUG_SAFARI_URL)
    return process.env.BUG_SAFARI_URL.replace(/\/$/, '');
  const root = path.resolve('dist/apps/bug-safari');
  fixture = http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, 'http://fixture.local').pathname,
      );
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!path.extname(file)) file = path.join(root, 'index.html');
    try {
      const content = await fsp.readFile(file);
      res.writeHead(200, {
        'content-type': mime[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
        'content-security-policy':
          pathname === '/runner.js'
            ? workerPolicy
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Missing production fixture');
    }
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + fixture.address().port;
}

(async () => {
  let browser;
  try {
    const base = await baseURL();
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [],
      networkProbes = [],
      externalRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    context.on('request', (request) => {
      if (request.url().includes('__bug_safari_network_probe'))
        networkProbes.push(request.url());
      if (
        /^https?:/.test(request.url()) &&
        new URL(request.url()).origin !== new URL(base).origin
      )
        externalRequests.push(new URL(request.url()).origin);
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#code-editor').waitFor();
    const module = await import(
      pathToFileURL(path.resolve('apps/bug-safari/src/challenges.ts')).href
    );
    const challenges = module.challenges;
    assert.equal(challenges.length, 6);
    assert.ok(await page.locator('#run-tests').isEnabled());
    assert.equal(
      await page.locator('#test-results [data-test-passed]').count(),
      0,
      'visiting the site never runs stored code',
    );

    async function choose(id) {
      await page.locator('button[data-challenge-id="' + id + '"]').click();
      await page.locator('#code-editor').waitFor();
    }
    async function run(code) {
      await page.locator('#code-editor').fill(code);
      await page.locator('#run-tests').click();
      await page.waitForFunction(() => {
        const status = document.querySelector('#run-status');
        return (
          status &&
          status.dataset.state !== 'running' &&
          document.querySelectorAll('#test-results [data-test-passed]').length >
            0
        );
      });
      return {
        passed: await page
          .locator('#test-results [data-test-passed="true"]')
          .count(),
        failed: await page
          .locator('#test-results [data-test-passed="false"]')
          .count(),
      };
    }
    await choose(challenges[0].id);
    const unearned = await page.locator('#progress-count').textContent();
    await page.locator('#hint').click();
    const firstHint = await page.locator('#hints-list').textContent();
    await page.locator('#hint').click();
    assert.notEqual(
      await page.locator('#hints-list').textContent(),
      firstHint,
      'progressive hints reveal new guidance',
    );
    await page.locator('#reveal-solution').click();
    assert.equal(
      await page.locator('#code-editor').inputValue(),
      challenges[0].solutionCode,
    );
    assert.equal(
      await page.locator('#progress-count').textContent(),
      unearned,
      'viewing a solution alone does not earn a completion',
    );
    await page.locator('#reset-code').click();
    assert.equal(
      await page.locator('#code-editor').inputValue(),
      challenges[0].starterCode,
    );

    // Editing a running, otherwise-correct program must invalidate its result.
    await choose(challenges[4].id);
    await page
      .locator('#code-editor')
      .fill(
        'const began = Date.now(); while (Date.now() - began < 600) {}\n' +
          challenges[4].solutionCode,
      );
    await page.locator('#run-tests').click();
    await page
      .locator('#code-editor')
      .fill('function solve() { return null; }');
    await page.waitForTimeout(1000);
    assert.equal(
      await page.locator('#progress-count').textContent(),
      unearned,
      'a stale successful run cannot award a discovery after code changes',
    );
    assert.notEqual(
      await page.locator('#run-status').getAttribute('data-state'),
      'passed',
    );

    for (const challenge of challenges) {
      await choose(challenge.id);
      const broken = await run(challenge.starterCode);
      assert.ok(
        broken.failed > 0,
        challenge.id + ' actually reproduces its bug',
      );
      const repaired = await run(challenge.solutionCode);
      assert.equal(
        repaired.failed,
        0,
        challenge.id + ' accepts a functioning repair',
      );
      assert.ok(repaired.passed > 0);
      assert.ok(
        (await page.locator('#preview-lines').textContent()).trim().length > 0,
        'actual observations accompany test results',
      );
    }
    const earned = await page.locator('#progress-count').textContent();
    assert.match(earned, /6/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#run-tests').waitFor();
    assert.equal(
      await page.locator('#progress-count').textContent(),
      earned,
      'field journal survives a reload',
    );
    assert.equal(
      await page.locator('#test-results [data-test-passed]').count(),
      0,
      'reload never auto-executes the saved solution',
    );

    await choose(challenges[0].id);
    const changed = await run(
      'function solve() { return ["deliberately wrong result"]; }',
    );
    assert.ok(changed.failed > 0);
    assert.ok(
      (await page.locator('#test-results').textContent()).includes(
        'deliberately wrong result',
      ),
      'edited code genuinely changes observed output',
    );
    await run(
      'function solve() { return ["<img src=x onerror=globalThis.__bugSafariInjected=1>"]; }',
    );
    assert.equal(await page.locator('#preview-lines img').count(), 0);
    assert.equal(
      await page.evaluate(() => window.__bugSafariInjected),
      undefined,
      'worker output is rendered as data, not executable HTML',
    );

    const started = Date.now();
    await page
      .locator('#code-editor')
      .fill('function solve() { while (true) {} }');
    await page.locator('#run-tests').click();
    await page.waitForFunction(
      () => document.querySelector('#run-status')?.dataset.state === 'timeout',
    );
    assert.ok(
      Date.now() - started < 3500,
      'runaway code is terminated promptly',
    );
    assert.equal(
      await page.evaluate(() => 2 + 2),
      4,
      'runaway worker cannot freeze the page',
    );
    assert.ok(await page.locator('#run-tests').isEnabled());

    await page
      .locator('#code-editor')
      .fill('function solve() { while (true) {} }');
    await page.locator('#run-tests').click();
    await choose(challenges[1].id);
    const switchedCode = await page.locator('#code-editor').inputValue();
    await page.waitForTimeout(1700);
    assert.equal(await page.locator('#code-editor').inputValue(), switchedCode);
    assert.notEqual(
      await page.locator('#run-status').getAttribute('data-state'),
      'timeout',
      'old worker cannot overwrite a newly selected challenge',
    );

    const response = await context.request.get(base + '/runner.js');
    assert.equal(response.status(), 200);
    assert.match(
      response.headers()['content-security-policy'] || '',
      /connect-src 'none'/,
    );
    assert.match(
      response.headers()['content-security-policy'] || '',
      /worker-src 'none'/,
    );
    const probeCode =
      `try { fetch('/__bug_safari_network_probe').catch(() => {}); } catch {}
try { importScripts('/__bug_safari_network_probe.js'); } catch {}
` + challenges[0].solutionCode;
    const isolated = await page.evaluate(
      ({ challengeId, code }) =>
        new Promise((resolve, reject) => {
          const worker = new Worker('/runner.js');
          const runId = 'browser-isolation-check';
          const timer = setTimeout(() => {
            worker.terminate();
            reject(new Error('Isolated probe did not finish'));
          }, 3000);
          worker.onerror = () => {
            clearTimeout(timer);
            worker.terminate();
            reject(new Error('Worker isolation probe failed'));
          };
          worker.onmessage = ({ data }) => {
            if (data?.type !== 'bug-safari:result' || data.runId !== runId)
              return;
            clearTimeout(timer);
            worker.terminate();
            resolve(data.result || data);
          };
          worker.postMessage({
            type: 'bug-safari:run',
            runId,
            challengeId,
            code,
          });
        }),
      { challengeId: challenges[0].id, code: probeCode },
    );
    assert.equal(isolated.status, 'complete');
    assert.equal(isolated.passed, true);
    assert.deepEqual(
      networkProbes,
      [],
      'worker CSP prevents fetch and script-import network requests',
    );

    await choose(challenges[4].id);
    await run(challenges[4].solutionCode);
    await page.screenshot({
      path: '/tmp/bug-safari-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'phone layout has no horizontal page overflow',
    );
    await page.locator('#code-editor').fill(challenges[4].starterCode);
    assert.equal(
      await page.locator('#code-editor').inputValue(),
      challenges[4].starterCode,
      'editor remains usable on phones',
    );
    await page.locator('#run-tests').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        document.querySelectorAll('#test-results [data-test-passed="false"]')
          .length > 0,
    );
    await page.screenshot({
      path: '/tmp/bug-safari-mobile.png',
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'app has no uncaught browser errors');
    assert.deepEqual(
      externalRequests,
      [],
      'Bug Safari has no external network dependencies',
    );
    console.log(
      'PASS Bug Safari: six real bugs/repairs, editable outputs, isolated-worker timeout/network policy, stale-run cancellation, hints/reset/journal, and desktop/mobile keyboard layout.',
    );
    await context.close();
  } finally {
    await browser?.close();
    if (fixture) {
      fixture.closeAllConnections();
      await new Promise((resolve) => fixture.close(resolve));
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
