import { isGymAccess, isValidGymCode, normalizePin, resolvePermissions } from '@gym/core';
import { isLanguage, type Language } from '@gym/i18n';
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { AppSupabaseClient } from '@/lib/backend';
import { logError } from '@/lib/logger';
import type { DeviceGym } from './device-gym';

// The server calls of login and the PIN, made with the staff member's own session. RLS and the
// server functions decide what each one may read or change.

/** A stable key the login screens translate. */
export type AuthErrorKey =
  | 'invalid_credentials'
  /** The same, on the first login of a device, where the gym code was typed too. */
  | 'invalid_gym_credentials'
  | 'account_inactive'
  | 'no_branch_access'
  | 'too_many_requests'
  | 'network'
  | 'same_password'
  | 'weak_password'
  /** Setting a PIN needs a recent password login. */
  | 'password_login_required'
  /** Click Group locked the gym: nobody of it can use the app. */
  | 'gym_locked'
  /** The gym is read-only (suspended, or its subscription ended): nothing can be added or changed. */
  | 'gym_read_only'
  | 'not_configured'
  | 'unexpected';

export class AuthFlowError extends Error {
  override readonly name = 'AuthFlowError';
  constructor(
    readonly key: AuthErrorKey,
    options?: ErrorOptions,
  ) {
    super(key, options);
  }
}

/** Sorts what Supabase Auth or PostgREST threw into a key the app can explain. */
export function toAuthError(error: unknown): AuthFlowError {
  if (error instanceof AuthFlowError) return error;
  if (isAuthRetryableFetchError(error)) return new AuthFlowError('network', { cause: error });
  if (isAuthApiError(error)) {
    if (error.code === 'invalid_credentials') return new AuthFlowError('invalid_credentials');
    if (error.code === 'same_password') return new AuthFlowError('same_password');
    if (error.code === 'weak_password') return new AuthFlowError('weak_password');
    if (error.status === 429 || error.code === 'over_request_rate_limit') {
      return new AuthFlowError('too_many_requests');
    }
  }
  // fetch() itself failed: no network, DNS, connection refused.
  if (error instanceof TypeError) return new AuthFlowError('network', { cause: error });
  return new AuthFlowError('unexpected', { cause: error });
}

/** The reason a login step failed, for the screen. Unexpected errors are logged with their details. */
export function authErrorKey(error: unknown, action: string): AuthErrorKey {
  const { key } = toAuthError(error);
  if (key === 'unexpected') logError(error, { area: 'auth', action });
  return key;
}

/** Server errors (a stable key as the message) that the login screens explain themselves. */
const SERVER_ERROR_KEYS = ['password_login_required', 'gym_read_only'] as const;

function failIfError(result: { error: unknown }): void {
  if (!result.error) return;
  const { error } = result;
  const serverKey = SERVER_ERROR_KEYS.find(
    (key) => typeof error === 'object' && 'message' in error && error.message === key,
  );
  if (serverKey) throw new AuthFlowError(serverKey, { cause: error });
  // PostgREST returns network failures as an error object, not a thrown TypeError.
  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.includes('fetch')
  ) {
    throw new AuthFlowError('network', { cause: error });
  }
  throw new AuthFlowError('unexpected', { cause: error });
}

interface RoleRow {
  readonly key: string | null;
  readonly deleted_at: string | null;
}

/** The staff member's role if it still exists. Can be null at runtime (RLS), whatever the type says. */
function activeRole(role: RoleRow | null): RoleRow | null {
  return role?.deleted_at === null ? role : null;
}

/** What the server says about a staff member, read with their own session. */
export interface StaffProfile {
  readonly staffId: string;
  readonly username: string;
  readonly fullName: string;
  readonly roleId: string;
  readonly permissions: readonly string[];
  readonly preferredLanguage: Language | null;
  readonly mustChangePassword: boolean;
  /** False: no PIN yet, or a manager removed it. */
  readonly hasPin: boolean;
  /** Too many wrong PINs; a password login clears it. */
  readonly pinLocked: boolean;
}

/** null: no active account (deactivated, removed, or the row isn't visible to them). */
export async function fetchProfile(
  client: AppSupabaseClient,
  staffId: string,
): Promise<StaffProfile | null> {
  const staff = await client
    .from('staff_users')
    .select(
      'id, username, full_name, role_id, preferred_language, is_active, must_change_password, deleted_at, roles(key, deleted_at)',
    )
    .eq('id', staffId)
    .maybeSingle();
  failIfError(staff);
  const row = staff.data;
  if (!row || !row.is_active || row.deleted_at !== null) return null;
  const role = activeRole(row.roles);

  const [rolePermissions, catalog, pin] = await Promise.all([
    client.from('role_permissions').select('permission_key').eq('role_id', row.role_id),
    client.from('permissions').select('key'),
    client.from('staff_pins').select('staff_id, locked_at').eq('staff_id', staffId).maybeSingle(),
  ]);
  failIfError(rolePermissions);
  failIfError(catalog);
  failIfError(pin);

  return {
    staffId: row.id,
    username: row.username,
    fullName: row.full_name,
    roleId: row.role_id,
    permissions: resolvePermissions(
      role?.key ?? null,
      (rolePermissions.data ?? []).map((each) => each.permission_key),
      (catalog.data ?? []).map((each) => each.key),
    ),
    preferredLanguage: isLanguage(row.preferred_language) ? row.preferred_language : null,
    mustChangePassword: row.must_change_password,
    hasPin: pin.data !== null,
    pinLocked: pin.data?.locked_at != null,
  };
}

/** The signed-in staff member's gym and its access state (also when it is locked). */
export async function fetchGym(client: AppSupabaseClient): Promise<DeviceGym | null> {
  const result = await client.rpc('my_gym').maybeSingle();
  failIfError(result);
  return parseServerGym(result.data);
}

/** Reads a my_gym() row; null when there is none (the staff member isn't active). */
export function parseServerGym(data: unknown): DeviceGym | null {
  if (typeof data !== 'object' || data === null) return null;
  const row: Partial<
    Record<'id' | 'code' | 'name_ckb' | 'name_en' | 'name_ar' | 'access', unknown>
  > = data;
  const { id, code, access } = row;
  if (
    typeof id !== 'string' ||
    typeof code !== 'string' ||
    !isValidGymCode(code) ||
    typeof row.name_ckb !== 'string' ||
    !isGymAccess(access)
  ) {
    throw new AuthFlowError('unexpected', { cause: data });
  }
  return {
    id,
    code,
    nameCkb: row.name_ckb,
    nameEn: typeof row.name_en === 'string' ? row.name_en : null,
    nameAr: typeof row.name_ar === 'string' ? row.name_ar : null,
    access,
  };
}

export interface BranchChoice {
  readonly id: string;
  readonly code: string;
  readonly nameCkb: string;
  readonly nameEn: string | null;
  readonly nameAr: string | null;
}

/** The active branches the staff member can access. */
export async function fetchBranches(client: AppSupabaseClient): Promise<BranchChoice[]> {
  const result = await client
    .from('branches')
    .select('id, code, name_ckb, name_en, name_ar')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('code');
  failIfError(result);
  return (result.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    nameCkb: row.name_ckb,
    nameEn: row.name_en,
    nameAr: row.name_ar,
  }));
}

/** A staff member's session, if it can be used right now. */
export async function usableSession(
  client: AppSupabaseClient,
): Promise<'ready' | 'unavailable' | 'ended'> {
  const { data, error } = await client.auth.getSession();
  if (data.session) return 'ready';
  // The server didn't answer: the session is kept and tried again later.
  if (error && isAuthRetryableFetchError(error)) return 'unavailable';
  return 'ended';
}

/** Sets the signed-in staff member's PIN. The server hashes it; it works on all their devices. */
export async function setPin(client: AppSupabaseClient, pin: string): Promise<void> {
  failIfError(await client.rpc('set_my_pin', { p_pin: normalizePin(pin) }));
}

/** Clears a PIN lockout after a password login (the server checks that the login came after it). */
export async function clearPinLockout(client: AppSupabaseClient): Promise<void> {
  failIfError(await client.rpc('clear_my_pin_lockout'));
}

export type PinCheck =
  | {
      readonly result:
        'ok' | 'locked_out' | 'no_pin' | 'no_branch_access' | 'inactive' | 'gym_locked';
    }
  | { readonly result: 'wrong_pin'; readonly triesLeft: number };

/** Asks the server whether the PIN is right; it counts wrong tries on every device. */
export async function checkPin(
  client: AppSupabaseClient,
  pin: string,
  branchId: string,
): Promise<PinCheck> {
  const response = await client.rpc('unlock_with_pin', {
    p_pin: normalizePin(pin),
    p_branch_id: branchId,
  });
  failIfError(response);
  return parsePinCheck(response.data);
}

export function parsePinCheck(data: unknown): PinCheck {
  if (typeof data !== 'object' || data === null || !('result' in data)) {
    throw new AuthFlowError('unexpected', { cause: data });
  }
  const { result } = data;
  if (result === 'wrong_pin') {
    const triesLeft = 'tries_left' in data ? data.tries_left : null;
    if (typeof triesLeft === 'number') return { result, triesLeft };
  }
  if (
    result === 'ok' ||
    result === 'locked_out' ||
    result === 'no_pin' ||
    result === 'no_branch_access' ||
    result === 'inactive' ||
    result === 'gym_locked'
  ) {
    return { result };
  }
  throw new AuthFlowError('unexpected', { cause: data });
}

/** Changes the signed-in staff member's password. The server then clears must_change_password. */
export async function changePassword(client: AppSupabaseClient, password: string): Promise<void> {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw toAuthError(error);
}
