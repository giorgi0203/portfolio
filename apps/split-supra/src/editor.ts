import { mountTable } from './table';
import {
  emptyRow,
  escapeHTML as h,
  loadDraft,
  money,
  remember,
  removeDraft,
  request,
  saveDraft,
  showMoney,
  type RoomResponse,
} from './model';
import {
  decisionOrigin,
  preparePhoto,
  reviewScan,
  signInUrl,
  type Receipt,
  type ScanSession,
} from './receipt';

export function mountEditor(container: HTMLElement) {
  const root = document.createElement('div');
  container.replaceChildren(root);
  const draft = loadDraft();
  root.innerHTML = `<section class="hero"><div class="hero-copy"><h1>Split the <em>supra.</em></h1><p>One receipt for the table. Pick your dishes, share the khinkali, and see what everyone owes in lari.</p><a class="button butter" href="#receipt">Enter a receipt <span aria-hidden="true">↓</span></a></div><img src="/khinkali.webp" alt="A plate of Georgian khinkali dumplings" width="750" height="480"></section>
  <div class="workspace"><div><section class="sheet" id="receipt"><div class="section-title"><h2>The receipt</h2><button class="button line compact" type="button" id="toggle-scan" aria-expanded="false" aria-controls="scan-box">Scan a photo</button></div>
  <div id="scan-box" class="scan-box" hidden><h3>Read a printed receipt</h3><p>Your photo goes to OpenAI when you press Read receipt. Check the GEL prices before inviting anyone.</p><p id="scan-account" role="status"></p>
  <div class="photo-actions"><label class="button line compact">Take a photo<input id="take-photo" class="file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label><label class="button line compact">Choose photo<input id="pick-photo" class="file" type="file" accept="image/jpeg,image/png,image/webp"></label></div>
  <img id="photo-preview" alt="Receipt selected for scanning" hidden><div class="actions"><button type="button" class="button compact" id="read-photo" disabled>Read receipt</button><button type="button" class="text-button" id="cancel-scan" hidden>Cancel</button><button type="button" class="text-button" id="clear-photo" hidden>Remove photo</button></div><p id="scan-status" role="status"></p></div>
  <form id="receipt-form"><div class="field-pair"><label>Table name<input name="title" required maxlength="80" value="${h(draft.title)}" autocomplete="off"></label><label>Your name<input name="name" required maxlength="32" value="${h(draft.name)}" autocomplete="nickname" placeholder="Giorgi"></label></div>
  <div class="receipt-head" aria-hidden="true"><span>Dish or drink</span><span>Qty.</span><span>Unit price</span><span></span></div><div id="receipt-rows"></div>
  <button class="text-button add-item" id="add-item" type="button">＋ Add another item</button>
  <div class="fee-field"><label>Service charge or tip <small>optional</small><span class="money-input"><span>₾</span><input type="text" name="fee" placeholder="0.00" inputmode="decimal" maxlength="12" value="${h(draft.fee)}"></span></label><p>Enter the total fee in lari. It’s divided in proportion to each person’s food and drinks.</p></div>
  <div id="scan-review" class="scan-review" hidden></div><p id="edit-status" class="error" role="alert"></p></form></section></div>
  <aside class="ticket" aria-label="Receipt summary"><div class="ticket-title"><span aria-hidden="true">₾</span><h2>Table total</h2></div><dl><div><dt>Food &amp; drinks</dt><dd id="subtotal"></dd></div><div><dt>Service &amp; tip</dt><dd id="fee-summary"></dd></div></dl><div class="ticket-total"><span>Total</span><strong id="bill-total"></strong></div><button class="button full" id="open-table" form="receipt-form" type="submit">Open table <span aria-hidden="true">→</span></button><p>Share the QR code or invite link so everyone can claim their dishes. Tables expire after 7 days.</p></aside></div>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string): T =>
    root.querySelector<T>(selector)!;
  const form = el<HTMLFormElement>('#receipt-form'),
    rows = el('#receipt-rows'),
    add = el<HTMLButtonElement>('#add-item');
  const read = el<HTMLButtonElement>('#read-photo'),
    photoPreview = el<HTMLImageElement>('#photo-preview');
  let photo = '',
    session: ScanSession | null = null,
    photoRevision = 0,
    draftRevision = 0;
  let reading: AbortController | null = null,
    creating = false;
  const report = (text: string) => {
    el('#edit-status').textContent = text;
  };
  function inputRows() {
    rows.innerHTML = draft.rows
      .map(
        (row, i) => `<div class="receipt-row" data-row="${i}">
      <input data-field="name" aria-label="Dish ${i + 1} name" value="${h(row.name)}" required maxlength="100" placeholder="e.g. Khinkali">
      <input data-field="quantity" aria-label="Dish ${i + 1} quantity" type="number" min="1" max="99" step="1" inputmode="numeric" required value="${h(row.quantity)}">
      <span class="money-input"><span>₾</span><input data-field="price" aria-label="Dish ${i + 1} unit price" type="text" inputmode="decimal" maxlength="12" placeholder="0.00" required value="${h(row.price)}"></span>
      <button class="remove" type="button" data-remove="${i}" aria-label="Remove dish ${i + 1}" ${draft.rows.length === 1 ? 'disabled' : ''}>×</button>
      ${row.printed ? `<small class="printed">Printed line total: ${h(row.printed)}</small>` : ''}</div>`,
      )
      .join('');
    add.disabled = draft.rows.length >= 60;
  }
  function totals() {
    const subtotal = draft.rows.reduce(
        (sum, row) =>
          sum + (Number(row.quantity) || 0) * (money(row.price) || 0),
        0,
      ),
      fee = money(draft.fee) || 0;
    el('#subtotal').textContent = showMoney(subtotal);
    el('#fee-summary').textContent = showMoney(fee);
    el('#bill-total').textContent = showMoney(subtotal + fee);
    if (draft.scan) {
      const grand = money(draft.scan.grand),
        diff = grand === null ? null : grand - subtotal - fee;
      const mismatches = draft.rows.filter(
        (row) =>
          row.printed &&
          money(row.printed) !== (money(row.price) || 0) * Number(row.quantity),
      ).length;
      el('#scan-review').hidden = false;
      el('#scan-review').innerHTML =
        `<h3>Review the scan</h3><p>Printed currency: <b>${h(draft.scan.currency)}</b> · Printed total: <b>${h(draft.scan.grand || 'unreadable')}</b></p>
        ${diff !== null && diff !== 0 ? `<p class="notice">Your total differs from the printed amount by ${showMoney(Math.abs(diff))}. Check quantities, prices and fees.</p>` : ''}
        ${mismatches ? `<p class="notice">Check ${mismatches} row(s) whose quantity × price differs from the printed line total.</p>` : ''}
        ${draft.scan.currency !== 'GEL' ? '<p class="notice">This table uses GEL. Enter the amounts in lari before continuing.</p>' : ''}
        ${draft.scan.warnings.map((w) => `<p>${h(w)}</p>`).join('')}
        <label class="check"><input type="checkbox" id="confirm-scan" required ${draft.confirmed ? 'checked' : ''}> I checked the quantities and GEL amounts against the receipt.</label>`;
    }
  }
  function changed() {
    draftRevision++;
    draft.confirmed = false;
    report('');
    totals();
    saveDraft(draft);
  }
  inputRows();
  totals();
  form.addEventListener('input', (e) => {
    const field = e.target;
    if (!(field instanceof HTMLInputElement)) return;
    if (field.id === 'confirm-scan') {
      draft.confirmed = field.checked;
      saveDraft(draft);
      return;
    }
    const row = field.closest<HTMLElement>('[data-row]');
    if (
      row &&
      ['name', 'quantity', 'price'].includes(field.dataset.field || '')
    ) {
      draft.rows[Number(row.dataset.row)][
        field.dataset.field as 'name' | 'quantity' | 'price'
      ] = field.value;
    } else if (field.name === 'title' || field.name === 'name') {
      draft[field.name] = field.value;
      saveDraft(draft);
      return;
    } else if (field.name === 'fee') draft.fee = field.value;
    changed();
  });
  add.onclick = () => {
    if (draft.rows.length >= 60) return;
    draft.rows.push(emptyRow());
    inputRows();
    changed();
    el<HTMLInputElement>(`[data-row="${draft.rows.length - 1}"] input`).focus();
  };
  rows.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>(
      '[data-remove]',
    );
    if (!button || draft.rows.length <= 1) return;
    draft.rows.splice(Number(button.dataset.remove), 1);
    inputRows();
    changed();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (creating) return;
    const items = draft.rows.map((row) => ({
        name: row.name.trim(),
        unitMinor: money(row.price),
        quantity: Number(row.quantity),
      })),
      feeMinor = draft.fee.trim() ? money(draft.fee) : 0;
    if (!draft.title.trim() || !draft.name.trim())
      return report('Give the table and your seat a name.');
    if (
      items.some(
        (row) =>
          !row.name ||
          row.unitMinor === null ||
          row.unitMinor < 1 ||
          row.unitMinor > 1_000_000 ||
          !Number.isInteger(row.quantity) ||
          row.quantity < 1 ||
          row.quantity > 99,
      )
    )
      return report(
        'Each dish needs a name, a quantity from 1 to 99, and a positive unit price up to ₾10,000 with up to two decimals.',
      );
    if (feeMinor === null || feeMinor > 1_000_000)
      return report('Enter a service charge between ₾0 and ₾10,000.');
    if (
      items.reduce(
        (sum, row) => sum + row.quantity * (row.unitMinor || 0),
        feeMinor,
      ) > 10_000_000
    )
      return report('The total must be ₾100,000 or less.');
    if (draft.scan && !draft.confirmed)
      return report('Review the imported amounts and confirm them first.');
    if (reading)
      return report('Let the scan finish or cancel it before opening a table.');
    creating = true;
    form.inert = true;
    el('#scan-box').inert = true;
    const button = el<HTMLButtonElement>('#open-table');
    button.disabled = true;
    button.textContent = 'Opening table…';
    report('');
    try {
      const result = await request<RoomResponse>('/api/supra/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          name: draft.name.trim(),
          items,
          feeMinor,
        }),
      });
      if (!result.participantId || !result.participantToken)
        throw new Error('Your seat could not be saved.');
      remember(result.room.id, {
        participantId: result.participantId,
        participantToken: result.participantToken,
      });
      removeDraft();
      history.pushState(
        null,
        '',
        '/table/' + encodeURIComponent(result.room.id),
      );
      mountTable(container, result.room.id, result.room);
      window.scrollTo(0, 0);
    } catch (error) {
      report(
        error instanceof Error ? error.message : 'Could not open the table.',
      );
    } finally {
      creating = false;
      form.inert = false;
      el('#scan-box').inert = false;
      button.disabled = false;
      button.textContent = 'Open table →';
    }
  });

  function photoControls() {
    read.disabled =
      !photo ||
      !session?.user?.emailVerified ||
      !session.configured ||
      session.remaining === 0 ||
      !!reading;
    read.textContent = reading ? 'Reading receipt…' : 'Read receipt';
    el('#cancel-scan').hidden = !reading;
    el('#clear-photo').hidden = !photo;
  }
  function account() {
    const box = el('#scan-account');
    if (!session) {
      box.textContent =
        'Receipt scanning is unavailable. You can still enter every item below.';
      return;
    }
    if (!session.user) {
      box.innerHTML = `<a href="${h(signInUrl)}">Sign in to read a receipt ↗</a> · Your draft stays in this tab.`;
      return;
    }
    if (!session.user.emailVerified) {
      box.textContent = 'Verify your Giorgi account email to read a receipt.';
      return;
    }
    box.textContent = session.configured
      ? `${session.remaining ?? 0} scans available · ${session.user.name || 'Signed in'}`
      : 'Receipt scanning is unavailable. Manual entry is ready.';
  }
  async function loadSession() {
    try {
      session = await request<ScanSession>(
        decisionOrigin + '/api/receipt/session',
        { credentials: 'include' },
      );
    } catch {
      session = null;
    }
    account();
    photoControls();
  }
  const panel = el('#scan-box'),
    toggle = el<HTMLButtonElement>('#toggle-scan');
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {
      el('#scan-account').textContent = 'Checking scan access…';
      void loadSession();
    }
  };
  function clearPhoto() {
    photoRevision++;
    reading?.abort();
    photo = '';
    photoPreview.removeAttribute('src');
    photoPreview.hidden = true;
    photoControls();
  }
  el('#clear-photo').onclick = () => {
    clearPhoto();
    el('#scan-status').textContent = '';
  };
  el('#cancel-scan').onclick = () => {
    reading?.abort();
  };
  for (const input of root.querySelectorAll<HTMLInputElement>('.file'))
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      clearPhoto();
      const revision = photoRevision;
      el('#scan-status').textContent = 'Preparing photo…';
      try {
        const data = await preparePhoto(file);
        if (revision !== photoRevision) return;
        photo = data;
        photoPreview.src = data;
        photoPreview.hidden = false;
        el('#scan-status').textContent = 'Ready to read.';
      } catch (error) {
        if (revision === photoRevision)
          el('#scan-status').textContent =
            error instanceof Error
              ? error.message
              : 'Could not read the photo.';
      }
      photoControls();
    };
  read.onclick = async () => {
    if (read.disabled || reading) return;
    if (
      draft.rows.some((r) => r.name.trim() || r.price.trim()) &&
      !window.confirm(
        'Replace the receipt items and fee with the scanned receipt?',
      )
    )
      return;
    const attempt = new AbortController();
    reading = attempt;
    const revision = photoRevision,
      edition = draftRevision;
    const timer = setTimeout(() => attempt.abort(), 38000);
    photoControls();
    el('#scan-status').textContent = 'Reading the printed items and prices…';
    try {
      const response = await request<Receipt & { remaining: number }>(
        decisionOrigin + '/api/receipt/analyze',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: photo }),
          signal: attempt.signal,
        },
      );
      if (revision !== photoRevision) return;
      if (edition !== draftRevision) {
        el('#scan-status').textContent =
          'The receipt was edited during the scan. Your edits were kept.';
        return;
      }
      Object.assign(draft, reviewScan(response));
      if (session) session.remaining = response.remaining;
      inputRows();
      changed();
      account();
      el('#scan-status').textContent =
        'Receipt read. Review each price and quantity below.';
    } catch (error) {
      if (revision === photoRevision)
        el('#scan-status').textContent = attempt.signal.aborted
          ? 'Scan stopped. Your receipt entries are still here.'
          : error instanceof Error
            ? error.message
            : 'Could not read the receipt.';
    } finally {
      clearTimeout(timer);
      reading = null;
      photoControls();
      void loadSession();
    }
  };
}
