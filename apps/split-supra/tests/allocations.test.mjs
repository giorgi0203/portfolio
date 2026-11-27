import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSplit } from '../../decision-department/shared/split.mjs';

const participants = ['g', 'a', 'n'].map((id) => ({ id }));
const items = [
  { id: 'plate', quantity: 2, unitMinor: 501 },
  { id: 'tea', quantity: 1, unitMinor: 225 },
];
const claim = (itemId, participantId, weight) => ({
  itemId,
  participantId,
  weight,
});

test('a shared plate, a private tea and proportional service conserve every tetri', () => {
  const claims = [
    claim('plate', 'g', 1),
    claim('plate', 'a', 1),
    claim('plate', 'n', 2),
    claim('tea', 'a', 1),
  ];
  const result = calculateSplit(items, participants, claims, 123);
  assert.deepEqual(
    result.people.map((p) => [p.itemsMinor, p.feeMinor, p.totalMinor]),
    [
      [251, 25, 276],
      [475, 48, 523],
      [501, 50, 551],
    ],
  );
  assert.equal(result.unassignedMinor, 0);
  assert.equal(result.totalMinor, 1350);
});
test('unclaimed receipt items carry their own share of fees', () => {
  const result = calculateSplit(
    items,
    participants,
    [claim('tea', 'a', 1)],
    123,
  );
  assert.equal(result.people[1].totalMinor, 248);
  assert.equal(result.unassignedMinor, 1102);
  assert.equal(
    result.people[1].totalMinor + result.unassignedMinor,
    result.totalMinor,
  );
});
test('an unopened table assigns the whole bill to unclaimed', () => {
  const result = calculateSplit(items, [], [], 99);
  assert.equal(result.unassignedMinor, result.totalMinor);
});
test('ties award the first tetri to the earlier seat independently of claim order', () => {
  const result = calculateSplit(
    [{ id: 'dish', quantity: 1, unitMinor: 1 }],
    participants,
    [claim('dish', 'a', 1), claim('dish', 'g', 1)],
    0,
  );
  assert.deepEqual(
    result.people.map((p) => p.totalMinor),
    [1, 0, 0],
  );
});
test('integer conservation across bounded receipt quantities and uneven claims', () => {
  for (let unitMinor = 1; unitMinor < 120; unitMinor++) {
    const result = calculateSplit(
      [{ id: 'dish', quantity: (unitMinor % 4) + 1, unitMinor }, ...items],
      participants,
      [claim('dish', 'g', 5), claim('dish', 'a', 11), claim('plate', 'n', 1)],
      unitMinor * 3,
    );
    assert.equal(
      result.people.reduce(
        (sum, p) => sum + p.totalMinor,
        result.unassignedMinor,
      ),
      result.totalMinor,
    );
  }
});
