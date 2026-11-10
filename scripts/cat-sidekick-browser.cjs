const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

// Exercise the production bundle without sending analytics/contact messages or
// navigating to the real project apps. Screenshots retain the actual site art.
const root = path.resolve('dist/apps/portfolio');
async function isolatedContext(browser, options = {}) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => {
    try {
      localStorage.setItem('giorgi-google-analytics-consent-v1', 'deny');
    } catch {
      /* Cross-origin/opaque auth frames have no storage fixture. */
    }
  });
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
async function start(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => {
    page.__errors.push(error.message);
  });
  page.__errors = [];
  await page.goto('https://giorgi.app/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-cat-sprite]').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-cat-sprite]')?.dataset.surface ===
      'portrait',
  );
  return page;
}
async function settled(page) {
  await page.waitForFunction(
    () =>
      !['jumping', 'crouching'].includes(
        document.querySelector('[data-cat-sprite]')?.dataset.state,
      ),
  );
}
async function documentPosition(page) {
  return page.locator('[data-cat-sprite]').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x + scrollX,
      y: rect.y + scrollY,
      surface: node.dataset.surface,
    };
  });
}
async function pose(page, selectors) {
  return page
    .locator('[data-cat-sprite]')
    .evaluate(
      (node, selectors) =>
        selectors.map(
          (selector) =>
            getComputedStyle(node.querySelector(selector)).transform,
        ),
      selectors,
    );
}
async function expectPoseChange(page, selectors, before, message) {
  await page.waitForFunction(
    ({ selectors, before }) => {
      const root = document.querySelector('[data-cat-sprite]');
      return (
        JSON.stringify(
          selectors.map(
            (selector) =>
              getComputedStyle(root.querySelector(selector)).transform,
          ),
        ) !== JSON.stringify(before)
      );
    },
    { selectors, before },
  );
  assert.notDeepEqual(await pose(page, selectors), before, message);
}
async function noControlCollision(page, selectors) {
  return page.locator('[data-cat-sprite]').evaluate((node, selectors) => {
    const cat = node.getBoundingClientRect();
    return ![...document.querySelectorAll(selectors)].some((control) => {
      const rect = control.getBoundingClientRect();
      return (
        rect.width &&
        rect.height &&
        cat.left < rect.right &&
        cat.right > rect.left &&
        cat.top < rect.bottom &&
        cat.bottom > rect.top
      );
    });
  }, selectors);
}
async function assertNoOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'cat and controls create no horizontal overflow',
  );
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
    const page = await start(desktop);
    await settled(page);
    const sprite = page.locator('[data-cat-sprite]');
    assert.equal(
      await sprite.evaluate((node) => getComputedStyle(node).position),
      'absolute',
      'cat belongs to the document, not the viewport',
    );
    assert.equal(
      await sprite.evaluate((node) => getComputedStyle(node).pointerEvents),
      'none',
    );
    assert.ok(
      await noControlCollision(
        page,
        '.cat-label,.human-stamp,h1,.hero-actions',
      ),
      'portrait companion leaves labels and controls clear',
    );
    await page.screenshot({ path: '/tmp/cat-v2-hero.png' });

    await page.mouse.move(200, 200);
    const looking = await pose(page, ['.cat-head', '.cat-pupil']);
    await page.mouse.move(1350, 350);
    await expectPoseChange(
      page,
      ['.cat-head', '.cat-pupil'],
      looking,
      'GSAP rig turns its head/eyes toward the pointer',
    );

    // Native scrolling must not move the cat to a new habitat or make it float
    // in the viewport. Only a deliberate project hover selects another home.
    await settled(page);
    const beforeScroll = await documentPosition(page);
    const card = page.locator('[data-app-card]').first();
    await card.evaluate((node) =>
      window.scrollTo({
        top: scrollY + node.getBoundingClientRect().top - 350,
        behavior: 'instant',
      }),
    );
    await page.waitForTimeout(700);
    const afterScroll = await documentPosition(page);
    assert.equal(
      afterScroll.surface,
      'portrait',
      'scroll alone does not select a project habitat',
    );
    assert.ok(
      Math.abs(beforeScroll.x - afterScroll.x) < 1 &&
        Math.abs(beforeScroll.y - afterScroll.y) < 1,
      'document position stays fixed while the page scrolls',
    );
    const cardRect = await card.boundingBox();
    await page.mouse.move(cardRect.x + cardRect.width / 2, cardRect.y + 90);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cat-sprite]')?.dataset.surface === 'card',
    );
    await settled(page);
    await sprite.waitFor({ state: 'visible' });
    assert.ok(
      await noControlCollision(
        page,
        'h1,h2,.filters button,.project-toolbar .tiny-note,.project-body',
      ),
      'project companion leaves headings, filters and task links clear',
    );
    const landed = await sprite.boundingBox();
    assert.ok(
      landed.x >= 0 && landed.x + landed.width <= 1440,
      'project cat remains within the page width',
    );
    assert.ok(
      await sprite.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return !document
          .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          ?.closest('[data-cat-sprite]');
      }),
      'decorative cat never captures project clicks',
    );
    await page.screenshot({ path: '/tmp/cat-v2-projects.png' });

    const petBefore = await pose(page, ['.cat-head', '.cat-ear-left']);
    await page
      .getByRole('button', { name: 'Pet the cat', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cat-sprite]')?.dataset.state ===
        'petting',
    );
    await expectPoseChange(
      page,
      ['.cat-head', '.cat-ear-left'],
      petBefore,
      'petting moves the head/ear rig',
    );
    const playBefore = await pose(page, ['.cat-body', '.cat-left-paw']);
    await page
      .getByRole('button', { name: 'Play with the cat', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cat-sprite]')?.dataset.state ===
        'playing',
    );
    await expectPoseChange(
      page,
      ['.cat-body', '.cat-left-paw'],
      playBefore,
      'playing animates the body/paw rig',
    );
    await page
      .getByRole('button', { name: 'Let the cat nap', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cat-sprite]')?.dataset.state ===
        'sleeping',
    );
    assert.ok(
      await sprite
        .locator('.sleep-eyes')
        .evaluate(
          (node) =>
            getComputedStyle(node).display !== 'none' &&
            Number(getComputedStyle(node).opacity) > 0,
        ),
      'nap closes the illustrated eyes',
    );

    await page.getByRole('button', { name: 'Cat: pause', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-cat-sprite]')?.dataset.state === 'paused',
    );
    const pausedPose = await pose(page, [
      '.cat-body',
      '.cat-head',
      '.cat-tail',
    ]);
    await page.mouse.move(400, 100);
    await page.waitForTimeout(500);
    assert.deepEqual(
      await pose(page, ['.cat-body', '.cat-head', '.cat-tail']),
      pausedPose,
      'pause freezes all rig motion',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: 'Cat: play', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Cat: play', exact: true }).click();
    await page
      .getByRole('button', { name: 'Cat: pause', exact: true })
      .waitFor();

    // Check local modal behavior without authenticating or contacting auth.
    await page.keyboard.press('Meta+Period');
    await page.locator('dialog[open]').waitFor();
    await sprite.waitFor({ state: 'hidden' });
    await page
      .getByRole('button', { name: 'Close sign-in', exact: true })
      .click();
    await page.getByLabel('Your name', { exact: true }).fill('Cat test');
    await page
      .getByLabel('Email address', { exact: true })
      .fill('cat-test@example.com');
    await page
      .getByLabel('What are we building?', { exact: true })
      .fill('Animation test only; this contact message is never submitted.');
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
      'project links remain normally clickable',
    );
    assert.deepEqual(page.__errors, [], 'desktop has no uncaught page errors');
    await desktop.close();

    const reduced = await isolatedContext(browser, {
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    const quietPage = await start(reduced);
    await quietPage.waitForFunction(
      () =>
        document.querySelector('[data-cat-sprite]')?.dataset.motion ===
        'reduced',
    );
    const quietPose = await pose(quietPage, [
      '.cat-body',
      '.cat-head',
      '.cat-tail',
      '.cat-left-paw',
    ]);
    await quietPage.mouse.move(300, 250);
    await quietPage.mouse.move(1300, 250);
    await quietPage
      .getByRole('button', { name: 'Play with the cat', exact: true })
      .click();
    await quietPage.waitForTimeout(700);
    assert.deepEqual(
      await pose(quietPage, [
        '.cat-body',
        '.cat-head',
        '.cat-tail',
        '.cat-left-paw',
      ]),
      quietPose,
      'reduced motion prevents automatic and requested animated sequences',
    );
    assert.equal(
      await quietPage
        .locator('[data-cat-sprite]')
        .evaluate((node) =>
          [...node.querySelectorAll('*')].some(
            (child) => getComputedStyle(child).animationName !== 'none',
          ),
        ),
      false,
    );
    assert.deepEqual(quietPage.__errors, []);
    await reduced.close();

    for (const reducedMotion of ['no-preference', 'reduce']) {
      const mobile = await isolatedContext(browser, {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        reducedMotion,
      });
      const mobilePage = await start(mobile);
      await mobilePage.locator('.portrait-scene').evaluate((node) =>
        window.scrollTo({
          top: scrollY + node.getBoundingClientRect().top - 140,
          behavior: 'instant',
        }),
      );
      await settled(mobilePage);
      const mobileSprite = mobilePage.locator('[data-cat-sprite]');
      assert.ok(
        await noControlCollision(
          mobilePage,
          '.cat-label,.human-stamp,.portrait-label,.hero-footnote,.site-header',
        ),
        'mobile portrait labels remain clear',
      );
      const phoneCat = await mobileSprite.boundingBox();
      const phonePortrait = await mobilePage
        .locator('.portrait-scene')
        .boundingBox();
      assert.ok(
        phoneCat.y >= phonePortrait.y - 2 &&
          phoneCat.y + phoneCat.height <=
            phonePortrait.y + phonePortrait.height + 2,
        'mobile cat stays within the portrait rather than hiding above it',
      );
      await assertNoOverflow(mobilePage);
      if (reducedMotion === 'no-preference') {
        const mobilePose = await pose(mobilePage, [
          '.cat-head',
          '.cat-left-paw',
        ]);
        await mobilePage
          .getByRole('button', { name: 'Pet the cat', exact: true })
          .tap();
        await mobilePage.waitForFunction(
          () =>
            document.querySelector('[data-cat-sprite]')?.dataset.state ===
            'petting',
        );
        await expectPoseChange(
          mobilePage,
          ['.cat-head', '.cat-left-paw'],
          mobilePose,
          'touch controls animate an explicit pet interaction',
        );
        await mobilePage.locator('.portrait-scene').evaluate((node) =>
          window.scrollTo({
            top: scrollY + node.getBoundingClientRect().top - 140,
            behavior: 'instant',
          }),
        );
        await mobilePage.waitForFunction(
          () =>
            document.querySelector('[data-cat-sprite]')?.dataset.state !==
            'petting',
        );
        await mobilePage.screenshot({ path: '/tmp/cat-v2-mobile.png' });
      }
      assert.deepEqual(mobilePage.__errors, []);
      await mobile.close();
    }
    console.log(
      'PASS illustrated GSAP cat: head/eye rig, document anchoring, deliberate project habitat, pet/play/nap sequences, pause persistence, forms/modal/links, reduced motion and mobile controls.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
