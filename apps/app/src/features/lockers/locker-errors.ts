import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for lockers (supabase/migrations/20261028200000_lockers.sql). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_inactive',
  'locker_not_found',
  'locker_out_of_order',
  'locker_wrong_kind',
  'locker_taken',
  'locker_wrong_zone',
  'locker_in_use',
  'locker_number_taken',
  'invalid_locker',
  'member_not_found',
  'member_archived',
  'member_not_active',
  'already_has_locker',
  'visit_not_found',
  'assignment_not_found',
  'already_released',
  'not_a_rental',
  'invalid_rental',
  'locker_price_not_set',
  'invalid_payment',
  'payment_too_large',
  'gym_read_only',
] as const;

/** Why a locker action failed, as a key of lockers:errors. */
export type LockerErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed locker call into a key; anything unexpected is logged. */
export function lockerErrorKey(error: unknown, action: string): LockerErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'lockers', action });
  return 'unexpected';
}
