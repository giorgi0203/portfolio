import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86400000;
const token = () => randomBytes(32).toString('base64url');
const identifier = (bytes = 12) => randomBytes(bytes).toString('base64url');
const digest = (value) => createHash('sha256').update(value).digest('hex');
class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new Problem(status, message);
};
function text(value, maximum, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(400, `${label} must be 1–${maximum} characters.`);
  return value.trim();
}
function validToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value);
}
function equalHash(expected, value) {
  return (
    validToken(value) &&
    timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(digest(value), 'hex'),
    )
  );
}

/** An isolated, low-stakes guest-room service. Invite links are bearer access. */
export function createDecisionServer({
  databasePath = process.env.DATABASE_PATH ||
    '/var/lib/giorgi-decisions/rooms.sqlite',
  origin = process.env.APP_ORIGIN || 'https://decisions.giorgi.app',
  clock = Date.now,
  spinDurationMs = 5000,
  trustProxy = process.env.TRUST_PROXY === '1',
  maxRooms = 2000,
} = {}) {
  const allowedOrigin = new URL(origin).origin;
  if (databasePath !== ':memory:')
    mkdirSync(dirname(resolve(databasePath)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, host_hash TEXT NOT NULL,
      created INTEGER NOT NULL, expires INTEGER NOT NULL, locked INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1, spin_sequence INTEGER NOT NULL DEFAULT 0,
      last_spin TEXT
    );
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS participants_room ON participants(room_id);
    CREATE TABLE IF NOT EXISTS choices (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      text TEXT NOT NULL, position INTEGER NOT NULL,
      UNIQUE(room_id,text)
    );
    CREATE INDEX IF NOT EXISTS choices_room ON choices(room_id);
    CREATE TABLE IF NOT EXISTS votes (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      choice_id TEXT NOT NULL REFERENCES choices(id) ON DELETE CASCADE,
      PRIMARY KEY(room_id, participant_id)
    );`);
  const prepare = (sql) => db.prepare(sql);
  const cleanup = () =>
    prepare('DELETE FROM rooms WHERE expires <= ?').run(clock());
  cleanup();
  const cleanupTimer = setInterval(cleanup, 60000);
  cleanupTimer.unref();
  const buckets = new Map();
  function limit(ip, category, maximum, windowMs) {
    const key = `${category}:${ip}`,
      now = clock();
    let bucket = buckets.get(key);
    if (!bucket || bucket.expires <= now) {
      if (buckets.size >= 10000) {
        for (const [item, value] of buckets)
          if (value.expires <= now) buckets.delete(item);
        if (buckets.size >= 10000)
          fail(503, 'The department is busy. Try again shortly.');
      }
      bucket = { expires: now + windowMs, count: 0 };
      buckets.set(key, bucket);
    }
    if (++bucket.count > maximum)
      fail(429, 'A little too much enthusiasm. Try again later.');
  }
  function roomRow(id) {
    if (!/^[A-Za-z0-9_-]{32}$/u.test(id))
      fail(404, 'Room not found or expired.');
    const row = prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!row || row.expires <= clock()) {
      if (row) prepare('DELETE FROM rooms WHERE id = ?').run(id);
      fail(404, 'Room not found or expired.');
    }
    return row;
  }
  function host(row, supplied) {
    if (!equalHash(row.host_hash, supplied))
      fail(403, 'Only this room’s host can do that.');
  }
  function participant(row, supplied) {
    if (!validToken(supplied)) fail(403, 'Join this room before taking part.');
    const user = prepare(
      'SELECT id FROM participants WHERE room_id = ? AND token_hash = ?',
    ).get(row.id, digest(supplied));
    if (!user) fail(403, 'Join this room before taking part.');
    return user;
  }
  function spinning(row) {
    return row.last_spin && JSON.parse(row.last_spin).endsAt > clock();
  }
  function editable(row) {
    if (row.locked) fail(409, 'The host has locked this room.');
    if (spinning(row))
      fail(409, 'The wheel is spinning. Wait for its decision.');
  }
  function changed(id) {
    prepare('UPDATE rooms SET revision = revision + 1 WHERE id = ?').run(id);
  }
  function publicRoom(id, participantToken) {
    const row = roomRow(id);
    const choices =
      prepare(`SELECT c.id,c.text,COUNT(v.participant_id) AS votes FROM choices c
      LEFT JOIN votes v ON v.choice_id=c.id AND v.room_id=c.room_id
      WHERE c.room_id=? GROUP BY c.id ORDER BY c.position`).all(id);
    const result = {
      id: row.id,
      title: row.title,
      createdAt: row.created,
      expiresAt: row.expires,
      locked: !!row.locked,
      revision: row.revision,
      participants: prepare(
        'SELECT COUNT(*) AS count FROM participants WHERE room_id=?',
      ).get(id).count,
      choices,
      lastSpin: row.last_spin ? JSON.parse(row.last_spin) : null,
    };
    if (validToken(participantToken)) {
      const user = prepare(
        'SELECT id FROM participants WHERE room_id=? AND token_hash=?',
      ).get(id, digest(participantToken));
      if (user)
        result.myVote =
          prepare(
            'SELECT choice_id FROM votes WHERE room_id=? AND participant_id=?',
          ).get(id, user.id)?.choice_id ?? null;
    }
    return result;
  }
  function transaction(operation) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  async function json(req) {
    if (req.headers.origin !== allowedOrigin)
      fail(403, 'Requests must come from this app.');
    if (
      !/^application\/json(?:\s*;|$)/iu.test(req.headers['content-type'] || '')
    )
      fail(415, 'Send application/json.');
    if (Number(req.headers['content-length'] || 0) > 8192) {
      req.resume();
      fail(413, 'That request is too large.');
    }
    let total = 0,
      chunks = [];
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 8192) {
        req.resume();
        fail(413, 'That request is too large.');
      }
      chunks.push(chunk);
    }
    try {
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (!result || typeof result !== 'object' || Array.isArray(result))
        fail(400, 'Send a JSON object.');
      return result;
    } catch {
      fail(400, 'That JSON is not valid.');
    }
  }
  function send(res, status, body) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    });
    res.end(JSON.stringify(body));
  }
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/health' && req.method === 'GET')
        return send(res, 200, { ok: true, service: 'decision-department' });
      const match = path.match(
        /^\/api\/rooms(?:\/([A-Za-z0-9_-]+)(?:\/(join|choices|vote|spin|reset|lock))?)?$/u,
      );
      if (!match) fail(404, 'That desk does not exist.');
      const [, id, action] = match;
      const ip =
        trustProxy && typeof req.headers['x-real-ip'] === 'string'
          ? req.headers['x-real-ip']
          : req.socket.remoteAddress || 'unknown';
      limit(ip, 'read', 600, 60000);
      if (id && !action && req.method === 'GET')
        return send(res, 200, {
          room: publicRoom(id, req.headers['x-participant-token']),
        });
      if (!['POST', 'DELETE'].includes(req.method))
        fail(405, 'That method is not available.');
      limit(ip, 'write', 180, 60000);
      const body = await json(req);
      if (!id && req.method === 'POST') {
        limit(ip, 'create', 12, 3600000);
        cleanup();
        if (
          prepare('SELECT COUNT(*) AS count FROM rooms').get().count >= maxRooms
        )
          fail(503, 'The department is full. Try again later.');
        const title = text(body.title, 80, 'Room title');
        if (
          !Array.isArray(body.choices) ||
          body.choices.length < 2 ||
          body.choices.length > 32
        )
          fail(400, 'Start with 2–32 choices.');
        const choices = body.choices.map((choice) =>
          text(choice, 80, 'Choice'),
        );
        if (
          new Set(choices.map((choice) => choice.toLocaleLowerCase())).size !==
          choices.length
        )
          fail(400, 'Each choice should be different.');
        const roomId = identifier(24),
          hostToken = token(),
          participantToken = token(),
          participantId = identifier();
        transaction(() => {
          prepare(
            'INSERT INTO rooms(id,title,host_hash,created,expires) VALUES(?,?,?,?,?)',
          ).run(roomId, title, digest(hostToken), clock(), clock() + 7 * DAY);
          prepare(
            'INSERT INTO participants(id,room_id,token_hash,name,created) VALUES(?,?,?,?,?)',
          ).run(
            participantId,
            roomId,
            digest(participantToken),
            'Host',
            clock(),
          );
          choices.forEach((choice, index) =>
            prepare(
              'INSERT INTO choices(id,room_id,text,position) VALUES(?,?,?,?)',
            ).run(identifier(), roomId, choice, index),
          );
        });
        return send(res, 201, {
          room: publicRoom(roomId, participantToken),
          hostToken,
          participantToken,
          participantId,
        });
      }
      if (!id) fail(405, 'That method is not available.');
      const row = roomRow(id);
      const hostToken = req.headers['x-host-token'],
        participantToken = req.headers['x-participant-token'];
      if (!action && req.method === 'DELETE') {
        host(row, hostToken);
        prepare('DELETE FROM rooms WHERE id=?').run(id);
        return send(res, 200, { ok: true });
      }
      if (req.method !== 'POST') fail(405, 'That method is not available.');
      if (action === 'join') {
        limit(ip, 'join', 30, 60000);
        if (row.locked) fail(409, 'The host has locked this room.');
        if (
          prepare(
            'SELECT COUNT(*) AS count FROM participants WHERE room_id=?',
          ).get(id).count >= 100
        )
          fail(409, 'This room already has 100 participants.');
        const name =
          body.name === undefined || body.name === ''
            ? 'Guest'
            : text(body.name, 24, 'Name');
        const participantToken = token(),
          participantId = identifier();
        transaction(() => {
          prepare(
            'INSERT INTO participants(id,room_id,token_hash,name,created) VALUES(?,?,?,?,?)',
          ).run(participantId, id, digest(participantToken), name, clock());
          changed(id);
        });
        return send(res, 201, {
          room: publicRoom(id, participantToken),
          participantToken,
          participantId,
        });
      }
      if (action === 'choices') {
        participant(row, participantToken);
        editable(row);
        const value = text(body.text, 80, 'Choice');
        const choices = prepare('SELECT text FROM choices WHERE room_id=?').all(
          id,
        );
        if (choices.length >= 32)
          fail(409, 'A room can have up to 32 choices.');
        if (
          choices.some(
            (choice) =>
              choice.text.toLocaleLowerCase() === value.toLocaleLowerCase(),
          )
        )
          fail(409, 'That choice is already on the wheel.');
        transaction(() => {
          prepare(
            'INSERT INTO choices(id,room_id,text,position) VALUES(?,?,?,?)',
          ).run(identifier(), id, value, choices.length);
          changed(id);
        });
      } else if (action === 'vote') {
        const user = participant(row, participantToken);
        editable(row);
        if (
          body.choiceId !== null &&
          (typeof body.choiceId !== 'string' ||
            !prepare('SELECT id FROM choices WHERE id=? AND room_id=?').get(
              body.choiceId,
              id,
            ))
        )
          fail(400, 'Choose an option from this room.');
        transaction(() => {
          if (body.choiceId === null)
            prepare(
              'DELETE FROM votes WHERE room_id=? AND participant_id=?',
            ).run(id, user.id);
          else
            prepare(
              'INSERT INTO votes(room_id,participant_id,choice_id) VALUES(?,?,?) ON CONFLICT(room_id,participant_id) DO UPDATE SET choice_id=excluded.choice_id',
            ).run(id, user.id, body.choiceId);
          changed(id);
        });
      } else if (action === 'spin') {
        host(row, hostToken);
        if (spinning(row)) fail(409, 'The wheel is already spinning.');
        const choices = prepare(
          'SELECT id,text FROM choices WHERE room_id=? ORDER BY position',
        ).all(id);
        if (choices.length < 2) fail(409, 'Add at least two choices.');
        const winner = choices[randomInt(choices.length)],
          sequence = row.spin_sequence + 1;
        const spin = {
          id: identifier(),
          sequence,
          winnerId: winner.id,
          winnerText: winner.text,
          startedAt: clock(),
          endsAt: clock() + spinDurationMs,
          choices,
        };
        transaction(() => {
          prepare(
            'UPDATE rooms SET last_spin=?,spin_sequence=?,revision=revision+1 WHERE id=?',
          ).run(JSON.stringify(spin), sequence, id);
        });
      } else if (action === 'reset') {
        host(row, hostToken);
        if (spinning(row))
          fail(409, 'Wait for the wheel to finish before resetting.');
        transaction(() => {
          prepare('DELETE FROM votes WHERE room_id=?').run(id);
          prepare(
            'UPDATE rooms SET last_spin=NULL,revision=revision+1 WHERE id=?',
          ).run(id);
        });
      } else if (action === 'lock') {
        host(row, hostToken);
        if (typeof body.locked !== 'boolean')
          fail(400, 'Choose whether this room is locked.');
        prepare('UPDATE rooms SET locked=?,revision=revision+1 WHERE id=?').run(
          Number(body.locked),
          id,
        );
      } else fail(405, 'That action is not available.');
      return send(res, 200, { room: publicRoom(id, participantToken) });
    } catch (error) {
      // Do not log invite URLs, participant credentials, names or choices.
      if (!(error instanceof Problem))
        console.error(
          'Decision Department request failed:',
          error?.code || 'internal_error',
        );
      if (!res.headersSent)
        send(res, error instanceof Problem ? error.status : 500, {
          error:
            error instanceof Problem
              ? error.message
              : 'The department hit a snag. Try again.',
        });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 8000;
  server.keepAliveTimeout = 5000;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    clearInterval(cleanupTimer);
    if (server.listening)
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
    db.close();
  }
  return { server, close };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createDecisionServer();
  app.server.listen(
    Number(process.env.PORT || 3360),
    process.env.HOST || '127.0.0.1',
    () => console.log('Decision Department listening.'),
  );
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      app.close().then(() => process.exit(0));
    });
}
