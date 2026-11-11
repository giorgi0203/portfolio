import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDecisionServer } from '../server/server.mjs';

const ORIGIN = 'https://decisions.test';
async function fixture(t, extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'decision-test-'));
  let now = 1700000000000,
    service,
    base;
  const databasePath = join(directory, 'rooms.sqlite');
  async function start() {
    service = createDecisionServer({
      databasePath,
      origin: ORIGIN,
      clock: () => now,
      ...extra,
    });
    await new Promise((resolve) =>
      service.server.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${service.server.address().port}`;
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
      participant,
      host,
      origin = ORIGIN,
      contentType = 'application/json',
      raw,
    } = {},
  ) {
    const headers = {};
    if (method !== 'GET') {
      if (origin !== null) headers.origin = origin;
      headers['content-type'] = contentType;
    }
    if (participant) headers['x-participant-token'] = participant;
    if (host) headers['x-host-token'] = host;
    const response = await fetch(base + path, {
      method,
      headers,
      body: method === 'GET' ? undefined : (raw ?? JSON.stringify(body ?? {})),
    });
    const value = await response.json();
    return { status: response.status, value, headers: response.headers };
  }
  const create = (title = 'Dinner committee') =>
    call('/api/rooms', {
      method: 'POST',
      body: { title, choices: ['Khinkali', 'Pizza', 'Sushi'] },
    });
  return {
    call,
    create,
    advance: (ms) => {
      now += ms;
    },
    restart: async () => {
      await service.close();
      await start();
    },
    databasePath,
  };
}

test('guest rooms isolate credentials; vote switching changes one advisory vote; choices persist across restart', async (t) => {
  const app = await fixture(t);
  const created = await app.create();
  assert.equal(created.status, 201);
  const a = created.value,
    path = `/api/rooms/${a.room.id}`;
  assert.equal(a.room.participants, 1);
  assert.equal(a.room.choices.length, 3);
  const guest = await app.call(path + '/join', {
    method: 'POST',
    body: { name: 'Friend' },
  });
  assert.equal(guest.status, 201);
  const b = guest.value;
  assert.equal(
    (
      await app.call(path + '/choices', {
        method: 'POST',
        body: { text: 'Tacos' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call(path + '/choices', {
        method: 'POST',
        body: { text: 'Tacos' },
        participant: b.participantToken,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.call(path + '/vote', {
        method: 'POST',
        body: { choiceId: a.room.choices[0].id },
        participant: b.participantToken,
      })
    ).status,
    200,
  );
  const switched = await app.call(path + '/vote', {
    method: 'POST',
    body: { choiceId: a.room.choices[1].id },
    participant: b.participantToken,
  });
  assert.equal(
    switched.value.room.choices.reduce((sum, choice) => sum + choice.votes, 0),
    1,
  );
  assert.equal(switched.value.room.myVote, a.room.choices[1].id);
  const other = (await app.create('Another room')).value;
  assert.equal(
    (
      await app.call(path + '/vote', {
        method: 'POST',
        body: { choiceId: a.room.choices[0].id },
        participant: other.participantToken,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call(path + '/vote', {
        method: 'POST',
        body: { choiceId: other.room.choices[0].id },
        participant: b.participantToken,
      })
    ).status,
    400,
  );
  await app.restart();
  const publicRead = await app.call(path);
  assert.equal(publicRead.value.room.participants, 2);
  assert.equal(publicRead.value.room.choices.length, 4);
  assert.equal(publicRead.value.room.choices[1].votes, 1);
  assert.equal(publicRead.headers.get('cache-control'), 'no-store');
  const publicJson = JSON.stringify(publicRead.value);
  for (const secret of [
    a.hostToken,
    a.participantToken,
    b.participantToken,
    'host_hash',
    'token_hash',
    'Friend',
  ])
    assert.ok(!publicJson.includes(secret));
  const stored = await readFile(app.databasePath);
  assert.ok(!stored.includes(Buffer.from(a.hostToken)));
  assert.ok(!stored.includes(Buffer.from(b.participantToken)));
  const mine = await app.call(path, { participant: b.participantToken });
  assert.equal(mine.value.room.myVote, a.room.choices[1].id);
});

test('one host-authoritative spin is visible identically to everyone and prevents concurrent edits/spins', async (t) => {
  const app = await fixture(t);
  const a = (await app.create()).value,
    path = `/api/rooms/${a.room.id}`;
  assert.equal(
    (
      await app.call(path + '/spin', {
        method: 'POST',
        participant: a.participantToken,
      })
    ).status,
    403,
  );
  const attempts = await Promise.all(
    [1, 2].map(() =>
      app.call(path + '/spin', { method: 'POST', host: a.hostToken }),
    ),
  );
  assert.deepEqual(attempts.map((result) => result.status).sort(), [200, 409]);
  const spin = attempts.find((result) => result.status === 200).value.room
    .lastSpin;
  assert.equal(spin.endsAt - spin.startedAt, 5000);
  assert.equal(spin.sequence, 1);
  assert.ok(
    spin.choices.some(
      (choice) =>
        choice.id === spin.winnerId && choice.text === spin.winnerText,
    ),
  );
  const reads = await Promise.all([app.call(path), app.call(path)]);
  assert.deepEqual(reads[0].value.room.lastSpin, spin);
  assert.deepEqual(reads[1].value.room.lastSpin, spin);
  for (const [action, body] of [
    ['choices', { text: 'New option' }],
    ['vote', { choiceId: a.room.choices[0].id }],
  ])
    assert.equal(
      (
        await app.call(path + '/' + action, {
          method: 'POST',
          body,
          participant: a.participantToken,
        })
      ).status,
      409,
    );
  assert.equal(
    (await app.call(path + '/reset', { method: 'POST', host: a.hostToken }))
      .status,
    409,
  );
  await app.restart();
  assert.deepEqual((await app.call(path)).value.room.lastSpin, spin);
  app.advance(6000);
  const next = await app.call(path + '/spin', {
    method: 'POST',
    host: a.hostToken,
  });
  assert.equal(next.status, 200);
  assert.equal(next.value.room.lastSpin.sequence, 2);
  // Cleanup remains possible even while the wheel is in motion.
  assert.equal(
    (await app.call(path, { method: 'DELETE', host: a.hostToken })).status,
    200,
  );
  assert.equal((await app.call(path)).status, 404);
});

test('host controls lock/reset/delete; rooms expire and do not accumulate indefinitely', async (t) => {
  const app = await fixture(t, { maxRooms: 1 });
  const a = (await app.create()).value,
    path = `/api/rooms/${a.room.id}`;
  assert.equal((await app.create()).status, 503);
  assert.equal(
    (
      await app.call(path + '/lock', {
        method: 'POST',
        body: { locked: true },
        host: a.participantToken,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call(path + '/lock', {
        method: 'POST',
        body: { locked: true },
        host: a.hostToken,
      })
    ).status,
    200,
  );
  assert.equal(
    (await app.call(path + '/join', { method: 'POST' })).status,
    409,
  );
  assert.equal(
    (
      await app.call(path + '/choices', {
        method: 'POST',
        body: { text: 'Cake' },
        participant: a.participantToken,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await app.call(path + '/lock', {
        method: 'POST',
        body: { locked: false },
        host: a.hostToken,
      })
    ).status,
    200,
  );
  await app.call(path + '/vote', {
    method: 'POST',
    body: { choiceId: a.room.choices[0].id },
    participant: a.participantToken,
  });
  const reset = await app.call(path + '/reset', {
    method: 'POST',
    host: a.hostToken,
  });
  assert.equal(reset.status, 200);
  assert.equal(reset.value.room.choices[0].votes, 0);
  assert.equal(
    (await app.call(path, { method: 'DELETE', host: a.participantToken }))
      .status,
    403,
  );
  app.advance(7 * 86400000 + 1);
  assert.equal((await app.call(path)).status, 404);
  assert.equal((await app.create('Fresh room')).status, 201);
});

test('unsafe origins, unexpected content, oversized bodies and invalid choices are rejected', async (t) => {
  const app = await fixture(t);
  const createBody = { title: 'Committee', choices: ['A', 'B'] };
  assert.equal(
    (
      await app.call('/api/rooms', {
        method: 'POST',
        body: createBody,
        origin: 'https://attacker.test',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call('/api/rooms', {
        method: 'POST',
        body: createBody,
        origin: null,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.call('/api/rooms', {
        method: 'POST',
        body: createBody,
        contentType: 'text/plain',
      })
    ).status,
    415,
  );
  assert.equal(
    (await app.call('/api/rooms', { method: 'POST', raw: '{bad json' })).status,
    400,
  );
  assert.equal(
    (await app.call('/api/rooms', { method: 'POST', raw: '[]' })).status,
    400,
  );
  assert.equal(
    (
      await app.call('/api/rooms', {
        method: 'POST',
        body: { ...createBody, title: 'x'.repeat(81) },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await app.call('/api/rooms', {
        method: 'POST',
        body: { ...createBody, choices: ['A', 'a'] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await app.call('/api/rooms', {
        method: 'POST',
        body: { title: 'x'.repeat(10000), choices: ['A', 'B'] },
      })
    ).status,
    413,
  );
  const created = (await app.create()).value,
    path = `/api/rooms/${created.room.id}`;
  assert.equal(
    (
      await app.call(path + '/choices', {
        method: 'POST',
        body: { text: 'PIZZA' },
        participant: created.participantToken,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await app.call(path + '/choices', {
        method: 'POST',
        body: { text: '\u0000oops' },
        participant: created.participantToken,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await app.call(path + '/vote', {
        method: 'POST',
        body: {},
        participant: created.participantToken,
      })
    ).status,
    400,
  );
  assert.equal((await app.call('/api/rooms/not-a-real-id')).status, 404);
});

test('room creation rate limits bound anonymous writes', async (t) => {
  const app = await fixture(t);
  for (let index = 0; index < 12; index++)
    assert.equal((await app.create(`Room ${index}`)).status, 201);
  assert.equal((await app.create('One too many')).status, 429);
  app.advance(3600001);
  assert.equal((await app.create('After cooldown')).status, 201);
});
