const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

// Exercise the production bundle at its actual origin without sending analytics
// or contact messages, navigating to project apps, or depending on the network.
const root = path.resolve('dist/apps/portfolio');
async function isolatedContext(browser, options = {}) {
  const context = await browser.newContext(options);
  await context.addInitScript(() =>
    localStorage.setItem('giorgi-google-analytics-consent-v1', 'deny'),
  );
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'giorgi.app') return route.abort();
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ json: { ok: true } });
    const file = path.resolve(
      root,
      '.' + (url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file))
      return route.fulfill({ status: 404, body: 'Missing fixture' });
    return route.fulfill({ path: file });
  });
  return context;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const desktop = await isolatedContext(browser, {
      viewport: { width: 1440, height: 1000 },
    });
    const page = await desktop.newPage();
    page.setDefaultTimeout(20000);
    await page.goto('https://giorgi.app/', { waitUntil: 'domcontentloaded' });
    const cat = page.locator('[data-cat-sidekick]');
    const sprite = page.locator('[data-cat-sprite]');
    await cat.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cat-sidekick]')?.dataset.motion ===
        'full',
    );
    await page.waitForTimeout(1200);
    await page.waitForFunction(
      () =>
        !['jumping', 'crouching'].includes(
          document.querySelector('[data-cat-sidekick]')?.dataset.state,
        ),
    );
    assert.ok(
      await sprite.evaluate((node) => {
        const cat = node.getBoundingClientRect();
        return ![...document.querySelectorAll('.cat-label,.human-stamp')].some(
          (control) => {
            const rect = control.getBoundingClientRect();
            return (
              cat.left < rect.right &&
              cat.right > rect.left &&
              cat.top < rect.bottom &&
              cat.bottom > rect.top
            );
          },
        );
      }),
      'initial perched cat does not cover the portrait labels',
    );
    await page.screenshot({ path: '/tmp/cat-sidekick-hero.png' });
    assert.equal(
      await sprite.evaluate((node) => getComputedStyle(node).pointerEvents),
      'none',
    );
    await page.mouse.move(300, 270);
    const lookBefore = await cat.evaluate((node) => [
      node.style.getPropertyValue('--look-x'),
      node.style.getPropertyValue('--look-y'),
    ]);
    await page.mouse.move(1350, 160);
    await page.waitForFunction((before) => {
      const cat = document.querySelector('[data-cat-sidekick]');
      return (
        cat &&
        JSON.stringify([
          cat.style.getPropertyValue('--look-x'),
          cat.style.getPropertyValue('--look-y'),
        ]) !== JSON.stringify(before)
      );
    }, lookBefore);

    // Observe the actual crouch / flight / landing, with no test-only setters.
    await page.evaluate(() => {
      window.__catStates = [];
      const cat = document.querySelector('[data-cat-sidekick]');
      new MutationObserver(() =>
        window.__catStates.push(cat.dataset.state),
      ).observe(cat, { attributes: true, attributeFilter: ['data-state'] });
    });
    const card = page.locator('[data-app-card]').first();
    await card.evaluate((node) =>
      window.scrollTo({
        top: scrollY + node.getBoundingClientRect().top - 350,
        behavior: 'instant',
      }),
    );
    const cardRect = await card.boundingBox();
    await page.mouse.move(cardRect.x + cardRect.width - 100, cardRect.y + 40);
    await page.waitForFunction(() => {
      const cat = document.querySelector('[data-cat-sidekick]');
      return (
        cat?.dataset.surface === 'card' &&
        window.__catStates.includes('jumping') &&
        cat.dataset.state !== 'jumping' &&
        cat.dataset.state !== 'crouching'
      );
    });
    const landed = await sprite.boundingBox();
    const surfaces = await page
      .locator('[data-app-card]')
      .evaluateAll((cards) =>
        cards.map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, top: rect.top, right: rect.right };
        }),
      );
    assert.ok(
      surfaces.some(
        (rect) =>
          Math.abs(landed.y + landed.height - rect.top) < 8 &&
          landed.x >= rect.x - 5 &&
          landed.x + landed.width <= rect.right + 5,
      ),
      'cat paws land on an actual card edge',
    );
    assert.ok(
      landed.x >= 0 && landed.x + landed.width <= 1440 && landed.y >= 90,
      'cat stays below the header and within the viewport',
    );
    assert.ok(
      await sprite.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return !document
          .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          ?.closest('[data-cat-sprite]');
      }),
      'cat art cannot intercept the pointer',
    );
    assert.ok(
      await sprite.evaluate((node) => {
        const cat = node.getBoundingClientRect();
        return ![
          ...document.querySelectorAll(
            'h1,h2,.filters button,.project-toolbar .tiny-note',
          ),
        ].some((control) => {
          const rect = control.getBoundingClientRect();
          return (
            cat.left < rect.right &&
            cat.right > rect.left &&
            cat.top < rect.bottom &&
            cat.bottom > rect.top
          );
        });
      }),
      'perched cat does not cover headings or project filters',
    );
    await page.screenshot({ path: '/tmp/cat-sidekick-desktop.png' });

    await page.getByRole('button', { name: 'Cat: pause', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cat-sidekick]')?.dataset.state ===
        'paused',
    );
    await page.waitForTimeout(800); // Let the button's automatic scroll settle before measuring.
    const paused = await sprite.boundingBox();
    await page.mouse.move(100, 200);
    await page.waitForTimeout(900);
    const stillPaused = await sprite.boundingBox();
    assert.ok(
      Math.abs(paused.x - stillPaused.x) < 1 &&
        Math.abs(paused.y - stillPaused.y) < 1,
      'paused cat stays put',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: 'Cat: play', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Cat: play', exact: true }).click();
    await page
      .getByRole('button', { name: 'Cat: pause', exact: true })
      .waitFor();

    // Form fields and card links remain normal DOM controls.
    await page.getByLabel('Your name', { exact: true }).fill('Cat test');
    await page
      .getByLabel('Email address', { exact: true })
      .fill('cat-test@example.com');
    await page
      .getByLabel('What are we building?', { exact: true })
      .fill('A little animation, no message will be sent.');
    assert.equal(
      await page.getByLabel('Your name', { exact: true }).inputValue(),
      'Cat test',
    );
    const link = page.getByRole('link', {
      name: 'Open HLS Inspector',
      exact: true,
    });
    await link.scrollIntoViewIfNeeded();
    assert.ok(
      await link.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return (
          document
            .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            ?.closest('a') === node
        );
      }),
      'project links remain clickable',
    );
    await desktop.close();

    const reduced = await isolatedContext(browser, {
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    const quietPage = await reduced.newPage();
    await quietPage.goto('https://giorgi.app/', {
      waitUntil: 'domcontentloaded',
    });
    await quietPage.waitForFunction(
      () =>
        document.querySelector('[data-cat-sidekick]')?.dataset.motion ===
        'reduced',
    );
    const quietSprite = quietPage.locator('[data-cat-sprite]');
    await quietPage.waitForTimeout(1200); // The route mounts after the root component; wait for its one initial anchor.
    const quietBefore = await quietSprite.boundingBox();
    await quietPage.mouse.move(300, 250);
    await quietPage.mouse.move(1300, 250);
    await quietPage.waitForTimeout(1000);
    assert.deepEqual(
      await quietSprite.boundingBox(),
      quietBefore,
      'reduced-motion cat does not chase the pointer',
    );
    assert.equal(
      await quietSprite.evaluate((node) =>
        [...node.querySelectorAll('*')].some(
          (child) => getComputedStyle(child).animationName !== 'none',
        ),
      ),
      false,
      'reduced motion disables decorative keyframes',
    );
    await reduced.close();

    const mobile = await isolatedContext(browser, {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto('https://giorgi.app/', {
      waitUntil: 'domcontentloaded',
    });
    await mobilePage.waitForFunction(
      () =>
        document.querySelector('[data-cat-sidekick]')?.dataset.motion ===
        'touch',
    );
    const mobileSprite = mobilePage.locator('[data-cat-sprite]');
    await mobilePage.waitForTimeout(1200); // Wait for routed page layout and the initial perch to settle.
    if (!(await mobileSprite.isVisible())) {
      await mobilePage
        .locator('.portrait-scene')
        .evaluate((node) =>
          window.scrollTo({
            top: scrollY + node.getBoundingClientRect().top - 180,
            behavior: 'instant',
          }),
        );
      await mobileSprite.waitFor({ state: 'visible' });
      await mobilePage.waitForTimeout(900);
    }
    await mobilePage.screenshot({ path: '/tmp/cat-sidekick-mobile.png' });
    const mobileBefore = await mobileSprite.boundingBox();
    await mobilePage.touchscreen.tap(180, 240);
    await mobilePage.waitForTimeout(1000);
    assert.deepEqual(
      await mobileSprite.boundingBox(),
      mobileBefore,
      'touch visits have no cursor chasing',
    );
    assert.ok(
      await mobilePage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'cat creates no horizontal overflow',
    );
    const mobileRect = await mobileSprite.boundingBox();
    assert.ok(
      mobileRect.x >= 0 &&
        mobileRect.x + mobileRect.width <= 390 &&
        mobileRect.y >= 78,
      'mobile cat stays inside safe viewport',
    );
    await mobilePage.screenshot({ path: '/tmp/cat-sidekick-mobile.png' });
    await mobile.close();
    const quietMobile = await isolatedContext(browser, {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const quietMobilePage = await quietMobile.newPage();
    await quietMobilePage.goto('https://giorgi.app/', {
      waitUntil: 'domcontentloaded',
    });
    await quietMobilePage.waitForFunction(
      () =>
        document.querySelector('[data-cat-sidekick]')?.dataset.motion ===
        'reduced',
    );
    await quietMobilePage.waitForTimeout(1200);
    const quietMobileSprite = quietMobilePage.locator('[data-cat-sprite]');
    if (!(await quietMobileSprite.isVisible())) {
      await quietMobilePage
        .locator('.portrait-scene')
        .evaluate((node) =>
          window.scrollTo({
            top: scrollY + node.getBoundingClientRect().top - 180,
            behavior: 'instant',
          }),
        );
      await quietMobileSprite.waitFor({ state: 'visible' });
      await quietMobilePage.waitForTimeout(900);
    }
    const quietMobileRect = await quietMobileSprite.boundingBox();
    assert.equal(
      quietMobileRect.width,
      86,
      'touch + reduced-motion keeps compact geometry',
    );
    assert.equal(quietMobileRect.height, 95);
    assert.ok(
      quietMobileRect.x >= 0 &&
        quietMobileRect.x + quietMobileRect.width <= 390 &&
        quietMobileRect.y >= 78,
    );
    assert.ok(
      await quietMobilePage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await quietMobile.close();
    console.log(
      'PASS cartoon cat: pointer tracking, crouch/pounce, real card landing, click-through art, pause persistence, usable forms/links, reduced motion and touch layout.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
