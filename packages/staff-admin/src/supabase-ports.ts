import type { Database } from '@gym/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  AuthAdminError,
  DatabaseError,
  type AdminPort,
  type CallerPort,
  type ChangePermit,
  type CreatePermit,
} from './ports.ts';

// The ports on top of supabase-js: the same code in the Edge Function (Deno) and in gym-server and
// the tests (Node).

type Client = SupabaseClient<Database>;

/** Long enough to mean "until reactivated" (the same as Auth's own "forever"). */
const BAN_FOREVER = '876000h';

interface AuthFailure {
  readonly message: string;
  readonly code?: string | undefined;
  readonly status?: number | undefined;
}

function authFailed(error: AuthFailure): AuthAdminError {
  return new AuthAdminError(error.code ?? null, error.status ?? null, error.message);
}

interface PostgrestFailure {
  readonly error: { readonly message: string; readonly code: string } | null;
  readonly status: number;
}

function databaseFailed({ error, status }: PostgrestFailure): DatabaseError {
  return new DatabaseError(error?.message ?? 'no_result', error?.code ?? null, status);
}

/** An admin port with a client that holds the secret key. */
export function supabaseAdminPort(client: Client): AdminPort {
  const update = async (
    id: string,
    attributes: Parameters<Client['auth']['admin']['updateUserById']>[1],
  ) => {
    const { error } = await client.auth.admin.updateUserById(id, attributes);
    if (error) throw authFailed(error);
  };

  return {
    async createLogin({ email, password, gymId }) {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        // No mail is ever sent: the address is on a domain that can't receive any.
        email_confirm: true,
        app_metadata: { gym_id: gymId },
      });
      if (error) throw authFailed(error);
      return data.user.id;
    },
    async deleteLogin(id) {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) throw authFailed(error);
    },
    setPassword: (id, password) => update(id, { password }),
    setEmail: (id, email) => update(id, { email, email_confirm: true }),
    setBanned: (id, banned) => update(id, { ban_duration: banned ? BAN_FOREVER : 'none' }),
    async findOrphanLogin(email) {
      const result = await client.rpc('staff_admin_orphan', { p_email: email });
      if (result.error) throw databaseFailed(result);
      // The generated type says string; the function returns null when there is none.
      const id: unknown = result.data;
      return typeof id === 'string' ? id : null;
    },
  };
}

/** A caller port with a client that sends the manager's own token. */
export function supabaseCallerPort(client: Client): CallerPort {
  /** An update of one staff row; refused when RLS hides the row (no row changes). */
  const updateStaff = async (
    staffId: string,
    values: Database['public']['Tables']['staff_users']['Update'],
  ) => {
    const result = await client
      .from('staff_users')
      .update(values, { count: 'exact' })
      .eq('id', staffId);
    if (result.error) throw databaseFailed(result);
    if (result.count !== 1) throw new DatabaseError('cannot_manage_staff', null, result.status);
  };

  return {
    async prepareCreate(check): Promise<CreatePermit> {
      const result = await client
        .rpc('staff_admin_prepare_create', {
          p_username: check.username,
          p_role_id: check.roleId,
          p_all_branches: check.allBranches,
          p_branch_ids: [...check.branchIds],
        })
        .single();
      if (result.error) throw databaseFailed(result);
      return { gymId: result.data.gym_id, gymCode: result.data.gym_code };
    },
    async prepareChange(staffId, action, newUsername): Promise<ChangePermit> {
      const result = await client
        .rpc('staff_admin_prepare_change', {
          p_staff_id: staffId,
          p_action: action,
          ...(newUsername === undefined ? {} : { p_new_username: newUsername }),
        })
        .single();
      if (result.error) throw databaseFailed(result);
      return {
        gymCode: result.data.gym_code,
        username: result.data.username,
        isActive: result.data.is_active,
      };
    },
    async createProfile(profile) {
      const result = await client.rpc('create_staff_profile', {
        p_id: profile.id,
        p_username: profile.username,
        p_full_name: profile.fullName,
        p_role_id: profile.roleId,
        p_all_branches: profile.allBranches,
        p_branch_ids: [...profile.branchIds],
        ...(profile.phone === null ? {} : { p_phone: profile.phone }),
      });
      if (result.error) throw databaseFailed(result);
    },
    setActive: (staffId, active) => updateStaff(staffId, { is_active: active }),
    requirePasswordChange: (staffId) => updateStaff(staffId, { must_change_password: true }),
    setUsername: (staffId, username) => updateStaff(staffId, { username }),
  };
}

export interface StaffAdminConfig {
  readonly url: string;
  /** The publishable (anon) key: the manager's requests go with it and their own token. */
  readonly publishableKey: string;
  /** The secret (service role) key. Only on the server: never in the app or in git. */
  readonly secretKey: string;
}

/** Headers of the app's request that the audit log reads (app.request_ip, app.request_device_id). */
const FORWARDED_HEADERS = ['x-device-id', 'x-forwarded-for'] as const;

/** The two ports of the handler, on a Supabase project (cloud, local, or the gym's server PC). */
export function supabaseStaffAdminPorts(config: StaffAdminConfig): {
  readonly admin: AdminPort;
  readonly callerFor: (token: string, request: Request) => CallerPort;
} {
  const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const adminClient = createClient<Database>(config.url, config.secretKey, { auth: noSession });

  return {
    admin: supabaseAdminPort(adminClient),
    callerFor(token, request) {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      for (const name of FORWARDED_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      return supabaseCallerPort(
        createClient<Database>(config.url, config.publishableKey, {
          auth: noSession,
          global: { headers },
        }),
      );
    },
  };
}
