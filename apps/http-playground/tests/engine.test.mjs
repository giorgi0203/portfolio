import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJourney, defaults, sampleBody } from '../src/engine.ts';
const journey = (overrides = {}) => buildJourney({ ...defaults, ...overrides });
test('fresh GET works offline without any network activity', () => {
  const j = journey({ preset: 'fresh', fault: 'offline' });
  assert.equal(j.network, false);
  assert.deepEqual(
    j.steps.map((s) => s.stage),
    ['cache', 'response'],
  );
  assert.equal(j.total, 0);
  assert.equal(j.status, 200);
  assert.equal(j.wireBody, '');
});
test('304 has no wire body and reuses cached representation', () => {
  const j = journey({ preset: 'revalidate' });
  assert.equal(j.status, 304);
  assert.equal(j.requestHeaders['If-None-Match'], '"ideas-v1"');
  assert.equal(j.wireBody, '');
  assert.equal(j.body, sampleBody);
});
test('POST does not use a GET cache or conditional validator', () => {
  for (const preset of ['fresh', 'revalidate']) {
    const j = journey({ method: 'POST', preset });
    assert.equal(j.network, true);
    assert.equal(j.status, 201);
    assert.equal(j.requestHeaders['If-None-Match'], undefined);
    assert.equal(j.responseHeaders['Cache-Control'], 'no-store');
  }
});
test('certificate and DNS failures stop before HTTP request', () => {
  for (const fault of ['dns', 'certificate']) {
    const j = journey({ fault });
    assert.equal(j.status, null);
    assert.equal(j.outcome, 'network-error');
    assert.ok(!j.steps.some((s) => s.stage === 'request'));
    assert.ok(!j.steps.some((s) => s.stage === 'server'));
  }
});
test('timeout differs from a server HTTP error', () => {
  const timeout = journey({ fault: 'timeout' }),
    server = journey({ fault: 'server' });
  assert.equal(timeout.status, null);
  assert.equal(server.status, 500);
  assert.equal(server.outcome, 'http-error');
  assert.ok(server.steps.some((s) => s.stage === 'response'));
  assert.equal(timeout.steps.at(-1).stage, 'server');
});
test('warm DNS saves DNS latency while still connecting and handshaking', () => {
  const cold = journey(),
    warm = journey({ preset: 'warm' });
  assert.equal(cold.total - warm.total, 160);
  assert.ok(warm.steps.some((s) => s.stage === 'tls'));
  assert.equal(warm.steps.find((s) => s.stage === 'dns').duration, 0);
});
test('latency and server work contribute to deterministic cumulative timing', () => {
  const j = journey({ latency: 120, serverDelay: 400 });
  assert.equal(j.total, 940);
  assert.equal(j.steps.at(-1).at + j.steps.at(-1).duration, j.total);
  assert.ok(j.steps.every((s) => s.at >= 0 && s.duration >= 0));
});
