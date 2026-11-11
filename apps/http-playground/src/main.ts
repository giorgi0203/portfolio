import './style.css';
import {
  buildJourney,
  defaults,
  type Config,
  type Journey,
  type Stage,
} from './engine';

const stages: {
  id: Stage;
  name: string;
  short: string;
  icon: string;
  explanation: string;
}[] = [
  {
    id: 'cache',
    name: 'Browser cache',
    short: 'Already got it?',
    icon: '▤',
    explanation:
      'The browser first checks whether it can reuse a stored response. A fresh cached GET can avoid the entire network. This lab focuses on browser caching; real deployments can also have CDN, proxy and service-worker caches.',
  },
  {
    id: 'dns',
    name: 'DNS',
    short: 'Find the address',
    icon: '⌕',
    explanation:
      'DNS resolves a hostname to an IP address. A cached DNS answer avoids a lookup, but it does not mean the HTTP response is cached. The address in this lab belongs to a documentation-only range.',
  },
  {
    id: 'tcp',
    name: 'TCP',
    short: 'Make a connection',
    icon: '⇄',
    explanation:
      'TCP provides an ordered, reliable byte stream. A handshake takes roughly one network round trip. Real browsers often reuse an existing connection; this lab deliberately starts a new HTTP/1.1 connection.',
  },
  {
    id: 'tls',
    name: 'TLS / HTTPS',
    short: 'Trust, then encrypt',
    icon: '◇',
    explanation:
      'TLS 1.3 negotiates encryption and authenticates the server using its certificate. Certificate verification happens before the HTTP request is sent. HTTP/3 uses QUIC instead of this TCP path.',
  },
  {
    id: 'request',
    name: 'HTTP request',
    short: 'Ask for a thing',
    icon: '↗',
    explanation:
      'A method, target and headers describe what the browser wants. HTTPS encrypts these HTTP bytes in transit. A conditional GET can include an ETag validator such as If-None-Match.',
  },
  {
    id: 'server',
    name: 'API',
    short: 'Do the actual work',
    icon: '{ }',
    explanation:
      'The server routes the request and runs an application handler. Database work and other services can add delay here. A 500 means the server returned an error; it is different from not getting an HTTP response.',
  },
  {
    id: 'response',
    name: 'Response',
    short: 'Bring it home',
    icon: '↙',
    explanation:
      'The browser receives status, headers and usually a body. A 304 has no representation body: the browser reuses its stored version. Cache-Control determines whether and how the result can be stored.',
  },
];
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const app = el<HTMLDivElement>('app');
app.innerHTML = `
<a class="skip" href="#lab">Skip to the playground</a>
<header class="site-header"><a class="brand" href="https://giorgi.app/"><span class="brand-mark">g.</span><span>giorgi.app <small>/ the experiments</small></span></a><a class="back-link" href="https://giorgi.app/#projects">Back to the junk drawer ↗</a></header>
<main><section class="intro"><div><p class="eyebrow"><span class="dot"></span> HTTP PLAYGROUND / A LITTLE UNDER THE HOOD</p><h1>A request walks<br>into a <em>browser.</em></h1><p class="intro-copy">Follow the trip from “where is it?” to “here you go.” Slow it down, break a thing, and see what actually changes.</p></div><aside class="intro-note"><span class="note-spark">✳</span><strong>No packets were harmed.</strong><p>This is a <b>learning simulation</b>, not a network inspector. Timings are illustrative. Nothing you enter is sent anywhere.</p><span>HTTP/1.1 + TLS 1.3 · simplified on purpose</span></aside></section>
<section id="lab" class="lab" aria-label="HTTP request simulator">
<aside class="control-panel"><div class="panel-heading"><span>01 / SET THE SCENE</span><span aria-hidden="true">⌁</span></div><label for="preset">Start with a scenario</label><select id="preset"><option value="cold">Cold visit · nothing cached</option><option value="warm">Warm DNS · address remembered</option><option value="fresh">Fresh GET cache · skip the network</option><option value="revalidate">Expired cache · ask with an ETag</option></select><p class="field-hint" id="preset-hint"></p>
<div class="request-fields"><div><label for="method">Method</label><select id="method"><option>GET</option><option>POST</option></select></div><div class="path-field"><label for="path">Request path</label><input id="path" value="/api/ideas" maxlength="120" spellcheck="false"/></div></div><p class="host-caption">https://api.example.invalid</p>
<div class="range-heading"><label for="latency">Network round trip</label><output id="latency-value" for="latency">100 ms</output></div><input type="range" id="latency" min="0" max="1000" step="20" value="100"/><div class="range-labels"><span>next door</span><span>satellite vibes</span></div>
<div class="range-heading"><label for="server-delay">API processing</label><output id="server-value" for="server-delay">180 ms</output></div><input type="range" id="server-delay" min="0" max="3000" step="20" value="180"/><div class="range-labels"><span>instant-ish</span><span>making coffee</span></div>
<label class="fault-label" for="fault">Introduce a little chaos</label><select id="fault"><option value="none">Everything behaves</option><option value="dns">DNS lookup fails</option><option value="certificate">TLS certificate is untrusted</option><option value="timeout">API request times out</option><option value="server">API returns HTTP 500</option><option value="offline">Browser is offline</option></select><p class="field-hint">Fresh cached GETs still work offline. Network faults only matter if a request needs the network.</p>
<div class="control-foot"><span>Animation pace</span><select id="speed" aria-label="Animation pace"><option value="1">Take it slow</option><option value="2" selected>Just right</option><option value="4">I get it</option></select></div></aside>
<div class="journey-panel"><div class="journey-heading"><div><p class="eyebrow">02 / FOLLOW THE REQUEST</p><h2>The scenic route<span>.</span></h2></div><span class="simulation-badge">SIMULATED NETWORK</span></div>
<div class="run-bar"><button id="run" class="button-primary">Run request <span aria-hidden="true">↗</span></button><button id="pause" disabled>Pause</button><button id="next">Next step →</button><button id="reset" class="reset-button">Reset ↺</button><span class="keyboard-hint">One click at a time works too.</span></div>
<div class="flow" aria-label="Request stages">${stages.map((s, i) => `<button class="stage" data-stage="${s.id}" type="button" aria-label="Explain ${s.name}"><span class="stage-number">0${i + 1}</span><span class="stage-icon" aria-hidden="true">${s.icon}</span><strong>${s.name}</strong><small>${s.short}</small><span class="stage-result">waiting</span></button>`).join('')}</div>
<div class="progress-track" aria-hidden="true"><span id="progress"></span></div>
<div class="current-step" role="status" aria-live="polite"><span class="step-marker" id="step-symbol">↗</span><div><p class="eyebrow" id="step-label">READY WHEN YOU ARE</p><h3 id="step-title">One request. A few moving parts.</h3><p id="step-detail">Press Run to watch the journey, or Next step to inspect it at your own pace. Click any stage to learn what it does.</p></div></div>
<div class="summary-strip"><div><span>SIMULATED ELAPSED</span><strong id="elapsed">0 <small>ms</small></strong></div><div><span>HTTP RESULT</span><strong id="response-status">Not sent yet</strong></div><div><span>RESPONSE SOURCE</span><strong id="source">—</strong></div></div>
<details class="explanation" id="explanation"><summary><span id="explain-title">Why do all these steps exist?</span><span aria-hidden="true">+</span></summary><p id="explain-body">Click a stage above for an explanation. Real browsers can reuse connections and overlap work; this lab keeps each step visible so you can follow the cause and effect.</p></details>
</div></section>
<section class="inspection" aria-label="Request and response details"><div class="trace-panel"><div class="terminal-heading"><span><i></i><i></i><i></i></span><b>request.journey</b><button id="copy-trace" type="button">Copy trace</button></div><ol id="trace" aria-label="Journey event log"><li class="trace-empty">Waiting for a curious human…</li></ol><div class="trace-footer"><span>Virtual clock. Real concepts.</span><span id="trace-count">0 events</span></div></div><div class="wire-panel"><div class="wire-tabs" role="group" aria-label="Inspect details"><button data-tab="request" class="selected" aria-pressed="true">Request</button><button data-tab="response" aria-pressed="false">Response</button><button data-tab="body" aria-pressed="false">Body</button></div><p id="wire-caption">No HTTP bytes have been sent yet.</p><pre id="wire-content">// Run a journey to inspect its headers.</pre></div></section>
<section class="takeaways"><p class="eyebrow">THE USEFUL PART TO REMEMBER</p><div><article><span>01</span><h3>A cache hit is a shortcut.</h3><p>A fresh response can avoid the network entirely. Reusing a DNS answer only skips the address lookup.</p></article><article><span>02</span><h3>Slow isn’t always the server.</h3><p>Distance, connection setup, TLS and application work all contribute. Move one slider and compare the trace.</p></article><article><span>03</span><h3>Failures have a location.</h3><p>A bad certificate stops before HTTP. A 500 is an HTTP response. A timeout means a response didn’t arrive in time.</p></article></div></section>
</main><footer><a href="https://giorgi.app/">Made by Giorgi. Mostly out of curiosity. ↗</a><span>No real requests · no API keys · no surprise bills</span></footer>`;

let config: Config = { ...defaults };
let journey: Journey = buildJourney(config);
let cursor = -1;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let tab = 'request';
const presetHints: Record<string, string> = {
  cold: 'Start from scratch: no HTTP response or DNS answer is cached.',
  warm: 'Only DNS is cached. A new TCP/TLS connection is still required in this lab.',
  fresh:
    'Age 12 seconds, max-age 60: a fresh GET response can be reused without asking the API.',
  revalidate:
    'The stored GET is stale. An ETag asks the API whether the representation changed.',
};
function configure() {
  clearTimeout(timer);
  running = false;
  cursor = -1;
  const rawPath = el<HTMLInputElement>('path').value.trim();
  config = {
    preset: el<HTMLSelectElement>('preset').value as Config['preset'],
    method: el<HTMLSelectElement>('method').value as Config['method'],
    fault: el<HTMLSelectElement>('fault').value as Config['fault'],
    latency: Number(el<HTMLInputElement>('latency').value),
    serverDelay: Number(el<HTMLInputElement>('server-delay').value),
    path: rawPath.startsWith('/') ? rawPath : '/' + rawPath,
  };
  journey = buildJourney(config);
  el('latency-value').textContent = config.latency + ' ms';
  el('server-value').textContent = config.serverDelay + ' ms';
  el('preset-hint').textContent =
    presetHints[config.preset] +
    (config.method === 'POST' ? ' POST bypasses this GET cache.' : '');
  render();
}
function finish() {
  clearTimeout(timer);
  running = false;
  render();
}
function advance() {
  if (cursor >= journey.steps.length - 1) {
    finish();
    return;
  }
  cursor++;
  render();
  if (running) {
    if (cursor === journey.steps.length - 1) {
      finish();
      return;
    }
    schedule();
  }
}
function schedule() {
  clearTimeout(timer);
  const step = journey.steps[cursor];
  const pace = Number(el<HTMLSelectElement>('speed').value);
  timer = setTimeout(
    advance,
    Math.min(1400, 450 + (step?.duration || 0) / pace),
  );
}
function render() {
  const done = cursor === journey.steps.length - 1;
  const current = journey.steps[cursor];
  const visible = journey.steps.slice(0, cursor + 1);
  el('run').innerHTML =
    (done ? 'Run again' : 'Run request') + ' <span aria-hidden="true">↗</span>';
  el<HTMLButtonElement>('run').disabled = running;
  el<HTMLButtonElement>('pause').disabled = cursor < 0 || done;
  el('pause').textContent = running ? 'Pause' : 'Resume';
  el<HTMLButtonElement>('next').disabled = done;
  el('progress').style.width =
    ((cursor + 1) / journey.steps.length) * 100 + '%';
  el('step-label').textContent = current
    ? done
      ? 'JOURNEY COMPLETE'
      : `STEP ${cursor + 1} OF ${journey.steps.length}`
    : 'READY WHEN YOU ARE';
  el('step-title').textContent =
    current?.title || 'One request. A few moving parts.';
  el('step-detail').textContent =
    current?.detail ||
    'Press Run to watch the journey, or Next step to inspect it at your own pace. Click any stage to learn what it does.';
  el('step-symbol').textContent =
    current?.kind === 'error' ? '!' : done ? '✓' : '↗';
  document
    .querySelector('.current-step')
    ?.setAttribute('data-kind', current?.kind || 'normal');
  el('elapsed').innerHTML =
    (current ? current.at + current.duration : 0).toLocaleString() +
    ' <small>ms</small>';
  el('response-status').textContent = done
    ? journey.status === null
      ? 'No HTTP response'
      : `${journey.status} ${journey.statusText}`
    : cursor < 0
      ? 'Not sent yet'
      : 'In progress…';
  el('response-status').setAttribute(
    'data-outcome',
    done ? journey.outcome : 'pending',
  );
  el('source').textContent = done ? journey.source : '—';
  for (const node of document.querySelectorAll<HTMLButtonElement>(
    '[data-stage]',
  )) {
    const id = node.dataset.stage;
    const seen = visible.find((s) => s.stage === id);
    node.className =
      'stage' +
      (seen ? ' visited' : '') +
      (current?.stage === id ? ' current' : '') +
      (seen?.kind === 'error' ? ' failed' : '') +
      (seen?.kind === 'cached' ? ' cached' : '');
    node.setAttribute('aria-current', current?.stage === id ? 'step' : 'false');
    node.querySelector('.stage-result')!.textContent = seen
      ? seen.kind === 'error'
        ? 'stopped'
        : seen.kind === 'cached'
          ? 'reused'
          : seen.duration
            ? `${seen.duration} ms`
            : 'checked'
      : done
        ? 'not needed'
        : 'waiting';
  }
  const trace = el('trace');
  trace.replaceChildren();
  if (!visible.length) {
    const li = document.createElement('li');
    li.className = 'trace-empty';
    li.textContent = 'Waiting for a curious human…';
    trace.append(li);
  }
  for (const step of visible) {
    const li = document.createElement('li');
    li.dataset.kind = step.kind;
    const time = document.createElement('time');
    time.textContent = `+${step.at.toFixed(0).padStart(4, '0')} ms`;
    const text = document.createElement('span');
    text.textContent = step.title;
    li.append(time, text);
    trace.append(li);
  }
  trace.scrollTop = trace.scrollHeight;
  el('trace-count').textContent =
    `${visible.length} event${visible.length === 1 ? '' : 's'}`;
  renderWire();
}
function renderWire() {
  const current = journey.steps[cursor];
  const done = cursor === journey.steps.length - 1;
  const sent = journey.steps
    .slice(0, cursor + 1)
    .some((s) => s.stage === 'request');
  const headers = (entries: Record<string, string>) =>
    Object.entries(entries)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  let caption = '',
    content = '';
  if (tab === 'request') {
    caption = sent
      ? 'Illustrative HTTP bytes inside the encrypted connection.'
      : 'No HTTP bytes have been sent.';
    content = sent
      ? `${config.method} ${config.path} HTTP/1.1\n${headers(journey.requestHeaders)}${config.method === 'POST' ? '\n\n{"idea":"Build a little thing."}' : ''}`
      : done && !journey.network
        ? '// A fresh cache hit never sends an HTTP request.'
        : '// Waiting for the HTTP request stage.';
  } else if (tab === 'response') {
    caption =
      done && journey.status !== null
        ? journey.network
          ? 'HTTP response received from the API.'
          : 'Stored HTTP response metadata; no network response occurred.'
        : 'No HTTP response is available.';
    content =
      done && journey.status !== null
        ? `HTTP/1.1 ${journey.status} ${journey.statusText}\n${headers(journey.responseHeaders)}`
        : done
          ? '// A transport failure is not an HTTP status code.'
          : '// Waiting for a response.';
  } else {
    caption =
      done && journey.status === 304
        ? 'Cached representation reused. The 304 response has NO body.'
        : done && !journey.network
          ? 'Stored response body reused without a network request.'
          : 'JSON representation shown to the application.';
    content = done
      ? journey.body || '// No representation body was received.'
      : '// Waiting for a completed journey.';
  }
  el('wire-caption').textContent = caption;
  el('wire-content').textContent = content;
}
el('run').addEventListener('click', () => {
  if (cursor === journey.steps.length - 1) cursor = -1;
  running = true;
  advance();
});
el('pause').addEventListener('click', () => {
  if (running) {
    clearTimeout(timer);
    running = false;
    render();
  } else {
    running = true;
    render();
    schedule();
  }
});
el('next').addEventListener('click', () => {
  clearTimeout(timer);
  running = false;
  advance();
});
el('reset').addEventListener('click', configure);
for (const id of [
  'preset',
  'method',
  'fault',
  'latency',
  'server-delay',
  'path',
])
  el(id).addEventListener(
    id === 'latency' || id === 'server-delay' ? 'input' : 'change',
    configure,
  );
el('speed').addEventListener('change', () => {
  if (running) schedule();
});
for (const node of document.querySelectorAll<HTMLButtonElement>('[data-stage]'))
  node.addEventListener('click', () => {
    const stage = stages.find((s) => s.id === node.dataset.stage)!;
    el('explain-title').textContent = stage.name + ' · what happens here?';
    el('explain-body').textContent = stage.explanation;
    el<HTMLDetailsElement>('explanation').open = true;
  });
for (const node of document.querySelectorAll<HTMLButtonElement>('[data-tab]'))
  node.addEventListener('click', () => {
    tab = node.dataset.tab!;
    for (const b of document.querySelectorAll('[data-tab]')) {
      b.classList.toggle('selected', b === node);
      b.setAttribute('aria-pressed', String(b === node));
    }
    renderWire();
  });
el('copy-trace').addEventListener('click', async () => {
  const text = journey.steps
    .slice(0, cursor + 1)
    .map((s) => `+${s.at} ms ${s.title} (${s.duration} ms)`)
    .join('\n');
  try {
    await navigator.clipboard.writeText(
      'HTTP Playground — simulated request\n' + text,
    );
    el('copy-trace').textContent = 'Copied ✓';
  } catch {
    el('copy-trace').textContent = 'Select trace to copy';
  }
  setTimeout(() => (el('copy-trace').textContent = 'Copy trace'), 1800);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) {
    clearTimeout(timer);
    running = false;
    render();
  }
});
configure();
