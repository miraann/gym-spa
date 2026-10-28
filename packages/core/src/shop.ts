import { toLatinDigits } from './digits.ts';

// The shop (Phase 8): barcodes, low stock and the till's basket. The database checks all of it again
// (supabase/migrations/20261029100000_shop.sql).

export const SHOP_LIMITS = {
  /** Products in one sale. */
  maxLines: 50,
  /** Of one product in one sale. */
  maxQuantity: 1000,
  /** Received, counted or taken out at once. */
  maxStockChange: 100000,
} as const;

/** Why goods are taken out of stock. */
export const STOCK_REMOVE_REASONS = ['damaged', 'expired', 'lost', 'gym_use', 'other'] as const;
export type StockRemoveReason = (typeof STOCK_REMOVE_REASONS)[number];

export const STOCK_MOVEMENT_KINDS = ['receive', 'sale', 'sale_void', 'count', 'adjust'] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

/** A barcode as typed or scanned: Latin digits, no spaces. */
export function normalizeBarcode(input: string): string {
  return toLatinDigits(input).replace(/\s+/g, '');
}

/** What a barcode may be: 3 to 64 letters, digits, dots and dashes. */
export function isValidBarcode(barcode: string): boolean {
  return /^[0-9A-Za-z.-]{3,64}$/.test(barcode);
}

/** Whether a counted product's stock is low: at or below its level, when it has one. */
export function isLowStock(stock: number, level: number | null): boolean {
  return level !== null && stock <= level;
}

export interface BasketLine {
  readonly productId: string;
  readonly quantity: number;
  /** The price shown when it was added: the sale is refused if it changed since. */
  readonly price: number;
}

/**
 * One more of a product, up to `available` (its stock, or null when it isn't counted) and the
 * limits. The basket is unchanged when nothing more can be added.
 */
export function addToBasket(
  lines: readonly BasketLine[],
  productId: string,
  price: number,
  available: number | null,
): readonly BasketLine[] {
  const line = lines.find((each) => each.productId === productId);
  const quantity = (line?.quantity ?? 0) + 1;
  const most = Math.min(SHOP_LIMITS.maxQuantity, available ?? SHOP_LIMITS.maxQuantity);
  if (quantity > most) return lines;
  if (line) {
    return lines.map((each) => (each.productId === productId ? { ...each, quantity } : each));
  }
  if (lines.length >= SHOP_LIMITS.maxLines) return lines;
  return [...lines, { productId, quantity, price }];
}

/** A product's quantity set (kept within 1 and the limits); 0 or less takes it out of the basket. */
export function setBasketQuantity(
  lines: readonly BasketLine[],
  productId: string,
  quantity: number,
  available: number | null,
): readonly BasketLine[] {
  if (quantity <= 0) return lines.filter((each) => each.productId !== productId);
  const most = Math.min(SHOP_LIMITS.maxQuantity, available ?? SHOP_LIMITS.maxQuantity);
  const kept = Math.max(1, Math.min(Math.trunc(quantity), most));
  return lines.map((each) => (each.productId === productId ? { ...each, quantity: kept } : each));
}

/** What the basket costs, in whole dinars. */
export function basketTotal(lines: readonly BasketLine[]): number {
  return lines.reduce((total, line) => total + line.quantity * line.price, 0);
}

/** How many things are in the basket. */
export function basketCount(lines: readonly BasketLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}
