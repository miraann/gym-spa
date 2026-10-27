import type { PaymentMethod } from '@gym/core';

/** A payment as the database takes it (app.read_payment): dinars, or dollars with the rate. */
export type PaymentInput = {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly reference: string | null;
} & (
  | { readonly currency: 'IQD'; readonly amount: number }
  | { readonly currency: 'USD'; readonly foreignAmount: number; readonly exchangeRate: number }
);

/** The JSON the money functions take for a payment. */
export function paymentJson(payment: PaymentInput) {
  return {
    id: payment.id,
    method: payment.method,
    ...(payment.reference ? { reference: payment.reference } : {}),
    ...(payment.currency === 'USD'
      ? {
          currency: 'USD',
          foreign_amount: payment.foreignAmount,
          exchange_rate: payment.exchangeRate,
        }
      : { amount: payment.amount }),
  };
}
