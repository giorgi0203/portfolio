const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

// Local runs use the production bundles and an isolated, real SQLite service.
// CI may supply the two HTTPS origins; its synthetic room is deleted in finally.
const fixtures = [];
const cleanup = [];
const privateValues = [];
const only = process.env.NEW_APPS_ONLY;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + server.address().port;
}
async function staticApp(directory, proxy) {
  const root = path.resolve(directory);
  const server = http.createServer(async (req, res) => {
    if (proxy && (req.url.startsWith('/api/') || req.url === '/health')) {
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port: proxy.port,
          method: req.method,
          path: req.url,
          headers: req.headers,
        },
        (reply) => {
          res.writeHead(reply.statusCode, reply.headers);
          reply.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end('Fixture service unavailable');
      });
      req.pipe(upstream);
      return;
    }
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
    let local = path.resolve(root, '.' + pathname);
    if (!local.startsWith(root + path.sep) && local !== root) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!path.extname(local)) local = path.join(root, 'index.html');
    try {
      const data = await fsp.readFile(local);
      res.writeHead(200, {
        'Content-Type': mime[path.extname(local)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Missing production fixture');
    }
  });
  const base = await listen(server);
  fixtures.push(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return base;
}
async function origins() {
  let httpBase = process.env.HTTP_URL?.replace(/\/$/, '');
  let decisionsBase = process.env.DECISIONS_URL?.replace(/\/$/, '');
  if (!httpBase && only !== 'decisions')
    httpBase = await staticApp('dist/apps/http-playground');
  if (!decisionsBase && only !== 'http') {
    const temporary = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'giorgi-decision-browser-'),
    );
    const proxy = { port: 0 };
    decisionsBase = await staticApp(
      'dist/apps/decision-department/public',
      proxy,
    );
    const { createDecisionServer } = await import(
      pathToFileURL(path.resolve('apps/decision-department/server/server.mjs'))
        .href
    );
    const service = await createDecisionServer({
      databasePath: path.join(temporary, 'rooms.sqlite'),
      origin: decisionsBase,
      spinDurationMs: 1200,
    });
    await listen(service.server);
    proxy.port = service.server.address().port;
    fixtures.push(async () => {
      await service.close();
      await fsp.rm(temporary, { recursive: true, force: true });
    });
  }
  return { httpBase, decisionsBase };
}
async function context(browser, origins, options = {}) {
  const ctx = await browser.newContext(options);
  await ctx.route('**/*', (route) => {
    if (!origins.includes(new URL(route.request().url()).origin))
      return route.abort();
    return route.continue();
  });
  cleanup.push(() => ctx.close());
  return ctx;
}
async function fits(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'layout must fit the mobile viewport',
  );
}
async function testHttp(browser, base) {
  const ctx = await context(browser, [base], {
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#run').waitFor();
  // Scenario assertions are tied to actual stage progress, response and trace.
  await httpScenarios(page);
  await page.screenshot({
    path: '/tmp/http-playground-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await fits(page);
  await page.screenshot({
    path: '/tmp/http-playground-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, [], 'HTTP Playground must not throw browser errors');
}
async function httpScenarios(page) {
  async function complete() {
    for (
      let index = 0;
      index < 16 && !(await page.locator('#next').isDisabled());
      index++
    )
      await page.locator('#next').click();
    assert.ok(
      await page.locator('#next').isDisabled(),
      'a finite journey reaches a terminal state',
    );
  }
  await page.locator('#run').click();
  await page.locator('#pause').click();
  assert.equal(await page.locator('#pause').textContent(), 'Resume');
  const pausedTrace = await page.locator('#trace-count').textContent();
  await page.waitForTimeout(650);
  assert.equal(
    await page.locator('#trace-count').textContent(),
    pausedTrace,
    'pause freezes stage progress',
  );
  await page.locator('#next').click();
  assert.notEqual(
    await page.locator('#trace-count').textContent(),
    pausedTrace,
    'next advances exactly while paused',
  );
  await page.locator('#reset').click();
  assert.equal(await page.locator('.stage.visited').count(), 0);
  assert.equal(
    await page.locator('#response-status').textContent(),
    'Not sent yet',
  );

  await page.locator('#preset').selectOption('fresh');
  await page.locator('#fault').selectOption('offline');
  await complete();
  assert.ok(
    (await page.locator('#response-status').textContent()).startsWith('200'),
  );
  for (const stage of ['dns', 'tcp', 'tls', 'request', 'server'])
    assert.equal(
      await page.locator('[data-stage="' + stage + '"].visited').count(),
      0,
      'a fresh cached GET does not visit ' + stage,
    );
  assert.ok(
    (await page.locator('#source').textContent()).includes(
      'Fresh browser cache',
    ),
  );

  await page.locator('#preset').selectOption('revalidate');
  await page.locator('#fault').selectOption('none');
  await complete();
  assert.ok(
    (await page.locator('#response-status').textContent()).startsWith('304'),
  );
  assert.equal(await page.locator('[data-stage="server"].visited').count(), 1);
  await page.locator('[data-tab="request"]').click();
  assert.ok(
    (await page.locator('#wire-content').textContent()).includes(
      'If-None-Match',
    ),
  );
  await page.locator('[data-tab="body"]').click();
  assert.ok(
    (await page.locator('#wire-caption').textContent()).includes(
      '304 response has NO body',
    ),
  );

  await page.locator('#preset').selectOption('cold');
  await page.locator('#fault').selectOption('certificate');
  await complete();
  assert.equal(
    await page.locator('#response-status').textContent(),
    'No HTTP response',
  );
  assert.equal(await page.locator('[data-stage="tls"].failed').count(), 1);
  for (const stage of ['request', 'server', 'response'])
    assert.equal(
      await page.locator('[data-stage="' + stage + '"].visited').count(),
      0,
      'certificate rejection stops before ' + stage,
    );
  await page.locator('[data-tab="response"]').click();
  assert.ok(
    (await page.locator('#wire-content').textContent()).includes(
      'not an HTTP status code',
    ),
  );

  await page.locator('#preset').selectOption('fresh');
  await page.locator('#method').selectOption('POST');
  await page.locator('#fault').selectOption('none');
  await complete();
  assert.ok(
    (await page.locator('#response-status').textContent()).startsWith('201'),
  );
  assert.equal(
    await page.locator('[data-stage="dns"].visited').count(),
    1,
    'POST cannot use the stored GET response',
  );
  await page.locator('#method').selectOption('GET');
  await page.locator('#preset').selectOption('cold');
  await page.locator('#latency').evaluate((node) => {
    node.value = '600';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.locator('#latency-value').textContent(), '600 ms');
  await complete();
  assert.ok(
    Number(
      (await page.locator('#elapsed').textContent()).replace(/[^0-9]/g, ''),
    ) > 2000,
    'latency slider changes the simulated elapsed journey',
  );
  await page.locator('[data-stage="tls"]').click();
  assert.ok(
    (await page.locator('#explanation').getAttribute('open')) !== null,
    'stage explanation can be opened',
  );
}
async function testDecisions(browser, base) {
  const host = await context(browser, [base], {
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const guest = await context(browser, [base], {
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();
  hostPage.setDefaultTimeout(20000);
  guestPage.setDefaultTimeout(20000);
  const errors = [];
  for (const p of [hostPage, guestPage])
    p.on('pageerror', (error) => errors.push(error.message));
  let created;
  try {
    await hostPage.goto(base, { waitUntil: 'domcontentloaded' });
    await hostPage
      .locator('#room-title')
      .fill('Browser proof — delete after check');
    await hostPage
      .locator('#initial-choices')
      .fill('Pizza\nMovie night\nBuild something');
    const response = hostPage.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname === '/api/rooms',
    );
    await hostPage.locator('#create-room button[type=submit]').click();
    const createResponse = await response;
    assert.equal(createResponse.status(), 201);
    created = await createResponse.json();
    privateValues.push(
      created.hostToken,
      created.participantToken,
      created.room?.id,
    );
    assert.ok(
      created.room?.id && created.hostToken,
      'room creation returns host credentials privately',
    );
    const invite = new URL('/room/' + created.room.id, base).href;
    assert.ok(
      !invite.includes(created.hostToken),
      'public invite must never include host token',
    );
    await hostPage.locator('#spin').waitFor();
    assert.ok(
      (await hostPage.locator('#invite-link').inputValue()) === invite,
      'the actual sharing control contains only the public invite',
    );
    assert.ok(
      (await hostPage
        .locator('#copy-invite')
        .getAttribute('data-invite-url')) === invite,
      'copy action shares the same public invite',
    );
    await guestPage.goto(invite, { waitUntil: 'domcontentloaded' });
    await guestPage.locator('#join-name').fill('Guest browser');
    await guestPage.locator('#join-room button[type=submit]').click();
    const hostile = '<img src=x onerror=window.__decisionXSS=1>';
    await guestPage.locator('#new-choice').fill(hostile);
    await guestPage.locator('#choice-form button[type=submit]').click();
    const guestChoice = guestPage
      .locator('[data-choice-id]')
      .filter({ hasText: hostile });
    await guestChoice.waitFor();
    assert.equal(
      await guestChoice.locator('img').count(),
      0,
      'choice text must not become HTML',
    );
    assert.equal(
      await guestPage.evaluate(() => window.__decisionXSS),
      undefined,
    );
    const guestVote = guestPage.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname.endsWith('/vote'),
    );
    await guestChoice.locator('[data-vote]').click();
    assert.equal((await guestVote).status(), 200);
    const hostChoice = hostPage
      .locator('[data-choice-id]')
      .filter({ hasText: hostile });
    await hostChoice.waitFor();
    const hostVote = hostPage.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname.endsWith('/vote'),
    );
    await hostChoice.locator('[data-vote]').click();
    assert.equal((await hostVote).status(), 200);
    const forbidden = await guest.request.post(
      base + '/api/rooms/' + created.room.id + '/spin',
      { headers: { Origin: base }, data: {} },
    );
    assert.equal(
      forbidden.status(),
      403,
      'a guest cannot spin the host’s room',
    );
    const stateResponse = await host.request.get(
      base + '/api/rooms/' + created.room.id,
    );
    const state = await stateResponse.json();
    assert.ok(
      !JSON.stringify(state).includes(created.hostToken),
      'read-only room state must not disclose host token',
    );
    assert.equal(
      state.room.choices.find((choice) => choice.text === hostile)?.votes,
      2,
      'two browser identities contribute two persisted votes',
    );
    const spinResponse = hostPage.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname.endsWith('/spin'),
    );
    await hostPage.locator('#spin').click();
    const spun = await (await spinResponse).json();
    assert.ok(
      await hostPage.locator('#spin').isDisabled(),
      'host cannot start duplicate spins while the round is active',
    );
    assert.ok(spun.room.lastSpin?.winnerText, 'server chooses the winner');
    await hostPage.waitForFunction(
      (expected) =>
        document.querySelector('#winner')?.textContent.includes(expected),
      spun.room.lastSpin.winnerText,
    );
    await guestPage.waitForFunction(
      (expected) =>
        document.querySelector('#winner')?.textContent.includes(expected),
      spun.room.lastSpin.winnerText,
    );
    const winningIndex = spun.room.lastSpin.choices.findIndex(
      (choice) => choice.id === spun.room.lastSpin.winnerId,
    );
    assert.ok(
      await hostPage.locator('#wheel').evaluate((wheel, index) => {
        const matrix = wheel.getScreenCTM();
        const center = new DOMPoint(200, 200).matrixTransform(matrix);
        const point = new DOMPoint(
          center.x,
          center.y - Math.hypot(matrix.a, matrix.b) * 140,
        ).matrixTransform(matrix.inverse());
        return wheel
          .querySelectorAll(':scope > path')
          [index]?.isPointInFill(point);
      }, winningIndex),
      'the segment beneath the physical pointer matches the server winner',
    );
    await hostPage.reload({ waitUntil: 'domcontentloaded' });
    await hostPage.waitForFunction(
      (expected) =>
        document.querySelector('#winner')?.textContent.includes(expected),
      spun.room.lastSpin.winnerText,
    );
    assert.equal(
      await hostPage.locator('[data-choice-id]').count(),
      4,
      'room survives a browser reload',
    );
    await hostPage.screenshot({
      path: '/tmp/decision-department-desktop.png',
      fullPage: true,
    });
    await hostPage.setViewportSize({ width: 390, height: 844 });
    await fits(hostPage);
    await hostPage.screenshot({
      path: '/tmp/decision-department-mobile.png',
      fullPage: true,
    });
    assert.deepEqual(
      errors,
      [],
      'Decision Department must not throw browser errors',
    );
  } finally {
    if (created?.room?.id && created.hostToken) {
      const response = await host.request.delete(
        base + '/api/rooms/' + created.room.id,
        {
          headers: {
            Origin: base,
            'x-host-token': created.hostToken,
            'Content-Type': 'application/json',
          },
          data: {},
        },
      );
      assert.ok(
        [200, 204, 404].includes(response.status()),
        'synthetic room must be cleaned up',
      );
    }
  }
}
(async () => {
  let browser;
  try {
    const bases = await origins();
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    if (only !== 'decisions') await testHttp(browser, bases.httpBase);
    if (only !== 'http') await testDecisions(browser, bases.decisionsBase);
    console.log(
      only === 'http'
        ? 'PASS HTTP Playground: protocol scenarios, controls and mobile layouts.'
        : only === 'decisions'
          ? 'PASS Decision Department: shared rooms, authoritative results, persistence, controls and mobile layouts; synthetic room deleted.'
          : 'PASS HTTP Playground and Decision Department: protocol scenarios, shared rooms, authoritative results, persistence, controls and mobile layouts; synthetic room deleted.',
    );
  } finally {
    for (const close of cleanup.reverse()) await close();
    if (browser) await browser.close();
    for (const close of fixtures.reverse()) await close();
  }
})().catch((error) => {
  let report =
    error instanceof Error ? error.stack || error.message : String(error);
  for (const value of privateValues.filter(Boolean))
    report = report.split(value).join('[private fixture value]');
  console.error(report);
  process.exitCode = 1;
});
