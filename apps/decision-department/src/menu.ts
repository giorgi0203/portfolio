import './menu.css';
import {
  generateCombinations,
  parseMoney,
  type MenuCombination,
} from '../shared/menu-budget.mjs';

type Category = 'main' | 'side' | 'drink' | 'dessert' | 'other';
type MenuItem = {
  id: string;
  name: string;
  price: string;
  category: Category;
  selected: boolean;
};
type Session = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  } | null;
  configured: boolean;
  limits: { daily: number; globalDaily: number };
  remaining?: number;
};
type Scan = {
  currency: string | null;
  items: { name: string; price: string | null; category: Category }[];
  warnings: string[];
  remaining?: number;
};
export type MenuOptions = {
  addToRoom: (text: string) => Promise<void>;
  canAddToRoom: () => boolean;
};
const CATEGORIES: Category[] = ['main', 'side', 'drink', 'dessert', 'other'];
const CURRENCIES = ['GEL', 'USD', 'EUR', 'GBP', 'TRY', 'AMD', 'RUB'];
const DRAFT = 'decision-department:private-menu:v1';
const MAX_PHOTO_BYTES = 1_400_000;
const MAX_ITEMS = 60;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}
function price(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** A private menu stays separate from the public room until explicitly shared. */
export function mountMenu(container: HTMLElement, options: MenuOptions) {
  container.id = 'menu';
  container.classList.add('menu-planner');
  container.setAttribute('aria-labelledby', 'menu-heading');
  // This shell is static. Photo-derived text is only assigned via DOM text/value APIs.
  container.innerHTML = `
    <div class="menu-heading-row"><div><p class="eyebrow">NEW DESK / THE BUDGET & BITES DIVISION</p><h2 id="menu-heading">Big menu. <em>Small decision.</em></h2><p class="menu-intro">Photograph the menu, set the table budget, and let dinner happen. A little less maths. A little more “that one.”</p></div><span class="menu-stamp" aria-hidden="true">APPROVED<br><b>🍽</b>FOR DINNER</span></div>
    <div class="menu-workspace">
      <section id="menu-photo-panel" class="menu-photo-panel" aria-labelledby="menu-photo-heading">
        <p class="eyebrow">01 / BRING THE MENU</p><h3 id="menu-photo-heading">The camera eats first.</h3>
        <div class="menu-photo-stage"><div id="menu-photo-empty" class="menu-paper" aria-hidden="true"><span>THE LITTLE MENU</span><b>Something good.</b><i></i><i></i><i></i><small>one photo → fewer arguments</small></div><img id="menu-photo-preview" alt="Your selected menu photo" hidden><button id="menu-clear-photo" class="menu-photo-remove" type="button" aria-label="Remove menu photo" hidden>×</button></div>
        <div class="menu-photo-actions"><button id="menu-take-photo" class="button small" type="button">Take a photo ↗</button><button id="menu-choose-photo" class="button light small" type="button">Upload photo</button></div>
        <input id="menu-camera" class="menu-file-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a menu photo">
        <input id="menu-upload" class="menu-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload a menu photo">
        <p class="menu-photo-help">One clear menu page at a time. JPEG, PNG or WebP. Your photo is resized and sent to OpenAI only when you press Read menu; the app does not store it.</p>
        <div class="menu-account"><p id="menu-account-status">Checking shared sign-in…</p><div class="menu-account-actions"><a id="menu-signin" href="/api/auth/sso/start">Sign in to scan ↗</a><a id="menu-verify-email" href="https://auth.giorgi.app/account" target="_blank" rel="noopener noreferrer" hidden>Verify your email ↗</a><button id="menu-refresh-account" type="button">Refresh sign-in</button><button id="menu-logout" type="button" hidden>Sign out here</button></div></div>
        <div class="menu-scan-actions"><button id="menu-read-photo" class="button full" type="button" disabled><span id="menu-scan-spinner" class="spinner" aria-hidden="true" hidden></span><span id="menu-read-label">Read menu with AI</span></button><button id="menu-cancel-scan" class="button light small" type="button" hidden>Cancel scan</button></div>
        <p id="menu-status" class="menu-status" data-state="idle" role="status" aria-live="polite">Photo scanning needs a verified account. Typing a menu and shuffling are free to use.</p>
      </section>
      <section class="menu-list-panel" aria-labelledby="menu-list-heading">
        <div class="menu-list-top"><div><p class="eyebrow">02 / CHECK THE SMALL PRINT</p><h3 id="menu-list-heading">Your menu, your call.</h3></div><span id="menu-item-count" class="menu-count">0 dishes</span></div>
        <p class="menu-helper">Check names, portions and prices before choosing. We start with mains; tick any other dishes you want in the mix. Unclear prices stay out until corrected.</p>
        <p id="menu-source-note" class="menu-source-note">This menu is private to this tab. Only combinations you explicitly add are shared.</p>
        <ul id="menu-warnings" class="menu-warnings" hidden></ul>
        <div class="menu-table-wrap"><table class="menu-table"><caption class="menu-sr-only">Editable menu dishes and prices</caption><thead><tr><th scope="col">Use</th><th scope="col">Dish / portion</th><th scope="col">Price</th><th scope="col">Type</th><th scope="col"><span class="menu-sr-only">Remove</span></th></tr></thead><tbody id="menu-items"></tbody></table><p id="menu-empty" class="menu-empty">Nothing on the menu yet.<br><span>Read a photo or type your first dish below.</span></p></div>
        <form id="menu-add-item" class="menu-add-form"><label>Dish or portion<input id="menu-add-name" maxlength="120" required placeholder="Khachapuri · one portion" autocomplete="off"></label><label>Price<input id="menu-add-price" inputmode="decimal" maxlength="10" required placeholder="18.50" autocomplete="off"></label><label>Type<select id="menu-add-category"><option value="main">Main</option><option value="side">Side</option><option value="drink">Drink</option><option value="dessert">Dessert</option><option value="other">Other</option></select></label><button id="menu-add-submit" class="button light small" type="submit">Add dish +</button></form>
        <div class="menu-list-actions"><button id="menu-sample" type="button">Try a sample menu ↗</button><button id="menu-clear" type="button" disabled>Clear menu</button></div>
      </section>
    </div>
    <section class="menu-budget-panel" aria-labelledby="menu-budget-heading"><div class="menu-budget-heading"><p class="eyebrow">03 / KEEP DINNER WITHIN REASON</p><h3 id="menu-budget-heading">The whole table. One budget.</h3><p>One selected dish per person; repeated dishes become quantities. Totals exclude fees, service charges and tips.</p></div><form id="menu-budget-form" class="menu-budget-form" novalidate><div class="menu-budget-fields"><label>Total group budget<input id="menu-budget" inputmode="decimal" maxlength="10" placeholder="60.00" autocomplete="off" aria-describedby="menu-budget-note"></label><label>Currency<select id="menu-currency"><option value="GEL">GEL · Georgian lari</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · Pound</option><option value="TRY">TRY · Turkish lira</option><option value="AMD">AMD · Armenian dram</option><option value="RUB">RUB · Ruble</option></select></label><label>People at the table<select id="menu-people">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1} ${i ? 'people' : 'person'}</option>`).join('')}</select></label></div><p id="menu-budget-note" class="menu-budget-note">Changing currency does not convert the prices. Use a single currency for this menu.</p><label class="menu-confirm"><input id="menu-confirm-currency" type="checkbox" checked><span>I checked the selected prices and their currency.</span></label><div class="menu-generate-row"><button id="menu-generate" class="button coral" type="submit">Find my dinner <span aria-hidden="true">↗</span></button><button id="menu-shuffle" class="button light" type="button" hidden>Shuffle again ↻</button><span>No extra AI calls. Just good combinations.</span></div><p id="menu-budget-message" class="menu-budget-message" role="status" aria-live="polite"></p></form></section>
    <section id="menu-results-section" class="menu-results-section" aria-labelledby="menu-results-heading" hidden><div class="menu-results-top"><div><p class="eyebrow">DINNER PROPOSALS / READY FOR THE COMMITTEE</p><h3 id="menu-results-heading">Three ways to say yes.</h3></div><p id="menu-room-help">Create or join a decision room below to share a combination.</p></div><div id="menu-combinations" class="menu-combinations"></div></section>
  `;

  const find = <T extends HTMLElement = HTMLElement>(id: string) =>
    container.querySelector<T>('#' + id)!;
  const budget = find<HTMLInputElement>('menu-budget');
  const currency = find<HTMLSelectElement>('menu-currency');
  const people = find<HTMLSelectElement>('menu-people');
  const confirmed = find<HTMLInputElement>('menu-confirm-currency');
  const camera = find<HTMLInputElement>('menu-camera');
  const upload = find<HTMLInputElement>('menu-upload');
  let items: MenuItem[] = [];
  let session: Session | undefined;
  let photo: string | undefined;
  let photoURL: string | undefined;
  let photoGeneration = 0;
  let scanGeneration = 0;
  let accountGeneration = 0;
  let scanController: AbortController | undefined;
  let accountController: AbortController | undefined;
  let preparing = false;
  let scanning = false;
  let destroyed = false;
  let combinations: MenuCombination[] = [];

  function status(
    text: string,
    state: 'idle' | 'loading' | 'success' | 'error' = 'idle',
  ) {
    const output = find('menu-status');
    output.textContent = text;
    output.dataset.state = state;
  }
  function budgetMessage(text: string, error = false) {
    find('menu-budget-message').textContent = text;
    find('menu-budget-message').classList.toggle('is-error', error);
  }
  function save() {
    try {
      sessionStorage.setItem(
        DRAFT,
        JSON.stringify({
          items,
          budget: budget.value,
          currency: currency.value,
          people: people.value,
          confirmed: confirmed.checked,
        }),
      );
    } catch {
      find('menu-source-note').textContent =
        'Your menu stays in this page. This browser could not save a draft for after sign-in.';
    }
  }
  function invalidate() {
    combinations = [];
    find('menu-results-section').hidden = true;
    find('menu-combinations').replaceChildren();
    find('menu-shuffle').hidden = true;
    budgetMessage('');
  }
  function cancelScan(text = 'Scan cancelled. Your menu is unchanged.') {
    scanGeneration++;
    scanController?.abort();
    scanController = undefined;
    if (scanning) {
      scanning = false;
      status(text);
      if (!destroyed) void refreshAccount();
    }
    syncScanControls();
  }
  function changed() {
    if (scanning)
      cancelScan(
        'Scan cancelled because you edited the menu. Your changes are kept.',
      );
    invalidate();
    save();
  }
  function syncScanControls() {
    const canScan =
      !!photo &&
      !preparing &&
      !!session?.configured &&
      !!session.user?.emailVerified &&
      session.remaining !== 0;
    find<HTMLButtonElement>('menu-read-photo').disabled = scanning || !canScan;
    find('menu-read-label').textContent = scanning
      ? 'Reading the menu…'
      : items.length
        ? 'Read photo & replace list'
        : 'Read menu with AI';
    find('menu-scan-spinner').hidden = !scanning;
    find('menu-cancel-scan').hidden = !scanning;
    find<HTMLButtonElement>('menu-take-photo').disabled = preparing;
    find<HTMLButtonElement>('menu-choose-photo').disabled = preparing;
    find('menu-photo-panel')?.setAttribute(
      'aria-busy',
      String(scanning || preparing),
    );
  }
  function accountUI() {
    const user = session?.user;
    find('menu-signin').hidden = !!user;
    find<HTMLAnchorElement>('menu-signin').href =
      '/api/auth/sso/start?returnTo=' + encodeURIComponent(location.pathname);
    find('menu-logout').hidden = !user;
    find('menu-verify-email').hidden = !user || user.emailVerified;
    if (!session) {
      find('menu-account-status').textContent =
        'Sign-in status is unavailable. You can still type a menu and shuffle.';
    } else if (!user) {
      find('menu-account-status').textContent =
        'Use your shared Giorgi account for photo scans. No sign-in needed for manual menus.';
    } else if (!user.emailVerified) {
      find('menu-account-status').textContent =
        `Hello, ${user.name}. Verify your email before using photo scans.`;
    } else {
      const remaining = session.remaining;
      find('menu-account-status').textContent =
        `Hello, ${user.name}. ${remaining === undefined ? `Up to ${session.limits.daily} scans a day.` : `${remaining} of ${session.limits.daily} daily scans left.`}`;
    }
    if (session && !session.configured) {
      find('menu-account-status').append(
        element(
          'span',
          'menu-config-notice',
          ' Photo reading is temporarily unavailable; manual menus still work.',
        ),
      );
    }
    syncScanControls();
  }
  async function readResponse(response: Response) {
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        'The department returned an unreadable response. Please try again.',
      );
    }
    if (!response.ok)
      throw new Error(
        typeof result.error === 'string'
          ? result.error
          : 'The request could not be completed. Please try again.',
      );
    return result;
  }
  async function refreshAccount() {
    const own = ++accountGeneration;
    accountController?.abort();
    accountController = new AbortController();
    find<HTMLButtonElement>('menu-refresh-account').disabled = true;
    try {
      const response = await fetch('/api/menu/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.any([
          accountController.signal,
          AbortSignal.timeout(8000),
        ]),
      });
      const data = await readResponse(response);
      if (destroyed || own !== accountGeneration) return;
      if (
        !data ||
        typeof data.configured !== 'boolean' ||
        !data.limits ||
        typeof data.limits.daily !== 'number' ||
        (data.user !== null &&
          (!data.user ||
            typeof data.user.name !== 'string' ||
            typeof data.user.emailVerified !== 'boolean'))
      )
        throw new Error('Invalid sign-in response.');
      session = data;
    } catch {
      if (destroyed || own !== accountGeneration) return;
      session = undefined;
    } finally {
      if (!destroyed && own === accountGeneration) {
        find<HTMLButtonElement>('menu-refresh-account').disabled = false;
        accountUI();
      }
    }
  }

  function warnings(values: string[]) {
    const list = find('menu-warnings');
    list.replaceChildren(
      ...values
        .slice(0, 8)
        .map((value) => element('li', '', value.slice(0, 240))),
    );
    list.hidden = !values.length;
  }
  function refreshRow(row: HTMLTableRowElement, item: MenuItem) {
    const valid = parseMoney(item.price) !== null;
    row.classList.toggle('menu-price-missing', !valid);
    const check = row.querySelector<HTMLInputElement>('.menu-item-selected')!;
    check.disabled = !valid || !item.name.trim();
    if (check.disabled) item.selected = false;
    check.checked = item.selected;
    check.setAttribute(
      'aria-label',
      'Include ' + (item.name.trim() || 'this dish'),
    );
    row
      .querySelector<HTMLInputElement>('.menu-item-price')!
      .setAttribute('aria-invalid', String(!valid));
    row.querySelector<HTMLInputElement>('.menu-item-price')!.title = valid
      ? 'Price per dish or portion'
      : 'Enter a clear, positive price before including this dish.';
  }
  function renderRows() {
    const body = find('menu-items');
    body.replaceChildren();
    for (const item of items) {
      const row = element('tr');
      row.dataset.menuItem = item.id;
      const chooseCell = element('td');
      const choose = element('input', 'menu-item-selected');
      choose.type = 'checkbox';
      choose.addEventListener('change', () => {
        item.selected = choose.checked;
        changed();
      });
      chooseCell.append(choose);
      const nameCell = element('td');
      const name = element('input', 'menu-item-name');
      name.value = item.name;
      name.maxLength = 120;
      name.setAttribute('aria-label', 'Dish or portion name');
      name.addEventListener('input', () => {
        item.name = name.value;
        refreshRow(row, item);
        changed();
      });
      nameCell.append(name);
      const priceCell = element('td');
      const amount = element('input', 'menu-item-price');
      amount.value = item.price;
      amount.maxLength = 10;
      amount.inputMode = 'decimal';
      amount.placeholder = 'Check price';
      amount.setAttribute('aria-label', 'Price for ' + item.name);
      amount.addEventListener('input', () => {
        item.price = amount.value;
        refreshRow(row, item);
        changed();
      });
      priceCell.append(amount);
      const categoryCell = element('td');
      const category = element('select', 'menu-item-category');
      category.setAttribute('aria-label', 'Type for ' + item.name);
      for (const value of CATEGORIES) {
        const option = element(
          'option',
          '',
          value[0].toUpperCase() + value.slice(1),
        );
        option.value = value;
        category.append(option);
      }
      category.value = item.category;
      category.addEventListener('change', () => {
        item.category = category.value as Category;
        changed();
      });
      categoryCell.append(category);
      const removeCell = element('td');
      const remove = element('button', 'menu-remove-item', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove ' + item.name);
      remove.addEventListener('click', () => {
        items = items.filter((value) => value.id !== item.id);
        changed();
        renderRows();
        find<HTMLInputElement>('menu-add-name').focus();
      });
      removeCell.append(remove);
      row.append(chooseCell, nameCell, priceCell, categoryCell, removeCell);
      refreshRow(row, item);
      body.append(row);
    }
    find('menu-empty').hidden = !!items.length;
    find('menu-item-count').textContent =
      `${items.length} dish${items.length === 1 ? '' : 'es'}`;
    find<HTMLButtonElement>('menu-clear').disabled = !items.length;
    find<HTMLButtonElement>('menu-add-submit').disabled =
      items.length >= MAX_ITEMS;
    syncScanControls();
  }
  function clearPhoto() {
    photoGeneration++;
    cancelScan();
    photo = undefined;
    preparing = false;
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = undefined;
    find<HTMLImageElement>('menu-photo-preview').removeAttribute('src');
    find('menu-photo-preview').hidden = true;
    find('menu-clear-photo').hidden = true;
    find('menu-photo-empty').hidden = false;
    camera.value = '';
    upload.value = '';
    syncScanControls();
  }
  async function preparePhoto(file: File | undefined) {
    if (!file) return;
    const own = ++photoGeneration;
    cancelScan();
    photo = undefined;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      clearPhoto();
      status(
        'Choose a JPEG, PNG or WebP photo. Screenshots work too.',
        'error',
      );
      return;
    }
    if (file.size > 20_000_000) {
      clearPhoto();
      status(
        'That photo is too large. Choose a photo smaller than 20 MB.',
        'error',
      );
      return;
    }
    preparing = true;
    status('Preparing a smaller, metadata-free photo…', 'loading');
    syncScanControls();
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      if (bitmap.width * bitmap.height > 64_000_000)
        throw new Error(
          'That photo has too many pixels. Try a screenshot or a smaller photo.',
        );
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error(
          'This browser could not prepare the photo. Try a different browser.',
        );
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let compressed: Blob | null = null;
      for (const quality of [0.82, 0.7, 0.58]) {
        compressed = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        );
        if (compressed && compressed.size <= MAX_PHOTO_BYTES) break;
      }
      if (!compressed || compressed.size > MAX_PHOTO_BYTES)
        throw new Error(
          'This photo is still too large to scan. Crop to one clear menu page and try again.',
        );
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error('The photo could not be read. Try another image.'));
        reader.readAsDataURL(compressed!);
      });
      if (destroyed || own !== photoGeneration) return;
      if (photoURL) URL.revokeObjectURL(photoURL);
      photo = data;
      photoURL = URL.createObjectURL(compressed);
      find<HTMLImageElement>('menu-photo-preview').src = photoURL;
      find('menu-photo-preview').hidden = false;
      find('menu-clear-photo').hidden = false;
      find('menu-photo-empty').hidden = true;
      status(
        'Photo ready. Check sign-in, then press Read menu. Nothing has been sent yet.',
      );
    } catch (error) {
      if (destroyed || own !== photoGeneration) return;
      clearPhoto();
      status(
        readableError(
          error,
          'The photo could not be prepared. Try a clearer JPEG photo.',
        ),
        'error',
      );
    } finally {
      bitmap?.close();
      if (!destroyed && own === photoGeneration) {
        preparing = false;
        syncScanControls();
      }
    }
  }
  async function scanPhoto() {
    if (
      !photo ||
      scanning ||
      preparing ||
      !session?.user?.emailVerified ||
      !session.configured
    )
      return;
    const own = ++scanGeneration;
    const controller = new AbortController();
    scanController = controller;
    scanning = true;
    const snapshot = photo;
    status(
      'Reading names, portions and prices… This can take up to 30 seconds.',
      'loading',
    );
    syncScanControls();
    try {
      const response = await fetch('/api/menu/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ image: snapshot }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(35000),
        ]),
      });
      const data: Scan = await readResponse(response);
      if (destroyed || own !== scanGeneration) return;
      if (
        !Array.isArray(data.items) ||
        !data.items.length ||
        data.items.length > MAX_ITEMS ||
        data.items.some(
          (item) =>
            typeof item.name !== 'string' ||
            !item.name.trim() ||
            item.name.length > 120 ||
            (item.price !== null && typeof item.price !== 'string') ||
            !CATEGORIES.includes(item.category),
        )
      )
        throw new Error(
          'The scan did not produce a clear menu. Try a closer photo or enter dishes manually.',
        );
      items = data.items.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name.trim(),
        price: item.price ?? '',
        category: item.category,
        selected:
          parseMoney(item.price ?? '') !== null &&
          ['main', 'other'].includes(item.category),
      }));
      const notes = Array.isArray(data.warnings)
        ? data.warnings.filter((value) => typeof value === 'string')
        : [];
      if (
        typeof data.currency === 'string' &&
        CURRENCIES.includes(data.currency)
      )
        currency.value = data.currency;
      else
        notes.unshift(
          'The currency was unclear or unsupported. Choose the correct currency before generating combinations.',
        );
      confirmed.checked = false;
      warnings(notes);
      invalidate();
      renderRows();
      save();
      find('menu-source-note').textContent =
        'AI-read menu · check every selected price and portion. Food labels are not allergy guarantees. Your photo is not stored.';
      const unclear = items.filter(
        (item) => parseMoney(item.price) === null,
      ).length;
      status(
        `Read ${items.length} dishes.${unclear ? ` ${unclear} need a clear price before they can be included.` : ''} Check the list and confirm its prices and currency.`,
        'success',
      );
      if (session && typeof data.remaining === 'number') {
        session.remaining = data.remaining;
        accountUI();
      }
    } catch (error) {
      if (destroyed || own !== scanGeneration) return;
      if (controller.signal.aborted)
        status('Scan cancelled. Your menu is unchanged.');
      else if (error instanceof DOMException && error.name === 'TimeoutError')
        status(
          'The menu scan took too long. Your existing menu is kept; try a clearer photo or type the dishes.',
          'error',
        );
      else
        status(
          readableError(
            error,
            'The photo could not be scanned. Your current menu is kept.',
          ),
          'error',
        );
    } finally {
      if (!destroyed && own === scanGeneration) {
        scanning = false;
        scanController = undefined;
        syncScanControls();
        void refreshAccount();
      }
    }
  }
  function summary(combination: MenuCombination) {
    const total = `${currency.value} ${(combination.totalMinor / 100).toFixed(2)}`;
    const names = combination.items
      .map((item) => `${item.quantity}× ${item.name}`)
      .join(' + ');
    const suffix = ` · ${total}`;
    return names.length + suffix.length <= 80
      ? names + suffix
      : names.slice(0, 79 - suffix.length) + '…' + suffix;
  }
  function refreshRoomState() {
    let available = false;
    try {
      available = options.canAddToRoom();
    } catch {
      /* room is not ready */
    }
    find('menu-room-help').textContent = available
      ? 'Add only the combinations you want your room to see. The full menu stays private.'
      : 'Create or join an unlocked decision room below to share a combination.';
    container
      .querySelectorAll<HTMLButtonElement>('[data-share-combination]')
      .forEach((button) => {
        if (button.dataset.busy !== 'true') button.disabled = !available;
        button.title = available
          ? 'Share this combination with the decision room'
          : 'Create or join an unlocked room below first';
      });
  }
  function renderCombinations() {
    const list = find('menu-combinations');
    list.replaceChildren();
    find('menu-results-heading').textContent =
      combinations.length === 3
        ? 'Three ways to say yes.'
        : combinations.length === 2
          ? 'Two ways to say yes.'
          : 'A little yes for dinner.';
    for (const [index, combination] of combinations.entries()) {
      const card = element('article', 'menu-combination');
      card.dataset.combination = combination.key;
      card.dataset.totalMinor = String(combination.totalMinor);
      card.dataset.remainingMinor = String(combination.remainingMinor);
      card.dataset.people = people.value;
      const heading = element('div', 'menu-combination-heading');
      heading.append(
        element('span', '', `PROPOSAL ${String(index + 1).padStart(2, '0')}`),
        element('span', 'menu-combination-check', '✓ Within budget'),
      );
      const dishes = element('ul');
      for (const item of combination.items) {
        const row = element('li');
        row.dataset.combinationItem = item.id;
        row.dataset.quantity = String(item.quantity);
        row.dataset.priceMinor = String(item.priceMinor);
        row.append(
          element('span', 'menu-combination-quantity', `${item.quantity}×`),
          element('span', 'menu-combination-name', item.name),
          element(
            'span',
            'menu-combination-price',
            price(item.priceMinor * item.quantity, currency.value),
          ),
        );
        dishes.append(row);
      }
      const total = element('div', 'menu-combination-total');
      total.append(
        element('span', '', 'Table total'),
        element('strong', '', price(combination.totalMinor, currency.value)),
      );
      const remaining = element(
        'p',
        'menu-combination-remaining',
        `${price(combination.remainingMinor, currency.value)} left in the budget`,
      );
      const share = element('button', 'button light small', 'Add to room ↗');
      share.type = 'button';
      share.dataset.shareCombination = String(index);
      share.addEventListener('click', async () => {
        if (!options.canAddToRoom()) {
          refreshRoomState();
          return;
        }
        share.disabled = true;
        share.dataset.busy = 'true';
        share.textContent = 'Adding…';
        try {
          await options.addToRoom(summary(combination));
          budgetMessage(
            'Combination added to your room. Friends can now vote for it.',
          );
        } catch (error) {
          budgetMessage(
            readableError(
              error,
              'Could not add this combination. Your menu is still here.',
            ),
            true,
          );
        } finally {
          delete share.dataset.busy;
          share.textContent = 'Add to room ↗';
          refreshRoomState();
        }
      });
      card.append(heading, dishes, total, remaining, share);
      list.append(card);
    }
    find('menu-results-section').hidden = !combinations.length;
    find('menu-shuffle').hidden = !combinations.length;
    refreshRoomState();
  }
  function generate() {
    if (!confirmed.checked) {
      budgetMessage(
        'Check the selected prices and currency, then tick the confirmation above.',
        true,
      );
      confirmed.focus();
      return;
    }
    const amount = parseMoney(budget.value);
    if (amount === null) {
      budgetMessage(
        'Enter a total group budget between 0.01 and 10,000.00. A comma or dot works for decimals.',
        true,
      );
      budget.focus();
      return;
    }
    const selected = items
      .filter(
        (item) =>
          item.selected && item.name.trim() && parseMoney(item.price) !== null,
      )
      .map((item) => ({
        id: item.id,
        name: item.name.trim(),
        priceMinor: parseMoney(item.price)!,
      }));
    try {
      const result = generateCombinations(
        selected,
        amount,
        Number(people.value),
      );
      combinations = result.combinations;
      renderCombinations();
      if (result.reason === 'empty')
        budgetMessage(
          'Include at least one dish with a clear name and price. Tick it in the menu above.',
          true,
        );
      else if (result.reason === 'unaffordable')
        budgetMessage(
          `The cheapest option for ${people.value} ${people.value === '1' ? 'person' : 'people'} is ${price(result.minimumMinor!, currency.value)}. Add ${price(result.minimumMinor! - amount, currency.value)} to the budget, include a cheaper dish, or reduce the group.`,
          true,
        );
      else
        budgetMessage(
          result.combinations.length < 3
            ? `Found ${result.combinations.length} distinct affordable ${result.combinations.length === 1 ? 'combination' : 'combinations'}. Repeated dishes count as separate portions.`
            : 'Three affordable combinations, one dish per person. Shuffle for another set.',
        );
      save();
    } catch {
      invalidate();
      budgetMessage(
        'Check that every selected dish has a positive price and that the group has 1–12 people.',
        true,
      );
    }
  }

  find('menu-take-photo').addEventListener('click', () => camera.click());
  find('menu-choose-photo').addEventListener('click', () => upload.click());
  camera.addEventListener('change', () => {
    void preparePhoto(camera.files?.[0]);
    camera.value = '';
  });
  upload.addEventListener('change', () => {
    void preparePhoto(upload.files?.[0]);
    upload.value = '';
  });
  find('menu-clear-photo').addEventListener('click', () => {
    clearPhoto();
    status('Photo removed. Your editable menu is kept.');
  });
  find('menu-read-photo').addEventListener('click', () => void scanPhoto());
  find('menu-cancel-scan').addEventListener('click', () => cancelScan());
  find('menu-refresh-account').addEventListener(
    'click',
    () => void refreshAccount(),
  );
  find('menu-signin').addEventListener('click', save);
  find('menu-logout').addEventListener('click', async () => {
    cancelScan();
    save();
    const button = find<HTMLButtonElement>('menu-logout');
    button.disabled = true;
    try {
      await readResponse(
        await fetch('/api/menu/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          credentials: 'same-origin',
          signal: AbortSignal.timeout(10000),
        }),
      );
      status(
        'Signed out of menu scanning here. Your manual menu is still available.',
      );
      await refreshAccount();
    } catch (error) {
      status(
        readableError(error, 'Sign-out could not finish. Please try again.'),
        'error',
      );
    } finally {
      button.disabled = false;
    }
  });
  find<HTMLFormElement>('menu-add-item').addEventListener('submit', (event) => {
    event.preventDefault();
    if (items.length >= MAX_ITEMS) {
      budgetMessage(
        'A menu can contain up to 60 dishes. Remove an item first.',
        true,
      );
      return;
    }
    const name = find<HTMLInputElement>('menu-add-name');
    const amount = find<HTMLInputElement>('menu-add-price');
    const category = find<HTMLSelectElement>('menu-add-category');
    if (!name.value.trim()) {
      name.focus();
      return;
    }
    if (parseMoney(amount.value) === null) {
      budgetMessage(
        'Enter a positive price such as 18.50 or 18,50. Use numbers only; the currency is chosen below.',
        true,
      );
      amount.focus();
      return;
    }
    items.push({
      id: crypto.randomUUID(),
      name: name.value.trim(),
      price: amount.value.trim(),
      category: category.value as Category,
      selected: true,
    });
    changed();
    renderRows();
    name.value = '';
    amount.value = '';
    name.focus();
  });
  find('menu-clear').addEventListener('click', () => {
    items = [];
    changed();
    renderRows();
    warnings([]);
    find('menu-source-note').textContent =
      'Menu cleared. Photos are never stored; type dishes or read a new photo.';
    find<HTMLInputElement>('menu-add-name').focus();
  });
  find('menu-sample').addEventListener('click', () => {
    if (scanning) cancelScan();
    items = [
      ['Khachapuri', '18.00'],
      ['Khinkali · five pieces', '15.00'],
      ['Chicken shkmeruli', '24.00'],
      ['Mushrooms with cheese', '17.00'],
      ['Lobio · one portion', '13.00'],
    ].map(([name, price]) => ({
      id: crypto.randomUUID(),
      name,
      price,
      category: 'main',
      selected: true,
    }));
    currency.value = 'GEL';
    budget.value = '45.00';
    people.value = '2';
    confirmed.checked = true;
    changed();
    renderRows();
    warnings([]);
    find('menu-source-note').textContent =
      'Sample menu · demonstration prices, not a real restaurant. Replace them with your menu before ordering.';
    status(
      'Sample menu loaded. Try Find my dinner; no photo or AI request is involved.',
    );
  });
  find<HTMLFormElement>('menu-budget-form').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      generate();
    },
  );
  find('menu-shuffle').addEventListener('click', generate);
  budget.addEventListener('input', () => {
    invalidate();
    save();
  });
  people.addEventListener('change', () => {
    invalidate();
    save();
  });
  currency.addEventListener('change', () => {
    confirmed.checked = false;
    changed();
  });
  confirmed.addEventListener('change', () => {
    invalidate();
    save();
  });

  try {
    const saved = sessionStorage.getItem(DRAFT);
    if (saved && saved.length <= 30000) {
      const draft = JSON.parse(saved);
      if (Array.isArray(draft.items) && draft.items.length <= MAX_ITEMS) {
        items = draft.items
          .filter(
            (item: unknown): item is MenuItem =>
              !!item &&
              typeof item === 'object' &&
              typeof (item as MenuItem).name === 'string' &&
              (item as MenuItem).name.length <= 120 &&
              typeof (item as MenuItem).price === 'string' &&
              (item as MenuItem).price.length <= 10 &&
              CATEGORIES.includes((item as MenuItem).category) &&
              typeof (item as MenuItem).selected === 'boolean',
          )
          .map((item: MenuItem) => ({ ...item, id: crypto.randomUUID() }));
        if (typeof draft.budget === 'string' && draft.budget.length <= 10)
          budget.value = draft.budget;
        if (CURRENCIES.includes(draft.currency))
          currency.value = draft.currency;
        if (/^(?:[1-9]|1[0-2])$/.test(draft.people))
          people.value = draft.people;
        confirmed.checked = draft.confirmed === true;
        if (items.length)
          find('menu-source-note').textContent =
            'Restored your private draft in this tab. Check its prices before ordering.';
      }
    }
  } catch {
    /* Storage can be disabled. The in-memory menu remains fully usable. */
  }
  function visibility() {
    if (!document.hidden) void refreshAccount();
  }
  document.addEventListener('visibilitychange', visibility);
  renderRows();
  refreshRoomState();
  void refreshAccount();
  return {
    refreshRoomState,
    destroy() {
      destroyed = true;
      scanGeneration++;
      accountGeneration++;
      photoGeneration++;
      scanController?.abort();
      accountController?.abort();
      if (photoURL) URL.revokeObjectURL(photoURL);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
