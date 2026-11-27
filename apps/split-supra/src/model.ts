import type {
  Claim,
  SplitTotals,
} from '../../decision-department/shared/split.mjs';

export interface Item {
  id: string;
  name: string;
  quantity: number;
  unitMinor: number;
}
export interface Participant {
  id: string;
  name: string;
}
export interface Table {
  id: string;
  title: string;
  hostId: string;
  feeMinor: number;
  created: number;
  expires: number;
  revision: number;
  items: Item[];
  participants: Participant[];
  claims: Claim[];
  totals: SplitTotals;
}
export interface Credentials {
  participantId: string;
  participantToken: string;
}
export interface RoomResponse extends Partial<Credentials> {
  room: Table;
}
export interface DraftRow {
  name: string;
  quantity: string;
  price: string;
  printed: string;
}
export interface Draft {
  title: string;
  name: string;
  fee: string;
  rows: DraftRow[];
  scan: { currency: string; grand: string; warnings: string[] } | null;
  confirmed: boolean;
}
export const emptyRow = (): DraftRow => ({
  name: '',
  quantity: '1',
  price: '',
  printed: '',
});
export const newDraft = (): Draft => ({
  title: 'Dinner with friends',
  name: '',
  fee: '',
  rows: [emptyRow()],
  scan: null,
  confirmed: false,
});
const key = 'split-supra:draft:v1';
const safeText = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.slice(0, limit) : '';

export function saveDraft(draft: Draft) {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* Draft is still held in memory. */
  }
}
export function removeDraft() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Browser storage is optional. */
  }
}
export function loadDraft(): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!value || !Array.isArray(value.rows) || value.rows.length < 1)
      return newDraft();
    return {
      title: safeText(value.title, 80),
      name: safeText(value.name, 32),
      fee: safeText(value.fee, 12),
      rows: value.rows
        .slice(0, 60)
        .map((r: DraftRow) => ({
          name: safeText(r?.name, 100),
          quantity: safeText(r?.quantity, 3),
          price: safeText(r?.price, 12),
          printed: safeText(r?.printed, 12),
        })),
      scan: value.scan
        ? {
            currency: safeText(value.scan.currency, 10),
            grand: safeText(value.scan.grand, 12),
            warnings: Array.isArray(value.scan.warnings)
              ? value.scan.warnings
                  .filter((x: unknown) => typeof x === 'string')
                  .map((x: string) => x.slice(0, 160))
                  .slice(0, 10)
              : [],
          }
        : null,
      confirmed: value.confirmed === true,
    };
  } catch {
    return newDraft();
  }
}
export function money(input: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(input.trim())) return null;
  const [whole, part = ''] = input.trim().split(/[.,]/);
  return Number(whole) * 100 + Number(part.padEnd(2, '0'));
}
export const showMoney = (minor: number) => '₾' + (minor / 100).toFixed(2);
export const escapeHTML = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        ch
      ] || '',
  );
const memoryCredentials = new Map<string, Credentials>();
export function remember(id: string, c: Credentials) {
  memoryCredentials.set(id, c);
  try {
    localStorage.setItem('split-supra:seat:' + id, JSON.stringify(c));
  } catch {
    /* The current tab can still participate. */
  }
}
export function seat(id: string): Credentials | null {
  if (memoryCredentials.has(id)) return memoryCredentials.get(id) ?? null;
  try {
    const c = JSON.parse(
      localStorage.getItem('split-supra:seat:' + id) || 'null',
    );
    return typeof c?.participantId === 'string' &&
      typeof c.participantToken === 'string'
      ? c
      : null;
  } catch {
    return null;
  }
}
export async function request<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    signal: init.signal ?? AbortSignal.timeout(16000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : typeof body.message === 'string'
          ? body.message
          : response.status === 404
            ? 'This table has closed or expired.'
            : `Request failed (${response.status}). Please try again.`,
    );
  return body as T;
}
