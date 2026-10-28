import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for personal training (supabase/migrations/20261028900000_personal_training.sql). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_inactive',
  'gym_read_only',
  'invalid_pt_package',
  'member_package_exists',
  'pt_package_not_found',
  'pt_package_inactive',
  'pt_package_not_usable',
  'trainer_not_found',
  'member_not_found',
  'member_archived',
  'no_sessions_left',
  'invalid_pt_session',
  'session_exists',
  'session_not_found',
  'reason_required',
  'invalid_payment',
  'payment_too_large',
] as const;

/** Why a PT call failed, as a key of pt:errors. */
export type PtErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed HR call into a key; anything unexpected is logged. */
export function ptErrorKey(error: unknown, action: string): PtErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'pt', action });
  return 'unexpected';
}
