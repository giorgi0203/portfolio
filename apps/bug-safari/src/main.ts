import './style.css';
import { challenges } from './challenges';
import { runChallenge, cancelRun } from './runner-client';
import type { RunResult } from './runner-client';

const STORE = 'giorgi-bug-safari-v1';
type Journal = {
  selected: string;
  completed: string[];
  assisted: string[];
  drafts: Record<string, string>;
  hints: Record<string, number>;
  attempts: Record<string, number>;
};
const journal: Journal = {
  selected: challenges[0].id,
  completed: [],
  assisted: [],
  drafts: {},
  hints: {},
  attempts: {},
};
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && typeof saved === 'object') {
    if (challenges.some((c) => c.id === saved.selected))
      journal.selected = saved.selected;
    if (Array.isArray(saved.completed))
      journal.completed = Array.from(
        new Set<string>(
          saved.completed.filter(
            (id: unknown) =>
              typeof id === 'string' && challenges.some((c) => c.id === id),
          ),
        ),
      );
    if (Array.isArray(saved.assisted))
      journal.assisted = saved.assisted.filter(
        (id: unknown) =>
          typeof id === 'string' && challenges.some((c) => c.id === id),
      );
    for (const name of ['drafts', 'hints', 'attempts'] as const) {
      if (
        saved[name] &&
        typeof saved[name] === 'object' &&
        !Array.isArray(saved[name])
      ) {
        for (const c of challenges) {
          const value = saved[name][c.id];
          if (
            name === 'drafts' &&
            typeof value === 'string' &&
            value.length <= 12000
          )
            journal.drafts[c.id] = value;
          else if (
            name !== 'drafts' &&
            Number.isInteger(value) &&
            value >= 0 &&
            value <= 10000
          )
            journal[name][c.id] = name === 'hints' ? Math.min(value, 3) : value;
        }
      }
    }
  }
} catch {
  /* A fresh field journal is fine when storage is unavailable or corrupt. */
}
let current =
  challenges.find((c) => c.id === journal.selected) || challenges[0];
let generation = 0,
  running = false,
  lastResult: RunResult | undefined,
  revealed = false,
  filter = 'all';
let storageFailed = false;
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(journal));
  } catch {
    storageFailed = true;
  }
}
const bug =
  '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="m25 20-5-7m19 7 5-7M18 29l-8-3m8 16-8 4m36-17 8-3m-8 16 8 4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><ellipse cx="32" cy="35" rx="15" ry="19" fill="currentColor"/><path d="M32 22v27" stroke="var(--lime)" stroke-width="2"/></svg>';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<a class="skip-link" href="#expedition">Skip to the expedition</a>
<header class="site-header"><a class="brand" href="https://giorgi.app/" aria-label="Back to Giorgi’s portfolio"><span class="brand-mark">g.</span><span>giorgi.app <small>/ field experiments</small></span></a><a class="back-link" href="https://giorgi.app/#projects">Back to the junk drawer <span aria-hidden="true">↗</span></a></header>
<main>
<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="signal"></span> A FIELD GUIDE TO THINGS THAT ALMOST WORK</p><h1>Bug Safari<span class="title-dot">.</span></h1><p class="hero-tagline">Small bugs. <em>Big aha moments.</em></p><p class="hero-description">Six curious creatures hiding in real JavaScript. Observe the odd behavior, change the code, and find the fix.</p></div><div class="specimen-card" aria-hidden="true"><div class="specimen-top"><span>SPECIMEN NO. 001</span><span>↗</span></div><div class="specimen-art"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="leaf leaf-one"></span><span class="leaf leaf-two"></span><div class="hero-beetle">${bug}</div><span class="annotation">usually found<br/>one index away ↳</span><span class="cross cross-one">+</span><span class="cross cross-two">+</span></div><div class="specimen-bottom"><span>Not a feature.</span><span>Probably.</span></div></div></section>
<div class="field-strip"><span><i class="signal"></i> NO SIGN-UP. NO AI. JUST YOUR BRAIN.</span><span>Your code runs in a disposable browser worker. <b>Happy hunting.</b></span></div>
<section class="safari-layout" id="expedition" aria-label="Debugging expedition">
<aside class="field-guide"><div class="guide-heading"><div><p class="eyebrow">01 / PICK A TRAIL</p><h2>The field guide</h2></div><span class="trail-count">06</span></div><label class="filter-label" for="difficulty">Difficulty</label><select id="difficulty"><option value="all">All trails</option><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option></select><nav id="challenge-list" aria-label="Debugging challenges"></nav><section class="journal" id="journal" aria-label="Your field journal"><div class="journal-title"><span>YOUR FIELD JOURNAL</span><span aria-hidden="true">✳</span></div><strong id="progress-count">0 / 6 discovered</strong><div class="journal-track" aria-hidden="true"><span id="progress-bar"></span></div><p id="journal-note">Discoveries and drafts stay in this browser. No account required.</p><button id="clear-journal" type="button">Clear discoveries</button></section></aside>
<div class="expedition-body"><header class="challenge-heading"><div><p class="eyebrow" id="challenge-meta"></p><h2 id="challenge-title"></h2></div><span class="species-pill" id="challenge-species"></span></header><p class="challenge-brief" id="challenge-brief"></p>
<div class="workbench"><section class="editor-panel" aria-labelledby="editor-title"><div class="editor-top"><div><span class="window-dots" aria-hidden="true"><i></i><i></i><i></i></span><h3 id="editor-title">safari.js</h3></div><span id="signature"></span></div><div class="editor-container"><pre id="line-numbers" aria-hidden="true"></pre><textarea id="code-editor" aria-label="JavaScript solution" aria-describedby="editor-keyboard-help" spellcheck="false" autocapitalize="off" autocomplete="off" maxlength="12000" wrap="off"></textarea></div><div class="editor-footer"><span id="draft-status">Your working copy</span><button id="reset-code" type="button">Reset code <span aria-hidden="true">↺</span></button></div><div class="run-toolbar"><button id="run-tests" class="primary-button" type="button"><span class="run-icon" aria-hidden="true">↗</span><span id="run-label">Run expedition</span></button><span class="keyboard-hint" id="editor-keyboard-help"><kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Enter</kbd><span>Esc, then Tab to leave the editor</span></span></div><p class="run-status" id="run-status" data-state="idle" role="status" aria-live="polite">Run the starter code to see this bug in the wild.</p></section>
<section class="observation-panel" aria-labelledby="observations-title"><div class="observation-heading"><div><p class="eyebrow">02 / OBSERVE & REPAIR</p><h3 id="observations-title">In the wild</h3></div><span class="observation-icon" aria-hidden="true">⌕</span></div><div id="observation-scene" class="observation-scene"><div class="scene-label"><span class="signal"></span><span id="preview-title">Waiting for an observation</span></div><div id="preview-lines"></div><p class="preview-note" id="preview-note">The preview uses your actual test output. Make a change and see what moves.</p></div><div class="test-heading"><h4>Field checks</h4><span id="test-summary">Not run yet</span></div><div id="test-results"></div></section></div>
<section class="field-notes" aria-labelledby="notes-title"><div class="notes-intro"><p class="eyebrow">03 / LEAVE WITH THE AHA</p><h3 id="notes-title">A little nudge?</h3><p>Good debugging starts with a question. Open one hint at a time, or study the worked solution.</p></div><div class="notes-content"><ol id="hints-list"></ol><div class="help-actions"><button id="hint" type="button">Reveal a hint <span aria-hidden="true">↗</span></button><button id="reveal-solution" type="button">Reveal solution</button></div><div id="explanation" class="explanation" hidden></div></div></section>
</div></section>
<section class="remember"><p class="eyebrow">THE USEFUL PART TO REMEMBER</p><div><article><span>01</span><h3>Reproduce before you repair.</h3><p>A failing check is a clue. Look at what actually happened before deciding what should change.</p></article><article><span>02</span><h3>Small fixes teach big ideas.</h3><p>Boundaries, identity, time, and cleanup. These little creatures turn up in much bigger codebases.</p></article><article><span>03</span><h3>Green is the beginning.</h3><p>Read the explanation, then try another approach. The goal is to understand the bug, not memorize the patch.</p></article></div></section>
</main><footer><span>Made by Giorgi. Occasionally bug-free. <a href="https://giorgi.app/">↗</a></span><span>Browser-only learning lab · drafts stay here</span></footer>`;
function el<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}
const editor = el<HTMLTextAreaElement>('code-editor');
let escapeNextTab = false;
function node(tag: string, text: string, className?: string) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
function formatIndex(id: string) {
  return String(challenges.findIndex((c) => c.id === id) + 1).padStart(2, '0');
}
function renderList() {
  const list = el('challenge-list');
  list.replaceChildren();
  for (const c of challenges.filter(
    (c) => filter === 'all' || c.difficulty === filter,
  )) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.challengeId = c.id;
    button.className =
      'trail' +
      (c.id === current.id ? ' selected' : '') +
      (journal.completed.includes(c.id) ? ' discovered' : '');
    button.setAttribute('aria-pressed', String(c.id === current.id));
    button.append(
      node(
        'span',
        journal.completed.includes(c.id) ? '✓' : formatIndex(c.id),
        'trail-index',
      ),
    );
    const copy = node('span', '', 'trail-copy');
    copy.append(
      node('strong', c.title),
      node(
        'small',
        `${c.species} · ${journal.completed.includes(c.id) ? (journal.assisted.includes(c.id) ? 'Guided discovery' : 'Solved') : c.difficulty}`,
      ),
    );
    button.append(copy, node('span', '↗', 'trail-arrow'));
    button.addEventListener('click', () => select(c.id));
    list.append(button);
  }
  const complete = journal.completed.length;
  el('progress-count').textContent =
    `${complete} / ${challenges.length} discovered`;
  el('progress-bar').style.width = `${(complete / challenges.length) * 100}%`;
  el('journal-note').textContent = storageFailed
    ? 'Browser storage is unavailable. You can still explore; this visit may not be remembered.'
    : 'Discoveries and drafts stay in this browser. No account required.';
}
function lineNumbers() {
  el('line-numbers').textContent = editor.value
    .split('\n')
    .map((_, i) => i + 1)
    .join('\n');
  el('line-numbers').style.transform = `translateY(-${editor.scrollTop}px)`;
}
function renderHints() {
  const list = el('hints-list');
  list.replaceChildren();
  const count = journal.hints[current.id] || 0;
  current.hints.slice(0, count).forEach((hint, i) => {
    const li = node('li', '');
    li.append(node('span', `FIELD NOTE ${i + 1}`), node('p', hint));
    list.append(li);
  });
  el<HTMLButtonElement>('hint').disabled = count >= current.hints.length;
  el('hint').textContent =
    count >= current.hints.length
      ? 'All hints uncovered'
      : `Reveal a hint (${count}/${current.hints.length}) ↗`;
}
function renderEmpty() {
  el('preview-title').textContent = 'Waiting for an observation';
  el('preview-lines').replaceChildren(
    node('div', '?', 'unobserved-symbol'),
    node('p', 'Every bug leaves a little evidence.', 'unobserved-copy'),
  );
  el('test-results').replaceChildren(
    node(
      'p',
      'Run your code to see which checks pass and which clues need a closer look.',
      'empty-checks',
    ),
  );
  el('test-summary').textContent = 'Not run yet';
  el('observation-scene').classList.remove('scene-success');
}
function select(id: string) {
  cancelRun();
  generation++;
  running = false;
  current = challenges.find((c) => c.id === id) || challenges[0];
  journal.selected = current.id;
  revealed = false;
  lastResult = undefined;
  editor.value = journal.drafts[current.id] ?? current.starterCode;
  lineNumbers();
  el('challenge-meta').textContent =
    `EXPEDITION ${formatIndex(current.id)} / ${current.difficulty.toUpperCase()}`;
  el('challenge-title').textContent = current.title;
  el('challenge-species').textContent = current.species;
  el('challenge-brief').textContent = current.brief;
  el('signature').textContent = current.signature;
  el('editor-title').textContent = `${current.id}.js`;
  el('run-status').dataset.state = 'idle';
  el('run-status').textContent =
    'Run the starter code to see this bug in the wild.';
  el('run-status').className = 'run-status';
  el('run-label').textContent = 'Run expedition';
  el<HTMLButtonElement>('run-tests').disabled = false;
  el('run-tests').classList.remove('is-running');
  el('draft-status').textContent =
    journal.drafts[current.id] === undefined
      ? 'Starter code · ready to investigate'
      : 'Saved draft · ready to investigate';
  el('explanation').hidden = true;
  renderEmpty();
  renderHints();
  renderList();
  save();
  if (location.hash !== `#${current.id}`)
    history.replaceState(null, '', `#${current.id}`);
}
function resultPreview(result: RunResult) {
  el('preview-title').textContent = result.preview.title;
  const preview = el('preview-lines');
  preview.replaceChildren();
  result.preview.lines.forEach((line, index) => {
    const item = node('div', '', 'observation-card');
    item.append(
      node('span', String(index + 1).padStart(2, '0'), 'observation-number'),
      node('p', line),
    );
    preview.append(item);
  });
  if (!result.preview.lines.length)
    preview.append(
      node(
        'p',
        'The specimen could not complete its behavior. Check the run message below.',
        'unobserved-copy',
      ),
    );
  el('observation-scene').classList.toggle('scene-success', result.passed);
  el('preview-note').textContent = result.passed
    ? 'That behavior came from your code. Small change, much happier specimen.'
    : 'These are observations from your code, not an illustration of the expected answer.';
  const tests = el('test-results');
  tests.replaceChildren();
  result.tests.forEach((test) => {
    const item = document.createElement('details');
    item.className = 'test-case';
    item.dataset.testPassed = String(test.passed);
    if (!test.passed) item.open = true;
    const summary = document.createElement('summary');
    summary.append(
      node('span', test.passed ? '✓' : '!', 'check-mark'),
      node('span', test.name),
      node('small', test.passed ? 'PASS' : 'LOOK CLOSER'),
    );
    item.append(summary);
    const diff = node('div', '', 'test-diff');
    const expected = node('div', '');
    expected.append(node('span', 'EXPECTED'), node('pre', test.expected));
    const actual = node('div', '');
    actual.append(node('span', 'OBSERVED'), node('pre', test.actual));
    diff.append(expected, actual);
    item.append(diff);
    tests.append(item);
  });
  if (!result.tests.length)
    tests.append(
      node(
        'p',
        result.error || 'No test observations were returned.',
        'empty-checks',
      ),
    );
  el('test-summary').textContent =
    `${result.tests.filter((t) => t.passed).length}/${result.tests.length} passed`;
}
function explanation() {
  const box = el('explanation');
  box.hidden = false;
  box.replaceChildren(
    node(
      'span',
      revealed ? 'THE WORKED SOLUTION' : 'SPECIMEN UNDERSTOOD',
      'eyebrow',
    ),
    node(
      'h4',
      revealed
        ? 'Here’s the idea behind the fix.'
        : 'Aha. That’s why it happened.',
    ),
    node('p', current.explanation),
  );
}
async function run() {
  if (running) return;
  const code = editor.value;
  const selected = current.id;
  const ownGeneration = ++generation;
  running = true;
  revealed = false;
  journal.drafts[selected] = code;
  journal.attempts[selected] = (journal.attempts[selected] || 0) + 1;
  save();
  el<HTMLButtonElement>('run-tests').disabled = true;
  el('run-tests').classList.add('is-running');
  el('run-label').textContent = 'Observing…';
  el('run-status').dataset.state = 'running';
  el('run-status').textContent = 'Running isolated field checks…';
  el('run-status').className = 'run-status';
  el('explanation').hidden = true;
  try {
    const result = await runChallenge(selected, code);
    if (ownGeneration !== generation || current.id !== selected) return;
    lastResult = result;
    resultPreview(result);
    el('run-status').dataset.state = result.passed
      ? 'passed'
      : result.status === 'complete'
        ? 'failed'
        : result.status;
    if (result.passed) {
      if (!journal.completed.includes(selected))
        journal.completed.push(selected);
      el('run-status').textContent =
        `${journal.assisted.includes(selected) ? 'Guided discovery' : 'Discovery'} recorded. All ${result.tests.length} field checks passed.`;
      el('run-status').className = 'run-status success';
      explanation();
    } else if (result.status === 'timeout') {
      el('run-status').textContent =
        'This specimen got stuck. The worker was stopped safely. Look for an endless loop or a promise that never finishes.';
      el('run-status').className = 'run-status error';
    } else if (result.status === 'error') {
      el('run-status').textContent =
        result.error ||
        'Your code could not run. Check its syntax and try again.';
      el('run-status').className = 'run-status error';
    } else {
      el('run-status').textContent =
        `${result.tests.filter((t) => !t.passed).length} clue${result.tests.filter((t) => !t.passed).length === 1 ? '' : 's'} still need a closer look. Compare expected and observed behavior.`;
      el('run-status').className = 'run-status error';
    }
    save();
    renderList();
  } catch {
    if (ownGeneration === generation) {
      el('run-status').dataset.state = 'error';
      el('run-status').textContent =
        'The field check couldn’t start. Refresh and try again; your draft is still here.';
      el('run-status').className = 'run-status error';
    }
  } finally {
    if (ownGeneration === generation) {
      running = false;
      el<HTMLButtonElement>('run-tests').disabled = false;
      el('run-tests').classList.remove('is-running');
      el('run-label').textContent = 'Run expedition';
    }
  }
}
editor.addEventListener('input', () => {
  const hadObservation = running || !!lastResult;
  if (running) {
    cancelRun();
    generation++;
    running = false;
    el<HTMLButtonElement>('run-tests').disabled = false;
    el('run-tests').classList.remove('is-running');
    el('run-label').textContent = 'Run expedition';
  }
  escapeNextTab = false;
  journal.drafts[current.id] = editor.value;
  save();
  lineNumbers();
  el('draft-status').textContent = storageFailed
    ? 'Working copy · storage unavailable'
    : 'Draft saved in this browser';
  el('run-status').dataset.state = 'idle';
  if (hadObservation) {
    el('run-status').textContent =
      'Code changed. Run again to check this version.';
    el('run-status').className = 'run-status';
    el('test-summary').textContent = lastResult
      ? 'Previous run · code changed'
      : 'Not run yet';
    el('observation-scene').classList.remove('scene-success');
    el('explanation').hidden = true;
  }
});
editor.addEventListener('scroll', lineNumbers);
editor.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    void run();
  }
  if (event.key === 'Escape') {
    escapeNextTab = true;
    el('draft-status').textContent = 'Press Tab to move out of the editor';
  }
  if (event.key === 'Tab') {
    if (event.shiftKey || escapeNextTab) {
      escapeNextTab = false;
      return;
    }
    event.preventDefault();
    const start = editor.selectionStart,
      end = editor.selectionEnd;
    editor.setRangeText('  ', start, end, 'end');
    editor.dispatchEvent(new Event('input'));
  }
});
el('run-tests').addEventListener('click', () => void run());
el('reset-code').addEventListener('click', () => {
  cancelRun();
  generation++;
  running = false;
  delete journal.drafts[current.id];
  select(current.id);
});
el('hint').addEventListener('click', () => {
  journal.hints[current.id] = Math.min(
    (journal.hints[current.id] || 0) + 1,
    current.hints.length,
  );
  save();
  renderHints();
});
el('reveal-solution').addEventListener('click', () => {
  cancelRun();
  generation++;
  running = false;
  revealed = true;
  if (!journal.assisted.includes(current.id)) journal.assisted.push(current.id);
  editor.value = current.solutionCode;
  journal.drafts[current.id] = editor.value;
  save();
  lineNumbers();
  el('run-label').textContent = 'Run expedition';
  el<HTMLButtonElement>('run-tests').disabled = false;
  el('run-tests').classList.remove('is-running');
  el('draft-status').textContent =
    'Worked solution · study it, then run the checks';
  el('run-status').dataset.state = 'idle';
  el('run-status').textContent =
    'Solution revealed. Run it to observe the repaired behavior.';
  el('run-status').className = 'run-status';
  explanation();
});
el<HTMLSelectElement>('difficulty').addEventListener('change', (event) => {
  filter = (event.target as HTMLSelectElement).value;
  renderList();
});
el('clear-journal').addEventListener('click', () => {
  journal.completed = [];
  save();
  renderList();
  el('run-status').textContent =
    'Discoveries cleared. Your drafts and hints are still here.';
});
window.addEventListener('pagehide', () => cancelRun());
const linked = location.hash.slice(1);
select(challenges.some((c) => c.id === linked) ? linked : journal.selected);
