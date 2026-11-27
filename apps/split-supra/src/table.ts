import qrcode from 'qrcode-generator';
import {
  escapeHTML as h,
  remember,
  request,
  seat,
  showMoney,
  type RoomResponse,
  type Table,
} from './model';

export function mountTable(root: HTMLElement, id: string, initial?: Table) {
  document.title = 'Your table · Split the Supra';
  if (!document.querySelector('meta[name="robots"]')) {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.append(meta);
  }
  root.innerHTML = `<section class="table-heading"><div><p class="table-date">Shared restaurant receipt</p><h1 id="table-name">Opening table…</h1></div><a class="button line compact" href="#invite">Invite diners ↓</a></section>
  <p id="room-status" role="status"></p>
  <div id="loaded-table" hidden><div class="at-table"><section class="dish-area">
  <div id="join-panel" class="join-panel"><h2>Take a seat</h2><p>Enter your name to claim the dishes you shared.</p><form id="join-form"><label class="visually-hidden" for="join-name">Your name</label><input id="join-name" maxlength="32" autocomplete="nickname" placeholder="Your name" required><button type="submit" class="button">Join table</button></form></div>
  <div id="your-share" class="personal" hidden></div>
  <section class="sheet"><div class="section-title"><h2>What did you have?</h2><span id="dish-count" class="muted"></span></div><p class="explain">Claim one share for an equal split. If you ate twice as much of a dish, take two shares.</p><div id="dish-list"></div></section></section>
  <aside class="table-side"><section class="ticket"><div class="ticket-title"><span aria-hidden="true">₾</span><h2>Table balance</h2></div><dl id="balances"></dl><div class="ticket-total"><span>Receipt total</span><strong id="room-total"></strong></div><p id="room-fee"></p></section>
  <section id="invite" class="invite sheet"><h2>Invite the table</h2><p>Scan to join on another phone.</p><img id="invite-qr" width="160" height="160" alt="QR code to join this table"><div class="invite-line"><input id="invite-link" aria-label="Table invite link" readonly><button id="copy-invite" class="button line compact" type="button">Copy link</button></div><p class="small">Anyone with the link can see the items, names and shares.</p></section>
  <div id="room-controls" class="room-controls"><p id="expiry"></p><button id="close-table" type="button" class="text-button" hidden>Close table</button></div></aside></div></div>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string): T =>
    root.querySelector<T>(selector)!;
  const report = (text: string) => {
    el('#room-status').textContent = text;
  };
  const join = el<HTMLFormElement>('#join-form'),
    dishes = el('#dish-list');
  let table: Table | undefined,
    credentials = seat(id),
    busy = false,
    stopped = false,
    failures = 0;
  let timer: ReturnType<typeof setTimeout>,
    pollAbort: AbortController | null = null;
  const endpoint = '/api/supra/rooms/' + encodeURIComponent(id),
    invite = location.origin + '/table/' + id;
  const code = qrcode(0, 'M');
  code.addData(invite);
  code.make();
  el<HTMLImageElement>('#invite-qr').src = code.createDataURL(5, 20);
  el<HTMLInputElement>('#invite-link').value = invite;
  el('#copy-invite').onclick = async () => {
    const link = el<HTMLInputElement>('#invite-link');
    try {
      await navigator.clipboard.writeText(invite);
      report('Invite link copied.');
    } catch {
      link.select();
      report('Select and copy the invite link.');
    }
  };
  function draw(room: Table) {
    if (stopped || room.id !== id || (table && table.revision > room.revision))
      return;
    table = room;
    el('#loaded-table').hidden = false;
    el('#table-name').textContent = room.title;
    document.title = room.title + ' · Split the Supra';
    const me = room.participants.find(
      (p) => p.id === credentials?.participantId,
    );
    el('#join-panel').hidden = !!me;
    el('#your-share').hidden = !me;
    const amount = room.totals.people.find((p) => p.id === me?.id);
    if (me && amount)
      el('#your-share').innerHTML =
        `<div><span>${h(me.name)}’s share</span><strong>${showMoney(amount.totalMinor)}</strong></div><span>${showMoney(amount.itemsMinor)} in dishes<br>+ ${showMoney(amount.feeMinor)} service &amp; tip</span>`;
    el('#dish-count').textContent =
      room.items.length +
      ' receipt ' +
      (room.items.length === 1 ? 'line' : 'lines');
    const active = dishes.contains(document.activeElement)
      ? (document.activeElement as HTMLButtonElement)
      : null;
    const previous = active?.dataset.claim,
      delta = active?.dataset.delta;
    const names = new Map(room.participants.map((p) => [p.id, p.name]));
    dishes.innerHTML = room.items
      .map((item) => {
        const claims = room.claims.filter((claim) => claim.itemId === item.id);
        const mine =
          claims.find((claim) => claim.participantId === me?.id)?.weight || 0;
        const summary = claims
          .map(
            (c) =>
              `${h(names.get(c.participantId) || 'Diner')}${c.weight > 1 ? ' ×' + c.weight : ''}`,
          )
          .join(' · ');
        return `<article class="dish ${mine ? 'chosen' : ''}"><div class="dish-detail"><h3>${h(item.name)}</h3><span>${item.quantity} × ${showMoney(item.unitMinor)}</span><p>${summary || 'Unclaimed'}</p></div><div class="dish-choice"><strong>${showMoney(item.quantity * item.unitMinor)}</strong>
      ${me ? (mine ? `<div class="stepper"><button type="button" data-claim="${h(item.id)}" data-delta="-1" aria-label="Remove one share of ${h(item.name)}" ${busy ? 'disabled' : ''}>−</button><span>${mine} ${mine === 1 ? 'share' : 'shares'}</span><button type="button" data-claim="${h(item.id)}" data-delta="1" aria-label="Add one share of ${h(item.name)}" ${mine >= 100 || busy ? 'disabled' : ''}>+</button></div>` : `<button class="claim" type="button" data-claim="${h(item.id)}" data-delta="1" aria-label="Claim ${h(item.name)}" ${busy ? 'disabled' : ''}>＋ I had this</button>`) : ''}</div></article>`;
      })
      .join('');
    if (previous)
      Array.from(dishes.querySelectorAll<HTMLButtonElement>('[data-claim]'))
        .find((b) => b.dataset.claim === previous && b.dataset.delta === delta)
        ?.focus({ preventScroll: true });
    el('#balances').innerHTML =
      room.totals.people
        .map(
          (amount) =>
            `<div><dt>${h(names.get(amount.id))}${amount.id === me?.id ? ' <small>(you)</small>' : ''}</dt><dd>${showMoney(amount.totalMinor)}</dd></div>`,
        )
        .join('') +
      `<div class="unassigned"><dt>Unclaimed</dt><dd>${showMoney(room.totals.unassignedMinor)}</dd></div>`;
    el('#room-total').textContent = showMoney(room.totals.totalMinor);
    el('#room-fee').textContent = room.feeMinor
      ? 'Includes ' +
        showMoney(room.feeMinor) +
        ' service & tip, split in proportion to food and drinks.'
      : 'No service charge or tip added.';
    el('#expiry').textContent =
      'Table expires ' +
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(new Date(room.expires)) +
      '.';
    el('#close-table').hidden = !me || room.hostId !== me.id;
  }
  async function change(path: string, method: string, body: unknown) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (credentials)
      headers['X-Participant-Token'] = credentials.participantToken;
    return request<RoomResponse>(endpoint + path, {
      method,
      headers,
      body: JSON.stringify(body),
    });
  }
  join.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const name = el<HTMLInputElement>('#join-name').value.trim();
    if (!name) {
      report('Enter your name to join.');
      return;
    }
    busy = true;
    const button = join.querySelector('button')!;
    button.disabled = true;
    button.textContent = 'Joining…';
    try {
      const result = await change('/join', 'POST', { name });
      if (!result.participantId || !result.participantToken)
        throw new Error('Could not save your seat.');
      credentials = {
        participantId: result.participantId,
        participantToken: result.participantToken,
      };
      remember(id, credentials);
      busy = false;
      draw(result.room);
      report('You joined the table.');
    } catch (error) {
      report(error instanceof Error ? error.message : 'Could not join.');
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = 'Join table';
    }
  };
  dishes.onclick = async (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>(
        '[data-claim]',
      ),
      itemId = button?.dataset.claim;
    if (!itemId || !credentials || !table || busy) return;
    const current =
      table.claims.find(
        (c) =>
          c.itemId === itemId && c.participantId === credentials?.participantId,
      )?.weight || 0;
    const weight = current + Number(button.dataset.delta);
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) return;
    busy = true;
    for (const b of dishes.querySelectorAll('button')) b.disabled = true;
    report('Saving your shares…');
    try {
      const response = await change('/claim', 'PUT', { itemId, weight });
      busy = false;
      draw(response.room);
      report('Shares updated.');
    } catch (error) {
      report(
        error instanceof Error
          ? error.message
          : 'Your share could not be saved.',
      );
    } finally {
      busy = false;
      if (table) draw(table);
    }
  };
  function stop() {
    stopped = true;
    pollAbort?.abort();
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', visibility);
  }
  function ended(message: string) {
    stop();
    root.innerHTML = `<section class="plain-state"><h1>This table is closed.</h1><p>${h(message)}</p><a class="button" href="/">Start another table →</a></section>`;
  }
  el('#close-table').onclick = async () => {
    if (
      busy ||
      !window.confirm(
        'Close this table for all diners? This removes the receipt and shares.',
      )
    )
      return;
    busy = true;
    report('Closing table…');
    try {
      await change('', 'DELETE', {});
      ended('Its receipt and shares have been removed.');
    } catch (error) {
      report(
        error instanceof Error ? error.message : 'Could not close the table.',
      );
    } finally {
      busy = false;
    }
  };
  function schedule() {
    clearTimeout(timer);
    if (!document.hidden && !stopped)
      timer = setTimeout(poll, Math.min(18000, 2800 * (1 + failures)));
  }
  async function poll() {
    if (stopped || pollAbort) return;
    pollAbort = new AbortController();
    const timeout = setTimeout(() => pollAbort?.abort(), 10000);
    try {
      const response = await fetch(endpoint, {
        cache: 'no-store',
        signal: pollAbort.signal,
      });
      if (response.status === 404 || response.status === 410) {
        ended('The invite has expired or the host has closed it.');
        return;
      }
      if (!response.ok) throw new Error('Could not refresh this table.');
      const { room } = (await response.json()) as RoomResponse;
      if (!table || room.revision !== table.revision) draw(room);
      if (failures) report('Table is up to date.');
      failures = 0;
    } catch {
      if (!stopped) {
        failures++;
        report('Connection interrupted. Reconnecting to the table…');
      }
    } finally {
      clearTimeout(timeout);
      pollAbort = null;
      schedule();
    }
  }
  function visibility() {
    if (document.hidden) clearTimeout(timer);
    else {
      clearTimeout(timer);
      void poll();
    }
  }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', () => {
    clearTimeout(timer);
    pollAbort?.abort();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void poll();
  });
  if (initial) {
    draw(initial);
    schedule();
  } else void poll();
}
