import { useState } from 'react';
import {
  emptyPaymentFields,
  paymentFieldsDraft,
  toPaymentInput,
  type PaymentFieldValues,
} from './payment-draft';

/** The payment fields' state, paid in full in dinars unless dollars are chosen. */
export function usePayNow(total: number) {
  const [payNow, setPayNow] = useState(true);
  const [payment, setPayment] = useState<PaymentFieldValues>(() => emptyPaymentFields(null));
  const values: PaymentFieldValues =
    payment.currency === 'IQD' ? { ...payment, amount: String(total) } : payment;
  const problem = payNow && total > 0 && paymentFieldsDraft(values, total).problem !== null;
  return {
    payNow,
    setPayNow,
    values,
    setPayment,
    problem,
    input: (paymentId: string) => (payNow && total > 0 ? toPaymentInput(values, paymentId) : null),
  };
}
