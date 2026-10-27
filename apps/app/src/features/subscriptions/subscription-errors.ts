import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises when selling (sell_subscription), changing (step 3f) and reading subscriptions. */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_inactive',
  'member_not_found',
  'member_not_active',
  'plan_not_found',
  'plan_not_on_sale',
  'price_changed',
  'plan_gender_mismatch',
  'invalid_start_date',
  'invalid_discount',
  'discount_too_large',
  'reason_required',
  'invalid_payment',
  'payment_too_large',
  'invalid_installments',
  'installments_mismatch',
  'sale_exists',
  'gym_read_only',
  'subscription_not_found',
  'subscription_not_active',
  'subscription_not_current',
  'subscription_ended',
  'subscription_frozen',
  'cannot_freeze',
  'cannot_change_plan',
  'invalid_freeze_dates',
  'already_frozen',
  'freeze_too_long',
  'freeze_not_found',
  'freeze_exists',
  'not_frozen',
  'same_plan',
  'credit_exceeds_price',
  'same_member',
  'refund_too_large',
  'invalid_refund',
] as const;

/** Why loading subscriptions or a sale failed, as a key of subscriptions:errors. */
export type SubscriptionErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/**
 * Sorts a failed load or sale into a key: a guard's key (the error's message), no connection, or a
 * refusal without a key. Anything else is logged.
 */
export function subscriptionErrorKey(error: unknown, action: string): SubscriptionErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  // RLS, or a privilege the role lacks: no key of its own.
  if (code === '42501') return 'permission_denied';
  // A check constraint or a bad value: the form checks the same rules first.
  if (code === '23514' || code === '22023' || code === '22P02' || code === '22007') {
    return 'invalid_request';
  }
  logError(error, { area: 'subscriptions', action });
  return 'unexpected';
}
