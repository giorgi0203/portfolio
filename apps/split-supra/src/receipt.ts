import { money, type DraftRow, type Draft } from './model';

export const decisionOrigin =
  import.meta.env.VITE_DECISION_ORIGIN ||
  (['localhost', '127.0.0.1'].includes(location.hostname)
    ? location.protocol + '//' + location.hostname + ':3360'
    : 'https://decisions.giorgi.app');
export const signInUrl = decisionOrigin + '/api/auth/sso/start?returnTo=/supra';
interface ReceiptLine {
  name: string;
  quantity: number | null;
  unitPrice: string | null;
  lineTotal: string | null;
}
export interface Receipt {
  currency: string | null;
  items: ReceiptLine[];
  fee: string | null;
  total: string | null;
  warnings: string[];
}
export interface ScanSession {
  user: { name?: string; emailVerified: boolean } | null;
  configured: boolean;
  remaining?: number;
}
function decimal(value: unknown) {
  return typeof value === 'string' && money(value) !== null ? value : '';
}
export function reviewScan(
  receipt: Receipt,
): Pick<Draft, 'scan' | 'rows' | 'fee' | 'confirmed'> {
  if (!Array.isArray(receipt.items) || !receipt.items.length)
    throw new Error(
      'No receipt items were readable. Try a clearer photo or enter the items.',
    );
  const rows = receipt.items.slice(0, 60).map((item): DraftRow => {
    const qty =
      typeof item.quantity === 'number' &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0 &&
      item.quantity <= 99
        ? item.quantity
        : null;
    const printed = decimal(item.lineTotal),
      lineTotal = money(printed);
    let price = decimal(item.unitPrice);
    if (!price && qty && lineTotal !== null && lineTotal % qty === 0)
      price = (lineTotal / qty / 100).toFixed(2);
    return {
      name: String(item.name || '').slice(0, 100),
      quantity: qty ? String(qty) : '',
      price,
      printed,
    };
  });
  return {
    rows,
    fee: decimal(receipt.fee),
    confirmed: false,
    scan: {
      currency: String(receipt.currency || 'unreadable').slice(0, 10),
      grand: decimal(receipt.total),
      warnings: Array.isArray(receipt.warnings)
        ? receipt.warnings
            .filter((w) => typeof w === 'string')
            .slice(0, 10)
            .map((w) => w.slice(0, 160))
        : [],
    },
  };
}

/** Re-encode a receipt before scanning so the file's location and other metadata stay local. */
export async function preparePhoto(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 20_000_000
  )
    throw new Error('Choose a JPEG, PNG or WebP smaller than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: w, naturalHeight: h } = image;
    if (!w || !h || w * h > 50_000_000)
      throw new Error('Crop the receipt or try a smaller image.');
    const scale = Math.min(1, 1800 / Math.max(w, h)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser could not prepare the photo.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.7, 0.52]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.startsWith('data:image/jpeg;base64,') && data.length < 1_850_000)
        return data;
    }
    throw new Error(
      'Crop the photo to the printed part of the receipt and try again.',
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
