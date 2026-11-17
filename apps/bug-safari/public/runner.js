/* Trusted challenge harness. Learner code runs only in a disposable Web Worker. */
const BugSafariHarness = (() => {
  const MAX_CODE = 12000;
  const stringify = (value) => {
    try {
      const result = JSON.stringify(value, (_key, item) =>
        typeof item === 'undefined'
          ? '[undefined]'
          : typeof item === 'function'
            ? '[function]'
            : typeof item === 'bigint'
              ? String(item)
              : item,
      );
      return String(result === undefined ? value : result).slice(0, 1000);
    } catch {
      return '[unprintable value]';
    }
  };
  const equal = (a, b) => stringify(a) === stringify(b);
  const check = (name, actual, expected) => ({
    name,
    passed: equal(actual, expected),
    actual: stringify(actual),
    expected: stringify(expected),
  });
  const snapshots = {
    fencepost: [
      'Page 1: three specimens',
      'Page 2: continue the inventory',
      'Final page: keep the tail',
    ],
    'number-moth': [
      'Numbers, not strings',
      'Negative scores',
      'Decimals and untouched input',
    ],
    'copy-cat': [
      'Add to a new backpack',
      'Preserve the original',
      'Return a fresh array',
    ],
    'closure-cobra': [
      'Remember every label',
      'Reverse callback order',
      'Small collections',
    ],
    'race-raccoon': [
      'Old response finishes last',
      'Sequential searches',
      'Three overlapping requests',
    ],
    'listener-leech': [
      'Unmount removes its listener',
      'Repeated mount/unmount cycles',
      'Preserve unrelated listeners',
    ],
  };
  const previewTitles = {
    fencepost: 'Inventory pages',
    'number-moth': 'Trail-race leaderboard',
    'copy-cat': 'Backpack inspection',
    'closure-cobra': 'Field-note buttons',
    'race-raccoon': 'Search screen history',
    'listener-leech': 'Listener inspection',
  };
  function bus() {
    const listeners = new Set();
    return {
      on: (handler) => listeners.add(handler),
      off: (handler) => listeners.delete(handler),
      emit: (value) => {
        for (const handler of [...listeners]) handler(value);
      },
      count: () => listeners.size,
    };
  }
  function deferredRequests() {
    const pending = [];
    return {
      request: (query) =>
        new Promise((resolve) => pending.push({ query, resolve })),
      finish: (index, value) => {
        if (!pending[index])
          throw new Error('The search function must call request(query).');
        pending[index].resolve(value);
      },
    };
  }
  async function runChallenge(challengeId, code) {
    const started = performance.now();
    const preview = {
      title: previewTitles[challengeId] || 'Observation',
      lines: [],
    };
    const result = {
      challengeId,
      status: 'complete',
      passed: false,
      tests: [],
      preview,
      durationMs: 0,
    };
    if (!Object.hasOwn(snapshots, challengeId))
      return { ...result, status: 'error', error: 'Unknown challenge.' };
    if (typeof code !== 'string' || code.length > MAX_CODE)
      return {
        ...result,
        status: 'error',
        error: 'Keep your expedition code under 12,000 characters.',
      };
    let solve;
    try {
      // This function is constructed in the worker, never in the page.
      solve = new Function(
        '"use strict";\n' +
          code +
          '\n; return typeof solve === "function" ? solve : undefined;',
      )();
      if (typeof solve !== 'function')
        throw new Error('Define a function named solve.');
    } catch (error) {
      return {
        ...result,
        status: 'error',
        error: String(error?.message || 'The code could not start.').slice(
          0,
          500,
        ),
        durationMs: Math.round(performance.now() - started),
      };
    }
    const titles = snapshots[challengeId];
    async function test(index, operation) {
      try {
        const value = await operation();
        result.tests.push(check(titles[index], value.actual, value.expected));
        if (value.line) preview.lines.push(String(value.line).slice(0, 1000));
      } catch (error) {
        result.tests.push({
          name: titles[index],
          passed: false,
          expected: 'Test completes successfully',
          actual: String(error?.message || error).slice(0, 500),
        });
        preview.lines.push(
          'The experiment threw: ' +
            String(error?.message || error).slice(0, 300),
        );
      }
    }
    if (challengeId === 'fencepost') {
      const items = [
        'Beetle',
        'Moth',
        'Cobra',
        'Raccoon',
        'Leech',
        'Gecko',
        'Otter',
      ];
      for (const [i, page, expected] of [
        [0, 1, items.slice(0, 3)],
        [1, 2, items.slice(3, 6)],
        [2, 3, items.slice(6)],
      ])
        await test(i, () => {
          const actual = solve([...items], page, 3);
          return {
            actual,
            expected,
            line: 'Page ' + page + ': ' + stringify(actual),
          };
        });
    } else if (challengeId === 'number-moth') {
      for (const [i, values, expected] of [
        [0, [100, 2, 20, 3], [2, 3, 20, 100]],
        [1, [-2, -10, 1, 0], [-10, -2, 0, 1]],
        [2, [2.5, 11.2, 3.1], [2.5, 3.1, 11.2]],
      ])
        await test(i, () => {
          const input = [...values],
            actual = solve(input);
          const observation = { sorted: actual, original: input };
          return {
            actual: observation,
            expected: { sorted: expected, original: values },
            line:
              'Scores: ' +
              stringify(actual) +
              '; original: ' +
              stringify(input),
          };
        });
    } else if (challengeId === 'copy-cat') {
      await test(0, () => {
        const source = ['Map', 'Torch'],
          actual = solve(source, 'Beetle');
        return {
          actual,
          expected: ['Map', 'Torch', 'Beetle'],
          line: 'New backpack: ' + stringify(actual),
        };
      });
      await test(1, () => {
        const source = ['Map', 'Torch'];
        solve(source, 'Moth');
        return {
          actual: source,
          expected: ['Map', 'Torch'],
          line: 'Original backpack after adding Moth: ' + stringify(source),
        };
      });
      await test(2, () => {
        const source = [];
        const output = solve(source, 'Cobra');
        return {
          actual: { differentArray: output !== source, output },
          expected: { differentArray: true, output: ['Cobra'] },
          line: 'Separate array object: ' + String(output !== source),
        };
      });
    } else if (challengeId === 'closure-cobra') {
      await test(0, () => {
        const callbacks = solve(['Beetle', 'Moth', 'Cobra']);
        const actual = callbacks.map((fn) => fn());
        return {
          actual,
          expected: ['Beetle', 'Moth', 'Cobra'],
          line: 'Button labels: ' + stringify(actual),
        };
      });
      await test(1, () => {
        const callbacks = solve(['Raccoon', 'Leech', 'Otter']);
        const actual = [...callbacks].reverse().map((fn) => fn());
        return {
          actual,
          expected: ['Otter', 'Leech', 'Raccoon'],
          line: 'Reverse clicks: ' + stringify(actual),
        };
      });
      await test(2, () => {
        const actual = {
          empty: solve([]).length,
          single: solve(['Gecko'])[0](),
        };
        return {
          actual,
          expected: { empty: 0, single: 'Gecko' },
          line: 'One button: ' + stringify(actual.single),
        };
      });
    } else if (challengeId === 'race-raccoon') {
      await test(0, async () => {
        const fixture = deferredRequests(),
          renders = [],
          search = solve(fixture.request, (value) => renders.push(value));
        const old = search('old'),
          recent = search('new');
        fixture.finish(1, 'New search result');
        await recent;
        fixture.finish(0, 'Old search result');
        await old;
        return {
          actual: renders,
          expected: ['New search result'],
          line:
            'New response → old response. Screen writes: ' + stringify(renders),
        };
      });
      await test(1, async () => {
        const fixture = deferredRequests(),
          renders = [],
          search = solve(fixture.request, (value) => renders.push(value));
        const first = search('first');
        fixture.finish(0, 'First result');
        await first;
        const next = search('next');
        fixture.finish(1, 'Next result');
        await next;
        return {
          actual: renders,
          expected: ['First result', 'Next result'],
          line: 'Sequential screen writes: ' + stringify(renders),
        };
      });
      await test(2, async () => {
        const fixture = deferredRequests(),
          renders = [],
          search = solve(fixture.request, (value) => renders.push(value));
        const a = search('same query'),
          b = search('middle'),
          c = search('same query');
        fixture.finish(2, 'Newest response');
        await c;
        fixture.finish(0, 'Oldest response');
        await a;
        fixture.finish(1, 'Middle response');
        await b;
        return {
          actual: renders,
          expected: ['Newest response'],
          line: 'Three requests, reversed finish order: ' + stringify(renders),
        };
      });
    } else if (challengeId === 'listener-leech') {
      await test(0, () => {
        const emitter = bus(),
          received = [],
          dispose = solve(emitter, (value) => received.push(value));
        emitter.emit('Before cleanup');
        dispose();
        emitter.emit('After cleanup');
        const actual = { received, listeners: emitter.count() };
        return {
          actual,
          expected: { received: ['Before cleanup'], listeners: 0 },
          line:
            'After unmount: ' +
            emitter.count() +
            ' listener(s); messages: ' +
            stringify(received),
        };
      });
      await test(1, () => {
        const emitter = bus();
        for (let index = 0; index < 5; index++) {
          const dispose = solve(emitter, () => undefined);
          dispose();
        }
        return {
          actual: emitter.count(),
          expected: 0,
          line:
            'After five mount/unmount cycles: ' +
            emitter.count() +
            ' listener(s)',
        };
      });
      await test(2, () => {
        const emitter = bus(),
          received = [];
        const other = (value) => received.push('other: ' + value);
        emitter.on(other);
        const dispose = solve(emitter, (value) =>
          received.push('ours: ' + value),
        );
        dispose();
        emitter.emit('ping');
        const actual = { received, listeners: emitter.count() };
        return {
          actual,
          expected: { received: ['other: ping'], listeners: 1 },
          line: 'Other component still receives: ' + stringify(received),
        };
      });
    }
    result.passed =
      result.tests.length === 3 && result.tests.every((item) => item.passed);
    result.durationMs = Math.round(performance.now() - started);
    return result;
  }
  return { runChallenge };
})();

if (typeof module !== 'undefined' && module.exports)
  module.exports = BugSafariHarness;
if (
  typeof WorkerGlobalScope !== 'undefined' &&
  self instanceof WorkerGlobalScope
) {
  const reply = self.postMessage.bind(self);
  self.onmessage = async (event) => {
    const data = event.data;
    if (
      !data ||
      data.type !== 'bug-safari:run' ||
      typeof data.runId !== 'string' ||
      data.runId.length > 100
    )
      return;
    const result = await BugSafariHarness.runChallenge(
      data.challengeId,
      data.code,
    );
    reply({ type: 'bug-safari:result', runId: data.runId, result });
  };
}
