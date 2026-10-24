// Prices, discounts and payments of a sale (step 3c), the same rules as the database's
// (supabase/migrations/…_selling.sql; tests run one list of cases through both), so the sell
// screen shows what the server will save before anything is sent. The database decides.

/** The discount permissions, highest first, with the largest share of the price each allows. */
export const DISCOUNT_PERMISSIONS = [
  ['discount.apply.any', 100],
  ['discount.apply.max_50', 50],
  ['discount.apply.max_25', 25],
  ['discount.apply.max_10', 10],
] as const;

/** The largest discount, in percent of the price, the staff member may give (0: none). */
export function maxDiscountPercent(permissions: ReadonlySet<string>): number {
  return DISCOUNT_PERMISSIONS.find(([key]) => permissions.has(key))?.[1] ?? 0;
}

/**
 * Whether a discount (whole dinars) is one the database accepts: from 0 to the price, and at most
 * maxPercent of it (app.is_discount_allowed). Compared in whole numbers, so nothing is rounded.
 */
export function isDiscountAllowed(price: number, discount: number, maxPercent: number): boolean {
  return (
    Number.isInteger(discount) &&
    discount >= 0 &&
    discount <= price &&
    discount * 100 <= price * maxPercent
  );
}

/**
 * Dollars (2 decimals) at a rate (dinars for one dollar, 2 decimals) in whole dinars, rounded
 * half up like app.usd_to_iqd(). Worked out in whole cents, so 12.35 × 1310 is 16,179 and not
 * 16,178 (12.35 × 1310 is 16178.499… in floating point).
 */
export function usdToIqd(amount: number, rate: number): number {
  const product = Math.round(amount * 100) * Math.round(rate * 100);
  return Math.floor((product + 5000) / 10000);
}

/**
 * Dollars handed over against what is owed, like the sale: their value in dinars, what they pay
 * (at most what is owed) and the change, given back in dinars.
 */
export function usdPayment(
  amount: number,
  rate: number,
  owed: number,
): { readonly value: number; readonly counts: number; readonly change: number } {
  const value = usdToIqd(amount, rate);
  const counts = Math.min(value, owed);
  return { value, counts, change: value - counts };
}

/** Whether a dollar amount or a rate has at most 2 decimals and is above 0. */
export function isValidUsdAmount(value: number): boolean {
  return (
    Number.isFinite(value) && value > 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}

/**
 * `remaining` dinars split into `count` installments of whole dinars, as equal as they can be:
 * the first ones take the extra dinars (100,000 in 3: 33,334, 33,333, 33,333).
 */
export function splitInstallments(remaining: number, count: number): number[] {
  if (count < 1 || remaining < count) return [];
  const base = Math.floor(remaining / count);
  const extra = remaining - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

/** One installment as the database takes it. */
export interface InstallmentDraft {
  /** YYYY-MM-DD. */
  readonly dueDate: string;
  /** Whole dinars. */
  readonly amount: number;
}

/** Why a list of installments would be refused, or null when the database accepts it. */
export type InstallmentProblem = 'amount' | 'date' | 'order' | 'sum';

/**
 * The checks of the sale (app.check_installments): every amount whole and above 0, every date
 * today or later, each later than the one before, and together exactly what is left to pay.
 */
export function installmentProblem(
  installments: readonly InstallmentDraft[],
  remaining: number,
  today: string,
): InstallmentProblem | null {
  let previous = '';
  let sum = 0;
  for (const installment of installments) {
    if (!Number.isInteger(installment.amount) || installment.amount <= 0) return 'amount';
    if (installment.dueDate < today) return 'date';
    if (installment.dueDate <= previous) return 'order';
    previous = installment.dueDate;
    sum += installment.amount;
  }
  return installments.length > 0 && sum !== remaining ? 'sum' : null;
}
