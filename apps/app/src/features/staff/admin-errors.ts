import { isStaffAdminErrorKey } from '@gym/staff-admin';
import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';
import { StaffAdminCallError, type StaffAdminCallErrorKey } from './staff-admin-api';

/**
 * Keys the database raises for roles, branches and devices (the guards and the admin functions);
 * the staff module's keys come from packages/staff-admin, and the database uses the same names for
 * the staff rules.
 */
const DATABASE_ERROR_KEYS = [
  'cannot_edit_role',
  'cannot_edit_own_role',
  'cannot_grant_permission',
  'system_role_read_only',
  'owner_has_all_permissions',
  'role_in_use',
  'role_deleted',
  'unknown_permission',
  'last_active_branch',
  'gym_branch_limit',
  'branch_code_exhausted',
  'branch_inactive',
  'gym_device_limit',
  'device_not_accessible',
  'device_code_exhausted',
  'not_allowed',
] as const;

type DatabaseErrorKey = (typeof DATABASE_ERROR_KEYS)[number];

/** Why an admin screen's change failed, as a key of staff:errors. */
export type AdminErrorKey = StaffAdminCallErrorKey | DatabaseErrorKey;

function isDatabaseErrorKey(value: unknown): value is DatabaseErrorKey {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/**
 * Sorts a failed change into a key: the staff module's own errors, a guard's key (the error's
 * message), no connection, or a refusal without a key. Anything else is logged.
 */
export function adminErrorKey(error: unknown, action: string): AdminErrorKey {
  if (error instanceof StaffAdminCallError) return error.key;
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isStaffAdminErrorKey(message) || isDatabaseErrorKey(message)) return message;
  // RLS, or a privilege the role lacks: no key of its own.
  if (code === '42501') return 'permission_denied';
  // A check constraint or a bad value: the forms check the same rules first.
  if (code === '23514' || code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'staff', action });
  return 'unexpected';
}
