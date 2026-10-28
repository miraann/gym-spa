import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for the spa (supabase/migrations/20261028400000_spa_setup.sql to 600000). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_inactive',
  'gym_read_only',
  'invalid_spa_service',
  'invalid_spa_room',
  'spa_room_name_taken',
  'invalid_therapist',
  'invalid_hours',
  'spa_service_not_found',
  'staff_not_found',
  'staff_already_therapist',
  'invalid_spa_package',
  'invalid_spa_sessions',
  'plan_not_found',
  'spa_package_not_found',
  'spa_package_inactive',
  'member_package_exists',
  'member_not_found',
  'member_archived',
  'member_not_active',
  'phone_in_use',
  'member_exists',
  'invalid_guest',
  'spa_booking_exists',
  'spa_booking_not_found',
  'spa_service_inactive',
  'spa_wrong_gender',
  'invalid_spa_booking',
  'spa_room_not_found',
  'spa_room_inactive',
  'spa_room_wrong_kind',
  'spa_room_taken',
  'spa_therapist_taken',
  'spa_member_busy',
  'therapist_required',
  'therapist_not_needed',
  'therapist_not_found',
  'therapist_inactive',
  'therapist_cant_do_service',
  'therapist_not_working',
  'spa_package_not_usable',
  'spa_plan_not_usable',
  'no_sessions_left',
  'spa_booking_closed',
  'invalid_status_change',
  'not_today',
  'invalid_payment',
  'payment_too_large',
] as const;

/** Why a spa call failed, as a key of spa:errors. */
export type SpaErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed spa call into a key; anything unexpected is logged. */
export function spaErrorKey(error: unknown, action: string): SpaErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'spa', action });
  return 'unexpected';
}

/** Errors after which the calendar should be read again (someone else changed it). */
export function spaErrorRefreshes(key: SpaErrorKey): boolean {
  return (
    key === 'spa_room_taken' ||
    key === 'spa_therapist_taken' ||
    key === 'spa_member_busy' ||
    key === 'spa_booking_not_found' ||
    key === 'spa_booking_closed' ||
    key === 'invalid_status_change'
  );
}
