import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for plans (the guards and save_plan). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_required',
  'branch_not_found',
  'plan_all_branches',
  'gym_read_only',
] as const;

/** Why loading or saving plans failed, as a key of plans:errors. */
export type PlanErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/**
 * Sorts a failed load or change into a key: a guard's key (the error's message), no connection, or
 * a refusal without a key. Anything else is logged.
 */
export function planErrorKey(error: unknown, action: string): PlanErrorKey {
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
  logError(error, { area: 'plans', action });
  return 'unexpected';
}
