/**
 * Why a seller-admin request failed: a stable key the seller panel translates, with the HTTP status
 * the server answers with. The database raises most of them with the same name (migrations
 * 20261010100500_platform_admins and 20261010100600_seller_gyms).
 */
export const SELLER_ADMIN_ERROR_STATUS = {
  /** No session, or it has ended. */
  unauthorized: 401,
  method_not_allowed: 405,
  /** The request isn't one the module knows (it never comes from the panel's own forms). */
  invalid_request: 400,
  /** Not an active platform admin (gym staff, anyone else). */
  not_platform_admin: 403,
  /** The session hasn't passed two-step login (aal2). */
  mfa_required: 403,
  /** The admin still has a password someone else chose. */
  password_change_required: 403,
  invalid_gym_code: 400,
  reserved_gym_code: 400,
  gym_code_taken: 409,
  invalid_username: 400,
  invalid_email: 400,
  email_taken: 409,
  admin_not_found: 404,
  /** Nobody changes their own platform admin account in the panel. */
  cannot_change_own_admin: 403,
  last_platform_admin: 409,
  wrong_code: 400,
  /** 5 wrong recovery codes in 15 minutes. */
  too_many_attempts: 429,
  /** Offline licenses (step MT-5, migration 20261029900000_licenses). */
  gym_not_found: 404,
  /** Only an offline gym has licenses. */
  online_gym: 409,
  /** A yearly license ends within 2 years, perpetual updates within 5, both after today. */
  invalid_license_date: 400,
  /** The machine code has the wrong length or its check doesn't match (a typo). */
  invalid_machine_code: 400,
  /** Activating needs a license that isn't revoked. */
  no_license: 409,
  /** The gym already has an active server PC: deactivate it first. */
  already_activated: 409,
  /** The function has no signing key, or one it refuses to use (the reason is logged). */
  license_key_missing: 503,
  /** Nothing was created (or the half-made login could not be removed; that is logged). */
  gym_create_failed: 500,
  admin_create_failed: 500,
  /** Supabase Auth refused or failed to change the login. */
  auth_update_failed: 502,
  /** The login changed, but the seller log or the account row didn't; do it again to finish. */
  record_failed: 500,
  unexpected: 500,
} as const satisfies Record<string, number>;

export type SellerAdminErrorKey = keyof typeof SELLER_ADMIN_ERROR_STATUS;

export const SELLER_ADMIN_ERROR_KEYS = Object.keys(
  SELLER_ADMIN_ERROR_STATUS,
) as SellerAdminErrorKey[];

export function isSellerAdminErrorKey(value: unknown): value is SellerAdminErrorKey {
  return typeof value === 'string' && Object.hasOwn(SELLER_ADMIN_ERROR_STATUS, value);
}

export class SellerAdminError extends Error {
  override readonly name = 'SellerAdminError';
  constructor(
    readonly key: SellerAdminErrorKey,
    options?: ErrorOptions,
  ) {
    super(key, options);
  }

  get status(): number {
    return SELLER_ADMIN_ERROR_STATUS[this.key];
  }
}
