import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for templates, reminders and messages. */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'invalid_template',
  'reminder_not_found',
  'member_not_found',
  'wrong_phone',
  'invalid_message',
  'message_exists',
  'no_branch_access',
  'gym_read_only',
] as const;

/** Why loading or changing failed, as a key of notifications:errors. */
export type NotificationErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed load or change into a key; anything unexpected is logged. */
export function notificationErrorKey(error: unknown, action: string): NotificationErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '23514' || code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'notifications', action });
  return 'unexpected';
}
