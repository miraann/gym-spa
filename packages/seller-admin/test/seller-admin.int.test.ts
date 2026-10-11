import { staffEmail } from '@gym/core';
import type { Database } from '@gym/db';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TestGym,
  adminClient,
  loginResult,
  publicClient,
  signIn,
  type TestStaff,
} from '../../staff-admin/test/fixture.ts';
import { localBackend, localSql } from '../../staff-admin/test/local.ts';
import { createSellerAdminHandler } from '../src/handler.ts';
import type { SellerAdminLogEntry, SellerCallerPort } from '../src/ports.ts';
import { supabaseSellerAdminPorts } from '../src/supabase-ports.ts';
import { TestPlatformAdmin, removePlatformAdminsSql, type TwoStepSession } from './platform.ts';

// The seller module in Node against the local Supabase (`pnpm db:start`): the real Auth admin API,
// Auth's access token hook and TOTP, and the real database rules. `pnpm test:int`. Its HTTP path is
// tested in Deno (pnpm test:deno).

const backend = localBackend();
const logs: SellerAdminLogEntry[] = [];
const ports = supabaseSellerAdminPorts(backend);

function handler(
  callerFor: (token: string, request: Request) => SellerCallerPort = ports.callerFor,
) {
  return createSellerAdminHandler({
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

/** Every temporary password and recovery code the tests saw: none may ever reach the log. */
const secrets: string[] = [];

async function send(token: string | null, body: unknown, serve = handler()): Promise<Answer> {
  const response = await serve(
    new Request('http://localhost/functions/v1/seller-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    }),
  );
  const answer = (await response.json()) as Record<string, unknown>;
  if (typeof answer.temporaryPassword === 'string') secrets.push(answer.temporaryPassword);
  return { status: response.status, body: answer };
}

/** A client that sends this token (like the panel), for the seller functions it calls itself. */
function asUser(token: string) {
  return createClient<Database>(backend.url, backend.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const run = crypto.randomUUID().slice(0, 6);
/** A gym code for this run (codes are never reused). */
const code = (label: string) => `int-${label}-${run}`;

function gymRequest(gymCode: string, username = 'boss') {
  return {
    action: 'create_gym',
    code: gymCode,
    nameCkb: `جیمی ${gymCode}`,
    nameEn: null,
    firstBranchName: 'لقی سەرەکی',
    paidUntil: '2027-01-31T21:00:00.000Z',
    owner: { username, fullName: 'خاوەنی نوێ', phone: null },
  };
}

const admins: TestPlatformAdmin[] = [];
const gyms: TestGym[] = [];
let ali: TestPlatformAdmin;
let sara: TestPlatformAdmin;
let aliSession: TwoStepSession;
let saraSession: TwoStepSession;

async function newAdmin(label: string): Promise<TestPlatformAdmin> {
  const admin = await TestPlatformAdmin.create(backend, label);
  admins.push(admin);
  return admin;
}

/** Creates a gym through the endpoint and keeps it for clean-up. */
async function createGym(
  gymCode: string,
  username = 'boss',
): Promise<{ gym: TestGym; owner: TestStaff }> {
  const answer = await send(aliSession.accessToken, gymRequest(gymCode, username));
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  const gym = TestGym.existing(backend, String(answer.body.gymId), gymCode);
  gyms.push(gym);
  const email = staffEmail(username, gymCode);
  return {
    gym,
    owner: {
      id: String(answer.body.ownerId),
      username,
      email,
      password: String(answer.body.temporaryPassword),
    },
  };
}

beforeAll(async () => {
  ali = await newAdmin('int-ali');
  sara = await newAdmin('int-sara');
  aliSession = await ali.ready();
  saraSession = await sara.ready();
});

afterAll(async () => {
  for (const gym of gyms) await gym.cleanup();
  localSql(removePlatformAdminsSql(admins.map((admin) => admin.id)));
  // Whatever happened: no temporary password or recovery code ever reaches the log.
  expect(secrets.length).toBeGreaterThan(0);
  const logged = JSON.stringify(logs);
  for (const secret of secrets) expect(logged).not.toContain(secret);
});

describe('create gym', () => {
  it('makes the gym and its Owner, who logs in with the temporary password and must change it', async () => {
    const { gym, owner } = await createGym(code('a'));
    const signedIn = await signIn(backend, owner.email, owner.password);
    const myGym = await signedIn.client.rpc('my_gym').single();
    expect(myGym.data).toMatchObject({ code: gym.code, access: 'active', suspended: false });
    expect(await gym.staffRow(owner.id)).toMatchObject({
      username: 'boss',
      is_active: true,
      must_change_password: true,
      all_branches: true,
      created_by: ali.id,
    });

    const log = await asUser(aliSession.accessToken).rpc('seller_audit_log', { p_gym_id: gym.id });
    expect(log.data?.map((entry) => [entry.action, entry.actor_id])).toEqual([
      ['gym_created', ali.id],
    ]);
  });

  it('a reserved or taken code makes nothing, not even a login', async () => {
    expect(await send(aliSession.accessToken, gymRequest('seller'))).toEqual({
      status: 400,
      body: { error: 'reserved_gym_code' },
    });
    expect(await send(aliSession.accessToken, gymRequest(code('a')))).toEqual({
      status: 409,
      body: { error: 'gym_code_taken' },
    });
    const users = await adminClient(backend).auth.admin.listUsers({ perPage: 1000 });
    // staffEmail() itself refuses a reserved code; this is the address a login would have had.
    expect(
      users.data.users.some((user) => user.email === 'boss@seller.staff.gym-spa.invalid'),
    ).toBe(false);
  });

  it('undoes the Owner login when the gym rows fail in the real database', async () => {
    const failing = (token: string, request: Request): SellerCallerPort => {
      const real = ports.callerFor(token, request);
      // The real database refuses: the code of a gym that exists, after the login was made.
      return { ...real, createGym: (gym) => real.createGym({ ...gym, code: code('a') }) };
    };
    const target = code('undone');
    expect(await send(aliSession.accessToken, gymRequest(target), handler(failing))).toEqual({
      status: 409,
      body: { error: 'gym_code_taken' },
    });
    expect(await loginResult(backend, staffEmail('boss', target), 'anything')).toBe(
      'invalid_credentials',
    );
    const users = await adminClient(backend).auth.admin.listUsers({ perPage: 1000 });
    expect(users.data.users.some((user) => user.email === staffEmail('boss', target))).toBe(false);
  });

  it('frees the Owner address a gym that was never made left behind', async () => {
    const target = code('freed');
    const email = staffEmail('boss', target);
    const left = await adminClient(backend).auth.admin.createUser({
      email,
      password: `Old-${crypto.randomUUID()}`,
      email_confirm: true,
      app_metadata: { gym_id: crypto.randomUUID() },
    });
    const leftId = left.data.user?.id ?? '';
    // Older than 2 minutes, like a real left-behind login.
    localSql(
      `update auth.users set created_at = now() - interval '3 minutes' where id = '${leftId}'`,
    );

    const { owner } = await createGym(target);
    expect(owner.id).not.toBe(leftId);
    expect(logs).toContainEqual(
      expect.objectContaining({ event: 'orphan_login_deleted', userId: leftId, email }),
    );
  });
});

describe('suspend and lock', () => {
  let gym: TestGym;
  let owner: TestStaff;

  beforeAll(async () => {
    ({ gym, owner } = await createGym(code('lock')));
  });

  it('suspend: the staff still log in, and the gym is read-only', async () => {
    const seller = asUser(aliSession.accessToken);
    expect((await seller.rpc('seller_suspend_gym', { p_gym_id: gym.id })).error).toBeNull();
    const signedIn = await signIn(backend, owner.email, owner.password);
    expect((await signedIn.client.rpc('my_gym').single()).data).toMatchObject({
      access: 'read_only',
      suspended: true,
    });
    const added = await signedIn.client.from('branches').insert({ code: 'B9', name_ckb: 'لق' });
    expect(added.error?.message).toBe('gym_read_only');
    expect((await seller.rpc('seller_reactivate_gym', { p_gym_id: gym.id })).error).toBeNull();
  });

  it('lock: Auth refuses the login and the refresh; reactivating lets the same session refresh', async () => {
    const before = await signIn(backend, owner.email, owner.password);
    const seller = asUser(aliSession.accessToken);
    const locked = await seller.rpc('seller_lock_gym', {
      p_gym_id: gym.id,
      p_reason: 'هەژماری دزراو',
    });
    expect(locked.error).toBeNull();

    const login = await publicClient(backend).auth.signInWithPassword({
      email: owner.email,
      password: owner.password,
    });
    expect([login.error?.status, login.error?.message]).toEqual([403, 'gym_locked']);

    const refresh = await publicClient(backend).auth.refreshSession({
      refresh_token: before.session.refresh_token,
    });
    expect([refresh.error?.status, refresh.error?.message]).toEqual([403, 'gym_locked']);

    // A token issued before the lock still has a valid signature, but sees nothing.
    expect((await before.client.from('branches').select('id')).data).toEqual([]);
    expect((await before.client.rpc('my_gym').single()).data).toMatchObject({ access: 'locked' });

    expect((await seller.rpc('seller_reactivate_gym', { p_gym_id: gym.id })).error).toBeNull();
    const again = await publicClient(backend).auth.refreshSession({
      refresh_token: before.session.refresh_token,
    });
    expect(again.error).toBeNull();
    expect(await loginResult(backend, owner.email, owner.password)).toBe('ok');
  });

  it("a platform admin's own login is never refused by the hook", async () => {
    expect((await ali.signIn()).auth).toBeDefined();
  });
});

describe('platform admins', () => {
  it('a new admin logs in with the temporary password, chooses their own, then sets up two-step login', async () => {
    const email = `int-new-${run}@clickgroup.example`;
    const added = await send(aliSession.accessToken, {
      action: 'add_admin',
      email,
      fullName: 'هاوکاری نوێ',
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const newcomer = adoptAdmin(
      String(added.body.userId),
      email,
      String(added.body.temporaryPassword),
    );

    const client = await newcomer.signIn();
    const me = await client.rpc('seller_me').single();
    expect(me.data).toMatchObject({ must_change_password: true, has_two_step: false, aal2: false });
    expect((await client.rpc('seller_gyms')).error?.message).toBe('mfa_required');

    const ready = await newcomer.ready();
    const gymsList = await ready.client.rpc('seller_gyms');
    expect(gymsList.error).toBeNull();
    expect((await ready.client.rpc('seller_me').single()).data).toMatchObject({
      must_change_password: false,
      has_two_step: true,
      aal2: true,
    });
  });

  it('deactivate: login is refused and an old token sees nothing; reactivate: they log in again', async () => {
    const omar = await newAdmin('int-omar');
    const omarSession = await omar.ready();
    expect(
      await send(aliSession.accessToken, { action: 'deactivate_admin', userId: omar.id }),
    ).toEqual({
      status: 200,
      body: { userId: omar.id },
    });
    await expect(omar.signIn()).rejects.toThrow(/banned/i);
    expect((await asUser(omarSession.accessToken).rpc('seller_me')).error?.message).toBe(
      'not_platform_admin',
    );

    expect(
      await send(aliSession.accessToken, { action: 'reactivate_admin', userId: omar.id }),
    ).toEqual({
      status: 200,
      body: { userId: omar.id },
    });
    await expect(omar.signIn()).resolves.toBeDefined();
  });

  it('reset two-step: their device is gone; they log in with the password and set up a new one', async () => {
    const omar = await newAdmin('int-omar2');
    await omar.ready();
    expect(
      await send(aliSession.accessToken, { action: 'reset_admin_two_step', userId: omar.id }),
    ).toEqual({ status: 200, body: { userId: omar.id } });
    const factors = await adminClient(backend).auth.admin.mfa.listFactors({ userId: omar.id });
    expect(factors.data?.factors).toEqual([]);

    const client = await omar.signIn();
    expect((await client.rpc('seller_me').single()).data).toMatchObject({ has_two_step: false });
    const fresh = await omar.setUpTwoStep(client);
    expect((await fresh.client.rpc('seller_gyms')).error).toBeNull();
  });

  it('reset password: the temporary one works and must be changed; the old one no longer works', async () => {
    const omar = await newAdmin('int-omar3');
    await omar.ready();
    const oldPassword = omar.password;
    const reset = await send(aliSession.accessToken, {
      action: 'reset_admin_password',
      userId: omar.id,
    });
    expect(reset.status).toBe(200);
    await expect(omar.signIn(oldPassword)).rejects.toThrow(/invalid/i);
    omar.password = String(reset.body.temporaryPassword);
    const client = await omar.signIn();
    expect((await client.rpc('seller_me').single()).data).toMatchObject({
      must_change_password: true,
    });
  });

  it('nobody changes their own account here', async () => {
    expect(
      await send(aliSession.accessToken, { action: 'reset_admin_two_step', userId: ali.id }),
    ).toEqual({
      status: 403,
      body: { error: 'cannot_change_own_admin' },
    });
  });
});

describe('recovery codes', () => {
  it('a code removes the lost device after the password alone; each code works once', async () => {
    const codes = await asUser(saraSession.accessToken).rpc('seller_new_recovery_codes');
    expect(codes.data).toHaveLength(10);
    secrets.push(...(codes.data ?? []));
    const [first] = codes.data ?? [];

    // The phone is lost: the password only.
    const client = await sara.signIn();
    const session = (await client.auth.getSession()).data.session;
    expect(session).not.toBeNull();
    const token = session?.access_token ?? '';
    expect(await send(token, { action: 'use_recovery_code', code: 'aaaa-bbbb-cccc-dddd' })).toEqual(
      {
        status: 400,
        body: { error: 'wrong_code' },
      },
    );
    expect(await send(token, { action: 'use_recovery_code', code: first })).toEqual({
      status: 200,
      body: { result: 'ok' },
    });
    const factors = await adminClient(backend).auth.admin.mfa.listFactors({ userId: sara.id });
    expect(factors.data?.factors).toEqual([]);
    expect(await send(token, { action: 'use_recovery_code', code: first })).toEqual({
      status: 400,
      body: { error: 'wrong_code' },
    });

    // They set up a new device right away.
    saraSession = await sara.setUpTwoStep(client);
    expect((await saraSession.client.rpc('seller_gyms')).error).toBeNull();
  });
});

describe('who may call it', () => {
  it('before the second step, only a recovery code is accepted', async () => {
    const client = await ali.signIn();
    const token = (await client.auth.getSession()).data.session?.access_token ?? '';
    expect(await send(token, gymRequest(code('aal1')))).toEqual({
      status: 403,
      body: { error: 'mfa_required' },
    });
  });

  it('gym staff are no platform admins, even for the one action that accepts aal1', async () => {
    const gym = gyms[0];
    if (!gym) throw new Error('no gym');
    const owner = await gym.addStaff('second.owner', 'owner', { allBranches: true });
    const token = (await signIn(backend, owner.email, owner.password)).session.access_token;
    expect(await send(token, { action: 'use_recovery_code', code: 'aaaa-bbbb-cccc-dddd' })).toEqual(
      {
        status: 403,
        body: { error: 'not_platform_admin' },
      },
    );
    expect((await asUser(token).rpc('seller_gyms')).error?.message).toBe('not_platform_admin');
  });

  it("the project's anon key and invalid tokens are unauthorized", async () => {
    expect(await send('not-a-token', gymRequest(code('x')))).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
    if (backend.legacyAnonKey !== null) {
      expect((await send(backend.legacyAnonKey, gymRequest(code('x')))).status).toBe(401);
    }
  });
});

/** A platform admin the endpoint just added (its row exists already), kept for clean-up. */
function adoptAdmin(id: string, email: string, password: string): TestPlatformAdmin {
  const admin = TestPlatformAdmin.adopt(backend, id, email, password);
  admins.push(admin);
  return admin;
}
