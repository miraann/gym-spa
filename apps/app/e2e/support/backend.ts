// Test data in the local Supabase (`pnpm db:start`) for the end-to-end tests of
// the web and Windows apps. Each test creates its own branch and staff and removes them after, so
// tests don't depend on the demo data, on your local accounts, or on each other.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Database } from '@gym/db';
import { createClient } from '@supabase/supabase-js';

interface LocalStatus {
  API_URL: string;
  SECRET_KEY: string;
  PUBLISHABLE_KEY: string;
}

let adminClient: ReturnType<typeof createClient<Database>> | undefined;
let localStatus: LocalStatus | undefined;

function status(): LocalStatus {
  if (localStatus) return localStatus;
  let output: string;
  try {
    output = execSync(
      'pnpm --silent --filter @gym/supabase exec supabase status --output json --workdir ..',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    throw new Error('Local Supabase is not running. Start it with pnpm db:start.');
  }
  localStatus = JSON.parse(output) as LocalStatus;
  return localStatus;
}

/** A Supabase client with the local secret key (tests only; never in the app). */
export function admin() {
  adminClient ??= createClient<Database>(status().API_URL, status().SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Sets a staff member's PIN the way the app does: right after their password login. */
async function setPinAs(email: string, password: string, pin: string): Promise<void> {
  const client = createClient<Database>(status().API_URL, status().PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(signIn.error.message);
  await write(client.rpc('set_my_pin', { p_pin: pin }));
  await client.auth.signOut({ scope: 'local' });
}

/** The data of a Supabase call; throws on an error or when nothing came back. */
async function check<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<NonNullable<T>> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) throw new Error('No data');
  return data;
}

/** Runs a write; throws on an error. */
export async function write(promise: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(error.message);
}

export interface TestStaff {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly password: string;
  /** Set on the server unless the staff member must choose one at first login. */
  readonly pin: string | null;
}

export interface StaffOptions {
  readonly role?: string;
  readonly branchIds: readonly string[];
  readonly mustChangePassword?: boolean;
  /** false: no PIN yet (first login asks for one) */
  readonly withPin?: boolean;
  readonly fullName?: string;
}

/** Creates branches and staff, and removes everything it made in cleanup(). */
export class TestData {
  private readonly run = randomUUID().slice(0, 8);
  private readonly branchIds: string[] = [];
  private readonly staffIds: string[] = [];
  private count = 0;

  async branch(): Promise<string> {
    const codes = await check(admin().from('branches').select('code'));
    const used = new Set(codes.map((row) => row.code));
    // Random, so parallel tests don't pick the same free code.
    for (;;) {
      const code = `B${String(100 + Math.floor(Math.random() * 900))}`;
      if (used.has(code)) continue;
      const { data, error } = await admin()
        .from('branches')
        .insert({ code, name_ckb: `لقی تاقیکردنەوە ${code}` })
        .select('id')
        .single();
      // 23505: another test took the code. 23503: another test deleted its branch while this
      // insert gave the all-branches staff access to every branch (a hard delete, tests only).
      if (error?.code === '23505' || error?.code === '23503') continue;
      if (error) throw new Error(error.message);
      this.branchIds.push(data.id);
      return data.id;
    }
  }

  async staff(options: StaffOptions): Promise<TestStaff> {
    this.count += 1;
    const username = `e2e_${this.run}_${String(this.count)}`;
    const password = `E2e-pass-${this.run}`;
    const fullName = options.fullName ?? `کارمەندی تاقیکردنەوە ${String(this.count)}`;
    const email = `${username}@staff.gym-spa.invalid`;
    const created = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw new Error(created.error.message);
    const id = created.data.user.id;
    this.staffIds.push(id);

    const role = await check(
      admin()
        .from('roles')
        .select('id')
        .eq('key', options.role ?? 'receptionist')
        .single(),
    );
    // The secret key runs as the system, so the insert keeps must_change_password as given.
    await write(
      admin()
        .from('staff_users')
        .insert({
          id,
          username,
          full_name: fullName,
          role_id: role.id,
          must_change_password: options.mustChangePassword ?? false,
        }),
    );
    for (const branchId of options.branchIds) {
      await write(admin().from('staff_branches').insert({ staff_id: id, branch_id: branchId }));
    }
    let pin: string | null = null;
    if (options.withPin ?? true) {
      pin = '482917';
      await setPinAs(email, password, pin);
    }
    return { id, username, fullName, password, pin };
  }

  async cleanup(): Promise<void> {
    const db = admin();
    // Test data only. Real staff and branches are never deleted.
    await db.from('staff_pins').delete().in('staff_id', this.staffIds);
    await db.from('settings').delete().in('branch_id', this.branchIds);
    await db.from('staff_branches').delete().in('staff_id', this.staffIds);
    await db.from('staff_users').delete().in('id', this.staffIds);
    for (const id of this.staffIds) await db.auth.admin.deleteUser(id);
    await db.from('devices').delete().in('branch_id', this.branchIds);
    await db.from('branches').delete().in('id', this.branchIds);
  }
}
