import type { License, LicenseType } from '@gym/core';
import type { AdminPort, ErrorSummary } from '@gym/staff-admin/server';

// What the seller operations need from the outside, as small interfaces: Supabase clients in the
// Edge Function (supabase-ports.ts), fakes in the tests (testing.ts).

/**
 * The secret key's side: the staff module's Auth admin port (a new gym's Owner is a staff login),
 * plus what platform admin logins need.
 */
export interface SellerAdminPort extends AdminPort {
  /** A platform admin's login: a real address, marked app_metadata.platform_admin. Returns its id. */
  createAdminLogin(login: { readonly email: string; readonly password: string }): Promise<string>;
  /** public.platform_admin_orphan: a platform admin login left behind at this address, or null. */
  findAdminOrphan(email: string): Promise<string | null>;
  /** Removes every two-step device (TOTP factor) of this login. */
  removeTwoStep(id: string): Promise<void>;
}

/** A new gym and its first Owner, for public.seller_create_gym. */
export interface NewGym {
  readonly gymId: string;
  readonly code: string;
  readonly nameCkb: string;
  readonly nameEn: string | null;
  readonly nameAr: string | null;
  readonly firstBranchName: string;
  /** ISO time, or null for no end. */
  readonly paidUntil: string | null;
  readonly ownerId: string;
  readonly ownerUsername: string;
  readonly ownerFullName: string;
  readonly ownerPhone: string | null;
}

export type AdminChangeAction = 'deactivate' | 'reactivate' | 'reset_two_step' | 'reset_password';

export interface AdminChangePermit {
  readonly email: string;
  readonly isActive: boolean;
}

export type RecoveryCodeAnswer = 'ok' | 'wrong_code' | 'too_many_attempts';

/** What a license will be, for public.seller_prepare_license. */
export interface LicenseRequest {
  readonly gymId: string;
  readonly type: LicenseType;
  readonly maxBranches: number | null;
  readonly maxDevices: number | null;
  /** YYYY-MM-DD */
  readonly validUntil: string;
}

/** What the code will carry besides the request: the gym as it is now, and today in Baghdad. */
export interface PreparedLicense {
  readonly gymCode: string;
  readonly gymName: string;
  readonly issuedOn: string;
}

export interface PreparedActivation {
  /** Normalized, as it will be signed. */
  readonly machineCode: string;
  readonly issuedOn: string;
}

/**
 * The platform admin's side: every call runs under their own session, and every function checks
 * for an active platform admin with two-step login itself (app.require_platform_admin).
 */
export interface SellerCallerPort {
  /** public.seller_prepare_create_gym */
  prepareCreateGym(code: string, ownerUsername: string): Promise<void>;
  /** public.seller_create_gym: the gym, its roles, branch B1, the Owner and the log entry, all or none. */
  createGym(gym: NewGym): Promise<void>;
  /** public.seller_prepare_add_admin */
  prepareAddAdmin(email: string): Promise<void>;
  /** public.seller_add_admin */
  addAdmin(userId: string, fullName: string): Promise<void>;
  /** public.seller_prepare_admin_change */
  prepareAdminChange(userId: string, action: AdminChangeAction): Promise<AdminChangePermit>;
  /** public.seller_set_admin_active */
  setAdminActive(userId: string, active: boolean): Promise<void>;
  /** public.seller_record_admin_change */
  recordAdminChange(userId: string, action: 'reset_two_step' | 'reset_password'): Promise<void>;
  /** public.seller_use_recovery_code: for the signed-in admin. */
  useRecoveryCode(code: string): Promise<RecoveryCodeAnswer>;
  /** public.seller_prepare_license: checks everything before the key is used. */
  prepareLicense(request: LicenseRequest): Promise<PreparedLicense>;
  /** public.seller_issue_license: checks again, compares the code's payload, stores and logs it. */
  issueLicense(license: License, code: string): Promise<void>;
  /** public.seller_prepare_activation */
  prepareActivation(gymId: string, machineCode: string): Promise<PreparedActivation>;
  /** public.seller_issue_activation */
  issueActivation(
    activation: {
      activationId: string;
      gymId: string;
      machineCode: string;
      issuedOn: string;
      kid: string;
    },
    code: string,
  ): Promise<void>;
}

/**
 * Something an operator should know about. Entries never hold a password or a recovery code: they
 * carry ids, the login address, and summaries of errors.
 */
export interface SellerAdminLogEntry {
  readonly event:
    | 'orphan_login_deleted'
    | 'compensation_failed'
    | 'auth_update_failed'
    | 'record_failed'
    | 'license_key_unusable'
    | 'unexpected_error';
  readonly action: string;
  readonly userId?: string;
  readonly gymId?: string;
  readonly email?: string;
  readonly error?: ErrorSummary;
  /** Why the signing key can't be used (never any part of the key). */
  readonly keyProblem?: string;
  /** What failed first, when the clean-up after it failed too. */
  readonly cause?: ErrorSummary;
}

export type SellerAdminLog = (entry: SellerAdminLogEntry) => void;

/** One JSON line per entry on stderr, where the Edge Function's logs are read. */
export const consoleLog: SellerAdminLog = (entry) => {
  console.error(JSON.stringify({ source: 'seller-admin', ...entry }));
};
