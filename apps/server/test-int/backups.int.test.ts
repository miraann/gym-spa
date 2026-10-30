import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  generateLicenseKey,
  importLicenseSigningKey,
  keyRingOf,
  signActivation,
  signLicense,
  staffEmail,
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

// Backups and restore on a real offline server (spec §8, step OF-e): a backup, a change, a restore
// that brings the data back and leaves logins working, the safety backup it makes first, the
// confirmation by gym code, and the second folder.

const PORTS: StackPorts = { postgres: 41432, auth: 41499, rest: 41430, gateway: 41421 };
const MACHINE = '0V5Q-1BD4-TS11-N9TC-9402';
const tools = toolPaths();
const ready = existsSync(tools.authExe) && existsSync(tools.postgrestExe);

const LICENSE: License = {
  licenseId: '8d2d1f7e-4c3e-4d9f-8a21-3b4c5d6e7f82',
  kid: 'test-backup',
  gymId: '3b7d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e31',
  gymCode: 'zakho-fit',
  gymName: 'جیمی زاخۆ',
  type: 'perpetual',
  maxBranches: null,
  maxDevices: null,
  features: [],
  issuedOn: '2026-10-29',
  expiresOn: null,
  updatesUntil: '2027-10-29',
};

describe.skipIf(!ready)('backups on an offline server', () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'gym-server-backups-'));
  const copyTo = mkdtempSync(path.join(tmpdir(), 'gym-server-usb-'));
  let server: RunningServer;
  let ownerPassword: string;

  async function admin(method: 'GET' | 'POST', name: string, body?: unknown) {
    const response = await fetch(`${server.url}/server/v1/admin/${name}`, {
      method,
      headers: { 'content-type': 'application/json', apikey: server.backend.SECRET_KEY },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  const members = async () =>
    queryAsync(server.db, 'select full_name from public.members order by full_name');

  async function addMember(name: string): Promise<void> {
    await queryAsync(
      server.db,
      `insert into public.members (id, gym_id, branch_id, full_name, gender, phone)
       select gen_random_uuid(), g.id, b.id, :'name', 'male', :'phone'
         from public.gyms g join public.branches b on b.gym_id = g.id and b.code = 'B1'`,
      { variables: { name, phone: `+96475012${String(Date.now()).slice(-5)}` } },
    );
  }

  beforeAll(async () => {
    const key = await importLicenseSigningKey((await generateLicenseKey('test-backup')).privateJwk);
    createServer({ dataRoot, ports: PORTS, tools, seed: false });
    server = await startServer({
      dataRoot,
      ports: PORTS,
      tools,
      license: { keys: keyRingOf(key), machineCode: MACHINE },
      backups: { schedule: false },
    });
    await admin('POST', 'license', {
      license: await signLicense(LICENSE, key),
      activation: await signActivation(
        {
          activationId: '1e2d1f7e-4c3e-4d9f-8a21-3b4c5d6e7f83',
          kid: 'test-backup',
          gymId: LICENSE.gymId,
          machineCode: MACHINE.replaceAll('-', ''),
          issuedOn: '2026-10-30',
        },
        key,
      ),
    });
    const owner = await admin('POST', 'owner', { username: 'owner', fullName: 'خاوەن' });
    ownerPassword = String(owner.body.temporaryPassword);
  });

  afterAll(async () => {
    await server.stop();
    rmSync(dataRoot, { recursive: true, force: true });
    rmSync(copyTo, { recursive: true, force: true });
  });

  it('makes a backup on request, and copies it to the second folder', async () => {
    await addMember('ئارام');
    expect((await admin('POST', 'backups-settings', { time: '03:30', copyTo })).body).toEqual({
      time: '03:30',
      copyTo,
    });
    const made = await admin('POST', 'backups-now');
    expect(made.status).toBe(201);
    expect(made.body.name).toMatch(/^zakho-fit-\d{8}-\d{6}-manual\.dump$/);
    expect(readdirSync(copyTo)).toEqual([made.body.name]);
    const listed = await admin('GET', 'backups');
    expect(listed.body.settings).toEqual({ time: '03:30', copyTo });
    expect((listed.body.backups as { name: string }[]).map((entry) => entry.name)).toEqual([
      made.body.name,
    ]);
  });

  it('refuses a restore that is not confirmed with the gym code, or of a file it has not', async () => {
    const [backup] = (await admin('GET', 'backups')).body.backups as { name: string }[];
    expect(
      await admin('POST', 'backups-restore', { name: backup?.name, gymCode: 'other' }),
    ).toEqual({
      status: 400,
      body: { error: 'confirm_mismatch' },
    });
    expect(
      (
        await admin('POST', 'backups-restore', {
          name: '../server-secrets.json',
          gymCode: 'zakho-fit',
        })
      ).body,
    ).toEqual({ error: 'backup_not_found' });
  });

  it('puts a backup back: the later change is gone, logins work, and a safety backup is kept', async () => {
    await addMember('بەختیار');
    expect(await members()).toEqual(['ئارام', 'بەختیار']);
    const backups = (await admin('GET', 'backups')).body.backups as { name: string }[];
    const restored = await admin('POST', 'backups-restore', {
      name: backups[0]?.name,
      gymCode: 'Zakho-Fit',
    });
    expect(restored).toEqual({ status: 200, body: { restored: true } });
    expect(await members()).toEqual(['ئارام']);
    expect(server.status().ok).toBe(true);

    const names = ((await admin('GET', 'backups')).body.backups as { name: string }[]).map(
      (entry) => entry.name,
    );
    expect(names.some((name) => name.endsWith('-before-restore.dump'))).toBe(true);

    const client = createClient<Schema>(server.url, OFFLINE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await client.auth.signInWithPassword({
      email: staffEmail('owner', 'zakho-fit'),
      password: ownerPassword,
    });
    expect(login.error).toBeNull();
    const branches = await client.from('branches').select('code');
    expect(branches.data).toEqual([{ code: 'B1' }]);
  });

  it('undoes the restore with the safety backup', async () => {
    const safety = ((await admin('GET', 'backups')).body.backups as { name: string }[]).find(
      (entry) => entry.name.endsWith('-before-restore.dump'),
    );
    await admin('POST', 'backups-restore', { name: safety?.name, gymCode: 'zakho-fit' });
    expect(await members()).toEqual(['ئارام', 'بەختیار']);
  });
});
