export type RunStatus = 'complete' | 'error' | 'timeout' | 'cancelled';
export interface TestResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}
export interface RunResult {
  challengeId: string;
  passed: boolean;
  status: RunStatus;
  tests: TestResult[];
  preview: { title: string; lines: string[] };
  durationMs: number;
  error?: string;
}
interface ActiveRun {
  worker: Worker;
  id: string;
  challengeId: string;
  resolve: (result: RunResult) => void;
  timer: ReturnType<typeof setTimeout>;
  started: number;
}
let active: ActiveRun | undefined;
const TIMEOUT_MS = 1500;
const MAX_CODE = 12000;
const emptyResult = (
  challengeId: string,
  status: RunStatus,
  error: string,
  durationMs = 0,
): RunResult => ({
  challengeId,
  status,
  error,
  passed: false,
  tests: [],
  preview: { title: 'Expedition paused', lines: [error] },
  durationMs,
});

function finish(run: ActiveRun, result: RunResult) {
  if (active !== run) return;
  active = undefined;
  clearTimeout(run.timer);
  run.worker.onmessage = null;
  run.worker.onerror = null;
  run.worker.terminate();
  run.resolve(result);
}

/** Stop work after a challenge switch/reset so stale results cannot win a race. */
export function cancelRun(): void {
  if (!active) return;
  const run = active;
  finish(
    run,
    emptyResult(
      run.challengeId,
      'cancelled',
      'This expedition was cancelled.',
      Math.round(performance.now() - run.started),
    ),
  );
}

function validResult(value: unknown, challengeId: string): value is RunResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<RunResult>;
  if (
    result.challengeId !== challengeId ||
    !['complete', 'error'].includes(result.status || '') ||
    !Array.isArray(result.tests) ||
    result.tests.length > 3
  )
    return false;
  if (
    !result.tests.every(
      (test) =>
        test &&
        typeof test.name === 'string' &&
        test.name.length < 200 &&
        typeof test.passed === 'boolean' &&
        typeof test.expected === 'string' &&
        test.expected.length <= 1000 &&
        typeof test.actual === 'string' &&
        test.actual.length <= 1000,
    )
  )
    return false;
  if (
    !result.preview ||
    typeof result.preview.title !== 'string' ||
    result.preview.title.length > 100 ||
    !Array.isArray(result.preview.lines) ||
    result.preview.lines.length > 6 ||
    !result.preview.lines.every(
      (line) => typeof line === 'string' && line.length <= 1000,
    )
  )
    return false;
  return (
    typeof result.durationMs === 'number' &&
    Number.isFinite(result.durationMs) &&
    result.durationMs >= 0 &&
    (result.error === undefined ||
      (typeof result.error === 'string' && result.error.length <= 500))
  );
}

/** Each run gets a fresh worker. Learner code is never evaluated in the page. */
export function runChallenge(
  challengeId: string,
  code: string,
): Promise<RunResult> {
  cancelRun();
  if (code.length > MAX_CODE)
    return Promise.resolve(
      emptyResult(
        challengeId,
        'error',
        'Keep your expedition code under 12,000 characters.',
      ),
    );
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker('/runner.js', { name: 'bug-safari-expedition' });
    } catch {
      resolve(
        emptyResult(
          challengeId,
          'error',
          'The isolated runner could not start in this browser.',
        ),
      );
      return;
    }
    const run: ActiveRun = {
      worker,
      id: crypto.randomUUID(),
      challengeId,
      resolve,
      started: performance.now(),
      timer: setTimeout(() => undefined, 0),
    };
    clearTimeout(run.timer);
    active = run;
    run.timer = setTimeout(
      () =>
        finish(
          run,
          emptyResult(
            challengeId,
            'timeout',
            'The expedition took too long. Check for an infinite loop or a Promise that never settles, then try again.',
            TIMEOUT_MS,
          ),
        ),
      TIMEOUT_MS,
    );
    worker.onmessage = (event) => {
      if (
        active !== run ||
        event.data?.type !== 'bug-safari:result' ||
        event.data?.runId !== run.id ||
        !validResult(event.data.result, challengeId)
      )
        return;
      const result: RunResult = event.data.result;
      finish(run, {
        ...result,
        passed:
          result.status === 'complete' &&
          result.tests.length === 3 &&
          result.tests.every((test) => test.passed),
      });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(
        run,
        emptyResult(
          challengeId,
          'error',
          'The isolated experiment failed to start or stopped unexpectedly. Check your code and try again.',
          Math.round(performance.now() - run.started),
        ),
      );
    };
    worker.postMessage({
      type: 'bug-safari:run',
      runId: run.id,
      challengeId,
      code,
    });
  });
}
