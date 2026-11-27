import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDecisionServer } from '../server/server.mjs';

const origin = 'https://split-supra.test';
const template = {
  title: 'Friday supra',
  name: 'Giorgi',
  feeMinor: 21,
  items: [
    { name: 'Lobiani', quantity: 3, unitMinor: 101 },
    { name: 'Juice', quantity: 1, unitMinor: 99 },
  ],
};
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'supra-'));
  let service,
    url,
    now = 1_800_000_000_000;
  async function start() {
    service = createDecisionServer({
      supraOrigin: origin,
      databasePath: join(directory, 'test.sqlite'),
      clock: () => now,
    });
    await new Promise((done) => service.server.listen(0, '127.0.0.1', done));
    url = 'http://127.0.0.1:' + service.server.address().port;
  }
  await start();
  t.after(async () => {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  });
  async function api(path, method = 'GET', body, token, site = origin) {
    const response = await fetch(url + '/api/supra/rooms' + path, {
      method,
      headers: {
        Origin: site,
        'Content-Type': 'application/json',
        ...(token ? { 'X-Participant-Token': token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, ...(await response.json()) };
  }
  return {
    api,
    advance: (ms) => {
      now += ms;
    },
    restart: async () => {
      await service.close();
      await start();
    },
  };
}

test('a bill persists across restarts and expires seven days after creation', async (t) => {
  const f = await fixture(t);
  const created = await f.api('', 'POST', template);
  assert.equal(created.status, 201);
  assert.equal(created.room.items.length, 2);
  assert.equal(created.room.totals.totalMinor, 423);
  assert.equal(created.room.totals.unassignedMinor, 423);
  assert.equal(created.room.hostId, created.participantId);
  assert.ok(/^[A-Za-z0-9_-]{32}$/u.test(created.room.id));
  const path = '/' + created.room.id;
  await f.restart();
  const fetched = await f.api(path);
  assert.deepEqual(fetched.room, created.room);
  assert.ok(!JSON.stringify(fetched).includes(created.participantToken));
  f.advance(7 * 86_400_000);
  assert.equal((await f.api(path)).status, 404);
  assert.equal(
    (await f.api(path + '/join', 'POST', { name: 'Late' })).status,
    404,
  );
});

test('two diners split by weights, retry claims idempotently and can remove only their own portion', async (t) => {
  const f = await fixture(t),
    host = await f.api('', 'POST', template),
    path = '/' + host.room.id;
  const guest = await f.api(path + '/join', 'POST', { name: 'Nino' });
  assert.equal(guest.status, 201);
  const claim = (token, weight, extra = {}) =>
    f.api(
      path + '/claim',
      'PUT',
      { itemId: host.room.items[0].id, weight, ...extra },
      token,
    );
  const writes = await Promise.all([
    claim(host.participantToken, 1),
    claim(guest.participantToken, 2),
  ]);
  assert.ok(writes.every((result) => result.status === 200));
  let current = (await f.api(path)).room;
  assert.deepEqual(
    current.totals.people.map((p) => p.itemsMinor),
    [101, 202],
  );
  assert.equal(
    current.totals.unassignedMinor +
      current.totals.people.reduce((sum, p) => sum + p.totalMinor, 0),
    423,
  );
  assert.equal(
    (await claim(guest.participantToken, 2)).room.revision,
    current.revision,
  );
  // The server derives the claimant from the credential, even if the client sends someone else's ID.
  current = (
    await claim(guest.participantToken, 0, {
      participantId: host.participantId,
    })
  ).room;
  assert.deepEqual(
    current.claims.map((c) => c.participantId),
    [host.participantId],
  );
  const foreign = await f.api('', 'POST', template);
  assert.equal((await claim(foreign.participantToken, 1)).status, 403);
  assert.equal(
    (
      await f.api(
        path + '/claim',
        'PUT',
        { itemId: foreign.room.items[0].id, weight: 1 },
        guest.participantToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (await f.api(path, 'DELETE', {}, guest.participantToken)).status,
    403,
  );
  assert.equal(
    (await f.api(path, 'DELETE', {}, host.participantToken)).status,
    200,
  );
  assert.equal((await f.api(path)).status, 404);
});

test('admission requires bounded whole-tetri receipt amounts, quantities and allowed origin', async (t) => {
  const f = await fixture(t);
  for (const fields of [
    { feeMinor: 0.5 },
    { feeMinor: -1 },
    { items: [] },
    { items: [null] },
    { items: [{ name: 'Dish', unitMinor: 100, quantity: 1.1 }] },
    { items: [{ name: 'Dish', unitMinor: -1, quantity: 1 }] },
    { items: [{ name: 'Dish', unitMinor: 1_000_000, quantity: 99 }] },
  ]) {
    assert.equal(
      (await f.api('', 'POST', { ...template, ...fields })).status,
      400,
    );
  }
  assert.equal(
    (await f.api('', 'POST', template, undefined, 'https://other.test')).status,
    403,
  );
  const host = await f.api('', 'POST', template),
    path = '/' + host.room.id;
  assert.equal(
    (await f.api(path + '/join', 'POST', { name: 'N'.repeat(33) })).status,
    400,
  );
  assert.equal(
    (
      await f.api(
        path + '/claim',
        'PUT',
        { itemId: host.room.items[0].id, weight: 101 },
        host.participantToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.api(path + '/claim', 'PUT', {
        itemId: host.room.items[0].id,
        weight: 1,
      })
    ).status,
    403,
  );
});
