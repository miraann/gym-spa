import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for classes (supabase/migrations/20261028800000_classes.sql). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_inactive',
  'gym_read_only',
  'invalid_class_type',
  'class_type_not_found',
  'trainer_not_found',
  'invalid_class_schedule',
  'class_not_found',
  'not_a_class_day',
  'class_cancelled',
  'class_over',
  'member_not_found',
  'member_not_active',
  'no_membership',
  'already_booked',
  'booking_exists',
  'booking_not_found',
  'class_attended',
  'invalid_status_change',
  'too_early',
  'reason_required',
] as const;

/** Why a class call failed, as a key of classes:errors. */
export type ClassErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed HR call into a key; anything unexpected is logged. */
export function classErrorKey(error: unknown, action: string): ClassErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'classes', action });
  return 'unexpected';
}
