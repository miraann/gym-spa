// Test data in the local Supabase (`pnpm db:start`) for the end-to-end tests of
// the web and Windows apps. Each test creates its own gym (with branches and staff) and removes it
// after, so tests don't depend on the demo data, on your local accounts, or on each other.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { staffEmail } from '@gym/core';
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

export interface TestGym {
  readonly id: string;
  readonly code: string;
  readonly nameCkb: string;
}

export interface TestStaff {
  readonly id: string;
  /** The code of their gym, which the first login on a device asks for. */
  readonly gymCode: string;
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

/**
 * A test's own gym (code e2e-<random>), made on first use with its roles and branch B1, plus the
 * branches and staff the test adds. cleanup() removes all of it.
 */
export class TestData {
  private readonly run = randomUUID().slice(0, 8);
  private created: Promise<TestGym> | undefined;
  private readonly staffIds: string[] = [];
  /** B1 comes with the gym; the test's own branches are B2, B3, ... */
  private branches = 1;
  private count = 0;

  /** The gym, created the first time a test needs it. */
  gym(): Promise<TestGym> {
    this.created ??= (async () => {
      const code = `e2e-${this.run}`;
      const nameCkb = `جیمی تاقیکردنەوە ${this.run}`;
      const gym = await check(
        admin().rpc('create_gym', {
          p_code: code,
          p_name_ckb: nameCkb,
          p_first_branch_name: 'لقی یەکەم',
        }),
      );
      return { id: gym.id, code, nameCkb };
    })();
    return this.created;
  }

  /** Changes the gym's subscription state, as Click Group's seller panel will (step MT-3). */
  async setGym(
    change: Pick<
      Database['public']['Tables']['gyms']['Update'],
      'paid_until' | 'suspended_at' | 'locked_at'
    >,
  ): Promise<void> {
    const gym = await this.gym();
    await write(admin().from('gyms').update(change).eq('id', gym.id));
  }

  async branch(): Promise<string> {
    const gym = await this.gym();
    this.branches += 1;
    const code = `B${String(this.branches)}`;
    const branch = await check(
      admin()
        .from('branches')
        .insert({ gym_id: gym.id, code, name_ckb: `لقی تاقیکردنەوە ${code}` })
        .select('id')
        .single(),
    );
    return branch.id;
  }

  async staff(options: StaffOptions): Promise<TestStaff> {
    const gym = await this.gym();
    this.count += 1;
    const username = `e2e_${this.run}_${String(this.count)}`;
    const password = `E2e-pass-${this.run}`;
    const fullName = options.fullName ?? `کارمەندی تاقیکردنەوە ${String(this.count)}`;
    const email = staffEmail(username, gym.code);
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
        .eq('gym_id', gym.id)
        .eq('key', options.role ?? 'receptionist')
        .single(),
    );
    // The secret key runs as the system, so the insert keeps must_change_password as given.
    await write(
      admin()
        .from('staff_users')
        .insert({
          id,
          gym_id: gym.id,
          username,
          full_name: fullName,
          role_id: role.id,
          must_change_password: options.mustChangePassword ?? false,
        }),
    );
    for (const branchId of options.branchIds) {
      await write(
        admin()
          .from('staff_branches')
          .insert({ gym_id: gym.id, staff_id: id, branch_id: branchId }),
      );
    }
    let pin: string | null = null;
    if (options.withPin ?? true) {
      pin = '482917';
      await setPinAs(email, password, pin);
    }
    return { id, gymCode: gym.code, username, fullName, password, pin };
  }

  /** Removes the test's gym and everything in it. Test data only: real data is never deleted. */
  async cleanup(): Promise<void> {
    if (!this.created) return;
    const { id: gymId } = await this.created;
    const db = admin();
    for (const table of ['staff_pins', 'settings', 'staff_branches', 'staff_users'] as const) {
      await write(db.from(table).delete().eq('gym_id', gymId));
    }
    for (const id of this.staffIds) await db.auth.admin.deleteUser(id);
    for (const table of [
      'device_status',
      'devices',
      'branches',
      'role_permissions',
      'roles',
    ] as const) {
      await write(db.from(table).delete().eq('gym_id', gymId));
    }
    await write(db.from('gyms').delete().eq('id', gymId));
  }
}
