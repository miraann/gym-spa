import { staffEmail } from '@gym/core';
import { StaffAdminError, type StaffAdminErrorKey } from './errors.ts';
import {
  AuthAdminError,
  DatabaseError,
  summarizeError,
  type AdminPort,
  type CallerPort,
  type StaffAdminLog,
} from './ports.ts';
import type {
  CreateStaffRequest,
  CreateStaffResult,
  DeactivateStaffRequest,
  ReactivateStaffRequest,
  RenameStaffRequest,
  ResetPasswordRequest,
  ResetPasswordResult,
  StaffChangeResult,
} from './requests.ts';
import { generateTemporaryPassword } from './temporary-password.ts';

// The five staff operations (spec §2.5, design B). Each one:
//   1. checks the request under the manager's own session (staff_admin_prepare_*), before
//      anything changes;
//   2. changes the login with Supabase Auth's admin API (the secret key);
//   3. changes the staff rows under the manager's session, so RLS, the guards and the audit log
//      apply as usual.
// Auth and the database can't share a transaction, so when step 3 fails, step 2 is undone. If
// the undo fails too, the error is logged for an operator and the request fails.

export interface StaffAdminDeps {
  readonly admin: AdminPort;
  readonly caller: CallerPort;
  readonly log: StaffAdminLog;
  /** Tests pass a fixed one; otherwise generateTemporaryPassword. */
  readonly temporaryPassword?: () => string;
}

/** Keys the database raises (guards and staff_admin_prepare_*) that the app can explain. */
const DATABASE_KEYS = new Set<StaffAdminErrorKey>([
  'permission_denied',
  'gym_read_only',
  'invalid_request',
  'invalid_username',
  'username_taken',
  'branches_required',
  'cannot_manage_staff',
  'cannot_edit_own_account',
  'cannot_grant_role',
  'cannot_grant_all_branches',
  'no_branch_access',
]);

/**
 * The key for an error from a port. Errors the module can't explain are logged, and become the
 * fallback key.
 */
function refusal(
  deps: StaffAdminDeps,
  action: string,
  error: unknown,
  fallback: StaffAdminErrorKey,
  staffId?: string,
): StaffAdminError {
  if (error instanceof StaffAdminError) return error;
  if (error instanceof DatabaseError) {
    const key = error.message as StaffAdminErrorKey;
    if (DATABASE_KEYS.has(key)) return new StaffAdminError(key, { cause: error });
    // The session is missing, invalid or expired (PostgREST's JWT errors).
    if (error.status === 401 || error.code?.startsWith('PGRST30')) {
      return new StaffAdminError('unauthorized', { cause: error });
    }
    // Unique (gym_id, username): another request took the username a moment ago.
    if (error.code === '23505') return new StaffAdminError('username_taken', { cause: error });
    // A row level security policy (e.g. a role lost staff.manage a moment ago).
    if (error.code === '42501') return new StaffAdminError('permission_denied', { cause: error });
  }
  deps.log({
    event: 'unexpected_error',
    action,
    ...(staffId === undefined ? {} : { staffId }),
    error: summarizeError(error),
  });
  return new StaffAdminError(fallback, { cause: error });
}

function isEmailTaken(error: unknown): boolean {
  return error instanceof AuthAdminError && error.code === 'email_exists';
}

/**
 * Runs an Auth change that gives a login this address. When the address is taken by a login left
 * behind (public.staff_admin_orphan decides), that login is deleted and the change tried once
 * more. Only the id the database returned is ever deleted.
 */
async function withAddressFreed<T>(
  deps: StaffAdminDeps,
  action: string,
  email: string,
  change: () => Promise<T>,
): Promise<T> {
  try {
    return await change();
  } catch (error) {
    if (!isEmailTaken(error)) throw error;
  }

  const orphan = await deps.admin.findOrphanLogin(email);
  if (orphan === null) throw new StaffAdminError('username_taken');
  await deps.admin.deleteLogin(orphan);
  deps.log({ event: 'orphan_login_deleted', action, staffId: orphan, email });

  try {
    return await change();
  } catch (error) {
    if (isEmailTaken(error)) throw new StaffAdminError('username_taken', { cause: error });
    throw error;
  }
}

export async function createStaff(
  deps: StaffAdminDeps,
  request: CreateStaffRequest,
): Promise<CreateStaffResult> {
  const action = request.action;
  const branchIds = request.allBranches ? [] : request.branchIds;
  let permit;
  try {
    permit = await deps.caller.prepareCreate({
      username: request.username,
      roleId: request.roleId,
      allBranches: request.allBranches,
      branchIds,
    });
  } catch (error) {
    throw refusal(deps, action, error, 'unexpected');
  }

  const email = staffEmail(request.username, permit.gymCode);
  const temporaryPassword = (deps.temporaryPassword ?? generateTemporaryPassword)();
  let staffId: string;
  try {
    staffId = await withAddressFreed(deps, action, email, () =>
      deps.admin.createLogin({ email, password: temporaryPassword, gymId: permit.gymId }),
    );
  } catch (error) {
    throw refusal(deps, action, error, 'staff_create_failed');
  }

  try {
    await deps.caller.createProfile({
      id: staffId,
      username: request.username,
      fullName: request.fullName,
      phone: request.phone ?? null,
      roleId: request.roleId,
      allBranches: request.allBranches,
      branchIds,
    });
  } catch (error) {
    // Undo: a login without a staff account would keep the username blocked.
    try {
      await deps.admin.deleteLogin(staffId);
    } catch (undoError) {
      deps.log({
        event: 'compensation_failed',
        action,
        staffId,
        email,
        error: summarizeError(undoError),
        cause: summarizeError(error),
      });
      throw new StaffAdminError('staff_create_failed', { cause: error });
    }
    throw refusal(deps, action, error, 'staff_create_failed', staffId);
  }

  return { staffId, username: request.username, temporaryPassword };
}

export async function resetPassword(
  deps: StaffAdminDeps,
  request: ResetPasswordRequest,
): Promise<ResetPasswordResult> {
  const { action, staffId } = request;
  try {
    await deps.caller.prepareChange(staffId, action);
  } catch (error) {
    throw refusal(deps, action, error, 'unexpected', staffId);
  }

  const temporaryPassword = (deps.temporaryPassword ?? generateTemporaryPassword)();
  try {
    // Ends the staff member's sessions too. The database clears must_change_password on every
    // password change (app.clear_must_change_password), so it is set again after this.
    await deps.admin.setPassword(staffId, temporaryPassword);
  } catch (error) {
    deps.log({ event: 'auth_update_failed', action, staffId, error: summarizeError(error) });
    throw new StaffAdminError('auth_update_failed', { cause: error });
  }

  try {
    await deps.caller.requirePasswordChange(staffId);
  } catch (error) {
    // The old password no longer works, so nothing is lost: resetting again is safe.
    deps.log({ event: 'must_change_not_set', action, staffId, error: summarizeError(error) });
    throw new StaffAdminError('must_change_not_set', { cause: error });
  }
  return { staffId, temporaryPassword };
}

export async function deactivateStaff(
  deps: StaffAdminDeps,
  request: DeactivateStaffRequest,
): Promise<StaffChangeResult> {
  const { action, staffId } = request;
  try {
    await deps.caller.prepareChange(staffId, action);
    // First, because it alone ends their access to all data at once (app.current_gym_id).
    await deps.caller.setActive(staffId, false);
  } catch (error) {
    throw refusal(deps, action, error, 'staff_update_failed', staffId);
  }

  try {
    await deps.admin.setBanned(staffId, true);
  } catch (error) {
    // The account stays deactivated (safe); deactivating again bans the login.
    deps.log({ event: 'auth_update_failed', action, staffId, error: summarizeError(error) });
    throw new StaffAdminError('auth_update_failed', { cause: error });
  }
  return { staffId };
}

export async function reactivateStaff(
  deps: StaffAdminDeps,
  request: ReactivateStaffRequest,
): Promise<StaffChangeResult> {
  const { action, staffId } = request;
  try {
    await deps.caller.prepareChange(staffId, action);
  } catch (error) {
    throw refusal(deps, action, error, 'staff_update_failed', staffId);
  }

  try {
    await deps.admin.setBanned(staffId, false);
  } catch (error) {
    deps.log({ event: 'auth_update_failed', action, staffId, error: summarizeError(error) });
    throw new StaffAdminError('auth_update_failed', { cause: error });
  }

  try {
    await deps.caller.setActive(staffId, true);
  } catch (error) {
    // Undo: an inactive account keeps a banned login.
    try {
      await deps.admin.setBanned(staffId, true);
    } catch (undoError) {
      deps.log({
        event: 'compensation_failed',
        action,
        staffId,
        error: summarizeError(undoError),
        cause: summarizeError(error),
      });
    }
    throw refusal(deps, action, error, 'staff_update_failed', staffId);
  }
  return { staffId };
}

export async function renameStaff(
  deps: StaffAdminDeps,
  request: RenameStaffRequest,
): Promise<StaffChangeResult> {
  const { action, staffId, username } = request;
  let permit;
  try {
    permit = await deps.caller.prepareChange(staffId, action, username);
  } catch (error) {
    throw refusal(deps, action, error, 'staff_update_failed', staffId);
  }
  if (permit.username === username) return { staffId };

  const oldEmail = staffEmail(permit.username, permit.gymCode);
  const newEmail = staffEmail(username, permit.gymCode);
  try {
    await withAddressFreed(deps, action, newEmail, () => deps.admin.setEmail(staffId, newEmail));
  } catch (error) {
    if (error instanceof StaffAdminError) throw error;
    deps.log({ event: 'auth_update_failed', action, staffId, error: summarizeError(error) });
    throw new StaffAdminError('auth_update_failed', { cause: error });
  }

  try {
    // login_matches checks that the login has the new address already.
    await deps.caller.setUsername(staffId, username);
  } catch (error) {
    // Undo: the login gets its old address back, so the old username keeps working.
    try {
      await deps.admin.setEmail(staffId, oldEmail);
    } catch (undoError) {
      deps.log({
        event: 'compensation_failed',
        action,
        staffId,
        email: newEmail,
        error: summarizeError(undoError),
        cause: summarizeError(error),
      });
    }
    throw refusal(deps, action, error, 'staff_update_failed', staffId);
  }
  return { staffId };
}
