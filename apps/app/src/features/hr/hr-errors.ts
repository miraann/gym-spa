import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for HR (supabase/migrations/20261028700000_staff_hr.sql). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'gym_read_only',
  'invalid_staff_profile',
  'invalid_card_uid',
  'card_in_use',
  'card_exists',
  'staff_card_not_found',
  'already_clocked_in',
  'not_clocked_in',
  'clock_not_found',
  'reason_required',
  'invalid_shift',
  'shift_overlaps',
  'shift_not_found',
  'card_not_staff',
  'staff_inactive',
  'staff_wrong_branch',
] as const;

/** Why an HR call failed, as a key of hr:errors. */
export type HrErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed HR call into a key; anything unexpected is logged. */
export function hrErrorKey(error: unknown, action: string): HrErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'hr', action });
  return 'unexpected';
}
