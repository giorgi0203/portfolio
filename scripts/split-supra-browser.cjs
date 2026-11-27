/** Run the guest table flow against production or a local server. Only the local scanner is stubbed. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const qrcode = require('qrcode-generator');

async function localHarness() {
  const { createDecisionServer } =
    await import('../apps/decision-department/server/server.mjs');
  const root = path.resolve(__dirname, '../dist/apps/split-supra');
  let api;
  const assets = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname.startsWith('/api/')) {
      api.server.emit('request', req, res);
      return;
    }
    const file = path.resolve(
      root,
      '.' +
        (pathname.startsWith('/table/') || pathname === '/'
          ? '/index.html'
          : pathname),
    );
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': assets[path.extname(file)] || 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  api = createDecisionServer({ supraOrigin: url, databasePath: ':memory:' });
  return {
    url,
    close: async () => {
      await api.close();
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeIdleConnections();
      });
    },
  };
}
(async () => {
  const local = process.env.SUPRA_URL ? null : await localHarness();
  const base = new URL(process.env.SUPRA_URL || local.url).origin;
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const host = await browser.newContext({
    viewport: { width: 1360, height: 940 },
  });
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const home = await host.newPage(),
    guestPage = await guest.newPage(),
    errors = [];
  home.on('pageerror', (e) => errors.push(e.message));
  guestPage.on('pageerror', (e) => errors.push(e.message));
  home.setDefaultTimeout(18000);
  guestPage.setDefaultTimeout(18000);
  let cleanupRoom;
  try {
    await home.goto(base);
    await home.getByRole('heading', { name: 'Split the supra.' }).waitFor();
    assert.ok(
      await home.locator('.hero img').evaluate(async (image) => {
        await image.decode();
        return image.naturalWidth > 200;
      }),
    );
    await home.screenshot({
      path: '/tmp/split-supra-home.png',
      fullPage: true,
    });
    let analyzeCalls = 0;
    if (local) {
      await home.route('**/api/receipt/session', (route) =>
        route.fulfill({
          json: {
            configured: true,
            user: { name: 'Host', emailVerified: true },
            remaining: 3,
          },
        }),
      );
      await home.route('**/api/receipt/analyze', (route) => {
        assert.ok(
          route
            .request()
            .postDataJSON()
            .image.startsWith('data:image/jpeg;base64,'),
        );
        analyzeCalls++;
        return route.fulfill({
          json: {
            currency: 'GEL',
            total: '17.60',
            fee: '1.60',
            warnings: [],
            remaining: 2,
            items: [
              {
                name: 'Khinkali',
                quantity: 4,
                unitPrice: null,
                lineTotal: '10.00',
              },
              {
                name: 'Lemonade',
                quantity: 2,
                unitPrice: '3.00',
                lineTotal: '6.00',
              },
            ],
          },
        });
      });
    }
    await home.getByRole('button', { name: 'Scan a photo' }).click();
    if (local) {
      await home
        .locator('#pick-photo')
        .setInputFiles(
          path.resolve(
            __dirname,
            '../apps/decision-department/tests/fixtures/receipt.png',
          ),
        );
      await home.getByText('Ready to read.', { exact: true }).waitFor();
      assert.equal(analyzeCalls, 0);
      await home
        .getByRole('button', { name: 'Read receipt', exact: true })
        .click();
      await home.getByRole('heading', { name: 'Review the scan' }).waitFor();
      assert.equal(analyzeCalls, 1);
      assert.equal(
        await home.getByLabel('Dish 1 unit price').inputValue(),
        '2.50',
      );
      assert.equal(await home.locator('#bill-total').innerText(), '₾17.60');
    } else {
      await home
        .getByRole('link', { name: 'Sign in to read a receipt' })
        .waitFor();
      assert.match(
        await home
          .getByRole('link', { name: 'Sign in to read a receipt' })
          .getAttribute('href'),
        /^https:\/\/decisions\.giorgi\.app\/api\/auth\/sso\/start\?returnTo=\/supra$/,
      );
      await home.getByLabel('Dish 1 name').fill('Khinkali');
      await home.getByLabel('Dish 1 quantity').fill('4');
      await home.getByLabel('Dish 1 unit price').fill('2.50');
      await home.getByRole('button', { name: 'Add another item' }).click();
      await home.getByLabel('Dish 2 name').fill('Lemonade');
      await home.getByLabel('Dish 2 quantity').fill('2');
      await home.getByLabel('Dish 2 unit price').fill('3.00');
      await home.locator('input[name=fee]').fill('1.60');
    }
    await home.getByRole('button', { name: 'Scan a photo' }).click();
    await home.getByLabel('Your name').fill('First seat');
    await home.getByLabel('Table name').fill('Receipt browser check');
    if (local) {
      await home
        .getByRole('button', { name: 'Open table', exact: false })
        .click();
      await home.locator('#confirm-scan:invalid').waitFor();
      assert.equal(new URL(home.url()).pathname, '/');
      await home.locator('#confirm-scan').check();
    }
    await home
      .getByRole('button', { name: 'Open table', exact: false })
      .click();
    await home
      .getByRole('heading', { name: 'Receipt browser check' })
      .waitFor();
    const link = await home.getByLabel('Table invite link').inputValue(),
      id = new URL(link).pathname.split('/').pop();
    assert.equal(new URL(link).origin, base);
    assert.match(id, /^[a-zA-Z0-9_-]{32}$/u);
    const token = await home.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem('split-supra:seat:' + id))
          .participantToken,
      id,
    );
    assert.ok(!link.includes(token));
    cleanupRoom = { id, token };
    const code = qrcode(0, 'M');
    code.addData(link);
    code.make();
    assert.equal(
      await home
        .getByRole('img', { name: 'QR code to join this table' })
        .getAttribute('src'),
      code.createDataURL(5, 20),
    );
    await home.getByRole('button', { name: 'Claim Khinkali' }).click();
    await home.getByText('Shares updated.').waitFor();
    await guestPage.goto(link);
    await guestPage.getByLabel('Your name').fill('Second seat');
    await guestPage.getByRole('button', { name: 'Join table' }).click();
    await guestPage.getByText('You joined the table.').waitFor();
    await guestPage.getByRole('button', { name: 'Claim Khinkali' }).click();
    await guestPage.getByText('Shares updated.').waitFor();
    await guestPage.getByRole('button', { name: 'Claim Lemonade' }).click();
    await guestPage.waitForFunction(
      () =>
        document.querySelector('#your-share strong')?.textContent === '₾12.10',
    );
    await home.waitForFunction(
      () =>
        document.querySelector('#your-share strong')?.textContent === '₾5.50',
    );
    await guestPage
      .getByRole('button', { name: 'Add one share of Khinkali' })
      .click();
    await guestPage.waitForFunction(
      () =>
        document.querySelector('#your-share strong')?.textContent === '₾13.94',
    );
    await guestPage
      .getByRole('button', { name: 'Remove one share of Khinkali' })
      .click();
    await guestPage.waitForFunction(
      () =>
        document.querySelector('#your-share strong')?.textContent === '₾12.10',
    );
    await home.reload();
    await home.getByRole('button', { name: 'Close table' }).waitFor();
    await home.waitForFunction(
      () =>
        document.querySelector('#your-share strong')?.textContent === '₾5.50',
    );
    await guestPage.reload();
    await guestPage.waitForFunction(
      () =>
        document.querySelector('#your-share strong')?.textContent === '₾12.10',
    );
    assert.equal(
      await guestPage.getByRole('button', { name: 'Close table' }).count(),
      0,
    );
    assert.ok(
      await guestPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await guestPage.screenshot({
      path: '/tmp/split-supra-mobile.png',
      fullPage: true,
    });
    await home.screenshot({
      path: '/tmp/split-supra-table.png',
      fullPage: true,
    });
    home.once('dialog', (dialog) => dialog.accept());
    await home.getByRole('button', { name: 'Close table' }).click();
    await home
      .getByRole('heading', { name: 'This table is closed.' })
      .waitFor();
    cleanupRoom = null;
    await guestPage
      .getByRole('heading', { name: 'This table is closed.' })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS shared receipt creation, QR, separate seats, weighted claims, service fee rounding, live updates, reload, close and mobile fit.',
    );
    console.log(
      local
        ? 'PASS receipt upload, explicit scan, uncertain-price recovery and required review with a fixture.'
        : 'PASS sign-in gate and credentialed receipt-session access from the public Supra origin.',
    );
  } finally {
    if (cleanupRoom)
      await home.request
        .delete(base + '/api/supra/rooms/' + cleanupRoom.id, {
          headers: { Origin: base, 'X-Participant-Token': cleanupRoom.token },
          data: {},
        })
        .catch(() => {});
    await browser.close();
    if (local) await local.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
