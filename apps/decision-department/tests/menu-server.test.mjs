import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDecisionServer } from '../server/server.mjs';
import { normalizeMenu, validateMenuImage } from '../server/menu-ai.mjs';

const ORIGIN = 'https://decisions.test';
const TOKEN = '1'.repeat(64);
const OTHER = '2'.repeat(64);
const USER = {
  id: 'test-menu-account',
  name: 'Menu friend',
  email: 'friend@example.invalid',
  emailVerified: true,
};
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XcAAAAASUVORK5CYII=',
  'base64',
);
const image = (suffix = '') =>
  'data:image/png;base64,' +
  Buffer.concat([PNG, Buffer.from(suffix)]).toString('base64');
const MENU = {
  currency: 'GEL',
  items: [
    { name: 'ხინკალი', price: '2.50', category: 'main' },
    { name: 'Lemonade', price: null, category: 'drink' },
  ],
  warnings: ['Confirm unclear prices before choosing a meal.'],
};
const reply = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const vision = (value) =>
  reply({ choices: [{ message: { content: JSON.stringify(value) } }] });

async function eventually(condition) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline)
      throw new Error('Expected background work did not arrive');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'menu-test-'));
  let now = 1_700_000_000_000,
    service,
    base;
  let providerCalls = 0;
  const users = new Map([
    [TOKEN, USER],
    [OTHER, { ...USER, id: 'another-account' }],
  ]);
  const identityCalls = [],
    providerBodies = [];
  const identityFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    identityCalls.push({ url, body });
    if (url.endsWith('/api/sso/session'))
      return reply({ user: users.get(body.session_token) || null });
    if (url.endsWith('/api/sso/logout')) {
      users.delete(body.session_token);
      return reply({ ok: true });
    }
    if (url.endsWith('/api/sso/token'))
      return reply({ user: USER, sessionToken: TOKEN });
    throw new Error('Unexpected identity route');
  };
  async function start() {
    service = createDecisionServer({
      databasePath: join(directory, 'rooms.sqlite'),
      origin: ORIGIN,
      clock: () => now,
      menu: {
        identityFetch,
        ai: {
          apiKey: 'fixture-only',
          baseUrl: 'https://ai.fixture/v1',
          model: 'fixture-vision',
        },
        providerFetch: async (url, init) => {
          providerCalls++;
          providerBodies.push(JSON.parse(init.body));
          return options.provider ? options.provider(url, init) : vision(MENU);
        },
        ...options.menu,
      },
    });
    await new Promise((resolve) =>
      service.server.listen(0, '127.0.0.1', resolve),
    );
    base = 'http://127.0.0.1:' + service.server.address().port;
  }
  await start();
  t.after(async () => {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  });

  async function call(
    path,
    {
      method = 'GET',
      body,
      cookie = '',
      origin = ORIGIN,
      raw,
      headers = {},
      signal,
    } = {},
  ) {
    const requestHeaders = { ...headers };
    if (cookie) requestHeaders.Cookie = cookie;
    if (method !== 'GET') {
      requestHeaders['Content-Type'] = 'application/json';
      if (origin !== null) requestHeaders.Origin = origin;
    }
    const response = await fetch(base + path, {
      method,
      headers: requestHeaders,
      redirect: 'manual',
      body: method === 'GET' ? undefined : (raw ?? JSON.stringify(body ?? {})),
      signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  }
  const scan = (photo = image(), token = TOKEN) =>
    call('/api/menu/analyze', {
      method: 'POST',
      cookie: '__Host-giorgi_decisions=' + token,
      body: { image: photo },
    });
  return {
    call,
    scan,
    users,
    identityCalls,
    providerBodies,
    providerCalls: () => providerCalls,
    advance: (ms) => (now += ms),
    restart: async () => {
      await service.close();
      await start();
    },
  };
}

test('menu session is anonymous without a cookie and scan requires a live verified central grant', async (t) => {
  const app = await fixture(t);
  let result = await app.call('/api/menu/session');
  assert.deepEqual(result.body, {
    user: null,
    configured: true,
    limits: { daily: 3, globalDaily: 30 },
  });
  assert.equal(
    (
      await app.call('/api/menu/analyze', {
        method: 'POST',
        body: { image: image() },
      })
    ).status,
    401,
  );
  assert.equal((await app.scan(image(), '3'.repeat(64))).status, 401);
  app.users.set(TOKEN, { ...USER, emailVerified: false });
  assert.equal((await app.scan()).status, 403);
  app.users.set(TOKEN, USER);
  result = await app.call('/api/menu/session', {
    cookie: '__Host-giorgi_decisions=' + TOKEN,
  });
  assert.equal(result.body.remaining, 3);
  assert.equal(result.body.user.emailVerified, true);
  assert.equal(app.providerCalls(), 0);
  assert.equal(
    (
      await app.call('/api/menu/session', {
        cookie:
          '__Host-giorgi_decisions=' +
          TOKEN +
          '; __Host-giorgi_decisions=' +
          OTHER,
      })
    ).body.user,
    null,
  );
  assert.match(result.headers.get('cache-control'), /no-store/u);
});

test('scan reads real structured vision output once; a private duplicate result is cached without another charge', async (t) => {
  const app = await fixture(t);
  const first = await app.scan();
  assert.equal(first.status, 200);
  assert.equal(first.body.items[0].name, 'ხინკალი');
  assert.equal(first.body.items[0].price, '2.50');
  assert.equal(first.body.items[1].price, null);
  assert.equal(first.body.remaining, 2);
  const second = await app.scan();
  assert.equal(second.status, 200);
  assert.equal(second.body.cached, true);
  assert.equal(second.body.remaining, 2);
  assert.equal(app.providerCalls(), 1);
  assert.equal(
    app.providerBodies[0].messages[1].content[1].image_url.url,
    image(),
  );
  assert.equal(app.providerBodies[0].max_tokens, 3500);
  assert.ok(
    app.providerBodies[0].messages[0].content.includes('untrusted data'),
  );
  // Another account does not receive the first account's cached menu.
  assert.equal((await app.scan(image(), OTHER)).status, 200);
  assert.equal(app.providerCalls(), 2);
});

test('cross-origin requests, non-images, malformed requests and oversized photos never call AI', async (t) => {
  const app = await fixture(t);
  const cookie = '__Host-giorgi_decisions=' + TOKEN;
  const post = (extra) =>
    app.call('/api/menu/analyze', {
      method: 'POST',
      cookie,
      body: { image: image() },
      ...extra,
    });
  assert.equal(
    (await post({ origin: 'https://attacker.invalid' })).status,
    403,
  );
  assert.equal((await post({ origin: null })).status, 403);
  assert.equal((await post({ raw: '{bad' })).status, 400);
  assert.equal(
    (await post({ body: { image: image(), url: 'https://attacker.invalid' } }))
      .status,
    400,
  );
  for (const value of [
    'https://attacker.invalid/menu.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/jpeg;base64,' + PNG.toString('base64'),
    'data:image/png;base64,aaa',
  ])
    assert.equal((await app.scan(value)).status, 400);
  assert.equal(
    (
      await app.scan(
        'data:image/png;base64,' + Buffer.alloc(1_500_001).toString('base64'),
      )
    ).status,
    413,
  );
  const hugeDimensions = Buffer.from(PNG);
  hugeDimensions.writeUInt32BE(100_000, 16);
  assert.equal(
    (
      await app.scan(
        'data:image/png;base64,' + hugeDimensions.toString('base64'),
      )
    ).status,
    413,
  );
  assert.equal(
    (await post({ raw: JSON.stringify({ image: 'x'.repeat(2_200_000) }) }))
      .status,
    413,
  );
  assert.equal(app.providerCalls(), 0);
});

test('PKCE sign-in is bound to a one-use cookie state, with a constrained return path and no browser token JSON', async (t) => {
  const app = await fixture(t);
  const room = 'a'.repeat(32);
  const start = await app.call(
    '/api/auth/sso/start?returnTo=' + encodeURIComponent('/room/' + room),
  );
  assert.equal(start.status, 303);
  const target = new URL(start.headers.get('location'));
  assert.equal(target.origin, 'https://auth.giorgi.app');
  assert.equal(target.searchParams.get('client_id'), 'decision-department');
  const state = target.searchParams.get('state');
  const cookie = start.headers.get('set-cookie').split(';')[0];
  assert.match(
    start.headers.get('set-cookie'),
    /HttpOnly; SameSite=Lax; Max-Age=600; Secure/u,
  );
  const callback =
    '/api/auth/sso/callback?state=' + state + '&code=' + 'a'.repeat(64);
  assert.equal((await app.call(callback)).status, 400);
  assert.equal(
    (
      await app.call(callback, {
        cookie: '__Host-giorgi_decisions_pending=' + '9'.repeat(64),
      })
    ).status,
    400,
  );
  const result = await app.call(callback, { cookie });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), '/room/' + room + '#menu');
  assert.ok(
    result.headers
      .get('set-cookie')
      .includes('__Host-giorgi_decisions=' + TOKEN),
  );
  assert.equal(result.body, null);
  const exchange = app.identityCalls.find((x) => x.url.endsWith('/token')).body;
  assert.equal(
    createHash('sha256').update(exchange.code_verifier).digest('base64url'),
    target.searchParams.get('code_challenge'),
  );
  assert.equal((await app.call(callback, { cookie })).status, 400);
  const unsafeStart = await app.call(
    '/api/auth/sso/start?returnTo=https://attacker.invalid/',
  );
  const unsafeState = new URL(
    unsafeStart.headers.get('location'),
  ).searchParams.get('state');
  const safe = await app.call(
    '/api/auth/sso/callback?state=' + unsafeState + '&code=' + 'b'.repeat(64),
    { cookie: unsafeStart.headers.get('set-cookie').split(';')[0] },
  );
  assert.equal(safe.headers.get('location'), '/#menu');
});

test('expired sign-in states and revoked grants fail closed; same-origin logout revokes the grant', async (t) => {
  const app = await fixture(t);
  const start = await app.call('/api/auth/sso/start');
  const target = new URL(start.headers.get('location'));
  app.advance(600_001);
  assert.equal(
    (
      await app.call(
        '/api/auth/sso/callback?state=' +
          target.searchParams.get('state') +
          '&code=' +
          'b'.repeat(64),
        { cookie: start.headers.get('set-cookie').split(';')[0] },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await app.call('/api/menu/logout', {
        method: 'POST',
        cookie: '__Host-giorgi_decisions=' + TOKEN,
        origin: 'https://attacker.invalid',
      })
    ).status,
    403,
  );
  const logout = await app.call('/api/menu/logout', {
    method: 'POST',
    cookie: '__Host-giorgi_decisions=' + TOKEN,
  });
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal((await app.scan()).status, 401);
});

test('daily account quotas survive server restart and the minute cooldown blocks paid retries', async (t) => {
  const app = await fixture(t);
  assert.equal((await app.scan(image('1'))).status, 200);
  assert.equal((await app.scan(image('2'))).status, 429);
  app.advance(60_001);
  assert.equal((await app.scan(image('2'))).status, 200);
  await app.restart();
  app.advance(60_001);
  assert.equal((await app.scan(image('3'))).status, 200);
  app.advance(60_001);
  const limited = await app.scan(image('4'));
  assert.equal(limited.status, 429);
  assert.match(limited.body.error, /last 24 hours/u);
  assert.equal(app.providerCalls(), 3);
  app.advance(86_400_001);
  assert.equal((await app.scan(image('5'))).status, 200);
});

test('global limits prevent additional accounts from spending credits', async (t) => {
  const app = await fixture(t, {
    menu: { limits: { daily: 3, globalDaily: 1 } },
  });
  assert.equal((await app.scan()).status, 200);
  assert.equal((await app.scan(image('other'), OTHER)).status, 429);
  assert.equal(app.providerCalls(), 1);
});

test('provider errors and malformed responses are readable, release concurrency, and still count attempts', async (t) => {
  let response = 0;
  const app = await fixture(t, {
    provider: async () => {
      response++;
      if (response === 1)
        return new Response('rejected secret', { status: 401 });
      if (response === 2)
        return vision({
          ...MENU,
          items: [{ name: 'Invented price', price: '-20', category: 'main' }],
        });
      return vision(MENU);
    },
  });
  let result = await app.scan(image('1'));
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.body).includes('secret'));
  assert.equal((await app.scan(image('2'))).status, 429);
  app.advance(60_001);
  result = await app.scan(image('2'));
  assert.equal(result.status, 502);
  app.advance(60_001);
  assert.equal((await app.scan(image('3'))).status, 200);
  assert.equal(
    (
      await app.call('/api/menu/session', {
        cookie: '__Host-giorgi_decisions=' + TOKEN,
      })
    ).body.remaining,
    0,
  );
});

test('a hung provider times out without wedging later scans', async (t) => {
  let call = 0;
  const app = await fixture(t, {
    menu: { timeoutMs: 25 },
    provider: async () => {
      call++;
      if (call === 1) return new Promise(() => {});
      return vision(MENU);
    },
  });
  assert.equal((await app.scan()).status, 504);
  app.advance(60_001);
  assert.equal((await app.scan(image('after'))).status, 200);
});

test('cancelling an HTTP scan aborts the provider and releases the account for later work', async (t) => {
  let entered = false,
    cancelled = false,
    providerCall = 0;
  const app = await fixture(t, {
    provider: async (_url, init) => {
      providerCall++;
      if (providerCall !== 1) return vision(MENU);
      entered = true;
      init.signal.addEventListener(
        'abort',
        () => {
          cancelled = true;
        },
        { once: true },
      );
      return new Promise(() => {});
    },
  });
  const controller = new AbortController();
  const pending = app.call('/api/menu/analyze', {
    method: 'POST',
    cookie: '__Host-giorgi_decisions=' + TOKEN,
    body: { image: image() },
    signal: controller.signal,
  });
  await eventually(() => entered);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await eventually(() => cancelled);
  await new Promise((resolve) => setImmediate(resolve));
  app.advance(60_001);
  assert.equal((await app.scan(image('after cancellation'))).status, 200);
});

test('identity outages fail closed before a paid call; unexpected API methods are rejected', async (t) => {
  const app = await fixture(t, {
    menu: {
      identityFetch: async () => {
        throw new Error('private connection detail');
      },
    },
  });
  const status = await app.call('/api/menu/session', {
    cookie: '__Host-giorgi_decisions=' + TOKEN,
  });
  assert.equal(status.status, 503);
  assert.ok(!JSON.stringify(status.body).includes('private connection detail'));
  assert.equal((await app.scan()).status, 503);
  assert.equal(app.providerCalls(), 0);
  assert.equal((await app.call('/api/menu/analyze')).status, 405);
  assert.equal((await app.call('/api/menu/unknown')).status, 404);
});

test('one scan per account and two globally bound concurrent paid work', async (t) => {
  let unblock;
  const pending = new Promise((resolve) => (unblock = resolve));
  let entered = 0;
  const app = await fixture(t, {
    provider: async () => {
      entered++;
      await pending;
      return vision(MENU);
    },
  });
  app.users.set('3'.repeat(64), { ...USER, id: 'third-account' });
  const first = app.scan(image('1'));
  await eventually(() => entered >= 1);
  assert.equal((await app.scan(image('2'))).status, 409);
  const second = app.scan(image('2'), OTHER);
  await eventually(() => entered >= 2);
  assert.equal((await app.scan(image('3'), '3'.repeat(64))).status, 503);
  unblock();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
});

test('missing configuration is safe for anonymous/manual flows; untrusted model values remain literal', async (t) => {
  const app = await fixture(t, { menu: { ai: {} } });
  assert.equal((await app.call('/api/menu/session')).body.configured, false);
  assert.equal((await app.scan()).status, 503);
  assert.equal(app.providerCalls(), 0);
  assert.equal(
    normalizeMenu({
      ...MENU,
      items: [
        {
          name: '<img src=x onerror=alert(1)>',
          price: '12,50',
          category: 'other',
        },
      ],
    }).items[0].price,
    '12.50',
  );
  assert.equal(validateMenuImage(image()).bytes.length, PNG.length);
});
