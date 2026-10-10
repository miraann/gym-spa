// Auth spike (throwaway): tries both staff admin designs against one backend and checks the result
// through real logins with Supabase Auth.
//   node spikes/windows-auth/staff-admin-test.mjs windows   the stack from spike.mjs (port 55421)
//   node spikes/windows-auth/staff-admin-test.mjs docker    the local Supabase (pnpm db:start)
//
// Design A: Postgres functions (staff-admin-a.sql), called by RPC with the manager's own session.
// Design B: Supabase Auth's admin API with the secret key, as an Edge Function (online) or a
//           gym-server endpoint (offline) would call it.
// Everything it creates is removed at the end, and the design A functions are dropped again.
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const { createClient } = createRequire(path.join(REPO, 'apps', 'app', 'package.json'))(
  '@supabase/supabase-js',
);

const target = process.argv[2];
if (target !== 'windows' && target !== 'docker')
  throw new Error('usage: staff-admin-test.mjs windows|docker');

let url, serviceKey, anonKey;
if (target === 'windows') {
  const k = JSON.parse(
    execFileSync(process.execPath, [path.join(HERE, 'spike.mjs'), 'keys'], { encoding: 'utf8' }),
  );
  [url, serviceKey, anonKey] = [k.apiUrl, k.serviceKey, k.anonKey];
} else {
  const s = JSON.parse(
    execSync(
      'pnpm --silent --filter @gym/supabase exec supabase status --output json --workdir ..',
      { cwd: REPO, encoding: 'utf8' },
    ),
  );
  [url, serviceKey, anonKey] = [s.API_URL, s.SECRET_KEY, s.PUBLISHABLE_KEY];
}
if (!/^http:\/\/127\.0\.0\.1:(55421|54321)$/.test(url))
  throw new Error(`refusing to run against ${url}`);

function sql(file) {
  const text = readFileSync(file, 'utf8');
  if (target === 'windows') {
    execFileSync(process.execPath, [path.join(HERE, 'spike.mjs'), 'psql', '-q', '-f', file], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } else {
    execSync(
      'docker exec -i supabase_db_gym-spa psql -q -U postgres -d postgres -v ON_ERROR_STOP=1',
      { input: text, stdio: ['pipe', 'ignore', 'inherit'] },
    );
  }
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const run = Math.random().toString(36).slice(2, 8);
const created = [];
let failures = 0;

function check(label, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(
    `${condition ? '  ok  ' : '  FAIL'} ${label}${!condition && detail ? ` (${detail})` : ''}`,
  );
}
const emailOf = (username) => `${username}@staff.gym-spa.invalid`;

async function login(username, password) {
  const client = createClient(url, anonKey, opts);
  const result = await client.auth.signInWithPassword({ email: emailOf(username), password });
  return { client, error: result.error, session: result.data.session };
}

async function roleId(key) {
  const { data, error } = await admin.from('roles').select('id').eq('key', key).single();
  if (error) throw error;
  return data.id;
}

/** A staff member made the way bootstrap/e2e do (secret key), for the manager and the receptionist. */
async function seedStaff(username, role, allBranches, branchIds) {
  const user = await admin.auth.admin.createUser({
    email: emailOf(username),
    password: 'Seed-pass-123',
    email_confirm: true,
  });
  if (user.error) throw user.error;
  created.push(user.data.user.id);
  const insert = await admin.from('staff_users').insert({
    id: user.data.user.id,
    username,
    full_name: 'تاقیکردنەوە',
    role_id: await roleId(role),
    all_branches: allBranches,
    must_change_password: false,
  });
  if (insert.error) throw insert.error;
  for (const branchId of branchIds) {
    const link = await admin
      .from('staff_branches')
      .insert({ staff_id: user.data.user.id, branch_id: branchId });
    if (link.error) throw link.error;
  }
  return user.data.user.id;
}

/** The shared checks: the account logs in, its profile is visible, and must_change_password is set. */
async function checkNewStaff(username, password, id) {
  const signedIn = await login(username, password);
  check('new staff member can log in with Supabase Auth', !signedIn.error, signedIn.error?.message);
  if (signedIn.error) return null;
  const profile = await signedIn.client
    .from('staff_users')
    .select('id, must_change_password')
    .eq('id', id)
    .maybeSingle();
  check('they see their own staff profile (RLS)', profile.data?.id === id, profile.error?.message);
  check(
    'must_change_password is set (someone else chose it)',
    profile.data?.must_change_password === true,
  );
  const authView = await admin.auth.admin.getUserById(id);
  check(
    'Auth admin API can read the account',
    !authView.error && authView.data.user.email === emailOf(username),
    authView.error?.message,
  );
  return signedIn.session;
}

async function checkReset(username, oldPassword, newPassword, oldSession) {
  check('old password no longer works', Boolean((await login(username, oldPassword)).error));
  check('new password works', !(await login(username, newPassword)).error);
  const refreshed = await createClient(url, anonKey, opts).auth.refreshSession({
    refresh_token: oldSession.refresh_token,
  });
  check(
    'old session can no longer refresh',
    Boolean(refreshed.error),
    refreshed.error ? '' : 'refresh worked',
  );
}

async function checkDeactivated(username, password, session) {
  const attempt = await login(username, password);
  // "User is banned" (code user_banned) is what the app can translate; any other error is a bug.
  check(
    'deactivated: login refused with user_banned',
    attempt.error?.code === 'user_banned',
    attempt.error ? `${attempt.error.code}: ${attempt.error.message}` : 'login worked',
  );
  const refreshed = await createClient(url, anonKey, opts).auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  check('deactivated: old session can no longer refresh', Boolean(refreshed.error));
}

try {
  const branch = (await admin.from('branches').select('id').order('code').limit(1).single()).data
    .id;
  const manager = `spk_${run}_mgr`;
  const clerk = `spk_${run}_rec`;
  await seedStaff(manager, 'super_admin', true, []);
  await seedStaff(clerk, 'receptionist', false, [branch]);
  const managerClient = (await login(manager, 'Seed-pass-123')).client;
  const clerkClient = (await login(clerk, 'Seed-pass-123')).client;
  const receptionist = await roleId('receptionist');

  // ---------------------------------------------------------------------------------------- A
  console.log(`\n[${target}] Design A: Postgres functions (RPC with the manager's session)`);
  sql(path.join(HERE, 'staff-admin-a.sql'));
  // PostgREST reloads its schema cache on NOTIFY pgrst; wait until the function is there.
  const loadStarted = Date.now();
  for (;;) {
    const probe = await managerClient.rpc('spike_set_staff_active', {
      p_staff_id: '00000000-0000-0000-0000-000000000000',
      p_active: true,
    });
    if (probe.error?.code !== 'PGRST202') break;
    if (Date.now() - loadStarted > 15000)
      throw new Error('PostgREST did not pick up the design A functions');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log(`  (PostgREST saw the new functions after ${String(Date.now() - loadStarted)} ms)`);

  const a = `spk_${run}_a`;
  const made = await managerClient.rpc('spike_create_staff', {
    p_username: a,
    p_full_name: 'کارمەندی A',
    p_password: 'First-pass-123',
    p_role_id: receptionist,
    p_branch_ids: [branch],
  });
  check('create_staff by a manager', !made.error, made.error?.message);
  if (!made.error) {
    created.push(made.data);
    const session = await checkNewStaff(a, 'First-pass-123', made.data);

    const denied = await clerkClient.rpc('spike_create_staff', {
      p_username: `spk_${run}_x`,
      p_full_name: 'x',
      p_password: 'First-pass-123',
      p_role_id: receptionist,
    });
    check(
      'a receptionist is refused (permission_denied)',
      denied.error?.message === 'permission_denied',
      denied.error?.message,
    );
    const dup = await managerClient.rpc('spike_create_staff', {
      p_username: a,
      p_full_name: 'x',
      p_password: 'First-pass-123',
      p_role_id: receptionist,
    });
    check(
      'same username again is refused (username_taken)',
      dup.error?.message === 'username_taken',
      dup.error?.message,
    );
    const bad = await managerClient.rpc('spike_create_staff', {
      p_username: `Bad Name ${run}`,
      p_full_name: 'x',
      p_password: 'First-pass-123',
      p_role_id: receptionist,
    });
    const orphans = await admin.auth.admin.listUsers({ perPage: 1000 });
    check(
      'invalid username fails, and leaves no Auth user behind (one transaction)',
      Boolean(bad.error) && !orphans.data.users.some((u) => u.email?.startsWith(`bad name ${run}`)),
      bad.error?.message,
    );
    const grant = await managerClient.rpc('spike_create_staff', {
      p_username: `spk_${run}_y`,
      p_full_name: 'y',
      p_password: 'First-pass-123',
      p_role_id: receptionist,
      p_all_branches: true,
    });
    if (!grant.error) created.push(grant.data);
    const clerkGrant = await clerkClient.rpc('spike_reset_staff_password', {
      p_staff_id: made.data,
      p_password: 'Other-pass-123',
    });
    check(
      'the usual guards still apply (receptionist cannot reset)',
      clerkGrant.error?.message === 'cannot_manage_staff',
      clerkGrant.error?.message,
    );

    const reset = await managerClient.rpc('spike_reset_staff_password', {
      p_staff_id: made.data,
      p_password: 'Second-pass-123',
    });
    check('reset_staff_password by a manager', !reset.error, reset.error?.message);
    if (session) await checkReset(a, 'First-pass-123', 'Second-pass-123', session);
    const after = await admin
      .from('staff_users')
      .select('must_change_password')
      .eq('id', made.data)
      .single();
    check(
      'after a reset they must choose a new password',
      after.data.must_change_password === true,
    );

    const fresh = (await login(a, 'Second-pass-123')).session;
    const off = await managerClient.rpc('spike_set_staff_active', {
      p_staff_id: made.data,
      p_active: false,
    });
    check('deactivate by a manager', !off.error, off.error?.message);
    if (fresh) await checkDeactivated(a, 'Second-pass-123', fresh);
    const on = await managerClient.rpc('spike_set_staff_active', {
      p_staff_id: made.data,
      p_active: true,
    });
    check(
      'reactivate, then login works again',
      !on.error && !(await login(a, 'Second-pass-123')).error,
      on.error?.message,
    );
  }

  // ---------------------------------------------------------------------------------------- B
  console.log(
    `\n[${target}] Design B: Auth admin API with the secret key (Edge Function / gym-server)`,
  );
  const b = `spk_${run}_b`;
  const userB = await admin.auth.admin.createUser({
    email: emailOf(b),
    password: 'First-pass-123',
    email_confirm: true,
  });
  check('admin.createUser', !userB.error, userB.error?.message);
  if (!userB.error) {
    created.push(userB.data.user.id);
    // In the real endpoint this insert runs with the manager's session, so the guards check them.
    const row = await managerClient.from('staff_users').insert({
      id: userB.data.user.id,
      username: b,
      full_name: 'کارمەندی B',
      role_id: receptionist,
    });
    check(
      'staff row inserted with the manager session (separate request: not atomic)',
      !row.error,
      row.error?.message,
    );
    const session = await checkNewStaff(b, 'First-pass-123', userB.data.user.id);
    const reset = await admin.auth.admin.updateUserById(userB.data.user.id, {
      password: 'Second-pass-123',
    });
    check('admin.updateUserById(password)', !reset.error, reset.error?.message);
    if (session) await checkReset(b, 'First-pass-123', 'Second-pass-123', session);
    const fresh = (await login(b, 'Second-pass-123')).session;
    const ban = await admin.auth.admin.updateUserById(userB.data.user.id, {
      ban_duration: '876000h',
    });
    check('admin.updateUserById(ban_duration)', !ban.error, ban.error?.message);
    if (fresh) await checkDeactivated(b, 'Second-pass-123', fresh);
  }
} finally {
  // Clean up: staff rows (secret key = system context), then the Auth users, then design A.
  await admin.from('staff_pins').delete().in('staff_id', created);
  await admin.from('staff_branches').delete().in('staff_id', created);
  await admin.from('staff_users').delete().in('id', created);
  for (const id of created) await admin.auth.admin.deleteUser(id);
  const drop = path.join(HERE, '.drop-a.sql');
  const dropSql = [
    'drop function if exists public.spike_create_staff(text, text, text, uuid, uuid[], boolean);',
    'drop function if exists public.spike_reset_staff_password(uuid, text);',
    'drop function if exists public.spike_set_staff_active(uuid, boolean);',
    "notify pgrst, 'reload schema';",
  ].join('\n');
  (await import('node:fs')).writeFileSync(drop, dropSql);
  try {
    sql(drop);
  } finally {
    (await import('node:fs')).rmSync(drop, { force: true });
  }
}
console.log(
  `\n[${target}] ${failures === 0 ? 'all checks passed' : `${String(failures)} check(s) failed`}`,
);
process.exitCode = failures === 0 ? 0 : 1;
