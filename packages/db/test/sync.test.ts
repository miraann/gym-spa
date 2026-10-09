// End-to-end sync tests: Node PowerSync clients act as devices against local Supabase and local
// PowerSync. Run with `pnpm test:sync` after `pnpm db:start` and `pnpm sync:start`.
//
// They create their own branches and staff (and remove them afterwards), so they don't depend on
// the demo data or on your local accounts.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  UpdateType,
  type PowerSyncBackendConnector,
  type SyncStreamSubscription,
} from '@powersync/common';
import { PowerSyncDatabase } from '@powersync/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AppSchema,
  applyChange,
  createUploader,
  writeMetadata,
  type AuthorSession,
  type Database,
} from '../src';

const POWERSYNC_URL = 'http://localhost:54380';

interface LocalStatus {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
}
const status = JSON.parse(
  execSync('pnpm --silent --filter @gym/supabase exec supabase status --output json --workdir ..', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
) as LocalStatus;

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, clientOptions);
const run = randomUUID().slice(0, 6);
const password = `Sync-test-${run}`;
const tempDir = mkdtempSync(path.join(tmpdir(), 'gym-sync-'));

interface Staff {
  id: string;
  client: SupabaseClient;
  token: string;
}

interface SupabaseResult {
  data: unknown;
  error: { message: string } | null;
}
type Success<R> = Extract<R, { error: null }>;

function succeeded<R extends SupabaseResult>(result: R): result is Success<R> {
  return result.error === null;
}

/** Throws on a Supabase error; returns the data (a row, rows, or null for plain writes). */
async function check<R extends SupabaseResult>(
  promise: PromiseLike<R>,
): Promise<Success<R>['data']> {
  const result = await promise;
  if (!succeeded(result)) throw new Error(result.error?.message);
  return result.data;
}

async function createBranch(code: string): Promise<string> {
  const row = await check(
    admin
      .from('branches')
      .insert({ code, name_ckb: `لقی تاقیکردنەوە ${code}` })
      .select('id')
      .single(),
  );
  return row.id;
}

async function createStaff(
  name: string,
  roleKey: string,
  branchIds: string[],
  allBranches = false,
): Promise<Staff> {
  const username = `sync_${run}_${name}`;
  const email = `${username}@staff.gym-spa.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(created.error.message);
  const userId = created.data.user.id;
  const role = await check(admin.from('roles').select('id').eq('key', roleKey).single());
  await check(
    admin.from('staff_users').insert({
      id: userId,
      username,
      full_name: `تاقیکردنەوە ${name}`,
      role_id: role.id,
      all_branches: allBranches,
      must_change_password: false,
    }),
  );
  for (const branchId of branchIds) {
    await check(admin.from('staff_branches').insert({ staff_id: userId, branch_id: branchId }));
  }
  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, clientOptions);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(signIn.error.message);
  return { id: userId, client, token: signIn.data.session.access_token };
}

/** A device: its own local database, connected with one staff member's token. */
interface Device {
  db: PowerSyncDatabase;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribeBranch(branchId: string): Promise<void>;
  waitForUploads(): Promise<void>;
  /** Unsubscribes its streams and closes its database. */
  close(): Promise<void>;
}

function createDevice(name: string, signedIn: Staff, authors: Staff[] = [signedIn]): Device {
  const db = new PowerSyncDatabase({
    schema: AppSchema,
    database: { dbFilename: `${name}.db`, dbLocation: tempDir },
  });
  const sessions = new Map(authors.map((staff) => [staff.id, staff]));
  const connector: PowerSyncBackendConnector = {
    fetchCredentials: () => Promise.resolve({ endpoint: POWERSYNC_URL, token: signedIn.token }),
    uploadData: createUploader({
      sessions: {
        forAuthor: (authorId): Promise<AuthorSession> => {
          const staff = sessions.get(authorId);
          return Promise.resolve(
            staff ? { kind: 'ready', client: staff.client } : { kind: 'signed_out' },
          );
        },
      },
      backoffMs: () => 100,
    }),
  };
  // Kept so they can be unsubscribed in cleanup: a dropped subscription is reported as leaked.
  const subscriptions: SyncStreamSubscription[] = [];
  return {
    db,
    connect: () => db.connect(connector, { retryDelayMs: 200 }),
    disconnect: () => db.disconnect(),
    async subscribeBranch(branchId) {
      const subscription = await db.syncStream('branch', { branch_id: branchId }).subscribe();
      subscriptions.push(subscription);
      await subscription.waitForFirstSync();
    },
    async waitForUploads() {
      await waitFor(async () => (await db.getUploadQueueStats()).count === 0);
    },
    async close() {
      for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
      await db.close();
    },
  };
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for sync');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function localValue(device: Device, sql: string, params: unknown[]): Promise<unknown> {
  const row = await device.db.getOptional<{ value: unknown }>(sql, params);
  return row?.value;
}

let branchX: string;
let branchY: string;
let owner1: Staff;
let owner2: Staff;
let receptionX: Staff;
const devices: Device[] = [];
const staffIds: string[] = [];

beforeAll(async () => {
  const codes = await check(admin.from('branches').select('code'));
  const free = Array.from({ length: 900 }, (_, i) => `B${String(i + 100)}`).filter(
    (code) => !codes.some((row) => row.code === code),
  );
  branchX = await createBranch(free[0] ?? 'B998');
  branchY = await createBranch(free[1] ?? 'B999');
  owner1 = await createStaff('admin1', 'admin', [], true);
  owner2 = await createStaff('admin2', 'admin', [], true);
  receptionX = await createStaff('reception', 'receptionist', [branchX]);
  staffIds.push(owner1.id, owner2.id, receptionX.id);
}, 60_000);

afterAll(async () => {
  await Promise.all(devices.map((device) => device.close()));
  // Test data only. Real staff are never deleted.
  await admin.from('settings').delete().in('branch_id', [branchX, branchY]);
  await admin.from('staff_branches').delete().in('staff_id', staffIds);
  await admin.from('staff_users').delete().in('id', staffIds);
  for (const id of staffIds) await admin.auth.admin.deleteUser(id);
  await admin.from('branches').delete().in('id', [branchX, branchY]);
  rmSync(tempDir, { recursive: true, force: true });
}, 60_000);

function device(name: string, signedIn: Staff, authors?: Staff[]): Device {
  const created = createDevice(`${run}-${name}`, signedIn, authors);
  devices.push(created);
  return created;
}

describe('what a device downloads', () => {
  it('gets the role and permission catalog', async () => {
    const reception = device('catalog', receptionX);
    await reception.connect();
    await reception.db.waitForFirstSync();

    expect(
      await localValue(reception, 'SELECT count(*) AS value FROM roles WHERE is_system = 1', []),
    ).toBe(8);
    expect(
      await localValue(
        reception,
        `SELECT module AS value FROM permissions WHERE id = 'members.create'`,
        [],
      ),
    ).toBe('members');
  });

  it('gets its own branch with its staff, and nothing of a branch the staff member cannot access', async () => {
    const reception = device('branch-scope', receptionX);
    await reception.connect();
    await reception.subscribeBranch(branchX);
    await reception.subscribeBranch(branchY);

    const branchIds = await reception.db.getAll<{ id: string }>('SELECT id FROM branches');
    expect(branchIds.map((row) => row.id)).toEqual([branchX]);

    // The receptionist, and every active staff member with all branches.
    const allBranches = await check(
      admin
        .from('staff_users')
        .select('id')
        .eq('all_branches', true)
        .eq('is_active', true)
        .is('deleted_at', null),
    );
    const staff = await reception.db.getAll<{ id: string }>('SELECT id FROM staff_users');
    expect(staff.map((row) => row.id).sort()).toEqual(
      [...allBranches.map((row) => row.id), receptionX.id].sort(),
    );
    expect(allBranches.map((row) => row.id)).toEqual(
      expect.arrayContaining([owner1.id, owner2.id]),
    );
    expect(
      await localValue(
        reception,
        'SELECT count(*) AS value FROM staff_branch_access WHERE branch_id = ?',
        [branchY],
      ),
    ).toBe(0);
  });
});

describe('two devices, offline, then back online', () => {
  it("keeps both devices' changes to different fields of the same row", async () => {
    const deviceA = device('two-a', owner1);
    const deviceB = device('two-b', owner2);
    for (const each of [deviceA, deviceB]) {
      await each.connect();
      await each.subscribeBranch(branchX);
    }

    // Both go offline and edit the same branch.
    await deviceA.disconnect();
    await deviceB.disconnect();
    await deviceA.db.execute('UPDATE branches SET phone = ?, _metadata = ? WHERE id = ?', [
      '0770 111 1111',
      writeMetadata(owner1.id),
      branchX,
    ]);
    await deviceB.db.execute('UPDATE branches SET address = ?, _metadata = ? WHERE id = ?', [
      'سلێمانی، شەقامی تاقیکردنەوە',
      writeMetadata(owner2.id),
      branchX,
    ]);
    expect((await deviceA.db.getUploadQueueStats()).count).toBe(1);

    // Nothing reached the server while offline.
    const before = await check(admin.from('branches').select('phone').eq('id', branchX).single());
    expect(before.phone).toBeNull();

    await deviceA.connect();
    await deviceB.connect();
    await deviceA.waitForUploads();
    await deviceB.waitForUploads();

    const server = await check(
      admin.from('branches').select('phone, address, updated_by').eq('id', branchX).single(),
    );
    expect(server.phone).toBe('0770 111 1111');
    expect(server.address).toBe('سلێمانی، شەقامی تاقیکردنەوە');

    // And each device ends up with both changes.
    for (const each of [deviceA, deviceB]) {
      await waitFor(
        async () =>
          (await localValue(
            each,
            "SELECT phone || '|' || address AS value FROM branches WHERE id = ?",
            [branchX],
          )) === '0770 111 1111|سلێمانی، شەقامی تاقیکردنەوە',
      );
    }
  });

  it('keeps the last upload when both change the same field', async () => {
    const deviceA = device('same-a', owner1);
    const deviceB = device('same-b', owner2);
    for (const each of [deviceA, deviceB]) {
      await each.connect();
      await each.subscribeBranch(branchX);
      await each.disconnect();
    }
    await deviceA.db.execute('UPDATE branches SET name_en = ?, _metadata = ? WHERE id = ?', [
      'From A',
      writeMetadata(owner1.id),
      branchX,
    ]);
    await deviceB.db.execute('UPDATE branches SET name_en = ?, _metadata = ? WHERE id = ?', [
      'From B',
      writeMetadata(owner2.id),
      branchX,
    ]);

    await deviceA.connect();
    await deviceA.waitForUploads();
    await deviceB.connect();
    await deviceB.waitForUploads();

    const server = await check(admin.from('branches').select('name_en').eq('id', branchX).single());
    expect(server.name_en).toBe('From B');
    await waitFor(
      async () =>
        (await localValue(deviceA, 'SELECT name_en AS value FROM branches WHERE id = ?', [
          branchX,
        ])) === 'From B',
    );
  });
});

describe('changes the server refuses', () => {
  it("records a change the author may not make, and goes back to the server's version", async () => {
    const reception = device('refused', receptionX);
    await reception.connect();
    await reception.subscribeBranch(branchX);
    const serverPhone = await localValue(
      reception,
      'SELECT phone AS value FROM branches WHERE id = ?',
      [branchX],
    );

    await reception.db.execute('UPDATE branches SET phone = ?, _metadata = ? WHERE id = ?', [
      '0770 999 9999',
      writeMetadata(receptionX.id),
      branchX,
    ]);
    await reception.waitForUploads();

    const rejected = await reception.db.getAll<{
      table_name: string;
      row_id: string;
      error_key: string;
    }>('SELECT table_name, row_id, error_key FROM rejected_changes');
    expect(rejected).toEqual([
      { table_name: 'branches', row_id: branchX, error_key: 'not_found_or_not_allowed' },
    ]);
    await waitFor(
      async () =>
        (await localValue(reception, 'SELECT phone AS value FROM branches WHERE id = ?', [
          branchX,
        ])) === serverPhone,
    );
  });

  it("keeps the guard's reason, so the app can explain it", async () => {
    const owner = device('guard', owner1);
    await owner.connect();
    await owner.subscribeBranch(branchX);
    await owner.db.execute('UPDATE branches SET code = ?, _metadata = ? WHERE id = ?', [
      'B990',
      writeMetadata(owner1.id),
      branchX,
    ]);
    await owner.waitForUploads();

    expect(await localValue(owner, 'SELECT error_key AS value FROM rejected_changes', [])).toBe(
      'read_only_column',
    );
  });

  it('rejects the changes of an author who is no longer signed in on this device', async () => {
    const shared = device('signed-out', owner1, [owner1]);
    await shared.connect();
    await shared.subscribeBranch(branchX);
    await shared.db.execute(
      'INSERT INTO settings (id, branch_id, key, value, _metadata) VALUES (uuid(), ?, ?, ?, ?)',
      [branchX, 'security.idle_lock_minutes', '20', writeMetadata(owner2.id)],
    );
    await shared.waitForUploads();

    expect(await localValue(shared, 'SELECT error_key AS value FROM rejected_changes', [])).toBe(
      'author_signed_out',
    );
  });
});

describe('who a change belongs to', () => {
  it("uploads each change under its own author's session", async () => {
    const shared = device('authors', owner1, [owner1, owner2]);
    await shared.connect();
    await shared.subscribeBranch(branchY);
    await shared.db.execute(
      'INSERT INTO settings (id, branch_id, key, value, _metadata) VALUES (uuid(), ?, ?, ?, ?)',
      [branchY, 'security.idle_lock_minutes', '15', writeMetadata(owner1.id)],
    );
    await shared.db.execute(
      'INSERT INTO settings (id, branch_id, key, value, _metadata) VALUES (uuid(), ?, ?, ?, ?)',
      [branchY, 'security.pin_max_attempts', '4', writeMetadata(owner2.id)],
    );
    await shared.waitForUploads();

    const rows = await check(
      admin.from('settings').select('key, value, created_by').eq('branch_id', branchY),
    );
    expect(rows.sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: 'security.idle_lock_minutes', value: 15, created_by: owner1.id },
      { key: 'security.pin_max_attempts', value: 4, created_by: owner2.id },
    ]);
  });

  it('treats a repeated insert (its first response was lost) as done', async () => {
    const id = randomUUID();
    const entry = {
      op: UpdateType.PUT,
      table: 'settings',
      id,
      opData: { branch_id: branchY, key: 'sync.unsynced_alert_hours', value: '12' },
    };
    expect(await applyChange(owner1.client, entry)).toEqual({ kind: 'done' });
    expect(await applyChange(owner1.client, entry)).toEqual({ kind: 'done' });
  });
});
