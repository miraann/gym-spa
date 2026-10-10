import { staffEmail } from '@gym/core';
import type { Database } from '@gym/db';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

// Test data in a real Supabase (the local one), for the staff module's integration tests: Node
// (staff-admin.int.test.ts, the module itself) and Deno (supabase/functions/staff-admin/
// http.test.ts, through the served Edge Function). No Node or Deno APIs here, so both can use it.
// Each TestGym makes its own gym and removes it, with every login in it, afterwards.

export interface Backend {
  readonly url: string;
  readonly publishableKey: string;
  readonly secretKey: string;
}

export type Client = SupabaseClient<Database>;

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** A client with the secret key (tests only). */
export function adminClient(backend: Backend): Client {
  return createClient<Database>(backend.url, backend.secretKey, { auth: NO_SESSION });
}

export function publicClient(backend: Backend): Client {
  return createClient<Database>(backend.url, backend.publishableKey, { auth: NO_SESSION });
}

export interface TestStaff {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

export interface SignedIn {
  readonly client: Client;
  readonly session: Session;
}

/** A supabase-js result that worked. */
type Success<R> = Extract<R, { error: null }>;

/** Throws on an error, returns the data. */
async function ok<R extends { data: unknown; error: { message: string } | null }>(
  promise: PromiseLike<R>,
): Promise<Success<R>['data']> {
  const result = await promise;
  if (result.error) throw new Error(result.error.message);
  return (result as Success<R>).data;
}

export class TestGym {
  private constructor(
    private readonly backend: Backend,
    readonly id: string,
    readonly code: string,
  ) {}

  static async create(backend: Backend, label: string): Promise<TestGym> {
    const code = `${label}-${crypto.randomUUID().slice(0, 8)}`;
    const gym = await ok(
      adminClient(backend).rpc('create_gym', {
        p_code: code,
        p_name_ckb: `جیمی تاقیکردنەوە ${code}`,
        p_first_branch_name: 'لقی یەکەم',
      }),
    );
    await ok(
      adminClient(backend)
        .from('branches')
        .insert({ gym_id: gym.id, code: 'B2', name_ckb: 'لقی دووەم' }),
    );
    return new TestGym(backend, gym.id, code);
  }

  get admin(): Client {
    return adminClient(this.backend);
  }

  async roleId(key: string): Promise<string> {
    const role = await ok(
      this.admin.from('roles').select('id').eq('gym_id', this.id).eq('key', key).single(),
    );
    return role.id;
  }

  async branchId(code: string): Promise<string> {
    const branch = await ok(
      this.admin.from('branches').select('id').eq('gym_id', this.id).eq('code', code).single(),
    );
    return branch.id;
  }

  email(username: string): string {
    return staffEmail(username, this.code);
  }

  /** A staff member made the way bootstrap:admin makes the first Owner. */
  async addStaff(
    username: string,
    roleKey: string,
    options: { readonly allBranches?: boolean; readonly branches?: readonly string[] } = {},
  ): Promise<TestStaff> {
    const email = this.email(username);
    const password = `Test-${crypto.randomUUID()}`;
    const created = await ok(
      this.admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    const id = created.user.id;
    await ok(
      this.admin.from('staff_users').insert({
        id,
        gym_id: this.id,
        username,
        full_name: `کارمەند ${username}`,
        role_id: await this.roleId(roleKey),
        all_branches: options.allBranches ?? false,
        must_change_password: false,
      }),
    );
    for (const code of options.branches ?? []) {
      await ok(
        this.admin
          .from('staff_branches')
          .insert({ gym_id: this.id, staff_id: id, branch_id: await this.branchId(code) }),
      );
    }
    return { id, username, email, password };
  }

  /** The staff row, read with the secret key. */
  async staffRow(id: string) {
    return ok(
      this.admin
        .from('staff_users')
        .select('username, is_active, must_change_password, all_branches, gym_id, created_by')
        .eq('id', id)
        .maybeSingle(),
    );
  }

  /** The login with this address, if there is one. */
  async login(email: string) {
    for (let page = 1; ; page += 1) {
      const { users } = await ok(this.admin.auth.admin.listUsers({ page, perPage: 1000 }));
      const found = users.find((user) => user.email === email);
      if (found || users.length < 1000) return found ?? null;
    }
  }

  /** Suspends the gym (read-only), or ends the suspension. */
  async suspend(suspended: boolean): Promise<void> {
    await ok(
      this.admin
        .from('gyms')
        .update({ suspended_at: suspended ? new Date().toISOString() : null })
        .eq('id', this.id),
    );
  }

  /** Removes the gym, its rows and every login of it. Test data only. */
  async cleanup(): Promise<void> {
    const admin = this.admin;
    for (const table of ['staff_pins', 'settings', 'staff_branches', 'staff_users'] as const) {
      await ok(admin.from(table).delete().eq('gym_id', this.id));
    }
    const suffix = `@${this.code}.staff.gym-spa.invalid`;
    for (let page = 1; ; page += 1) {
      const { users } = await ok(admin.auth.admin.listUsers({ page, perPage: 1000 }));
      for (const user of users) {
        if (user.email?.endsWith(suffix)) await ok(admin.auth.admin.deleteUser(user.id));
      }
      if (users.length < 1000) break;
    }
    for (const table of [
      'device_status',
      'devices',
      'branches',
      'role_permissions',
      'roles',
    ] as const) {
      await ok(admin.from(table).delete().eq('gym_id', this.id));
    }
    await ok(admin.from('gyms').delete().eq('id', this.id));
  }
}

/** Logs in like the app does; throws with Auth's error code when it fails. */
export async function signIn(backend: Backend, email: string, password: string): Promise<SignedIn> {
  const client = publicClient(backend);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new LoginFailed(error.code ?? error.message);
  return { client, session: data.session };
}

export class LoginFailed extends Error {
  override readonly name = 'LoginFailed';
}

/** The Auth error code of a login attempt, or 'ok'. */
export async function loginResult(
  backend: Backend,
  email: string,
  password: string,
): Promise<string> {
  try {
    await signIn(backend, email, password);
    return 'ok';
  } catch (error) {
    if (error instanceof LoginFailed) return error.message;
    throw error;
  }
}

/** A request to the staff-admin endpoint, as the app sends it. */
export function staffAdminRequest(base: string, token: string | null, body: unknown): Request {
  return new Request(`${base}/functions/v1/staff-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}
