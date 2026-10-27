import {
  isValidUsdAmount,
  parseDecimal,
  parseWholeNumber,
  usdPayment,
  type PaymentMethod,
} from '@gym/core';
import type { PaymentInput } from './payment-input';

// One payment as typed in the pay and new-invoice dialogs, worked out against what is owed with
// the database's rules (app.read_payment): the dialog shows the result and checks it alike.

export interface PaymentFieldValues {
  /** Dinars, for a payment in dinars. */
  amount: string;
  currency: 'IQD' | 'USD';
  usdAmount: string;
  rate: string;
  method: PaymentMethod;
  reference: string;
}

export type PaymentFieldProblem = 'amount' | 'usdAmount' | 'rate';

export interface PaymentFieldsDraft {
  /** What the payment counts for, in dinars (0 while it isn't valid). */
  readonly counts: number;
  readonly usd: { readonly value: number; readonly change: number } | null;
  readonly problem: PaymentFieldProblem | null;
}

export function emptyPaymentFields(amount: number | null): PaymentFieldValues {
  return {
    amount: amount === null ? '' : String(amount),
    currency: 'IQD',
    usdAmount: '',
    rate: '',
    method: 'cash',
    reference: '',
  };
}

export function paymentFieldsDraft(values: PaymentFieldValues, owed: number): PaymentFieldsDraft {
  if (values.currency === 'USD') {
    const amount = parseDecimal(values.usdAmount);
    const rate = parseDecimal(values.rate);
    if (amount === null || !isValidUsdAmount(amount))
      return { counts: 0, usd: null, problem: 'usdAmount' };
    if (rate === null || !isValidUsdAmount(rate)) return { counts: 0, usd: null, problem: 'rate' };
    const payment = usdPayment(amount, rate, owed);
    return {
      counts: payment.counts,
      usd: { value: payment.value, change: payment.change },
      problem: payment.counts > 0 ? null : 'usdAmount',
    };
  }
  const amount = parseWholeNumber(values.amount);
  if (amount === null || amount <= 0 || amount > owed)
    return { counts: 0, usd: null, problem: 'amount' };
  return { counts: amount, usd: null, problem: null };
}

/** The payment as the database takes it; only for values without a problem. */
export function toPaymentInput(values: PaymentFieldValues, id: string): PaymentInput {
  const common = { id, method: values.method, reference: values.reference.trim() || null };
  return values.currency === 'USD'
    ? {
        ...common,
        currency: 'USD',
        foreignAmount: parseDecimal(values.usdAmount) ?? 0,
        exchangeRate: parseDecimal(values.rate) ?? 0,
      }
    : { ...common, currency: 'IQD', amount: parseWholeNumber(values.amount) ?? 0 };
}
