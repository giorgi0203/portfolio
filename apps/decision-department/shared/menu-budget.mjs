/** Money stays in integer minor units; neither OCR nor random draws set totals. */
export const MAX_MONEY_MINOR = 1_000_000;
const MAX_ITEMS = 60;
const MAX_PEOPLE = 12;
const MAX_SUGGESTIONS = 3;
const RANDOM_ATTEMPTS = 80;

/** Read an explicitly entered decimal amount, never currency symbols or ranges. */
export function parseMoney(value) {
  if (typeof value !== 'string') return null;
  const amount = value.trim();
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/u.test(amount)) return null;
  const [whole, fraction = ''] = amount.split(/[.,]/u);
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= MAX_MONEY_MINOR
    ? minor
    : null;
}

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError(
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
}

function shortText(value, maximum, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TypeError(
      `${label} must be nonempty text of at most ${maximum} characters.`,
    );
}

/**
 * Select exactly one dish per person, including repeated orders of one dish.
 * Random choices reserve the cheapest possible remaining portions. A sorted
 * enumeration supplies missing alternatives even when the injected RNG repeats.
 */
export function generateCombinations(items, budgetMinor, people, options = {}) {
  integer(budgetMinor, 1, MAX_MONEY_MINOR, 'Budget');
  integer(people, 1, MAX_PEOPLE, 'People');
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Combination options must be an object.');
  const { random = Math.random, limit = MAX_SUGGESTIONS } = options;
  if (typeof random !== 'function')
    throw new TypeError('Random must be a function.');
  integer(limit, 1, MAX_SUGGESTIONS, 'Suggestion count');
  if (!Array.isArray(items))
    throw new TypeError('Menu items must be an array.');
  if (items.length > MAX_ITEMS)
    throw new RangeError(`Choose at most ${MAX_ITEMS} menu items.`);
  const ids = new Set();
  const menu = items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new TypeError('Each menu item must be an object.');
    shortText(item.id, 100, 'Item ID');
    shortText(item.name, 160, 'Item name');
    integer(item.priceMinor, 1, MAX_MONEY_MINOR, 'Item price');
    if (ids.has(item.id))
      throw new TypeError('Each menu item needs a unique ID.');
    ids.add(item.id);
    return { id: item.id, name: item.name, priceMinor: item.priceMinor };
  });
  if (!menu.length) return { combinations: [], reason: 'empty' };
  menu.sort(
    (left, right) =>
      left.priceMinor - right.priceMinor ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  const cheapest = menu[0].priceMinor;
  const minimumMinor = cheapest * people;
  if (minimumMinor > budgetMinor)
    return { combinations: [], minimumMinor, reason: 'unaffordable' };

  const found = new Map();
  function add(counts) {
    const entries = menu.flatMap((item, index) =>
      counts[index] ? [{ ...item, quantity: counts[index] }] : [],
    );
    const key = JSON.stringify(
      entries.map(({ id, quantity }) => [id, quantity]),
    );
    if (found.has(key)) return;
    const totalMinor = entries.reduce(
      (sum, item) => sum + item.priceMinor * item.quantity,
      0,
    );
    found.set(key, {
      items: entries,
      totalMinor,
      remainingMinor: budgetMinor - totalMinor,
      key,
    });
  }

  for (
    let attempt = 0;
    attempt < RANDOM_ATTEMPTS && found.size < limit;
    attempt++
  ) {
    const counts = new Uint8Array(menu.length);
    let remaining = budgetMinor;
    for (let slots = people; slots > 0; slots--) {
      const ceiling = remaining - (slots - 1) * cheapest;
      let eligible = 0;
      while (eligible < menu.length && menu[eligible].priceMinor <= ceiling)
        eligible++;
      const sample = random();
      if (
        typeof sample !== 'number' ||
        !Number.isFinite(sample) ||
        sample < 0 ||
        sample >= 1
      )
        throw new RangeError(
          'Random must return a finite number from 0 up to, but not including, 1.',
        );
      const index = Math.floor(sample * eligible);
      counts[index]++;
      remaining -= menu[index].priceMinor;
    }
    add(counts);
  }

  if (found.size < limit) {
    const counts = new Uint8Array(menu.length);
    function visit(start, slots, remaining) {
      if (found.size >= limit) return;
      if (!slots) {
        add(counts);
        return;
      }
      for (let index = start; index < menu.length; index++) {
        // Every accepted prefix can finish by repeating this cheapest allowed
        // index. Thus there are no exponential dead-end branches to explore.
        if (menu[index].priceMinor * slots > remaining) break;
        counts[index]++;
        visit(index, slots - 1, remaining - menu[index].priceMinor);
        counts[index]--;
        if (found.size >= limit) return;
      }
    }
    visit(0, people, budgetMinor);
  }
  return { combinations: [...found.values()], minimumMinor };
}
