import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for payments, voids, refunds and charges. */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'invoice_not_found',
  'payment_not_found',
  'invoice_voided',
  'nothing_owed',
  'no_branch_access',
  'branch_inactive',
  'invalid_payment',
  'payment_too_large',
  'payment_exists',
  'already_voided',
  'void_too_late',
  'reason_required',
  'invalid_refund',
  'refund_too_large',
  'member_not_found',
  'member_archived',
  'invalid_charge',
  'charge_exists',
  'gym_read_only',
] as const;

/** Why loading or changing money failed, as a key of payments:serverErrors. */
export type PaymentErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/**
 * Sorts a failed load or change into a key: a function's key (the error's message), no connection,
 * or a refusal without a key. Anything else is logged.
 */
export function paymentErrorKey(error: unknown, action: string): PaymentErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '23514' || code === '22023' || code === '22P02' || code === '22007') {
    return 'invalid_request';
  }
  logError(error, { area: 'payments', action });
  return 'unexpected';
}
