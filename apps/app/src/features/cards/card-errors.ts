import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for cards (the card functions and the guard). */
const DATABASE_ERROR_KEYS = [
  'invalid_card_uid',
  'card_in_use',
  'card_blocked',
  'member_has_card',
  'card_not_found',
  'card_not_active',
  'card_not_blocked',
  'card_reassigned',
  'same_card',
  'member_archived',
  'member_not_found',
  'reason_required',
  'permission_denied',
  'gym_read_only',
  'invalid_request',
] as const;

/** Why a card screen's load or change failed, as a key of cards:errors. */
export type CardErrorKey = (typeof DATABASE_ERROR_KEYS)[number] | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/**
 * Sorts a failed load or change into a key: a guard's key (the error's message), no connection, or
 * a refusal without a key. Anything else is logged.
 */
export function cardErrorKey(error: unknown, action: string): CardErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  // RLS, or a privilege the role lacks: no key of its own.
  if (code === '42501') return 'permission_denied';
  if (code === '23514' || code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'cards', action });
  return 'unexpected';
}
