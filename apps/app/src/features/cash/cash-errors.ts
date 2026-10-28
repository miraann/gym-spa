import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for the cash register (supabase/migrations/20261029200000_cash_register.sql). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_inactive',
  'gym_read_only',
  'shift_exists',
  'shift_open',
  'invalid_shift',
  'shift_not_found',
  'movement_exists',
  'shift_closed',
  'invalid_cash_movement',
  'invalid_count',
] as const;

/** Why a cash register call failed, as a key of cash:errors. */
export type CashErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed cash register call into a key; anything unexpected is logged. */
export function cashErrorKey(error: unknown, action: string): CashErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'cash', action });
  return 'unexpected';
}
