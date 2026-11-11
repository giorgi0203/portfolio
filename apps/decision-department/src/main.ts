import './style.css';

type Choice = { id: string; text: string; votes: number };
type Spin = {
  id: string;
  sequence: number;
  winnerId: string;
  winnerText: string;
  startedAt: number;
  endsAt: number;
  choices: { id: string; text: string }[];
};
type Room = {
  id: string;
  title: string;
  createdAt: number;
  expiresAt: number;
  locked: boolean;
  revision: number;
  participants: number;
  choices: Choice[];
  lastSpin: Spin | null;
  myVote?: string | null;
};
type Credentials = {
  hostToken?: string;
  participantToken?: string;
  participantId?: string;
};
type Reply = {
  room: Room;
  hostToken?: string;
  participantToken?: string;
  participantId?: string;
};
const colors = [
  '#ed937c',
  '#d8e9a6',
  '#c9b9e1',
  '#e8c788',
  '#a6c7bd',
  '#dfacc1',
  '#b7c1dc',
  '#d1d29c',
];
const presets: Record<string, { title: string; choices: string[] }> = {
  food: {
    title: 'What’s for dinner?',
    choices: [
      'Pizza',
      'Khinkali',
      'Sushi',
      'Cook something',
      'Burgers',
      'Surprise me',
    ],
  },
  watch: {
    title: 'What are we watching?',
    choices: [
      'A terrible movie',
      'One more episode',
      'A documentary',
      'Something nostalgic',
    ],
  },
  build: {
    title: 'What should we build?',
    choices: [
      'A tiny game',
      'A useful little tool',
      'A ridiculous website',
      'Finish the old project',
    ],
  },
};
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const root = $('#app');
root.innerHTML = `
<header class="topbar"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">✳</span><span>The Decision Department</span></a><div class="top-links"><span id="connection-status" class="connection">Ready for business</span><a href="https://giorgi.app/"><span class="back-long">Giorgi’s junk drawer </span>↗</a></div></header>
<main class="shell"><section class="masthead"><div><p class="eyebrow">AN ENTIRE DEPARTMENT. FOR ONE LITTLE DECISION.</p><h1>Less “I don’t know.”<br>More <em>“let’s do that.”</em></h1><p>Gather the options. Invite the indecisive. Spin once, together.<br>Finally, a meeting with an outcome.</p></div><div class="department-seal" aria-hidden="true">OFFICIALLY<br><b>✳</b>UNDECIDED</div></section>
<div class="workspace"><section class="wheel-panel" aria-label="Decision wheel"><div class="panel-top"><span>THE UNBIASED OPINION MACHINE</span><span id="wheel-count">6 possibilities</span></div><div class="wheel-stage"><svg class="wheel-pointer" viewBox="0 0 30 31" aria-hidden="true"><path d="M2 2h26L15 28Z" fill="#2e352c" stroke="#f7f3e9" stroke-width="2"/></svg><svg id="wheel" class="wheel" viewBox="0 0 400 400" aria-hidden="true"></svg><div class="wheel-center" aria-hidden="true"><b>✳</b><span>DEPT. OF MAYBE</span></div></div><p id="wheel-caption" class="wheel-caption">One wheel. <strong>Zero follow-up meetings.</strong></p><div class="wheel-actions"><button id="spin" type="button" class="button coral" hidden>Make it official <span aria-hidden="true">↻</span></button></div><div id="receipt" class="receipt" hidden><span class="receipt-stamp" aria-hidden="true">DECIDED</span><p class="eyebrow">OFFICIAL DEPARTMENTAL RULING</p><h3 id="winner" aria-live="polite" aria-atomic="true"></h3><p id="receipt-note"></p></div></section>
<section class="side-panel" aria-label="Your decision room"><div id="loading" class="skeleton" hidden><span class="spinner" aria-hidden="true"></span>Finding your department…</div>
<div id="create-view"><div class="steps"><b>01 / MAKE A ROOM</b><span>→</span>02 / BRING FRIENDS<span>→</span>03 / DECIDE</div><p class="eyebrow">FILE A NEW CASE</p><h2>What can’t you decide?</h2><p class="helper">Start with a few options. Everyone with your invite can add a suggestion and vote. No accounts, no awkward introductions.</p><form id="create-room"><label for="room-title">The important question<input id="room-title" required maxlength="80" value="What’s for dinner?" placeholder="Where should we go this weekend?"></label><label for="initial-choices">The possibilities <span class="muted">— one per line</span><textarea id="initial-choices" required rows="6" maxlength="3000"></textarea></label><div class="presets" role="group" aria-label="Quick room ideas"><button class="preset" type="button" data-preset="food">Dinner plans</button><button class="preset" type="button" data-preset="watch">Movie night</button><button class="preset" type="button" data-preset="build">Build something</button></div><button id="create-submit" class="button full" type="submit">Open a department <span aria-hidden="true">↗</span></button><p class="fine-print">2–32 options · invite-only by link · rooms expire after 7 days<br>The creator keeps host controls in this browser.</p></form></div>
<div id="room-view" hidden><div class="room-top"><div><p class="eyebrow">CASE NOW OPEN</p><p class="room-code">ROOM <code id="room-code"></code></p></div><span id="role-badge" class="role-badge"></span></div><h2 id="room-heading" class="room-title"></h2><p id="room-subtitle" class="helper"></p><div class="invite-row"><input id="invite-link" readonly aria-label="Public room invite link"><button id="copy-invite" class="button light small" type="button">Copy invite ↗</button></div>
<div id="join-box" class="join-box" hidden><p>Welcome to the committee. Join to add a choice or cast your vote.</p><form id="join-room"><label for="join-name">Your name <span class="muted">(optional)</span><input id="join-name" maxlength="24" autocomplete="nickname" placeholder="A mysterious decision-maker"></label><button id="join-submit" type="submit" class="button small">Take a seat ↗</button></form></div>
<div class="section-line"><h3>The shortlist</h3><span id="vote-summary"></span></div><ul id="choices" class="choices"></ul><form id="choice-form" class="add-row" hidden><label for="new-choice">Add your brilliant suggestion<input id="new-choice" maxlength="80" required placeholder="What about…"></label><button id="add-choice" class="button light small" type="submit">Add +</button></form><div class="participant-strip"><span class="participant-dot" aria-hidden="true">◉</span><span id="participants"></span><span id="round-status"></span></div><p class="fine-print">Votes show what the group likes. The wheel gives every option an equal chance.</p><div id="host-actions" class="host-actions" hidden><button id="lock-room" class="button light small" type="button">Lock suggestions</button><button id="reset-round" class="button light small" type="button">New round</button><button id="delete-room" class="button danger small" type="button">Close room</button></div><p id="host-note" class="host-note" hidden>Host controls belong to this browser. The invite link never includes your host key.</p><p id="expiry" class="fine-print"></p><a href="/" id="new-room-link" class="fine-print">Start another decision ↗</a></div>
<div id="message" class="message" role="alert" hidden></div></section></div><footer class="bottom-note"><p>A low-stakes committee for dinner plans, movie nights, and questionable side projects.<br>Anyone with the invite can join. Use nicknames; don’t put private information in a room.</p><a href="https://giorgi.app/">Made by Giorgi. Obviously. ↗</a></footer></main><div id="toast" role="status" aria-live="polite"></div>`;

let room: Room | undefined;
let credentials: Credentials = {};
let currentId = '';
let generation = 0;
let busy = false;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let spinTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
let myVote: string | null = null;
let wheelKey = '';
let currentRotation = 0;
let wheelAnimation: Animation | undefined;
let shownSpin = '';
let announcedSpin = '';
let creating = false;
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = (id: string) => `decision-department:room:${id}`;
const publicInvite = (id: string) =>
  `${location.origin}/room/${encodeURIComponent(id)}`;
function setConnection(text: string, offline = false) {
  $('#connection-status').textContent = text;
  $('#connection-status').classList.toggle('offline', offline);
}
function message(text: string, success = false) {
  const box = $('#message');
  box.textContent = text;
  box.classList.toggle('success', success);
  box.hidden = !text;
}
function toast(text: string) {
  clearTimeout(toastTimer);
  const box = $('#toast');
  box.textContent = text;
  box.classList.add('show');
  toastTimer = setTimeout(() => box.classList.remove('show'), 2800);
}
function readCredentials(id: string): Credentials {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(id)) || '{}');
    return {
      hostToken:
        typeof parsed.hostToken === 'string' ? parsed.hostToken : undefined,
      participantToken:
        typeof parsed.participantToken === 'string'
          ? parsed.participantToken
          : undefined,
      participantId:
        typeof parsed.participantId === 'string'
          ? parsed.participantId
          : undefined,
    };
  } catch {
    return {};
  }
}
function remember(reply: Reply) {
  credentials = {
    ...credentials,
    ...(reply.hostToken ? { hostToken: reply.hostToken } : {}),
    ...(reply.participantToken
      ? { participantToken: reply.participantToken }
      : {}),
    ...(reply.participantId ? { participantId: reply.participantId } : {}),
  };
  try {
    localStorage.setItem(
      storageKey(reply.room.id),
      JSON.stringify(credentials),
    );
  } catch {
    message(
      'This browser could not save your room access. Keep this tab open; host controls cannot be recovered after it closes.',
    );
  }
}
async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  role: 'host' | 'participant' | 'none' = 'none',
): Promise<Reply> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (role === 'host' && credentials.hostToken)
    headers['x-host-token'] = credentials.hostToken;
  if (
    (role === 'participant' || method === 'GET') &&
    credentials.participantToken
  )
    headers['x-participant-token'] = credentials.participantToken;
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(12000),
  });
  let result: Reply & { error?: string };
  try {
    result = await response.json();
  } catch {
    throw new Error(
      'The department returned an unreadable response. Please try again.',
    );
  }
  if (!response.ok) {
    const error = new Error(
      result.error ||
        `The request could not be completed (${response.status}).`,
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return result;
}
function svgNode(tag: string, attrs: Record<string, string>) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  return node;
}
function drawWheel(choices: { id: string; text: string }[]) {
  const key = choices.map((c) => `${c.id}:${c.text}`).join('|');
  if (key === wheelKey) return;
  wheelKey = key;
  const wheel = $('#wheel');
  wheel.replaceChildren();
  const n = choices.length || 1;
  const slice = (Math.PI * 2) / n;
  choices.forEach((choice, i) => {
    const start = -Math.PI / 2 + i * slice,
      end = start + slice;
    const x1 = 200 + Math.cos(start) * 193,
      y1 = 200 + Math.sin(start) * 193,
      x2 = 200 + Math.cos(end) * 193,
      y2 = 200 + Math.sin(end) * 193;
    const d =
      n === 1
        ? 'M200 7A193 193 0 1 1 199.99 7Z'
        : `M200 200L${x1} ${y1}A193 193 0 ${slice > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`;
    wheel.append(
      svgNode('path', {
        d,
        fill: colors[i % colors.length],
        stroke: '#f7f3e9',
        'stroke-width': '2',
      }),
    );
    const middle = start + slice / 2;
    const x = 200 + Math.cos(middle) * 134,
      y = 200 + Math.sin(middle) * 134;
    const text = svgNode('text', {
      x: String(x),
      y: String(y),
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      transform: `rotate(${(middle * 180) / Math.PI + 90} ${x} ${y})`,
    });
    if (n > 12) text.setAttribute('class', 'small-label');
    const max = n > 16 ? 8 : n > 10 ? 11 : 17;
    text.textContent =
      choice.text.length > max
        ? choice.text.slice(0, max - 1) + '…'
        : choice.text;
    wheel.append(text);
  });
  wheel.append(
    svgNode('circle', {
      cx: '200',
      cy: '200',
      r: '194',
      fill: 'none',
      stroke: '#2e352c',
      'stroke-width': '2',
    }),
  );
  $('#wheel-count').textContent =
    `${choices.length} possibilit${choices.length === 1 ? 'y' : 'ies'}`;
}
function activeSpin() {
  return !!room?.lastSpin && room.lastSpin.endsAt > Date.now();
}
function winnerReceipt(spin: Spin) {
  $('#receipt').hidden = false;
  $('#winner').dataset.spinId = spin.id;
  if (announcedSpin !== spin.id) {
    $('#winner').textContent = spin.winnerText;
    announcedSpin = spin.id;
  }
  $('#receipt-note').textContent =
    `ROUND ${spin.sequence.toString().padStart(2, '0')} · SAME RULING FOR THE WHOLE ROOM\nEvery option had an equal chance. Democracy was consulted.`;
  $('#wheel-caption').textContent =
    'Decision filed. Please direct all complaints to the wheel.';
}
function animateSpin(spin: Spin) {
  if (shownSpin === spin.id) return;
  shownSpin = spin.id;
  clearTimeout(spinTimer);
  wheelAnimation?.cancel();
  const choices = spin.choices;
  drawWheel(choices);
  const index = choices.findIndex((choice) => choice.id === spin.winnerId);
  if (index < 0) return;
  const target =
    (((360 - ((index + 0.5) * 360) / choices.length) % 360) + 360) % 360;
  const delta = (target - (((currentRotation % 360) + 360) % 360) + 360) % 360;
  const remaining = Math.max(0, spin.endsAt - Date.now());
  $('#receipt').hidden = true;
  $('#wheel-caption').textContent = remaining
    ? 'The committee has spoken. Let’s see what it said…'
    : 'The decision is on file.';
  if (!remaining || motion.matches) {
    currentRotation = target;
    $('#wheel').style.transform = `rotate(${target}deg)`;
    winnerReceipt(spin);
    return;
  }
  const end = currentRotation + 360 * 5 + delta;
  wheelAnimation = $('#wheel').animate(
    [
      { transform: `rotate(${currentRotation}deg)` },
      { transform: `rotate(${end}deg)` },
    ],
    {
      duration: remaining,
      easing: 'cubic-bezier(.13,.76,.12,1)',
      fill: 'forwards',
    },
  );
  wheelAnimation.onfinish = () => {
    if (room?.lastSpin?.id !== spin.id) return;
    currentRotation = end;
    $('#wheel').style.transform = `rotate(${end}deg)`;
    wheelAnimation?.cancel();
    wheelAnimation = undefined;
    winnerReceipt(spin);
    updateControls();
  };
  spinTimer = setTimeout(() => {
    if (room?.lastSpin?.id === spin.id) {
      winnerReceipt(spin);
      updateControls();
    }
  }, remaining + 100);
}
function updateChoices(next: Room) {
  const list = $('#choices');
  const existing = new Map(
    Array.from(list.children).map((node) => [
      (node as HTMLElement).dataset.choiceId,
      node as HTMLElement,
    ]),
  );
  for (const [index, choice] of next.choices.entries()) {
    let row = existing.get(choice.id);
    existing.delete(choice.id);
    if (!row) {
      row = document.createElement('li');
      row.className = 'choice';
      row.dataset.choiceId = choice.id;
      const swatch = document.createElement('span');
      swatch.className = 'choice-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'choice-name';
      const votes = document.createElement('span');
      votes.className = 'choice-votes';
      const vote = document.createElement('button');
      vote.type = 'button';
      vote.className = 'vote-button';
      vote.dataset.vote = choice.id;
      row.append(swatch, name, votes, vote);
      list.append(row);
    }
    (row.querySelector('.choice-swatch') as HTMLElement).style.background =
      colors[index % colors.length];
    row.querySelector('.choice-name')!.textContent = choice.text;
    row.querySelector('.choice-votes')!.textContent =
      `${choice.votes} vote${choice.votes === 1 ? '' : 's'}`;
    const button = row.querySelector('button')!;
    button.textContent = myVote === choice.id ? 'Voted ✓' : 'Vote ↑';
    button.setAttribute(
      'aria-label',
      `${myVote === choice.id ? 'Remove vote for' : 'Vote for'} ${choice.text}`,
    );
    button.setAttribute('aria-pressed', String(myVote === choice.id));
    button.disabled =
      !credentials.participantToken || next.locked || activeSpin() || busy;
    row.classList.toggle('selected', myVote === choice.id);
    row.classList.toggle(
      'won',
      next.lastSpin?.winnerId === choice.id && !activeSpin(),
    );
  }
  for (const row of existing.values()) row.remove();
}
function updateControls() {
  if (!room) return;
  const host = !!credentials.hostToken,
    joined = !!credentials.participantToken,
    spinning = activeSpin();
  $('#spin').hidden = !host;
  ($('#spin') as HTMLButtonElement).disabled =
    busy || spinning || room.choices.length < 2;
  $('#spin').replaceChildren();
  const label = document.createElement('span');
  label.textContent = busy
    ? 'One moment…'
    : spinning
      ? 'Decision in progress…'
      : 'Make it official';
  $('#spin').append(label);
  if (busy || spinning) {
    const indicator = document.createElement('span');
    indicator.className = 'spinner';
    indicator.setAttribute('aria-hidden', 'true');
    $('#spin').append(indicator);
  } else {
    const arrow = document.createElement('span');
    arrow.textContent = '↻';
    arrow.setAttribute('aria-hidden', 'true');
    $('#spin').append(arrow);
  }
  $('#join-box').hidden = joined;
  ($('#join-submit') as HTMLButtonElement).disabled =
    busy || room.locked || spinning;
  $('#choice-form').hidden = !joined;
  ($('#add-choice') as HTMLButtonElement).disabled =
    busy || room.locked || spinning || room.choices.length >= 32;
  ($('#new-choice') as HTMLInputElement).disabled = room.locked || spinning;
  $('#host-actions').hidden = !host;
  $('#host-note').hidden = !host;
  for (const selector of ['#lock-room', '#reset-round'])
    ($(selector) as HTMLButtonElement).disabled = busy || spinning;
  ($('#delete-room') as HTMLButtonElement).disabled = busy;
  $('#lock-room').textContent = room.locked
    ? 'Unlock suggestions'
    : 'Lock suggestions';
  $('#round-status').textContent = spinning
    ? '· spinning together'
    : room.locked
      ? '· suggestions locked'
      : '· suggestions open';
  $('#role-badge').textContent = host
    ? '✧ HOST'
    : joined
      ? '◉ COMMITTEE MEMBER'
      : '↗ INVITED GUEST';
  updateChoices(room);
}
function accept(next: Room, initial = false) {
  if (room && next.revision < room.revision) return;
  room = next;
  if (next.myVote !== undefined) myVote = next.myVote;
  $('#loading').hidden = true;
  $('#create-view').hidden = true;
  $('#room-view').hidden = false;
  $('#room-code').textContent = next.id.slice(0, 8).toUpperCase();
  $('#room-heading').textContent = next.title;
  document.title = `${next.title} · The Decision Department`;
  $('#room-subtitle').textContent = credentials.hostToken
    ? 'Your very own committee. Invite friends, then make it official.'
    : credentials.participantToken
      ? 'You have a seat at the table. Add a possibility or vote for your favorite.'
      : 'A tiny decision is waiting for your considerable wisdom.';
  const invite = publicInvite(next.id);
  $('#invite-link').setAttribute('value', invite);
  ($('#invite-link') as HTMLInputElement).value = invite;
  $('#copy-invite').dataset.inviteUrl = invite;
  $('#participants').textContent =
    `${next.participants} decision-maker${next.participants === 1 ? '' : 's'} in the room`;
  const total = next.choices.reduce((n, c) => n + c.votes, 0);
  $('#vote-summary').textContent =
    `${next.choices.length}/32 choices · ${total} vote${total === 1 ? '' : 's'}`;
  $('#expiry').textContent =
    `This room expires ${new Date(next.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Invite links are shareable; host keys stay here.`;
  const spinning = activeSpin();
  const poolChanged =
    !!next.lastSpin &&
    !spinning &&
    JSON.stringify(next.lastSpin.choices) !==
      JSON.stringify(next.choices.map(({ id, text }) => ({ id, text })));
  const wheelChoices =
    next.lastSpin && !poolChanged ? next.lastSpin.choices : next.choices;
  if (!next.lastSpin) {
    shownSpin = '';
    announcedSpin = '';
    clearTimeout(spinTimer);
    wheelAnimation?.cancel();
    wheelAnimation = undefined;
    drawWheel(next.choices);
    $('#receipt').hidden = true;
    $('#wheel-caption').textContent = credentials.hostToken
      ? 'Ready when your committee is. The host gets the big button.'
      : 'The host will spin once everyone has had their say.';
  } else if (poolChanged) {
    clearTimeout(spinTimer);
    wheelAnimation?.cancel();
    wheelAnimation = undefined;
    shownSpin = next.lastSpin.id;
    currentRotation = 0;
    $('#wheel').style.transform = 'rotate(0deg)';
    drawWheel(next.choices);
    $('#receipt').hidden = true;
    $('#wheel-caption').textContent =
      'The shortlist changed. The next spin uses every current option.';
  } else {
    if (initial) shownSpin = '';
    drawWheel(wheelChoices);
    animateSpin(next.lastSpin);
  }
  updateControls();
  setConnection('Room is live');
  failures = 0;
}
async function refreshRoom(initial = false) {
  const id = currentId,
    version = generation;
  if (!id || busy) return;
  try {
    const reply = await api(`/api/rooms/${encodeURIComponent(id)}`);
    if (version !== generation || id !== currentId || busy) return;
    accept(reply.room, initial);
  } catch (error) {
    if (version !== generation) return;
    failures++;
    setConnection('Reconnecting…', true);
    if (initial || (error as Error & { status?: number }).status === 404) {
      $('#loading').hidden = true;
      message((error as Error).message);
      if ((error as Error & { status?: number }).status === 404) {
        generation++;
        currentId = '';
        room = undefined;
        clearTimeout(spinTimer);
        wheelAnimation?.cancel();
        $('#room-view').hidden = true;
        $('#create-view').hidden = false;
        $('#receipt').hidden = true;
        $('#spin').hidden = true;
        drawWheel(
          presets.food.choices.map((text, i) => ({ id: String(i), text })),
        );
        $('#wheel-caption').textContent =
          'That room has closed or expired. A new decision awaits.';
      } else if (!room) {
        $('#room-view').hidden = true;
        $('#create-view').hidden = false;
      }
    }
  } finally {
    if (version === generation) schedulePoll();
  }
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (currentId && !document.hidden)
    pollTimer = setTimeout(
      () => void refreshRoom(),
      Math.min(12000, 2000 * 2 ** Math.min(failures, 3)),
    );
}
async function mutate(
  endpoint: string,
  body: unknown,
  role: 'host' | 'participant',
  after?: () => void,
) {
  if (!room || busy) return;
  const id = currentId,
    version = generation;
  busy = true;
  message('');
  updateControls();
  try {
    const reply = await api(
      `/api/rooms/${encodeURIComponent(id)}${endpoint}`,
      'POST',
      body,
      role,
    );
    if (version !== generation) return;
    accept(reply.room);
    after?.();
  } catch (error) {
    if (version === generation) message((error as Error).message);
  } finally {
    if (version === generation) {
      busy = false;
      updateControls();
      schedulePoll();
    }
  }
}
function beginRoom(id: string, reply?: Reply) {
  generation++;
  clearTimeout(pollTimer);
  clearTimeout(spinTimer);
  wheelAnimation?.cancel();
  wheelAnimation = undefined;
  room = undefined;
  currentId = id;
  credentials = readCredentials(id);
  myVote = null;
  wheelKey = '';
  shownSpin = '';
  announcedSpin = '';
  currentRotation = 0;
  $('#create-view').hidden = true;
  $('#room-view').hidden = true;
  $('#loading').hidden = true;
  message('');
  document
    .querySelector('meta[name=robots]')
    ?.setAttribute('content', 'noindex,nofollow');
  if (reply) {
    remember(reply);
    accept(reply.room, true);
    schedulePoll();
  } else {
    $('#loading').hidden = false;
    void refreshRoom(true);
  }
}
$('#initial-choices').textContent = presets.food.choices.join('\n');
drawWheel(presets.food.choices.map((text, i) => ({ id: String(i), text })));
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-preset]',
))
  button.addEventListener('click', () => {
    const preset = presets[button.dataset.preset!];
    ($('#room-title') as HTMLInputElement).value = preset.title;
    ($('#initial-choices') as HTMLTextAreaElement).value =
      preset.choices.join('\n');
    drawWheel(preset.choices.map((text, i) => ({ id: String(i), text })));
  });
$('#create-room').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (creating) return;
  const title = ($('#room-title') as HTMLInputElement).value.trim();
  const choices = ($('#initial-choices') as HTMLTextAreaElement).value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    choices.length < 2 ||
    choices.length > 32 ||
    choices.some((s) => s.length > 80)
  ) {
    message(
      'Add between 2 and 32 choices, with no more than 80 characters each.',
    );
    return;
  }
  creating = true;
  message('');
  ($('#create-submit') as HTMLButtonElement).disabled = true;
  $('#create-submit').textContent = 'Opening your department…';
  try {
    credentials = {};
    const reply = await api('/api/rooms', 'POST', { title, choices });
    history.pushState({}, '', `/room/${encodeURIComponent(reply.room.id)}`);
    beginRoom(reply.room.id, reply);
    toast('Department open. Your friends are invited to disagree.');
  } catch (error) {
    message((error as Error).message);
  } finally {
    creating = false;
    ($('#create-submit') as HTMLButtonElement).disabled = false;
    $('#create-submit').textContent = 'Open a department ↗';
  }
});
$('#join-room').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!room || busy) return;
  busy = true;
  message('');
  updateControls();
  const version = generation;
  try {
    const reply = await api(
      `/api/rooms/${encodeURIComponent(currentId)}/join`,
      'POST',
      { name: ($('#join-name') as HTMLInputElement).value.trim() },
    );
    if (version !== generation) return;
    remember(reply);
    accept(reply.room);
    toast('You’re on the committee. Make your opinion count.');
  } catch (error) {
    if (version === generation) message((error as Error).message);
  } finally {
    if (version === generation) {
      busy = false;
      updateControls();
      schedulePoll();
    }
  }
});
$('#choice-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = ($('#new-choice') as HTMLInputElement).value.trim();
  if (!text) return;
  void mutate('/choices', { text }, 'participant', () => {
    ($('#new-choice') as HTMLInputElement).value = '';
    toast('Suggestion officially submitted.');
  });
});
$('#choices').addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    '[data-vote]',
  );
  if (!button || button.disabled) return;
  const next = myVote === button.dataset.vote ? null : button.dataset.vote!;
  void mutate('/vote', { choiceId: next }, 'participant', () => {
    myVote = next;
    if (room) updateControls();
  });
});
$('#spin').addEventListener('click', () => void mutate('/spin', {}, 'host'));
$('#lock-room').addEventListener(
  'click',
  () => room && void mutate('/lock', { locked: !room.locked }, 'host'),
);
$('#reset-round').addEventListener(
  'click',
  () =>
    void mutate('/reset', {}, 'host', () => {
      myVote = null;
      toast('New round. A fresh chance to overthink it.');
    }),
);
$('#delete-room').addEventListener('click', async () => {
  if (
    !room ||
    busy ||
    !confirm(
      'Close this room for everyone? Its choices and votes will be deleted.',
    )
  )
    return;
  busy = true;
  updateControls();
  try {
    await api(
      `/api/rooms/${encodeURIComponent(currentId)}`,
      'DELETE',
      {},
      'host',
    );
    generation++;
    clearTimeout(pollTimer);
    try {
      localStorage.removeItem(storageKey(currentId));
    } catch {
      /* Optional local preference. */
    }
    location.assign('/');
  } catch (error) {
    message((error as Error).message);
    busy = false;
    updateControls();
  }
});
$('#copy-invite').addEventListener('click', async () => {
  if (!room) return;
  const input = $('#invite-link') as HTMLInputElement;
  try {
    await navigator.clipboard.writeText(publicInvite(room.id));
    toast('Invite copied. Bring your most indecisive friends.');
  } catch {
    input.focus();
    input.select();
    toast('Select and copy the highlighted invite link.');
  }
});
window.addEventListener('popstate', () => location.reload());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(pollTimer);
  } else if (currentId) void refreshRoom();
});
motion.addEventListener('change', () => {
  if (motion.matches && room?.lastSpin) {
    wheelAnimation?.finish();
    winnerReceipt(room.lastSpin);
  }
});
window.addEventListener('online', () => {
  if (currentId) void refreshRoom();
});
window.addEventListener('offline', () => setConnection('You’re offline', true));
const match = location.pathname.match(/^\/room\/([A-Za-z0-9_-]{20,80})\/?$/);
const queryId = new URLSearchParams(location.search).get('room');
if (match) beginRoom(match[1]);
else if (queryId && /^[A-Za-z0-9_-]{20,80}$/.test(queryId)) {
  history.replaceState({}, '', `/room/${queryId}`);
  beginRoom(queryId);
} else if (location.pathname !== '/') {
  message('That room link does not look right. Start a new department below.');
}
