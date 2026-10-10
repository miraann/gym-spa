import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaffAdminHandler } from '../src/handler.ts';
import type { CallerPort, StaffAdminLogEntry } from '../src/ports.ts';
import { supabaseStaffAdminPorts } from '../src/supabase-ports.ts';
import {
  TestGym,
  loginResult,
  publicClient,
  signIn,
  staffAdminRequest,
  type Backend,
  type TestStaff,
} from './fixture.ts';

// The staff module in Node against the local Supabase (`pnpm db:start`): real Auth admin API, real
// database rules. `pnpm test:int`. The same module runs in the Edge Function; its HTTP path is
// tested in Deno (pnpm test:deno).

/** The legacy anon key: a valid, signed JWT with role anon (HS256). */
let legacyAnonKey: string | null = null;

function localBackend(): Backend {
  let output: string;
  try {
    output = execSync(
      'pnpm --silent --filter @gym/supabase exec supabase status --output json --workdir ..',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    throw new Error('Local Supabase is not running. Start it with pnpm db:start.');
  }
  const status = JSON.parse(output) as Record<string, string | undefined>;
  legacyAnonKey = status.ANON_KEY ?? null;
  const url = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) throw new Error('`supabase status` misses keys');
  return { url, publishableKey, secretKey };
}

const backend = localBackend();
const logs: StaffAdminLogEntry[] = [];
const ports = supabaseStaffAdminPorts(backend);

/** The endpoint as the Edge Function serves it, with a way to swap the caller's side. */
function handler(callerFor: (token: string, request: Request) => CallerPort = ports.callerFor) {
  return createStaffAdminHandler({
    verifyToken: ports.verifyToken,
    admin: ports.admin,
    callerFor,
    log: (entry) => logs.push(entry),
  });
}

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function send(token: string | null, body: unknown, serve = handler()): Promise<Answer> {
  const response = await serve(staffAdminRequest('http://localhost', token, body));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

let gym: TestGym;
let otherGym: TestGym;
let owner: TestStaff;
let manager: TestStaff;
let reception: TestStaff;
let otherOwner: TestStaff;
let ownerToken: string;

beforeAll(async () => {
  gym = await TestGym.create(backend, 'int-a');
  otherGym = await TestGym.create(backend, 'int-b');
  owner = await gym.addStaff('owner', 'owner', { allBranches: true });
  manager = await gym.addStaff('manager', 'branch_manager', { branches: ['B1'] });
  reception = await gym.addStaff('reception', 'receptionist', { branches: ['B1'] });
  otherOwner = await otherGym.addStaff('owner', 'owner', { allBranches: true });
  ownerToken = (await signIn(backend, owner.email, owner.password)).session.access_token;
});

afterAll(async () => {
  await gym.cleanup();
  await otherGym.cleanup();
  // Whatever happened: no temporary password ever reaches the log.
  expect(JSON.stringify(logs)).not.toMatch(/temporaryPassword/);
});

async function createReceptionist(username: string, token = ownerToken): Promise<Answer> {
  return send(token, {
    action: 'create',
    username,
    fullName: 'کارمەندی نوێ',
    phone: '0750 111 2233',
    roleId: await gym.roleId('receptionist'),
    allBranches: false,
    branchIds: [await gym.branchId('B1')],
  });
}

describe('create', () => {
  it('makes an account that logs in with the temporary password and must change it', async () => {
    const created = await createReceptionist('desk.one');
    expect(created.status).toBe(200);
    const { staffId, temporaryPassword } = created.body as {
      staffId: string;
      temporaryPassword: string;
    };
    expect(temporaryPassword).toMatch(/^[a-z2-9]{14}$/);

    expect(await gym.staffRow(staffId)).toMatchObject({
      username: 'desk.one',
      is_active: true,
      must_change_password: true,
      gym_id: gym.id,
      // Written under the owner's own session, so the audit trail names them.
      created_by: owner.id,
    });
    expect((await gym.login(gym.email('desk.one')))?.app_metadata.gym_id).toBe(gym.id);

    const { client } = await signIn(backend, gym.email('desk.one'), temporaryPassword);
    const own = await client
      .from('staff_users')
      .select('must_change_password')
      .eq('id', staffId)
      .single();
    expect(own.data?.must_change_password).toBe(true);
    const branches = await client
      .from('staff_branches')
      .select('branch_id')
      .eq('staff_id', staffId);
    expect(branches.data).toEqual([{ branch_id: await gym.branchId('B1') }]);
  });

  it('refuses staff without staff.manage, and leaves no login behind', async () => {
    const token = (await signIn(backend, reception.email, reception.password)).session.access_token;
    const refused = await createReceptionist('desk.two', token);
    expect(refused).toEqual({ status: 403, body: { error: 'permission_denied' } });
    expect(await gym.login(gym.email('desk.two'))).toBeNull();
  });

  it("never gives a role above the manager's own", async () => {
    const token = (await signIn(backend, manager.email, manager.password)).session.access_token;
    const refused = await send(token, {
      action: 'create',
      username: 'new.owner',
      fullName: 'خاوەنی نوێ',
      roleId: await gym.roleId('owner'),
      allBranches: true,
      branchIds: [],
    });
    expect(refused.body).toEqual({ error: 'cannot_grant_role' });
    expect(await gym.login(gym.email('new.owner'))).toBeNull();
  });

  it("never reaches across gyms: another gym's role or branch is refused", async () => {
    const role = await send(ownerToken, {
      action: 'create',
      username: 'cross.role',
      fullName: 'کارمەند',
      roleId: await otherGym.roleId('receptionist'),
      allBranches: false,
      branchIds: [await gym.branchId('B1')],
    });
    expect(role.body).toEqual({ error: 'cannot_grant_role' });
    const branch = await send(ownerToken, {
      action: 'create',
      username: 'cross.branch',
      fullName: 'کارمەند',
      roleId: await gym.roleId('receptionist'),
      allBranches: false,
      branchIds: [await otherGym.branchId('B1')],
    });
    expect(branch.body).toEqual({ error: 'no_branch_access' });
  });

  it('a taken username is refused before any login is made', async () => {
    expect((await createReceptionist('reception')).body).toEqual({ error: 'username_taken' });
  });

  it('the same username in another gym is fine', async () => {
    const otherToken = (await signIn(backend, otherOwner.email, otherOwner.password)).session
      .access_token;
    const created = await send(otherToken, {
      action: 'create',
      username: 'desk.one',
      fullName: 'کارمەند',
      roleId: await otherGym.roleId('receptionist'),
      allBranches: false,
      branchIds: [await otherGym.branchId('B1')],
    });
    expect(created.status).toBe(200);
    expect((await gym.login(otherGym.email('desk.one')))?.id).toBe(created.body.staffId);
  });

  it('undoes the login when the staff rows fail in the real database', async () => {
    // The database refuses the phone (its check constraint), after the login was made.
    const broken = handler((token, request) => {
      const real = ports.callerFor(token, request);
      return {
        ...real,
        createProfile: (profile) => real.createProfile({ ...profile, phone: 'x' }),
      };
    });
    const failed = await send(
      ownerToken,
      {
        action: 'create',
        username: 'half.made',
        fullName: 'کارمەند',
        roleId: await gym.roleId('receptionist'),
        allBranches: false,
        branchIds: [await gym.branchId('B1')],
      },
      broken,
    );
    expect(failed).toEqual({ status: 500, body: { error: 'staff_create_failed' } });
    expect(await gym.login(gym.email('half.made'))).toBeNull();
    // So the username is free again.
    expect((await createReceptionist('half.made')).status).toBe(200);
  });

  it('a login at the address that is too new to be left behind is never deleted', async () => {
    const email = gym.email('in.flight');
    const made = await gym.admin.auth.admin.createUser({
      email,
      password: 'In-flight-2026',
      email_confirm: true,
      app_metadata: { gym_id: gym.id },
    });
    expect((await createReceptionist('in.flight')).body).toEqual({ error: 'username_taken' });
    expect((await gym.login(email))?.id).toBe(made.data.user?.id);
  });
});

describe('changes', () => {
  let target: TestStaff;
  let targetPassword: string;

  beforeAll(async () => {
    target = await gym.addStaff('target', 'receptionist', { branches: ['B1'] });
    targetPassword = target.password;
  });

  it('reset: the old password and session stop working, the new one must be changed', async () => {
    const before = await signIn(backend, target.email, targetPassword);
    const reset = await send(ownerToken, { action: 'reset_password', staffId: target.id });
    expect(reset.status).toBe(200);
    const temporaryPassword = String(reset.body.temporaryPassword);

    expect(await loginResult(backend, target.email, targetPassword)).toBe('invalid_credentials');
    const refreshed = await publicClient(backend).auth.refreshSession({
      refresh_token: before.session.refresh_token,
    });
    expect(refreshed.error).not.toBeNull();
    expect(await loginResult(backend, target.email, temporaryPassword)).toBe('ok');
    expect((await gym.staffRow(target.id))?.must_change_password).toBe(true);
    targetPassword = temporaryPassword;
  });

  it('deactivate: login and refresh are refused, and an old token sees nothing', async () => {
    const before = await signIn(backend, target.email, targetPassword);
    const done = await send(ownerToken, { action: 'deactivate', staffId: target.id });
    expect(done).toEqual({ status: 200, body: { staffId: target.id } });

    expect(await loginResult(backend, target.email, targetPassword)).toBe('user_banned');
    const refreshed = await publicClient(backend).auth.refreshSession({
      refresh_token: before.session.refresh_token,
    });
    expect(refreshed.error?.code).toBe('user_banned');
    const seen = await before.client.from('staff_users').select('id');
    expect(seen.data).toEqual([]);
  });

  it('reactivate: they can log in again', async () => {
    const done = await send(ownerToken, { action: 'reactivate', staffId: target.id });
    expect(done.status).toBe(200);
    expect(await loginResult(backend, target.email, targetPassword)).toBe('ok');
    expect((await gym.staffRow(target.id))?.is_active).toBe(true);
  });

  it('rename: the new username logs in, the old one no longer does', async () => {
    const done = await send(ownerToken, {
      action: 'rename',
      staffId: target.id,
      username: 'front.desk',
    });
    expect(done.status).toBe(200);
    expect(await loginResult(backend, gym.email('front.desk'), targetPassword)).toBe('ok');
    expect(await loginResult(backend, target.email, targetPassword)).toBe('invalid_credentials');
    expect((await gym.staffRow(target.id))?.username).toBe('front.desk');
  });

  it('nobody manages themselves', async () => {
    expect((await send(ownerToken, { action: 'deactivate', staffId: owner.id })).body).toEqual({
      error: 'cannot_edit_own_account',
    });
  });

  it('a branch manager cannot touch the Owner', async () => {
    const token = (await signIn(backend, manager.email, manager.password)).session.access_token;
    expect((await send(token, { action: 'reset_password', staffId: owner.id })).body).toEqual({
      error: 'cannot_manage_staff',
    });
    expect(await loginResult(backend, owner.email, owner.password)).toBe('ok');
  });

  it("another gym's Owner cannot touch this gym's staff", async () => {
    const token = (await signIn(backend, otherOwner.email, otherOwner.password)).session
      .access_token;
    for (const action of ['reset_password', 'deactivate', 'reactivate'] as const) {
      expect((await send(token, { action, staffId: reception.id })).body).toEqual({
        error: 'cannot_manage_staff',
      });
    }
    expect(await loginResult(backend, reception.email, reception.password)).toBe('ok');
  });

  it('a read-only gym can still deactivate and reset, but not create, reactivate or rename', async () => {
    const member = await gym.addStaff('seasonal', 'receptionist', { branches: ['B1'] });
    await gym.suspend(true);
    try {
      expect((await createReceptionist('desk.three')).body).toEqual({ error: 'gym_read_only' });
      expect(
        (await send(ownerToken, { action: 'reset_password', staffId: member.id })).status,
      ).toBe(200);
      expect((await send(ownerToken, { action: 'deactivate', staffId: member.id })).status).toBe(
        200,
      );
      expect((await send(ownerToken, { action: 'reactivate', staffId: member.id })).body).toEqual({
        error: 'gym_read_only',
      });
      expect(
        (await send(ownerToken, { action: 'rename', staffId: reception.id, username: 'desk.four' }))
          .body,
      ).toEqual({ error: 'gym_read_only' });
      expect(await loginResult(backend, member.email, member.password)).toBe('user_banned');
    } finally {
      await gym.suspend(false);
    }
  });

  it('an invalid token is unauthorized', async () => {
    expect(await send('not-a-token', { action: 'deactivate', staffId: reception.id })).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it("the project's own anon key is not a staff session", async () => {
    expect(legacyAnonKey).not.toBeNull();
    expect(await send(legacyAnonKey, { action: 'deactivate', staffId: reception.id })).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('a real session whose claims were changed is refused', async () => {
    const [header, payload, signature] = ownerToken.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const changed = Buffer.from(JSON.stringify({ ...claims, sub: reception.id })).toString(
      'base64url',
    );
    const forged = `${header ?? ''}.${changed}.${signature ?? ''}`;
    expect((await send(forged, { action: 'deactivate', staffId: manager.id })).status).toBe(401);
    expect(await loginResult(backend, manager.email, manager.password)).toBe('ok');
  });
});
