import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for support access. */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'support_offline',
  'invalid_request',
  'reason_required',
  'support_already_granted',
  'grant_not_found',
] as const;

/** Why loading or changing support access failed, as a key of support:errors. */
export type SupportErrorKey = (typeof DATABASE_ERROR_KEYS)[number] | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed load or change into a key; anything unexpected is logged. */
export function supportErrorKey(error: unknown, action: string): SupportErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023') return 'invalid_request';
  logError(error, { area: 'support', action });
  return 'unexpected';
}
