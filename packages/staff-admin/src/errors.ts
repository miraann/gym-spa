/**
 * Why a staff-admin request failed: a stable key the app translates (staff:errors in
 * packages/i18n), with the HTTP status the server answers with. The database raises most of them
 * with the same name (migration 20261010100400_staff_admin, and the guards).
 */
export const STAFF_ADMIN_ERROR_STATUS = {
  /** No staff session, or it has ended. */
  unauthorized: 401,
  method_not_allowed: 405,
  /** The request isn't one the module knows (it never comes from the app's own forms). */
  invalid_request: 400,
  invalid_username: 400,
  branches_required: 400,
  /** Needs the staff.manage permission. */
  permission_denied: 403,
  gym_read_only: 403,
  cannot_manage_staff: 403,
  cannot_edit_own_account: 403,
  cannot_grant_role: 403,
  cannot_grant_all_branches: 403,
  no_branch_access: 403,
  username_taken: 409,
  /** Nothing was created (or the half-made login could not be removed; that is logged). */
  staff_create_failed: 500,
  /** The account didn't change (or the change could not be undone; that is logged). */
  staff_update_failed: 500,
  /** Supabase Auth refused or failed to change the login. */
  auth_update_failed: 502,
  /** The password was reset, but the account could not be marked "must change"; reset again. */
  must_change_not_set: 500,
  unexpected: 500,
} as const satisfies Record<string, number>;

export type StaffAdminErrorKey = keyof typeof STAFF_ADMIN_ERROR_STATUS;

export const STAFF_ADMIN_ERROR_KEYS = Object.keys(STAFF_ADMIN_ERROR_STATUS) as StaffAdminErrorKey[];

export function isStaffAdminErrorKey(value: unknown): value is StaffAdminErrorKey {
  return typeof value === 'string' && Object.hasOwn(STAFF_ADMIN_ERROR_STATUS, value);
}

export class StaffAdminError extends Error {
  override readonly name = 'StaffAdminError';
  constructor(
    readonly key: StaffAdminErrorKey,
    options?: ErrorOptions,
  ) {
    super(key, options);
  }

  get status(): number {
    return STAFF_ADMIN_ERROR_STATUS[this.key];
  }
}
