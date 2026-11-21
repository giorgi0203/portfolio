export interface Challenge {
  id: string;
  title: string;
  species: string;
  difficulty: 'Beginner' | 'Intermediate';
  brief: string;
  signature: string;
  starterCode: string;
  solutionCode: string;
  hints: [string, string, string];
  explanation: string;
  expectedTestCases: string[];
}

export const challenges: Challenge[] = [
  {
    id: 'fencepost',
    title: 'The missing last item',
    species: 'Fencepost beetle',
    difficulty: 'Beginner',
    brief:
      'The expedition inventory shows only two specimens on a three-item page. Return exactly the requested page without changing the inventory. Pages start at 1.',
    signature: 'solve(items, page, pageSize) → items on that page',
    starterCode: `function solve(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  return items.slice(start, end);
}`,
    solutionCode: `function solve(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}`,
    hints: [
      'Check how many items you ask slice() to return.',
      'The second argument of slice() is an exclusive end index.',
      'Remove the - 1 from the end calculation.',
    ],
    explanation:
      'slice(start, end) includes start but excludes end. A page of three items needs end = start + 3. Subtracting one drops the final item. This is a boundary bug, not a missing specimen.',
    expectedTestCases: [
      'First page contains three items.',
      'Second page starts at the fourth item.',
      'The final short page keeps its remaining item.',
    ],
  },
  {
    id: 'number-moth',
    title: 'A suspicious leaderboard',
    species: 'Lexicographic moth',
    difficulty: 'Beginner',
    brief:
      'The trail-race leaderboard puts 100 before 20. Sort the supplied scores from smallest to largest. Keep the original scores unchanged.',
    signature: 'solve(scores) → a new numerically sorted array',
    starterCode: `function solve(scores) {
  return [...scores].sort();
}`,
    solutionCode: `function solve(scores) {
  return [...scores].sort((a, b) => a - b);
}`,
    hints: [
      'The copy is useful. The ordering is the suspicious part.',
      'Without a comparator, sort() compares string representations.',
      'Use a numeric comparator: (a, b) => a - b.',
    ],
    explanation:
      'JavaScript’s default sort order is based on strings, so "100" comes before "20". A numeric comparator returns a negative, zero, or positive number to describe ordering. Copying first also prevents sort() from mutating the caller’s array.',
    expectedTestCases: [
      'Mixed digit lengths sort numerically.',
      'Negative scores keep their numeric order.',
      'Decimals sort correctly without changing the input.',
    ],
  },
  {
    id: 'copy-cat',
    title: 'Two backpacks, one surprise',
    species: 'Shared-state chameleon',
    difficulty: 'Beginner',
    brief:
      'Adding a specimen to a new backpack also changes the original explorer’s backpack. Add the new item to a fresh array and leave the original alone.',
    signature: 'solve(backpack, newItem) → a new backpack array',
    starterCode: `function solve(backpack, newItem) {
  backpack.push(newItem);
  return backpack;
}`,
    solutionCode: `function solve(backpack, newItem) {
  return [...backpack, newItem];
}`,
    hints: [
      'Inspect the original backpack after the function returns.',
      'push() changes the array it is called on.',
      'Return [...backpack, newItem] instead of pushing into backpack.',
    ],
    explanation:
      'Arrays are objects. Passing an array into a function passes a reference to that same object. push() mutates it, so every reference sees the addition. A new array separates the two backpacks; this is a shallow copy, so nested objects would still be shared.',
    expectedTestCases: [
      'The new backpack contains the extra item.',
      'The original backpack stays unchanged.',
      'The returned array is a different object.',
    ],
  },
  {
    id: 'closure-cobra',
    title: 'Every label went missing',
    species: 'Closure cobra',
    difficulty: 'Beginner',
    brief:
      'Each field-note button stores a callback that should return its own specimen name. By the time you click, every callback has forgotten its label.',
    signature:
      'solve(names) → an array of callbacks; callback() returns its name',
    starterCode: `function solve(names) {
  const callbacks = [];
  for (var index = 0; index < names.length; index++) {
    callbacks.push(() => names[index]);
  }
  return callbacks;
}`,
    solutionCode: `function solve(names) {
  const callbacks = [];
  for (let index = 0; index < names.length; index++) {
    callbacks.push(() => names[index]);
  }
  return callbacks;
}`,
    hints: [
      'The callbacks run after the loop has finished.',
      'var gives these callbacks one shared index binding.',
      'Use let for a fresh per-iteration binding, or map each name directly.',
    ],
    explanation:
      'A closure keeps access to a binding, not a frozen copy of its value. With var, the callbacks share one index that equals names.length after the loop. A let loop creates a new binding per iteration. names.map(name => () => name) is another valid repair.',
    expectedTestCases: [
      'Each callback remembers its own label.',
      'Callbacks also work when invoked in reverse order.',
      'Empty and single-item lists behave normally.',
    ],
  },
  {
    id: 'race-raccoon',
    title: 'Yesterday’s search wins',
    species: 'Race-condition raccoon',
    difficulty: 'Intermediate',
    brief:
      'An older, slower search arrives after the latest search and overwrites the screen. Return a search function that renders only the latest requested result. request(query) returns a Promise; render(result) updates the screen.',
    signature: 'solve(request, render) → async search(query)',
    starterCode: `function solve(request, render) {
  return async function search(query) {
    const result = await request(query);
    render(result);
  };
}`,
    solutionCode: `function solve(request, render) {
  let latestRequest = 0;
  return async function search(query) {
    const requestId = ++latestRequest;
    const result = await request(query);
    if (requestId === latestRequest) {
      render(result);
    }
  };
}`,
    hints: [
      'Response order is not the same as request order.',
      'Give every search call a monotonically increasing request ID.',
      'Only render if the finished request ID still matches the latest issued ID.',
    ],
    explanation:
      'The most recent response is not necessarily the most recent request. A generation counter lets old requests finish while ignoring their stale result. The tests use real Promises with deliberately controlled completion order, not a live network. Production code can also use cancellation where supported.',
    expectedTestCases: [
      'A slow old search cannot overwrite the newer result.',
      'Sequential completed searches both render normally.',
      'Only the newest of three overlapping searches renders.',
    ],
  },
  {
    id: 'listener-leech',
    title: 'The echo that keeps growing',
    species: 'Listener leech',
    difficulty: 'Intermediate',
    brief:
      'Every mount adds a message listener, but unmounting leaves it behind. Subscribe using bus.on(handler) and return a cleanup function using bus.off(handler). Keep unrelated listeners intact.',
    signature: 'solve(bus, onMessage) → cleanup()',
    starterCode: `function solve(bus, onMessage) {
  const handler = (message) => onMessage(message);
  bus.on(handler);
  return function cleanup() {
    bus.off((message) => onMessage(message));
  };
}`,
    solutionCode: `function solve(bus, onMessage) {
  const handler = (message) => onMessage(message);
  bus.on(handler);
  return function cleanup() {
    bus.off(handler);
  };
}`,
    hints: [
      'The two arrow functions look alike. Are they the same object?',
      'Unsubscription must receive the same function reference used to subscribe.',
      'Pass handler directly to bus.off(handler).',
    ],
    explanation:
      'Two function expressions create two different objects, even with identical source code. Removing a new function does not remove the original listener. Keeping the original handler reference prevents callbacks accumulating across mounts. This controlled event bus shows retained listener counts; it is not a browser heap measurement.',
    expectedTestCases: [
      'Unmount removes the registered listener.',
      'Repeated mounts do not accumulate listeners.',
      'Cleanup preserves another component’s listener.',
    ],
  },
];

export const challengeById = (id: string) =>
  challenges.find((challenge) => challenge.id === id);
