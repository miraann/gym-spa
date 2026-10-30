import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  generateLicenseKey,
  importLicenseSigningKey,
  keyRingOf,
  signActivation,
  signLicense,
  staffEmail,
  type Activation,
  type License,
} from '@gym/core';
import type { Database as Schema } from '@gym/db';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryAsync } from '../src/database.ts';
import { OFFLINE_PUBLISHABLE_KEY } from '../src/keys.ts';
import { toolPaths } from '../src/paths.ts';
import type { StackPorts } from '../src/ports.ts';
import { createServer, startServer, type RunningServer } from '../src/stack.ts';

// The license on a real offline server (spec §2.6, step OF-b), end to end: no license, a license
// that makes the gym (read-only until activated), the first Owner, the activation, a renewal, the
// clock set back and accepted again. A throwaway test key signs the codes.

const PORTS: StackPorts = { postgres: 46432, auth: 46499, rest: 46430, gateway: 46421 };
const MACHINE = '0V5Q-1BD4-TS11-N9TC-9402';
const tools = toolPaths();
const ready = existsSync(tools.authExe) && existsSync(tools.postgrestExe);

const LICENSE: License = {
  licenseId: '5a1c0f6e-3b2d-4c8e-9f10-2a3b4c5d6e7f',
  kid: 'test-int',
  gymId: '0b7d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  gymCode: 'hawler-fit',
  gymName: 'جیمی هەولێر',
  type: 'yearly',
  maxBranches: 2,
  maxDevices: 6,
  features: [],
  issuedOn: '2026-10-29',
  expiresOn: '2027-10-29',
  updatesUntil: null,
};
const ACTIVATION: Activation = {
  activationId: '9c8b7a6f-5e4d-4c3b-8a29-18f7e6d5c4b3',
  kid: 'test-int',
  gymId: LICENSE.gymId,
  machineCode: MACHINE.replaceAll('-', ''),
  issuedOn: '2026-10-30',
};

describe.skipIf(!ready)('the license on an offline server', () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'gym-server-license-'));
  let server: RunningServer;
  let codes: { license: string; activation: string; renewal: string; otherMachine: string };

  async function admin(method: 'GET' | 'POST', name: string, body?: unknown) {
    const response = await fetch(`${server.url}/server/v1/admin/${name}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function gymRow(): Promise<string[]> {
    const rows = await queryAsync(
      server.db,
      `select (suspended_at is not null)::text, to_char(paid_until at time zone 'Asia/Baghdad', 'YYYY-MM-DD HH24:MI'),
              max_branches::text, max_devices::text, edition, name_ckb
         from public.gyms where id = :'id'::uuid`,
      { variables: { id: LICENSE.gymId } },
    );
    return (rows[0] ?? '').split('\t');
  }

  beforeAll(async () => {
    const key = await importLicenseSigningKey((await generateLicenseKey('test-int')).privateJwk);
    codes = {
      license: await signLicense(LICENSE, key),
      activation: await signActivation(ACTIVATION, key),
      renewal: await signLicense(
        {
          ...LICENSE,
          licenseId: '6b2d1f7e-4c3e-4d9f-8a21-3b4c5d6e7f80',
          issuedOn: '2026-10-30',
          expiresOn: '2028-01-31',
          maxDevices: 8,
        },
        key,
      ),
      otherMachine: await signActivation(
        { ...ACTIVATION, machineCode: '1VSCZG2B53APHZFW67MW' },
        key,
      ),
    };
    createServer({ dataRoot, ports: PORTS, tools, seed: false });
    server = await startServer({
      dataRoot,
      ports: PORTS,
      tools,
      license: { keys: keyRingOf(key), machineCode: MACHINE },
    });
  });

  afterAll(async () => {
    await server.stop();
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('passes any text to the database unchanged', async () => {
    const value = "جیمی هەولێر's \\ گەورە\nline 2";
    expect(
      await queryAsync(server.db, "select :'v' = :'v', length(:'v')", { variables: { v: value } }),
    ).toEqual([`t\t${String(value.length)}`]);
    const rows = await queryAsync(server.db, "select replace(:'v', E'\\n', '|')", {
      variables: { v: value },
    });
    expect(rows).toEqual([value.replace('\n', '|')]);
  });

  it('starts with no license and no gym', async () => {
    expect(await admin('GET', 'license')).toMatchObject({
      status: 200,
      body: { machineCode: MACHINE, license: { kind: 'none' } },
    });
    expect(await server.info()).toMatchObject({ gym: null, license: { kind: 'none' } });
    expect((await admin('POST', 'owner', { username: 'owner', fullName: 'خاوەن' })).status).toBe(
      409,
    );
  });

  it('makes the gym from its license, read-only until the PC is activated', async () => {
    const installed = await admin('POST', 'license', { license: codes.license });
    expect(installed).toMatchObject({ status: 200, body: { license: { kind: 'not_activated' } } });
    expect(await server.info()).toMatchObject({
      gym: { code: 'hawler-fit', name: 'جیمی هەولێر' },
      license: { kind: 'not_activated', expiresOn: '2027-10-29' },
    });
    // The end of its last day in Baghdad; its limits; read-only.
    expect(await gymRow()).toEqual([
      'true',
      '2027-10-30 00:00',
      '2',
      '6',
      'offline',
      'جیمی هەولێر',
    ]);
    const branches = await queryAsync(server.db, 'select code from public.branches');
    expect(branches).toEqual(['B1']);
  });

  it('makes the first Owner once, who logs in with the temporary password', async () => {
    const made = await admin('POST', 'owner', { username: 'Owner', fullName: 'خاوەنی جیم' });
    expect(made.status).toBe(201);
    expect(made.body.username).toBe('owner');
    const password = String(made.body.temporaryPassword);
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect((await admin('POST', 'owner', { username: 'second', fullName: 'دووەم' })).body).toEqual({
      error: 'owner_exists',
    });

    const client = createClient<Schema>(server.url, OFFLINE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await client.auth.signInWithPassword({
      email: staffEmail('owner', 'hawler-fit'),
      password,
    });
    expect(login.error).toBeNull();
    const own = await client.from('staff_users').select('must_change_password').single();
    expect(own.data?.must_change_password).toBe(true);
    const gym = await client.rpc('my_gym').single();
    expect(gym.data?.access).toBe('read_only');
    await client.auth.signOut({ scope: 'local' });
  });

  it('refuses an activation for another PC', async () => {
    expect(await admin('POST', 'license', { activation: codes.otherMachine })).toMatchObject({
      status: 400,
      body: { error: 'activation_other_machine' },
    });
  });

  it('works once this PC is activated', async () => {
    const activated = await admin('POST', 'license', { activation: codes.activation });
    expect(activated).toMatchObject({ status: 200, body: { license: { kind: 'activated' } } });
    expect((await gymRow())[0]).toBe('false');
  });

  it('takes a renewal with the activation kept', async () => {
    const renewed = await admin('POST', 'license', { license: codes.renewal });
    expect(renewed).toMatchObject({
      status: 200,
      body: { license: { kind: 'activated', expiresOn: '2028-01-31', maxDevices: 8 } },
    });
    expect(await gymRow()).toEqual([
      'false',
      '2028-02-01 00:00',
      '2',
      '8',
      'offline',
      'جیمی هەولێر',
    ]);
    expect(await admin('POST', 'license', { license: codes.license })).toMatchObject({
      status: 400,
      body: { error: 'license_older' },
    });
  });

  it('goes read-only when the clock is set back, until an administrator accepts the time', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      path.join(dataRoot, 'clock.json'),
      JSON.stringify({ latest: future, acceptedAt: null }),
    );
    await server.license?.refresh();
    expect(server.license?.summary().clockBehind).toBe(true);
    expect((await gymRow())[0]).toBe('true');

    const accepted = await admin('POST', 'clock-accept');
    expect(accepted).toMatchObject({ status: 200, body: { license: { clockBehind: false } } });
    expect((await gymRow())[0]).toBe('false');
  });

  it('answers the server settings only to the server PC itself', async () => {
    // From the loopback address it works (above); the gateway's unit tests cover the LAN refusal.
    expect((await admin('GET', 'nothing')).status).toBe(404);
  });
});
