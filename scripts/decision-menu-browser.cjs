const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

// Local runs exercise the production UI and the real SQLite/HTTP backend. Only
// its two outbound services are replaced. Public runs never invoke paid AI.
const cleanup = [],
  privateValues = [];
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
const fixtureUsers = new Map();
const unclearDish =
  'Seasonal vegetable platter with walnut sauce, fresh herbs, roasted peppers, grilled aubergine and warm bread';
for (let i = 0; i < 8; i++) {
  const token = String.fromCharCode(97 + i).repeat(64);
  fixtureUsers.set(token, {
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    name: i === 1 ? 'Unverified diner' : 'Verified diner',
    email: `menu-fixture-${i}@example.invalid`,
    emailVerified: i !== 1,
  });
}
const fixture = {
  mode: 'success',
  calls: 0,
  aborted: 0,
  bodies: [],
  result: {
    currency: 'GEL',
    items: [
      { name: 'Khachapuri', price: '16.50', category: 'main' },
      { name: 'Bean stew', price: '12.00', category: 'main' },
      { name: unclearDish, price: null, category: 'main' },
      {
        name: '<img src=x onerror=window.__menuXSS=1>',
        price: '9.50',
        category: 'main',
      },
      { name: 'Lemonade', price: '4.00', category: 'drink' },
    ],
    warnings: ['The seasonal dish price was unreadable.'],
  },
};

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + server.address().port;
}
async function origin() {
  if (process.env.DECISIONS_URL)
    return process.env.DECISIONS_URL.replace(/\/$/, '');
  const directory = path.resolve('dist/apps/decision-department/public');
  const proxy = { port: 0 };
  const staticServer = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/') || req.url === '/health') {
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
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      res.on('close', () => {
        if (!res.writableEnded) upstream.destroy();
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
    let file = path.resolve(directory, '.' + pathname);
    if (file !== directory && !file.startsWith(directory + path.sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!path.extname(file)) file = path.join(directory, 'index.html');
    try {
      const content = await fsp.readFile(file);
      res.writeHead(200, {
        'content-type': mime[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'content-security-policy':
          "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' blob: data:; form-action 'self'",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Missing production fixture');
    }
  });
  const base = await listen(staticServer);
  cleanup.push(async () => {
    staticServer.closeAllConnections();
    await new Promise((resolve) => staticServer.close(resolve));
  });
  const temporary = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'decision-menu-browser-'),
  );
  const { createDecisionServer } = await import(
    pathToFileURL(path.resolve('apps/decision-department/server/server.mjs'))
      .href
  );
  const service = createDecisionServer({
    databasePath: path.join(temporary, 'rooms.sqlite'),
    origin: base,
    spinDurationMs: 1000,
    menu: {
      ai: {
        apiKey: 'fixture-not-a-real-provider-key',
        baseUrl: 'https://provider.fixture/v1',
        model: 'fixture-vision',
      },
      identityFetch: async (_url, options = {}) => {
        const body = JSON.parse(options.body || '{}');
        if (String(_url).endsWith('/api/sso/logout'))
          return Response.json({ ok: true });
        return Response.json({
          user: fixtureUsers.get(body.session_token) || null,
        });
      },
      providerFetch: async (_url, options = {}) => {
        fixture.calls++;
        fixture.bodies.push(JSON.parse(options.body));
        const mode = fixture.mode;
        if (mode === 'error')
          return Response.json(
            { error: { message: 'fixture provider unavailable' } },
            { status: 503 },
          );
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            resolve,
            mode === 'delay' || mode === 'timeout' ? 1500 : 180,
          );
          const abort = () => {
            clearTimeout(timer);
            fixture.aborted++;
            reject(new DOMException('Fixture request cancelled', 'AbortError'));
          };
          if (options.signal?.aborted) abort();
          else options.signal?.addEventListener('abort', abort, { once: true });
        });
        return Response.json({
          choices: [{ message: { content: JSON.stringify(fixture.result) } }],
        });
      },
      timeoutMs: 1000,
    },
  });
  await listen(service.server);
  proxy.port = service.server.address().port;
  cleanup.push(async () => {
    await service.close();
    await fsp.rm(temporary, { recursive: true, force: true });
  });
  return base;
}

async function context(browser, base, token) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== base)
      return route.abort();
    return route.continue();
  });
  if (token)
    await ctx.addCookies([
      {
        name: 'giorgi_decisions',
        value: token,
        url: base,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  cleanup.push(() => ctx.close());
  return ctx;
}
async function open(ctx, base) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/#menu', { waitUntil: 'domcontentloaded' });
  await page.locator('#menu-budget').waitFor();
  return { page, errors };
}
async function addItem(page, name, price, category = 'main') {
  await page.locator('#menu-add-name').fill(name);
  await page.locator('#menu-add-price').fill(price);
  await page.locator('#menu-add-category').selectOption(category);
  await page.locator('#menu-add-item button[type=submit]').click();
}
async function confirm(page) {
  const box = page.locator('#menu-confirm-currency');
  if (!(await box.isChecked())) await box.check();
}
async function verifyCombinations(page, budget, people, minimum = 1) {
  const cards = page.locator('#menu-combinations [data-combination]');
  await cards.first().waitFor();
  const combinations = await cards.evaluateAll((nodes) =>
    nodes.map((card) => ({
      total: Number(card.dataset.totalMinor),
      remaining: Number(card.dataset.remainingMinor),
      people: Number(card.dataset.people),
      items: [...card.querySelectorAll('[data-combination-item]')].map(
        (item) => ({
          quantity: Number(item.dataset.quantity),
          price: Number(item.dataset.priceMinor),
        }),
      ),
      text: card.textContent,
    })),
  );
  assert.ok(combinations.length >= minimum && combinations.length <= 3);
  for (const combination of combinations) {
    assert.equal(combination.people, people);
    assert.equal(
      combination.items.reduce((sum, item) => sum + item.quantity, 0),
      people,
    );
    assert.equal(
      combination.items.reduce(
        (sum, item) => sum + item.quantity * item.price,
        0,
      ),
      combination.total,
    );
    assert.ok(combination.total <= budget && combination.total > 0);
    assert.equal(combination.remaining, budget - combination.total);
  }
  return combinations;
}
async function fits(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'phone layout has no horizontal page overflow',
  );
}
async function noPhotoStorage(page) {
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  assert.ok(
    !storage.includes('data:image') && !storage.includes('blob:'),
    'raw photos and object URLs are never persisted in browser storage',
  );
}
async function image(browser, label = 'Menu fixture') {
  const page = await browser.newPage({ viewport: { width: 800, height: 640 } });
  await page.setContent(
    '<html><body style="margin:0;padding:55px;background:#faf7ef;color:#182b22;font:28px sans-serif"><h1></h1><p>Khachapuri — 16.50 GEL</p><p>Bean stew — 12.00 GEL</p><p>Lemonade — 4.00 GEL</p></body></html>',
  );
  await page
    .locator('h1')
    .evaluate((node, value) => (node.textContent = value), label);
  const buffer = await page.screenshot({ type: 'png' });
  await page.close();
  return { name: 'restaurant-menu.png', mimeType: 'image/png', buffer };
}
async function choosePhoto(page, photo) {
  await page.locator('#menu-upload').setInputFiles(photo);
  await page.locator('#menu-photo-preview').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state !== 'loading',
  );
}

async function publicJourney(browser, base, local) {
  const ctx = await context(browser, base),
    { page, errors } = await open(ctx, base);
  if (await page.locator('#menu-clear').isEnabled())
    await page.locator('#menu-clear').click();
  const before = await page.locator('#menu-items [data-menu-item]').count();
  await addItem(page, 'Invalid decimal', '9.999');
  assert.equal(
    await page.locator('#menu-items [data-menu-item]').count(),
    before,
    'invalid precision must not silently round menu prices',
  );
  await addItem(page, 'Bean stew', '9,50');
  await addItem(page, 'Khachapuri', '12.25');
  await addItem(page, 'Grilled vegetables', '16.00');
  assert.equal(await page.locator('#menu-items [data-menu-item]').count(), 3);
  await page.locator('#menu-budget').fill('30.00');
  await page.locator('#menu-people').selectOption('2');
  await confirm(page);
  await page.locator('#menu-generate').click();
  await verifyCombinations(page, 3000, 2, 3);
  const calls = fixture.calls;
  await page.locator('#menu-shuffle').click();
  await verifyCombinations(page, 3000, 2, 3);
  assert.equal(fixture.calls, calls, 'reshuffling makes no paid AI requests');

  await page.locator('#menu-budget').fill('18.99');
  await page.locator('#menu-generate').click();
  assert.equal(
    await page.locator('#menu-combinations [data-combination]').count(),
    0,
    'an impossible budget cannot retain a stale shareable result',
  );
  assert.match(
    await page.locator('#menu-budget-message').textContent(),
    /budget|short|need|minimum|afford/i,
  );
  await page.locator('#menu-budget').fill('30.00');
  await page.locator('#menu-generate').click();
  await verifyCombinations(page, 3000, 2, 3);

  let created;
  try {
    await page
      .locator('#room-title')
      .fill('Menu browser proof — delete after check');
    await page
      .locator('#initial-choices')
      .fill('Original dinner plan\nBackup dinner plan');
    const response = page.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname === '/api/rooms',
    );
    await page.locator('#create-room button[type=submit]').click();
    const reply = await response;
    assert.equal(reply.status(), 201);
    created = await reply.json();
    privateValues.push(
      created.hostToken,
      created.participantToken,
      created.room.id,
    );
    await page
      .locator('#menu-combinations [data-share-combination]')
      .first()
      .waitFor();
    await page.waitForFunction(
      () =>
        !document.querySelector('#menu-combinations [data-share-combination]')
          .disabled,
    );
    const shared = page.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname.endsWith('/choices'),
    );
    await page
      .locator('#menu-combinations [data-share-combination]')
      .first()
      .click();
    assert.equal((await shared).status(), 200);
    const state = await (
      await ctx.request.get(base + '/api/rooms/' + created.room.id)
    ).json();
    assert.equal(
      state.room.choices.length,
      3,
      'only the explicitly selected combination is shared',
    );
    const sharedText = state.room.choices[2].text;
    assert.ok(
      sharedText.length <= 80 &&
        /Bean stew|Khachapuri|Grilled vegetables/.test(sharedText),
    );
    const guest = await context(browser, base),
      guestPage = await guest.newPage();
    await guestPage.goto(base + '/room/' + created.room.id, {
      waitUntil: 'domcontentloaded',
    });
    await guestPage
      .locator('#choices')
      .getByText(sharedText, { exact: true })
      .waitFor();
    await noPhotoStorage(page);
    await page.locator('#menu').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: '/tmp/decision-menu-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await fits(page);
    await page.locator('#menu-shuffle').focus();
    await page.keyboard.press('Enter');
    await verifyCombinations(page, 3000, 2, 3);
    await page.screenshot({
      path: '/tmp/decision-menu-mobile.png',
      fullPage: true,
    });
  } finally {
    if (created?.room?.id && created.hostToken) {
      const reply = await ctx.request.delete(
        base + '/api/rooms/' + created.room.id,
        {
          headers: { Origin: base, 'x-host-token': created.hostToken },
          data: {},
        },
      );
      assert.ok(
        [200, 204, 404].includes(reply.status()),
        'synthetic decision room was deleted',
      );
    }
  }

  const photo = await image(browser, 'Anonymous menu');
  assert.equal(
    await page.locator('#menu-camera').getAttribute('capture'),
    'environment',
  );
  const cameraPicker = page.waitForEvent('filechooser');
  await page.locator('#menu-take-photo').click();
  await (await cameraPicker).setFiles(photo);
  await page.locator('#menu-photo-preview').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state !== 'loading',
  );
  assert.ok(
    await page.locator('#menu-read-photo').isDisabled(),
    'photo scanning requires sign-in',
  );
  assert.ok(
    (await page.locator('#menu-signin').getAttribute('href')).includes(
      '/api/auth/sso/start',
    ),
  );
  const unauthenticated = await ctx.request.post(base + '/api/menu/analyze', {
    headers: { Origin: base },
    data: { image: 'data:image/png;base64,' + photo.buffer.toString('base64') },
  });
  assert.equal(
    unauthenticated.status(),
    401,
    'the backend independently gates anonymous scan requests',
  );
  assert.deepEqual(
    errors,
    [],
    'manual menu and room sharing have no uncaught browser errors',
  );
  if (local)
    assert.equal(
      fixture.calls,
      0,
      'manual mode and unauthenticated scans never call the AI provider',
    );
}

async function aiJourneys(browser, base) {
  const photo = await image(browser),
    second = await image(browser, 'Second menu fixture');
  const verified = await context(browser, base, 'a'.repeat(64));
  const { page, errors } = await open(verified, base);
  await page.waitForFunction(
    () =>
      !document
        .querySelector('#menu-account-status')
        .textContent.match(/checking|loading/i),
  );
  await choosePhoto(page, photo);
  assert.ok(await page.locator('#menu-read-photo').isEnabled());
  const calls = fixture.calls;
  await page.locator('#menu-read-photo').click();
  await page.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state === 'loading',
  );
  await page.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state === 'success',
  );
  assert.equal(fixture.calls, calls + 1);
  assert.equal(await page.locator('#menu-items [data-menu-item]').count(), 5);
  assert.equal(
    await page.locator('#menu-confirm-currency').isChecked(),
    false,
    'extracted prices and currency require explicit review',
  );
  // Locate by the editable input value rather than an HTML attribute snapshot.
  const unknownIndex = await page
    .locator('#menu-items .menu-item-name')
    .evaluateAll(
      (nodes, name) => nodes.findIndex((node) => node.value === name),
      unclearDish,
    );
  assert.ok(
    unknownIndex >= 0 && unclearDish.length > 80,
    'valid long AI dish names are accepted without rejecting the whole menu',
  );
  const unknownRow = page
    .locator('#menu-items [data-menu-item]')
    .nth(unknownIndex);
  assert.equal(
    await unknownRow.locator('.menu-item-selected').isChecked(),
    false,
  );
  assert.equal(await unknownRow.locator('.menu-item-price').inputValue(), '');
  assert.equal(
    await page.locator('#menu-items img').count(),
    0,
    'extracted item names render as literal text',
  );
  assert.equal(await page.evaluate(() => window.__menuXSS), undefined);
  await unknownRow.locator('.menu-item-price').fill('11.25');
  await unknownRow.locator('.menu-item-selected').check();
  await page.locator('#menu-budget').fill('40.00');
  await page.locator('#menu-people').selectOption('2');
  await confirm(page);
  await page.locator('#menu-generate').click();
  await verifyCombinations(page, 4000, 2);
  await page.locator('#menu-shuffle').click();
  assert.equal(fixture.calls, calls + 1);
  await noPhotoStorage(page);
  assert.ok(
    !JSON.stringify(await page.content()).includes(
      'fixture-not-a-real-provider-key',
    ),
  );
  const source = fixture.bodies[fixture.bodies.length - 1];
  assert.ok(
    JSON.stringify(source).includes('data:image/jpeg;base64,'),
    'the real browser resized/reencoded the menu before its API upload',
  );
  await page.locator('#menu').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: '/tmp/decision-menu-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await fits(page);
  await page.screenshot({
    path: '/tmp/decision-menu-mobile.png',
    fullPage: true,
  });

  const unverified = await context(browser, base, 'b'.repeat(64));
  const unverifiedPage = (await open(unverified, base)).page;
  await choosePhoto(unverifiedPage, photo);
  assert.ok(
    await unverifiedPage.locator('#menu-read-photo').isDisabled(),
    'unverified users cannot scan through the UI',
  );
  const forbidden = await unverified.request.post(base + '/api/menu/analyze', {
    headers: { Origin: base },
    data: { image: 'data:image/png;base64,' + photo.buffer.toString('base64') },
  });
  assert.equal(forbidden.status(), 403);
  assert.equal(
    fixture.calls,
    calls + 1,
    'email verification is enforced on the backend too',
  );

  // Each scenario uses another fixture account, preserving real quota behavior.
  fixture.mode = 'delay';
  const cancelled = await context(browser, base, 'c'.repeat(64));
  const cancelPage = (await open(cancelled, base)).page;
  await addItem(cancelPage, 'Keep my draft', '8.50');
  await choosePhoto(cancelPage, photo);
  await cancelPage.locator('#menu-read-photo').click();
  await cancelPage.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state === 'loading',
  );
  await cancelPage.locator('#menu-cancel-scan').click();
  await cancelPage.waitForTimeout(1700);
  assert.equal(
    await cancelPage
      .locator('#menu-items .menu-item-name')
      .first()
      .inputValue(),
    'Keep my draft',
  );
  assert.notEqual(
    await cancelPage.locator('#menu-status').getAttribute('data-state'),
    'loading',
  );

  const stale = await context(browser, base, 'd'.repeat(64));
  const stalePage = (await open(stale, base)).page;
  await addItem(stalePage, 'Original draft', '8.50');
  await choosePhoto(stalePage, second);
  await stalePage.locator('#menu-read-photo').click();
  await stalePage.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state === 'loading',
  );
  await stalePage
    .locator('#menu-items .menu-item-name')
    .first()
    .fill('My edited draft');
  await stalePage.waitForTimeout(1700);
  assert.equal(
    await stalePage.locator('#menu-items .menu-item-name').first().inputValue(),
    'My edited draft',
    'late AI results cannot replace an edited draft',
  );
  assert.equal(
    await stalePage.locator('#menu-items [data-menu-item]').count(),
    1,
  );

  fixture.mode = 'error';
  const failed = await context(browser, base, 'e'.repeat(64));
  const failedPage = (await open(failed, base)).page;
  await addItem(failedPage, 'Saved draft', '7.25');
  await choosePhoto(failedPage, photo);
  await failedPage.locator('#menu-read-photo').click();
  await failedPage.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state === 'error',
  );
  assert.equal(
    await failedPage
      .locator('#menu-items .menu-item-name')
      .first()
      .inputValue(),
    'Saved draft',
  );
  assert.ok(
    await failedPage.locator('#menu-read-photo').isEnabled(),
    'provider failures release the loading state',
  );
  await failedPage
    .locator('#menu-upload')
    .setInputFiles({
      name: 'not-a-menu.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
  await failedPage.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state === 'error',
  );
  await noPhotoStorage(failedPage);

  fixture.mode = 'timeout';
  const timedOut = await context(browser, base, 'f'.repeat(64));
  const timeoutPage = (await open(timedOut, base)).page;
  await addItem(timeoutPage, 'Timeout keeps this draft', '6.25');
  await choosePhoto(timeoutPage, photo);
  await timeoutPage.locator('#menu-read-photo').click();
  await timeoutPage.waitForFunction(
    () => document.querySelector('#menu-status').dataset.state === 'error',
  );
  assert.match(
    await timeoutPage.locator('#menu-status').textContent(),
    /long|time/i,
  );
  assert.equal(
    await timeoutPage
      .locator('#menu-items .menu-item-name')
      .first()
      .inputValue(),
    'Timeout keeps this draft',
  );
  assert.ok(
    await timeoutPage.locator('#menu-read-photo').isEnabled(),
    'a timed-out scan cannot leave the interface busy',
  );
  assert.deepEqual(
    errors,
    [],
    'AI menu interactions have no uncaught browser errors',
  );
}

(async () => {
  let browser;
  try {
    const base = await origin(),
      local = !process.env.DECISIONS_URL;
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    await publicJourney(browser, base, local);
    if (local) await aiJourneys(browser, base);
    console.log(
      local
        ? 'PASS Decision menu: manual prices/budgets, real room sharing, actual upload/HTTP extraction, verified auth, cancellation/stale edits/errors, no-cost reshuffles, private photo handling and mobile keyboard layout.'
        : 'PASS public Decision menu: manual prices/budgets, real room sharing, anonymous AI gates and mobile keyboard layout; no paid AI calls; synthetic room deleted.',
    );
  } finally {
    for (const close of cleanup.reverse()) await close();
    await browser?.close();
  }
})().catch((error) => {
  let report =
    error instanceof Error ? error.stack || error.message : String(error);
  for (const value of privateValues.filter(Boolean))
    report = report.split(value).join('[private fixture value]');
  console.error(report);
  process.exitCode = 1;
});
