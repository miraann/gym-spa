// A smoke test of the staff module (step MT-2) on a real project, done as a gym's Owner through
// the staff-admin function, the way the app will do it:
//
//   pnpm smoke:staff-admin --remote   the project in supabase/.env.local
//   pnpm smoke:staff-admin            local Supabase (`pnpm db:start`, and `pnpm db:functions`)
//
// It logs in as the Owner, creates the receptionist smoke.test, checks that its temporary password
// logs in and must be changed, deactivates it, and checks that its login is then refused.
// smoke.test stays, deactivated (staff accounts are never deleted); its id is printed.
//
// Passwords are never printed or stored: the Owner types theirs hidden, and the temporary password
// stays in memory. Only the public (publishable) key is used, never the secret key.
//
// Asks for what isn't given. For automation: --gym, --owner, --staff (default smoke.test), and
// the Owner's password in SMOKE_OWNER_PASSWORD.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs, parseEnv } from 'node:util';
import {
  isValidGymCode,
  isValidUsername,
  normalizeGymCode,
  normalizeUsername,
  staffEmail,
} from '@gym/core';
import type { Database } from '@gym/db';
import {
  createStaffResult,
  staffAdminFailure,
  staffChangeResult,
  type StaffAdminRequest,
} from '@gym/staff-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { fail, localSupabase, readHidden, run, ScriptError } from './script-support';

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    gym: { type: 'string' },
    owner: { type: 'string' },
    staff: { type: 'string', default: 'smoke.test' },
  },
});

/** Values that must never reach the screen. Every line goes through hide(). */
const secrets: string[] = [];

function hide(text: string): string {
  return secrets.reduce((out, secret) => (secret ? out.replaceAll(secret, '[hidden]') : out), text);
}

function say(line: string): void {
  console.log(hide(line));
}

function stop(message: string): never {
  fail(hide(message));
}

interface Connection {
  readonly url: string;
  readonly publishableKey: string;
}

/**
 * The project's address and its publishable key. Remote: SUPABASE_URL from supabase/.env.local,
 * and SUPABASE_PUBLISHABLE_KEY there or the app's VITE_SUPABASE_PUBLISHABLE_KEY (apps/app/.env.local)
 * when that file names the same project.
 */
function connection(): Connection {
  if (!args.remote) {
    const { url, publishableKey } = localSupabase();
    return { url, publishableKey };
  }
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Not there: the variables may come from the environment instead.
  }
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (!url) stop('Set SUPABASE_URL in supabase/.env.local (see supabase/.env.example).');

  let publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    let app: Record<string, string | undefined> = {};
    try {
      app = parseEnv(readFileSync('../apps/app/.env.local', 'utf8'));
    } catch {
      // Not there either: the message below says what to set.
    }
    if (app.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '') === url) {
      publishableKey = app.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
    }
  }
  if (!publishableKey) {
    stop(
      'Set SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) in supabase/.env.local, or make apps/app/.env.local point at the same project.',
    );
  }
  return { url, publishableKey };
}

type Client = SupabaseClient<Database>;

function newClient({ url, publishableKey }: Connection): Client {
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** One call to the staff-admin function with the Owner's session, as the app makes it. */
async function callStaffAdmin<T>(
  { url, publishableKey }: Connection,
  token: string,
  request: StaffAdminRequest,
  result: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${url}/functions/v1/staff-admin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = staffAdminFailure.safeParse(body);
    const key = failure.success ? failure.data.error : 'no readable answer';
    const hint =
      key === 'username_taken'
        ? ` (left from an earlier run? Pass --staff with another username.)`
        : '';
    stop(`staff-admin refused "${request.action}": ${String(response.status)} ${key}${hint}`);
  }
  const parsed = result.safeParse(body);
  if (!parsed.success) stop(`staff-admin gave an unexpected answer to "${request.action}".`);
  return parsed.data;
}

async function ask(): Promise<{ gymCode: string; owner: string; password: string }> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let gymCode: string;
  let owner: string;
  try {
    gymCode = normalizeGymCode(args.gym ?? (await prompt.question('Gym code: ')));
    owner = normalizeUsername(args.owner ?? (await prompt.question("Owner's username: ")));
  } finally {
    prompt.close();
  }
  if (!isValidGymCode(gymCode)) stop(`"${gymCode}" is not a gym code.`);
  if (!isValidUsername(owner)) stop(`"${owner}" is not a username.`);
  const password =
    process.env.SMOKE_OWNER_PASSWORD ??
    (await readHidden("Owner's password (not shown): ", 'SMOKE_OWNER_PASSWORD'));
  secrets.push(password);
  return { gymCode, owner, password };
}

async function main() {
  const project = connection();
  say(`Supabase: ${project.url}`);
  const staffUsername = normalizeUsername(args.staff);
  if (!isValidUsername(staffUsername)) stop(`"${staffUsername}" is not a username.`);
  const { gymCode, owner, password } = await ask();

  const ownerClient = newClient(project);
  const login = await ownerClient.auth.signInWithPassword({
    email: staffEmail(owner, gymCode),
    password,
  });
  if (login.error) stop(`The Owner could not log in: ${login.error.code ?? login.error.message}`);
  say(`✔ Logged in as "${owner}" of gym "${gymCode}"`);
  const token = login.data.session.access_token;

  try {
    const role = await ownerClient
      .from('roles')
      .select('id')
      .eq('key', 'receptionist')
      .is('deleted_at', null)
      .single();
    if (role.error) stop(`Could not read the receptionist role: ${role.error.message}`);
    const branch = await ownerClient
      .from('branches')
      .select('id, code')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('code')
      .limit(1)
      .single();
    if (branch.error) stop(`Could not read a branch: ${branch.error.message}`);

    const created = await callStaffAdmin(
      project,
      token,
      {
        action: 'create',
        username: staffUsername,
        fullName: 'تاقیکردنەوەی خێرا',
        roleId: role.data.id,
        allBranches: false,
        branchIds: [branch.data.id],
      },
      createStaffResult,
    );
    secrets.push(created.temporaryPassword);
    say(`✔ Created "${staffUsername}" in branch ${branch.data.code}: staff id ${created.staffId}`);
    say('✔ Temporary password received');

    const staffLogin = staffEmail(staffUsername, gymCode);
    try {
      const staffClient = newClient(project);
      const first = await staffClient.auth.signInWithPassword({
        email: staffLogin,
        password: created.temporaryPassword,
      });
      if (first.error) {
        stop(`The temporary password did not log in: ${first.error.code ?? first.error.message}`);
      }
      say('✔ The temporary password logs in');
      const own = await staffClient
        .from('staff_users')
        .select('must_change_password')
        .eq('id', created.staffId)
        .single();
      await staffClient.auth.signOut({ scope: 'local' });
      if (own.error)
        stop(`${staffUsername} could not read their own account: ${own.error.message}`);
      if (!own.data.must_change_password) stop('must_change_password is not set.');
      say('✔ must_change_password is set');
    } finally {
      // Whatever happened above, the test account doesn't stay active.
      await callStaffAdmin(
        project,
        token,
        { action: 'deactivate', staffId: created.staffId },
        staffChangeResult,
      );
      say(`✔ Deactivated "${staffUsername}"`);
    }

    const again = await newClient(project).auth.signInWithPassword({
      email: staffLogin,
      password: created.temporaryPassword,
    });
    if (!again.error) stop(`"${staffUsername}" can still log in after deactivation.`);
    if (again.error.code !== 'user_banned') {
      stop(`The login was refused, but not as banned: ${again.error.code ?? again.error.message}`);
    }
    say('✔ Its login is refused (user_banned)');
    const row = await ownerClient
      .from('staff_users')
      .select('is_active')
      .eq('id', created.staffId)
      .single();
    if (row.error || row.data.is_active) stop('The account is not shown as inactive.');
    say('✔ The account is inactive');

    say(`\nSmoke test passed. "${staffUsername}" stays deactivated. Staff id: ${created.staffId}`);
  } finally {
    // Ends only this session of the Owner, not their other devices.
    await ownerClient.auth.signOut({ scope: 'local' });
  }
}

await run(async () => {
  try {
    await main();
  } catch (error) {
    if (error instanceof ScriptError) throw error;
    // Anything unexpected is shown without the secrets.
    stop(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
});
