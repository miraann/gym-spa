import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for members (the guards and the member functions). */
const DATABASE_ERROR_KEYS = [
  'phone_in_use',
  'contact_phone_required',
  'invalid_birth_date',
  'reason_required',
  'member_archived',
  'member_not_found',
  'no_branch_access',
  'branch_inactive',
  'permission_denied',
  'gym_read_only',
  'invalid_photo',
] as const;

/** Why a members screen's load or change failed, as a key of members:errors. */
export type MemberErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/**
 * Sorts a failed load or change into a key: a guard's key (the error's message), no connection, or
 * a refusal without a key. Anything else is logged.
 */
export function memberErrorKey(error: unknown, action: string): MemberErrorKey {
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
  logError(error, { area: 'members', action });
  return 'unexpected';
}
