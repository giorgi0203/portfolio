import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  MenuProblem,
  MAX_MENU_BODY,
  extractMenu,
  readAiConfiguration,
  validateMenuImage,
} from './menu-ai.mjs';

const DAY = 86_400_000;
const CLIENT = 'decision-department';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const opaque = () => randomBytes(32).toString('hex');
const isToken = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
function validUser(value) {
  return (
    value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 100 &&
    typeof value.name === 'string' &&
    value.name.length <= 120 &&
    typeof value.email === 'string' &&
    value.email.length <= 254 &&
    typeof value.emailVerified === 'boolean'
  );
}
function cookieValue(req, name) {
  const cookies = req.headers.cookie || '';
  if (cookies.length > 8192) return '';
  const found = cookies
    .split(';')
    .map((x) => x.trim())
    .filter((x) => x.startsWith(name + '='));
  if (found.length !== 1) return '';
  return found[0].slice(name.length + 1);
}
function constantEqual(a, b) {
  return (
    isToken(a) &&
    isToken(b) &&
    timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  );
}

export function createMenuService({
  db,
  origin,
  clock = Date.now,
  identityPublicUrl = process.env.AUTH_PUBLIC_URL || 'https://auth.giorgi.app',
  identityInternalUrl = process.env.AUTH_INTERNAL_URL ||
    'http://127.0.0.1:3100',
  identityFetch = fetch,
  providerFetch = fetch,
  ai,
  timeoutMs = 25_000,
  limits: suppliedLimits = {},
} = {}) {
  const limits = { daily: 3, globalDaily: 30, ...suppliedLimits };
  if (
    ![limits.daily, limits.globalDaily].every(
      (x) => Number.isInteger(x) && x > 0 && x <= 1000,
    )
  )
    throw new Error('Invalid menu scan limits');
  const appOrigin = new URL(origin).origin;
  const secure = new URL(appOrigin).protocol === 'https:';
  const cookieName = secure ? '__Host-giorgi_decisions' : 'giorgi_decisions';
  const pendingName = secure
    ? '__Host-giorgi_decisions_pending'
    : 'giorgi_decisions_pending';
  const callback = appOrigin + '/api/auth/sso/callback';
  db.exec(`CREATE TABLE IF NOT EXISTS menu_sso_pending (state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, return_path TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS menu_scan_attempts (id TEXT PRIMARY KEY, subject TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS menu_scan_subject ON menu_scan_attempts(subject,created);
    CREATE INDEX IF NOT EXISTS menu_scan_created ON menu_scan_attempts(created);`);
  const active = new Set();
  const cache = new Map();
  const controllers = new Set();
  let stopped = false;
  const configuration = () => readAiConfiguration(ai);
  const fail = (status, message, retryAfter) => {
    throw new MenuProblem(status, message, retryAfter);
  };
  function setCookie(res, name, value, maxAge) {
    const old = res.getHeader('Set-Cookie') || [];
    res.setHeader('Set-Cookie', [
      ...(Array.isArray(old) ? old : [old]),
      `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`,
    ]);
  }
  function headers(res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
  }
  function send(res, status, value) {
    if (res.destroyed) return;
    headers(res);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify(value));
  }
  function redirect(res, location) {
    headers(res);
    res.writeHead(303, { Location: location });
    res.end();
  }
  async function body(req, maximum) {
    if (req.headers.origin !== appOrigin)
      fail(403, 'Requests must come from this app.');
    if (
      !/^application\/json(?:\s*;|$)/iu.test(req.headers['content-type'] || '')
    )
      fail(415, 'Send application/json.');
    if (Number(req.headers['content-length'] || 0) > maximum) {
      req.resume();
      fail(413, 'That request is too large. Choose a smaller menu photo.');
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maximum) {
        req.resume();
        fail(413, 'That request is too large. Choose a smaller menu photo.');
      }
      chunks.push(chunk);
    }
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      fail(400, 'That JSON is not valid.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      fail(400, 'Send a JSON object.');
    return parsed;
  }
  async function identity(path, data) {
    try {
      const response = await identityFetch(
        identityInternalUrl.replace(/\/$/u, '') + path,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(7000),
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(data),
        },
      );
      if (!response.ok) {
        if ([400, 401, 403].includes(response.status)) return null;
        fail(503, 'Shared sign-in is unavailable. Please try again shortly.');
      }
      const text = await response.text();
      if (text.length > 12_000)
        fail(503, 'Shared sign-in returned an unreadable response.');
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof MenuProblem) throw error;
      fail(503, 'Shared sign-in is unavailable. Please try again shortly.');
    }
  }
  async function user(req) {
    const token = cookieValue(req, cookieName);
    if (!isToken(token)) return null;
    const response = await identity('/api/sso/session', {
      client_id: CLIENT,
      session_token: token,
    });
    if (!response || response.user === null) return null;
    if (!validUser(response.user))
      fail(503, 'Shared sign-in returned an unreadable response.');
    const { id, name, email, emailVerified } = response.user;
    return { id, name, email, emailVerified };
  }
  function count(subject, since) {
    return db
      .prepare(
        'SELECT COUNT(*) AS n FROM menu_scan_attempts WHERE subject=? AND created>?',
      )
      .get(subject, since).n;
  }
  function remaining(userId) {
    return Math.max(0, limits.daily - count(hash(userId), clock() - DAY));
  }
  function reserve(userId) {
    const now = clock(),
      subject = hash(userId);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM menu_scan_attempts WHERE created<=?').run(
        now - 2 * DAY,
      );
      if (count(subject, now - DAY) >= limits.daily)
        fail(
          429,
          `Your ${limits.daily} menu scans for the last 24 hours are used. Enter items manually or try later.`,
          3600,
        );
      if (
        db
          .prepare(
            'SELECT COUNT(*) AS n FROM menu_scan_attempts WHERE created>?',
          )
          .get(now - DAY).n >= limits.globalDaily
      )
        fail(
          429,
          'Today’s shared menu scanning limit is reached. You can still enter items manually.',
          3600,
        );
      if (count(subject, now - 60_000))
        fail(429, 'Wait one minute before scanning another photo.', 60);
      db.prepare('INSERT INTO menu_scan_attempts VALUES(?,?,?)').run(
        opaque(),
        subject,
        now,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function cached(key) {
    for (const [id, value] of cache)
      if (value.expires <= clock()) cache.delete(id);
    return cache.get(key)?.menu;
  }
  async function handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/api/menu/') && !path.startsWith('/api/auth/sso/'))
      return false;
    try {
      if (stopped)
        fail(503, 'The department is restarting. Please try again shortly.');
      if (path === '/api/menu/session' && req.method === 'GET') {
        const current = await user(req);
        send(res, 200, {
          user: current,
          configured: !!configuration(),
          limits,
          ...(current ? { remaining: remaining(current.id) } : {}),
        });
      } else if (path === '/api/auth/sso/start' && req.method === 'GET') {
        const state = opaque(),
          verifier = randomBytes(32).toString('base64url');
        const returnTo = url.searchParams.get('returnTo') || '/';
        const safePath =
          returnTo === '/' || /^\/room\/[A-Za-z0-9_-]{32}$/u.test(returnTo)
            ? returnTo
            : '/';
        db.prepare('DELETE FROM menu_sso_pending WHERE expires<=?').run(
          clock(),
        );
        if (
          db.prepare('SELECT COUNT(*) AS n FROM menu_sso_pending').get().n >=
          1000
        )
          fail(503, 'Sign-in is busy. Please try again shortly.');
        db.prepare('INSERT INTO menu_sso_pending VALUES(?,?,?,?)').run(
          hash(state),
          verifier,
          safePath,
          clock() + 600_000,
        );
        setCookie(res, pendingName, state, 600);
        const target = new URL('/api/sso/authorize', identityPublicUrl);
        target.search = new URLSearchParams({
          client_id: CLIENT,
          redirect_uri: callback,
          state,
          code_challenge: createHash('sha256')
            .update(verifier)
            .digest('base64url'),
        }).toString();
        redirect(res, target.href);
      } else if (path === '/api/auth/sso/callback' && req.method === 'GET') {
        const state = url.searchParams.get('state'),
          code = url.searchParams.get('code');
        const pending = cookieValue(req, pendingName);
        if (!constantEqual(state, pending) || !isToken(code))
          fail(
            400,
            'Sign-in expired or did not match this browser. Please start again.',
          );
        const row = db
          .prepare(
            'DELETE FROM menu_sso_pending WHERE state_hash=? AND expires>? RETURNING verifier,return_path',
          )
          .get(hash(state), clock());
        setCookie(res, pendingName, '', 0);
        if (!row)
          fail(400, 'Sign-in expired or was already used. Please start again.');
        const result = await identity('/api/sso/token', {
          code,
          client_id: CLIENT,
          redirect_uri: callback,
          code_verifier: row.verifier,
        });
        if (!result || !validUser(result.user) || !isToken(result.sessionToken))
          fail(400, 'Sign-in could not be completed. Please start again.');
        setCookie(res, cookieName, result.sessionToken, 14 * 24 * 60 * 60);
        redirect(res, row.return_path + '#menu');
      } else if (path === '/api/menu/logout' && req.method === 'POST') {
        const data = await body(req, 8192);
        if (Object.keys(data).length)
          fail(400, 'Send an empty logout request.');
        const token = cookieValue(req, cookieName);
        if (isToken(token))
          await identity('/api/sso/logout', {
            client_id: CLIENT,
            session_token: token,
          });
        setCookie(res, cookieName, '', 0);
        send(res, 200, { ok: true });
      } else if (path === '/api/menu/analyze' && req.method === 'POST') {
        // Reject cross-site requests before receiving an image or checking a session.
        if (req.headers.origin !== appOrigin) {
          req.resume();
          fail(403, 'Requests must come from this app.');
        }
        const current = await user(req);
        if (!current) {
          req.resume();
          fail(
            401,
            'Sign in with your Giorgi account to scan a menu. Manual entry is always available.',
          );
        }
        if (!current.emailVerified) {
          req.resume();
          fail(
            403,
            'Verify your email in your Giorgi account before scanning a menu. Manual entry is always available.',
          );
        }
        const config = configuration();
        if (!config) {
          req.resume();
          fail(
            503,
            'Photo scanning is not configured right now. You can still enter items manually.',
          );
        }
        const data = await body(req, MAX_MENU_BODY);
        if (Object.keys(data).length !== 1 || !Object.hasOwn(data, 'image'))
          fail(400, 'Send one menu photo.');
        const image = validateMenuImage(data.image);
        const key = hash(current.id + ':' + hash(image.bytes));
        const previous = cached(key);
        if (previous) {
          send(res, 200, {
            ...previous,
            cached: true,
            remaining: remaining(current.id),
          });
          return true;
        }
        if (active.has(current.id))
          fail(
            409,
            'Your other menu photo is still being read. Wait for it or cancel it first.',
          );
        if (active.size >= 2)
          fail(
            503,
            'Two menu scans are already running. Please try again shortly.',
            10,
          );
        reserve(current.id);
        active.add(current.id);
        const controller = new AbortController();
        controllers.add(controller);
        const onClose = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.once('close', onClose);
        try {
          const extracted = await extractMenu({
            image: image.dataUrl,
            configuration: config,
            fetcher: providerFetch,
            signal: controller.signal,
            timeoutMs,
          });
          if (!controller.signal.aborted && !stopped) {
            while (cache.size >= 100) cache.delete(cache.keys().next().value);
            cache.set(key, { menu: extracted, expires: clock() + 600_000 });
            send(res, 200, { ...extracted, remaining: remaining(current.id) });
          }
        } finally {
          res.removeListener('close', onClose);
          active.delete(current.id);
          controllers.delete(controller);
        }
      } else if (
        [
          '/api/menu/session',
          '/api/menu/analyze',
          '/api/menu/logout',
          '/api/auth/sso/start',
          '/api/auth/sso/callback',
        ].includes(path)
      )
        fail(405, 'That method is not available.');
      else fail(404, 'That menu desk does not exist.');
    } catch (error) {
      if (error instanceof MenuProblem) {
        if (error.retryAfter)
          res.setHeader('Retry-After', String(error.retryAfter));
        send(res, error.status, { error: error.message });
      } else {
        // Never log image bodies, session tokens, menu content or provider errors.
        send(res, 500, {
          error: 'Menu scanning hit a snag. Enter items manually or try again.',
        });
      }
    }
    return true;
  }
  function close() {
    stopped = true;
    for (const controller of controllers) controller.abort();
    cache.clear();
  }
  return { handle, close };
}
