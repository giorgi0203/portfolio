import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCombinations,
  MAX_MONEY_MINOR,
  parseMoney,
} from '../shared/menu-budget.mjs';

const dish = (id, priceMinor, name = id) => ({ id, name, priceMinor });

function check(result, menu, budget, people) {
  assert.ok(result.combinations.length <= 3);
  assert.equal(
    new Set(result.combinations.map((value) => value.key)).size,
    result.combinations.length,
  );
  for (const combination of result.combinations) {
    assert.ok(combination.items.length > 0);
    let portions = 0;
    let total = 0;
    for (const item of combination.items) {
      const source = menu.find((value) => value.id === item.id);
      assert.ok(source);
      assert.equal(item.name, source.name);
      assert.equal(item.priceMinor, source.priceMinor);
      assert.ok(Number.isSafeInteger(item.quantity) && item.quantity > 0);
      portions += item.quantity;
      total += item.priceMinor * item.quantity;
    }
    assert.equal(portions, people);
    assert.equal(combination.totalMinor, total);
    assert.ok(total <= budget);
    assert.equal(combination.remainingMinor, budget - total);
  }
}

test('decimal money parsing uses minor units and accepts a decimal comma', () => {
  for (const [text, expected] of [
    ['1', 100],
    ['0.01', 1],
    ['0,01', 1],
    ['12,5', 1250],
    [' 12.50 ', 1250],
    ['9.09', 909],
    ['0012.05', 1205],
    ['10000', MAX_MONEY_MINOR],
    ['10000.00', MAX_MONEY_MINOR],
  ])
    assert.equal(parseMoney(text), expected, text);
  assert.equal(
    parseMoney('0.29'),
    29,
    'no binary floating-point money rounding',
  );
});

test('malformed, ambiguous and out-of-range amounts require correction', () => {
  for (const value of [
    '',
    ' ',
    '0',
    '0.00',
    '-1',
    '+1',
    '1e3',
    'NaN',
    'Infinity',
    '₾12',
    '$12.00',
    '12 GEL',
    '12/15',
    'from 12',
    '1,250.00',
    '1.250,00',
    '1,234',
    '1 000',
    '1_000',
    '.50',
    '12.',
    '1.001',
    '10000.01',
    '999999999999999999999999',
    '\n1\n2',
    null,
    undefined,
    12,
  ])
    assert.equal(parseMoney(value), null, String(value));
});

test('exact budgets and unaffordable parties are distinguished by one minor unit', () => {
  const menu = [dish('khinkali', 1250)];
  const exact = generateCombinations(menu, 3750, 3, { random: () => 0 });
  check(exact, menu, 3750, 3);
  assert.equal(exact.combinations.length, 1);
  assert.equal(exact.combinations[0].remainingMinor, 0);
  assert.equal(exact.combinations[0].items[0].quantity, 3);
  assert.deepEqual(generateCombinations(menu, 3749, 3), {
    combinations: [],
    minimumMinor: 3750,
    reason: 'unaffordable',
  });
  assert.deepEqual(generateCombinations([], 100, 1), {
    combinations: [],
    reason: 'empty',
  });
});

test('constant randomness still finds distinct alternatives and equal-price dishes', () => {
  const menu = [dish('a', 500), dish('b', 500), dish('c', 500)];
  const result = generateCombinations(menu, 1000, 2, { random: () => 0 });
  check(result, menu, 1000, 2);
  assert.equal(result.combinations.length, 3);
  assert.ok(
    result.combinations.some((value) =>
      value.items.some((item) => item.id === 'b'),
    ),
  );
  assert.ok(
    result.combinations.some((value) =>
      value.items.some((item) => item.id === 'c'),
    ),
  );
  const limited = generateCombinations(menu, 1000, 2, {
    random: () => 0,
    limit: 1,
  });
  assert.equal(limited.combinations.length, 1);
});

test('returns two combinations when only two are affordable; expensive items never strand portions', () => {
  const menu = [
    dish('cheap', 100),
    dish('medium', 150),
    dish('expensive', 1000),
  ];
  const result = generateCombinations(menu, 250, 2, { random: () => 0.999999 });
  check(result, menu, 250, 2);
  assert.equal(result.combinations.length, 2);
  assert.ok(
    result.combinations.every((value) =>
      value.items.every((item) => item.id !== 'expensive'),
    ),
  );
});

test('results preserve literal names and input objects, including unusual safe IDs', () => {
  const menu = Object.freeze([
    Object.freeze(dish('__proto__', 100, '<img src=x onerror=alert(1)>')),
    Object.freeze(dish('constructor', 200, 'ქართული კერძი')),
  ]);
  const snapshot = JSON.stringify(menu);
  const result = generateCombinations(menu, 300, 2, { random: () => 0 });
  check(result, menu, 300, 2);
  assert.equal(JSON.stringify(menu), snapshot);
  assert.equal(
    result.combinations[0].items[0].name,
    '<img src=x onerror=alert(1)>',
  );
  result.combinations[0].items[0].name = 'edited result';
  assert.equal(menu[0].name, '<img src=x onerror=alert(1)>');
});

test('numeric, menu and RNG validation prevents unsafe or unbounded work', () => {
  const menu = [dish('a', 100)];
  for (const value of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
    1000001,
  ])
    assert.throws(() => generateCombinations(menu, value, 1), RangeError);
  for (const value of [0, -1, 1.5, 13, NaN, Infinity])
    assert.throws(() => generateCombinations(menu, 1000, value), RangeError);
  for (const value of [0, -1, 1.5, 4, NaN])
    assert.throws(
      () => generateCombinations(menu, 1000, 1, { limit: value }),
      RangeError,
    );
  for (const value of [-0.1, 1, NaN, Infinity, '0.5', undefined])
    assert.throws(
      () => generateCombinations(menu, 1000, 1, { random: () => value }),
      RangeError,
    );
  assert.throws(
    () => generateCombinations(menu, 1000, 1, { random: 'bad' }),
    TypeError,
  );
  for (const options of [null, [], 1])
    assert.throws(
      () => generateCombinations(menu, 1000, 1, options),
      TypeError,
    );
  for (const items of [null, {}, 'menu'])
    assert.throws(() => generateCombinations(items, 1000, 1), TypeError);
  for (const item of [
    null,
    [],
    {},
    dish('', 100),
    dish('a', 0),
    dish('a', -1),
    dish('a', 1.5),
    dish('a', 1000001),
    dish('a', 100, ''),
    dish('a\n', 100),
    dish('x'.repeat(101), 100),
    dish('a', 100, 'x'.repeat(161)),
  ])
    assert.throws(() => generateCombinations([item], 1000, 1));
  assert.throws(
    () => generateCombinations([dish('a', 100), dish('a', 200)], 1000, 1),
    TypeError,
  );
  assert.throws(
    () =>
      generateCombinations(
        Array.from({ length: 61 }, (_, i) => dish(String(i), 100)),
        1000,
        1,
      ),
    RangeError,
  );
});

test('bounded construction handles the maximum party/menu and numeric ceiling', () => {
  const menu = Array.from({ length: 60 }, (_, index) =>
    dish(String(index), 100 + index),
  );
  let samples = 0;
  const result = generateCombinations(menu, MAX_MONEY_MINOR, 12, {
    random: () => {
      samples++;
      return 0;
    },
  });
  check(result, menu, MAX_MONEY_MINOR, 12);
  assert.equal(result.combinations.length, 3);
  assert.ok(samples <= 80 * 12);
});

test('small-menu exhaustive oracle verifies feasibility and combination cardinality', () => {
  const rng = (() => {
    let seed = 12409;
    return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  })();
  for (let trial = 0; trial < 180; trial++) {
    const menu = Array.from({ length: 1 + (trial % 4) }, (_, i) =>
      dish(`item-${i}`, 1 + Math.floor(rng() * 9)),
    );
    const people = 1 + (trial % 4);
    const budget = 1 + Math.floor(rng() * 40);
    let possible = 0;
    function oracle(start, slots, remaining) {
      if (!slots) {
        possible++;
        return;
      }
      for (let index = start; index < menu.length; index++)
        if (menu[index].priceMinor <= remaining)
          oracle(index, slots - 1, remaining - menu[index].priceMinor);
    }
    oracle(0, people, budget);
    const result = generateCombinations(menu, budget, people, {
      random: trial % 2 ? rng : () => 0,
    });
    check(result, menu, budget, people);
    assert.equal(
      result.combinations.length,
      Math.min(3, possible),
      `trial ${trial}`,
    );
    assert.equal(result.reason === 'unaffordable', possible === 0);
  }
});
