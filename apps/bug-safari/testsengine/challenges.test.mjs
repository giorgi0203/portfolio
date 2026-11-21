import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { challenges } from '../src/challenges.ts';
const require = createRequire(import.meta.url);
const { runChallenge } = require('../public/runner.js');

for (const challenge of challenges) {
  test(`${challenge.id}: real starter fails and repair passes all observations`, async () => {
    const broken = await runChallenge(challenge.id, challenge.starterCode);
    assert.equal(broken.status, 'complete');
    assert.equal(broken.tests.length, 3);
    assert.equal(broken.passed, false);
    assert.ok(broken.tests.some((item) => !item.passed));
    const fixed = await runChallenge(challenge.id, challenge.solutionCode);
    assert.equal(fixed.status, 'complete');
    assert.equal(fixed.passed, true, JSON.stringify(fixed.tests));
    assert.equal(fixed.tests.length, 3);
    assert.ok(fixed.preview.lines.length > 0);
  });
}

test('syntax errors and missing entry points are useful failures', async () => {
  const malformed = await runChallenge('fencepost', 'function solve( {');
  assert.equal(malformed.status, 'error');
  assert.ok(malformed.error);
  const missing = await runChallenge('fencepost', 'const answer = 42;');
  assert.equal(missing.status, 'error');
  assert.match(missing.error, /solve/);
});

test('large source and unknown challenges are rejected', async () => {
  assert.equal(
    (await runChallenge('fencepost', 'x'.repeat(12001))).status,
    'error',
  );
  assert.equal(
    (await runChallenge('unknown', 'function solve() {}')).status,
    'error',
  );
});

test('a valid alternate implementation passes rather than relying on source matching', async () => {
  const result = await runChallenge(
    'closure-cobra',
    'function solve(names) { return names.map(name => () => name); }',
  );
  assert.equal(result.passed, true);
});
