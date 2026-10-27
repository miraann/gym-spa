import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for check-in, checking out and voiding (a refusal is an answer). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_inactive',
  'member_not_found',
  'device_not_found',
  'invalid_request',
  'gym_read_only',
  'visit_not_found',
  'visit_voided',
  'already_voided',
  'reason_required',
] as const;

/** Why a check-in failed, as a key of checkin:errors. */
export type CheckinErrorKey = (typeof DATABASE_ERROR_KEYS)[number] | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed check-in into a key; anything unexpected is logged. */
export function checkinErrorKey(error: unknown, action: string): CheckinErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'checkin', action });
  return 'unexpected';
}
