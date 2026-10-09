import { parsePinHash, resolvePermissions, type PinHash } from '@gym/core';
import { isLanguage, type Language } from '@gym/i18n';
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { AppSupabaseClient } from '@/lib/backend';
import { logError } from '@/lib/logger';

// The online calls of login and the PIN, made with the staff member's own session. RLS decides
// what each one may read or change.

/** A stable key the login screens translate. */
export type AuthErrorKey =
  | 'invalid_credentials'
  | 'account_inactive'
  | 'no_branch_access'
  | 'too_many_requests'
  | 'network'
  | 'same_password'
  | 'weak_password'
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

function failIfError(result: { error: unknown }): void {
  if (!result.error) return;
  const { error } = result;
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
  /** null: no PIN yet, or a manager removed it. */
  readonly pin: PinHash | null;
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
    client
      .from('staff_pins')
      .select('algorithm, iterations, salt, hash')
      .eq('staff_id', staffId)
      .maybeSingle(),
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
    pin: parsePinHash(pin.data),
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

/** Saves the PIN hash for the signed-in staff member (it works on their other devices too). */
export async function savePin(
  client: AppSupabaseClient,
  staffId: string,
  pin: PinHash,
): Promise<void> {
  failIfError(
    await client
      .from('staff_pins')
      .upsert({ staff_id: staffId, ...pin }, { onConflict: 'staff_id' }),
  );
}

/** Changes the signed-in staff member's password. The server then clears must_change_password. */
export async function changePassword(client: AppSupabaseClient, password: string): Promise<void> {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw toAuthError(error);
}
