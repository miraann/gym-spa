import {
  LicenseKeyError,
  keyRingOf,
  normalizeMachineCode,
  signActivation,
  signLicense,
  staffEmail,
  verifyActivationCode,
  verifyLicenseCode,
  type License,
  type LicenseSigningKey,
} from '@gym/core';
import {
  AddressTaken,
  DatabaseError,
  RowsNotWritten,
  generateTemporaryPassword,
  summarizeError,
  withAddressFreed,
  writeRowsOrUndo,
} from '@gym/staff-admin/server';
import { SellerAdminError, type SellerAdminErrorKey } from './errors.ts';
import type { SellerAdminLog, SellerAdminPort, SellerCallerPort } from './ports.ts';
import type {
  AddAdminRequest,
  AddAdminResult,
  AdminChangeResult,
  CreateGymRequest,
  CreateGymResult,
  DeactivateAdminRequest,
  IssueActivationRequest,
  IssueActivationResult,
  IssueLicenseRequest,
  IssueLicenseResult,
  ReactivateAdminRequest,
  ResetAdminPasswordRequest,
  ResetAdminPasswordResult,
  ResetAdminTwoStepRequest,
  UseRecoveryCodeRequest,
  UseRecoveryCodeResult,
} from './requests.ts';

// The seller panel's operations that need the Auth admin API (spec §2.6, step MT-3). Like the staff
// module's (design B), each one:
//   1. checks the request under the platform admin's own session, before anything changes (the
//      database also checks for an active platform admin with two-step login);
//   2. changes the login with Supabase Auth's admin API (the secret key);
//   3. writes the rows and the seller log entry under the platform admin's session again.
// Auth and the database can't share a transaction, so a failed step 3 undoes step 2 where it can.
// Everything else the panel does (subscription dates, suspend, lock, ...) is a database function it
// calls directly.

export interface SellerAdminDeps {
  readonly admin: SellerAdminPort;
  readonly caller: SellerCallerPort;
  readonly log: SellerAdminLog;
  /** The signed-in platform admin: the checked token's user. */
  readonly callerId: string;
  /** Tests pass a fixed one; otherwise generateTemporaryPassword. */
  readonly temporaryPassword?: () => string;
  /** Tests pass fixed ids; otherwise crypto.randomUUID. */
  readonly newId?: () => string;
  /**
   * The license signing key (the LICENSE_SIGNING_KEY secret, checked by importLicenseSigningKey).
   * Absent: issuing answers license_key_missing, and everything else works.
   */
  readonly licenseKey?: () => Promise<LicenseSigningKey>;
}

/** Keys the database raises (migrations 20261010100500 and 20261010100600) that the panel explains. */
const DATABASE_KEYS = new Set<SellerAdminErrorKey>([
  'not_platform_admin',
  'mfa_required',
  'password_change_required',
  'invalid_request',
  'invalid_gym_code',
  'reserved_gym_code',
  'gym_code_taken',
  'invalid_username',
  'invalid_email',
  'email_taken',
  'admin_not_found',
  'cannot_change_own_admin',
  'last_platform_admin',
  'gym_not_found',
  'online_gym',
  'invalid_license_date',
  'invalid_machine_code',
  'no_license',
  'already_activated',
]);

function isDatabaseKey(value: string): value is SellerAdminErrorKey {
  return (DATABASE_KEYS as ReadonlySet<string>).has(value);
}

interface RefusalContext {
  readonly action: string;
  readonly fallback: SellerAdminErrorKey;
  /** The key for a unique violation (another request took the code or address a moment ago). */
  readonly taken?: SellerAdminErrorKey;
  readonly userId?: string;
  readonly gymId?: string;
}

/**
 * The key for an error from a port. Errors the module can't explain are logged, and become the
 * fallback key.
 */
function refusal(deps: SellerAdminDeps, error: unknown, context: RefusalContext): SellerAdminError {
  if (error instanceof SellerAdminError) return error;
  if (error instanceof DatabaseError) {
    if (isDatabaseKey(error.message)) return new SellerAdminError(error.message, { cause: error });
    // The session is missing, invalid or expired (PostgREST's JWT errors).
    if (error.status === 401 || error.code?.startsWith('PGRST30')) {
      return new SellerAdminError('unauthorized', { cause: error });
    }
    if (error.code === '23505' && context.taken !== undefined) {
      return new SellerAdminError(context.taken, { cause: error });
    }
    // No privilege: never a platform admin's session.
    if (error.code === '42501') return new SellerAdminError('not_platform_admin', { cause: error });
  }
  deps.log({
    event: 'unexpected_error',
    action: context.action,
    ...(context.userId === undefined ? {} : { userId: context.userId }),
    ...(context.gymId === undefined ? {} : { gymId: context.gymId }),
    error: summarizeError(error),
  });
  return new SellerAdminError(context.fallback, { cause: error });
}

function authFailed(
  deps: SellerAdminDeps,
  action: string,
  userId: string,
  error: unknown,
): SellerAdminError {
  deps.log({ event: 'auth_update_failed', action, userId, error: summarizeError(error) });
  return new SellerAdminError('auth_update_failed', { cause: error });
}

function recordFailed(
  deps: SellerAdminDeps,
  action: string,
  userId: string,
  error: unknown,
): SellerAdminError {
  deps.log({ event: 'record_failed', action, userId, error: summarizeError(error) });
  return new SellerAdminError('record_failed', { cause: error });
}

function newId(deps: SellerAdminDeps): string {
  return deps.newId ? deps.newId() : crypto.randomUUID();
}

function temporaryPassword(deps: SellerAdminDeps): string {
  return (deps.temporaryPassword ?? generateTemporaryPassword)();
}

// Gyms ------------------------------------------------------------------------------------------

/**
 * A new online gym with its first Owner. The gym's rows are written only after the Owner's login
 * exists, all in one transaction, so a gym never exists without its Owner; when they fail, the
 * login is deleted again.
 */
export async function createGym(
  deps: SellerAdminDeps,
  request: CreateGymRequest,
): Promise<CreateGymResult> {
  const { action, code, owner } = request;
  try {
    await deps.caller.prepareCreateGym(code, owner.username);
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', taken: 'gym_code_taken' });
  }

  const gymId = newId(deps);
  const email = staffEmail(owner.username, code);
  const password = temporaryPassword(deps);
  let ownerId: string;
  try {
    ownerId = await withAddressFreed(
      {
        email,
        // A login the panel made for a gym that was never made (staff_admin_orphan decides).
        findOrphan: (address) => deps.admin.findOrphanLogin(address),
        deleteLogin: (id) => deps.admin.deleteLogin(id),
        onOrphanDeleted: (id) => {
          deps.log({ event: 'orphan_login_deleted', action, userId: id, gymId, email });
        },
      },
      () => deps.admin.createLogin({ email, password, gymId }),
    );
  } catch (error) {
    // Only a gym with the same code being made at this moment holds a new gym's Owner address.
    if (error instanceof AddressTaken) {
      throw new SellerAdminError('gym_code_taken', { cause: error });
    }
    throw refusal(deps, error, { action, fallback: 'gym_create_failed', gymId });
  }

  try {
    await writeRowsOrUndo(
      ownerId,
      () =>
        deps.caller.createGym({
          gymId,
          code,
          nameCkb: request.nameCkb,
          nameEn: request.nameEn ?? null,
          nameAr: request.nameAr ?? null,
          firstBranchName: request.firstBranchName,
          paidUntil: request.paidUntil,
          ownerId,
          ownerUsername: owner.username,
          ownerFullName: owner.fullName,
          ownerPhone: owner.phone ?? null,
        }),
      (id) => deps.admin.deleteLogin(id),
      (undoError, cause) => {
        deps.log({
          event: 'compensation_failed',
          action,
          userId: ownerId,
          gymId,
          email,
          error: summarizeError(undoError),
          cause: summarizeError(cause),
        });
      },
    );
  } catch (error) {
    if (!(error instanceof RowsNotWritten)) throw error;
    if (!error.undone) throw new SellerAdminError('gym_create_failed', { cause: error.cause });
    throw refusal(deps, error.cause, {
      action,
      fallback: 'gym_create_failed',
      taken: 'gym_code_taken',
      userId: ownerId,
      gymId,
    });
  }

  return { gymId, code, ownerId, ownerUsername: owner.username, temporaryPassword: password };
}

// Platform admins -------------------------------------------------------------------------------

/** Another platform admin, with a temporary password; they choose their own and set up two-step login next. */
export async function addAdmin(
  deps: SellerAdminDeps,
  request: AddAdminRequest,
): Promise<AddAdminResult> {
  const { action, email } = request;
  try {
    await deps.caller.prepareAddAdmin(email);
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', taken: 'email_taken' });
  }

  const password = temporaryPassword(deps);
  let userId: string;
  try {
    userId = await withAddressFreed(
      {
        email,
        findOrphan: (address) => deps.admin.findAdminOrphan(address),
        deleteLogin: (id) => deps.admin.deleteLogin(id),
        onOrphanDeleted: (id) => {
          deps.log({ event: 'orphan_login_deleted', action, userId: id, email });
        },
      },
      () => deps.admin.createAdminLogin({ email, password }),
    );
  } catch (error) {
    if (error instanceof AddressTaken) throw new SellerAdminError('email_taken', { cause: error });
    throw refusal(deps, error, { action, fallback: 'admin_create_failed' });
  }

  try {
    await writeRowsOrUndo(
      userId,
      () => deps.caller.addAdmin(userId, request.fullName),
      (id) => deps.admin.deleteLogin(id),
      (undoError, cause) => {
        deps.log({
          event: 'compensation_failed',
          action,
          userId,
          email,
          error: summarizeError(undoError),
          cause: summarizeError(cause),
        });
      },
    );
  } catch (error) {
    if (!(error instanceof RowsNotWritten)) throw error;
    if (!error.undone) throw new SellerAdminError('admin_create_failed', { cause: error.cause });
    throw refusal(deps, error.cause, {
      action,
      fallback: 'admin_create_failed',
      taken: 'email_taken',
      userId,
    });
  }

  return { userId, email, temporaryPassword: password };
}

/**
 * The account first: that alone ends their access to every seller function at once. The ban then
 * stops logins and token refreshes. If the ban fails, the account stays deactivated, and
 * deactivating again finishes it.
 */
export async function deactivateAdmin(
  deps: SellerAdminDeps,
  request: DeactivateAdminRequest,
): Promise<AdminChangeResult> {
  const { action, userId } = request;
  try {
    await deps.caller.setAdminActive(userId, false);
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', userId });
  }
  try {
    await deps.admin.setBanned(userId, true);
  } catch (error) {
    throw authFailed(deps, action, userId, error);
  }
  return { userId };
}

export async function reactivateAdmin(
  deps: SellerAdminDeps,
  request: ReactivateAdminRequest,
): Promise<AdminChangeResult> {
  const { action, userId } = request;
  try {
    await deps.caller.prepareAdminChange(userId, 'reactivate');
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', userId });
  }
  try {
    await deps.admin.setBanned(userId, false);
  } catch (error) {
    throw authFailed(deps, action, userId, error);
  }
  try {
    await deps.caller.setAdminActive(userId, true);
  } catch (error) {
    // Undo: an inactive account keeps a banned login.
    try {
      await deps.admin.setBanned(userId, true);
    } catch (undoError) {
      deps.log({
        event: 'compensation_failed',
        action,
        userId,
        error: summarizeError(undoError),
        cause: summarizeError(error),
      });
    }
    throw refusal(deps, error, { action, fallback: 'unexpected', userId });
  }
  return { userId };
}

/**
 * Removes another admin's two-step device (they lost their phone): they set up a new one at their
 * next login. The record voids their recovery codes too. If it fails, doing it again finishes it.
 */
export async function resetAdminTwoStep(
  deps: SellerAdminDeps,
  request: ResetAdminTwoStepRequest,
): Promise<AdminChangeResult> {
  const { action, userId } = request;
  try {
    await deps.caller.prepareAdminChange(userId, 'reset_two_step');
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', userId });
  }
  try {
    await deps.admin.removeTwoStep(userId);
  } catch (error) {
    throw authFailed(deps, action, userId, error);
  }
  try {
    await deps.caller.recordAdminChange(userId, 'reset_two_step');
  } catch (error) {
    throw recordFailed(deps, action, userId, error);
  }
  return { userId };
}

/**
 * A temporary password for another admin, shown once. It ends their sessions; the record makes
 * them choose their own at the next login. If the record fails, resetting again is safe: the old
 * password no longer works either way.
 */
export async function resetAdminPassword(
  deps: SellerAdminDeps,
  request: ResetAdminPasswordRequest,
): Promise<ResetAdminPasswordResult> {
  const { action, userId } = request;
  try {
    await deps.caller.prepareAdminChange(userId, 'reset_password');
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', userId });
  }
  const password = temporaryPassword(deps);
  try {
    await deps.admin.setPassword(userId, password);
  } catch (error) {
    throw authFailed(deps, action, userId, error);
  }
  try {
    await deps.caller.recordAdminChange(userId, 'reset_password');
  } catch (error) {
    throw recordFailed(deps, action, userId, error);
  }
  return { userId, temporaryPassword: password };
}

/**
 * The signed-in admin lost their two-step device and uses a recovery code: the database checks it,
 * uses it up and logs it; then their old device is removed so they can set up a new one. If Auth
 * fails after that, the code stays used (logged); they use another one.
 */
export async function useRecoveryCode(
  deps: SellerAdminDeps,
  request: UseRecoveryCodeRequest,
): Promise<UseRecoveryCodeResult> {
  const { action } = request;
  let answer;
  try {
    answer = await deps.caller.useRecoveryCode(request.code);
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', userId: deps.callerId });
  }
  if (answer !== 'ok') throw new SellerAdminError(answer);

  try {
    // The same user the database just checked: both come from the one verified token.
    await deps.admin.removeTwoStep(deps.callerId);
  } catch (error) {
    throw authFailed(deps, action, deps.callerId, error);
  }
  return { result: 'ok' };
}

// Offline licenses ------------------------------------------------------------------------------
// Spec §2.6, step MT-5. Like creating a gym: the database checks the request under the platform
// admin's session before the key is touched; then the code is signed and checked with the key's
// public half; then the database checks everything again and stores it only when the code's
// payload equals the fields, with the log entry. No Auth call, and nothing to undo: a code that
// isn't stored is never answered.

/** The signing key, or license_key_missing. Why a key can't be used is logged, never the key. */
async function signingKey(deps: SellerAdminDeps, action: string): Promise<LicenseSigningKey> {
  if (deps.licenseKey === undefined) throw new SellerAdminError('license_key_missing');
  try {
    return await deps.licenseKey();
  } catch (error) {
    deps.log({
      event: 'license_key_unusable',
      action,
      keyProblem: error instanceof LicenseKeyError ? error.problem : 'unexpected',
    });
    throw new SellerAdminError('license_key_missing', { cause: error });
  }
}

/** A code that fails its own key's check is never handed out (a broken key or runtime). */
function signedWrongly(deps: SellerAdminDeps, action: string, gymId: string): SellerAdminError {
  deps.log({
    event: 'unexpected_error',
    action,
    gymId,
    error: { name: 'SignatureCheckFailed', message: 'a new code failed its key check' },
  });
  return new SellerAdminError('unexpected');
}

export async function issueLicense(
  deps: SellerAdminDeps,
  request: IssueLicenseRequest,
): Promise<IssueLicenseResult> {
  const { action, gymId, type, maxBranches, maxDevices, validUntil } = request;
  let prepared;
  try {
    prepared = await deps.caller.prepareLicense({
      gymId,
      type,
      maxBranches,
      maxDevices,
      validUntil,
    });
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', gymId });
  }

  const key = await signingKey(deps, action);
  const license: License = {
    licenseId: newId(deps),
    kid: key.kid,
    gymId,
    gymCode: prepared.gymCode,
    gymName: prepared.gymName,
    type,
    maxBranches,
    maxDevices,
    features: [],
    issuedOn: prepared.issuedOn,
    expiresOn: type === 'yearly' ? validUntil : null,
    updatesUntil: type === 'perpetual' ? validUntil : null,
  };
  const code = await signLicense(license, key);
  if (!(await verifyLicenseCode(code, keyRingOf(key))).ok) throw signedWrongly(deps, action, gymId);

  try {
    await deps.caller.issueLicense(license, code);
  } catch (error) {
    throw refusal(deps, error, { action, fallback: 'unexpected', gymId });
  }
  return { licenseId: license.licenseId, code };
}

export async function issueActivation(
  deps: SellerAdminDeps,
  request: IssueActivationRequest,
): Promise<IssueActivationResult> {
  const { action, gymId } = request;
  const machineCode = normalizeMachineCode(request.machineCode);
  if (machineCode === null) throw new SellerAdminError('invalid_machine_code');
  let prepared;
  try {
    prepared = await deps.caller.prepareActivation(gymId, machineCode);
  } catch (error) {
    throw refusal(deps, error, {
      action,
      fallback: 'unexpected',
      taken: 'already_activated',
      gymId,
    });
  }

  const key = await signingKey(deps, action);
  const activation = {
    activationId: newId(deps),
    kid: key.kid,
    gymId,
    machineCode: prepared.machineCode,
    issuedOn: prepared.issuedOn,
  };
  const code = await signActivation(activation, key);
  if (!(await verifyActivationCode(code, keyRingOf(key))).ok) {
    throw signedWrongly(deps, action, gymId);
  }

  try {
    await deps.caller.issueActivation(activation, code);
  } catch (error) {
    throw refusal(deps, error, {
      action,
      fallback: 'unexpected',
      taken: 'already_activated',
      gymId,
    });
  }
  return { activationId: activation.activationId, code };
}
