import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  isValidUsername,
  normalizeUsername,
  SHIPPED_LICENSE_KEYS,
  staffEmail,
  type License,
  type LicenseKeyRing,
} from '@gym/core';
import type { Database as Schema } from '@gym/db';
import { generateTemporaryPassword } from '@gym/staff-admin/server';
import { createClient } from '@supabase/supabase-js';
import { acceptClock, checkClock, parseClockState, type ClockState } from './clock.ts';
import { queryAsync, type Database } from './database.ts';
import {
  gymTarget,
  installCodes,
  readServerLicense,
  summarize,
  type GymTarget,
  type LicenseSummary,
  type StoredCodes,
} from './license.ts';

// The license on the running server (spec §2.6, step OF-b): the codes in license.json, the clock
// check in clock.json, and the gym row kept in line with both every minute, so the rules the
// database already has (the 30-day grace, read-only, branch and device limits) apply offline too.
// The first license makes the gym itself; its first Owner is made once, from the server PC.

/** "Main branch", like `pnpm bootstrap:admin`; renamed later in the app. */
const FIRST_BRANCH_NAME = 'لقی سەرەکی';
const CHECK_EVERY_MS = 60_000;

export class OwnerError extends Error {
  constructor(readonly key: 'no_gym' | 'owner_exists' | 'invalid_username' | 'invalid_name') {
    super(key);
  }
}

export interface LicenseServiceOptions {
  readonly db: Database;
  readonly dataRoot: string;
  /** gym-server's own loopback address, for Auth's admin API (the first Owner). */
  readonly url: string;
  readonly machineCode: string;
  readonly log: (line: string) => void;
  /** The keys codes must be signed with; tests pass a throwaway key, servers the shipped ones. */
  readonly keys?: LicenseKeyRing;
  readonly now?: () => number;
}

export interface LicenseService {
  readonly machineCode: string;
  summary(): LicenseSummary;
  /** The gym the installed license is for (even when it no longer verifies); null: none. */
  gymId(): string | null;
  install(input: { license?: string; activation?: string }): Promise<LicenseSummary>;
  createOwner(input: { username: string; fullName: string }): Promise<{
    username: string;
    temporaryPassword: string;
  }>;
  acceptClock(): Promise<LicenseSummary>;
  refresh(): Promise<void>;
  stop(): void;
}

function readJson(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function readCodes(file: string): StoredCodes | null {
  const text = readJson(file);
  if (text === null) return null;
  try {
    const raw = JSON.parse(text) as Partial<StoredCodes>;
    if (typeof raw.license !== 'string') return null;
    return {
      license: raw.license,
      activation: typeof raw.activation === 'string' ? raw.activation : null,
    };
  } catch {
    return null;
  }
}

/** Makes the gym of a first license: its roles and branch B1, as the cloud does (create_gym). */
async function ensureGym(db: Database, license: License): Promise<void> {
  const others = await queryAsync(db, "select id from public.gyms where id <> :'gym_id'::uuid", {
    variables: { gym_id: license.gymId },
  });
  if (others.length > 0) throw new Error('This server has another gym in its database.');
  await queryAsync(
    db,
    `select public.create_gym(
       p_code => :'code', p_name_ckb => :'name', p_first_branch_name => :'branch',
       p_edition => 'offline', p_id => :'gym_id'::uuid)
     where not exists (select from public.gyms where id = :'gym_id'::uuid);
     update public.gyms set name_ckb = :'name'
      where id = :'gym_id'::uuid and name_ckb is distinct from :'name';`,
    {
      variables: {
        gym_id: license.gymId,
        code: license.gymCode,
        name: license.gymName,
        branch: FIRST_BRANCH_NAME,
      },
    },
  );
}

/**
 * Brings the gym row in line with the license: a yearly license ends at the end of its last day
 * in Baghdad (then the grace period), a perpetual one never; the limits; read-only through
 * suspended_at. Only changed values are written, so the audit log gets a row only for a change.
 */
async function applyTarget(db: Database, target: GymTarget): Promise<void> {
  const { terms } = target;
  await queryAsync(
    db,
    `update public.gyms g set
       paid_until = case when :'has_terms' then t.paid_until else g.paid_until end,
       max_branches = case when :'has_terms' then t.max_branches else g.max_branches end,
       max_devices = case when :'has_terms' then t.max_devices else g.max_devices end,
       suspended_at = case when :'read_only' then coalesce(g.suspended_at, now()) end
     from (select
             (nullif(:'last_day', '')::date + 1)::timestamp at time zone 'Asia/Baghdad' as paid_until,
             nullif(:'max_branches', '')::integer as max_branches,
             nullif(:'max_devices', '')::integer as max_devices) t
     where g.id = :'gym_id'::uuid
       and ((:'has_terms' and (g.paid_until is distinct from t.paid_until
                               or g.max_branches is distinct from t.max_branches
                               or g.max_devices is distinct from t.max_devices))
            or (g.suspended_at is null) = :'read_only');`,
    {
      variables: {
        gym_id: target.gymId,
        has_terms: String(terms !== null),
        last_day: terms?.lastDay ?? '',
        max_branches:
          terms?.maxBranches === null || terms === null ? '' : String(terms.maxBranches),
        max_devices: terms?.maxDevices === null || terms === null ? '' : String(terms.maxDevices),
        read_only: String(target.readOnly),
      },
    },
  );
}

/** The newest audit row's time; after an accept, only rows up to that moment count. */
async function newestAuditRow(db: Database, clock: ClockState | null): Promise<number | null> {
  const rows = await queryAsync(
    db,
    `select floor(extract(epoch from max(occurred_at)) * 1000)::bigint from public.audit_logs
      where nullif(:'accepted', '') is null or occurred_at <= nullif(:'accepted', '')::timestamptz`,
    { variables: { accepted: clock?.acceptedAt ?? '' } },
  );
  const value = rows[0];
  return value === undefined || value === '' ? null : Number(value);
}

export async function startLicenseService(options: LicenseServiceOptions): Promise<LicenseService> {
  const { db, log } = options;
  const keys = options.keys ?? SHIPPED_LICENSE_KEYS;
  const now = options.now ?? (() => Date.now());
  const codesFile = path.join(options.dataRoot, 'license.json');
  const clockFile = path.join(options.dataRoot, 'clock.json');
  let summary: LicenseSummary = summarize({ kind: 'none' }, false, now());
  let licensedGym: string | null = null;
  let running: Promise<void> | null = null;

  const check = async () => {
    const clock = parseClockState(readJson(clockFile));
    const clockCheck = checkClock(now(), clock, await newestAuditRow(db, clock));
    writeFileSync(clockFile, JSON.stringify(clockCheck.next));
    const server = await readServerLicense(readCodes(codesFile), options.machineCode, keys);
    const target = gymTarget(server, clockCheck.behind);
    licensedGym = target?.gymId ?? null;
    if (target !== null) await applyTarget(db, target);
    const next = summarize(server, clockCheck.behind, now());
    if (next.kind !== summary.kind || next.clockBehind !== summary.clockBehind) {
      log(`license: ${next.kind}${next.clockBehind ? ', the clock is set back' : ''}`);
    }
    summary = next;
  };
  /** One check at a time; a call during a check waits for it and runs again. */
  const refresh = async () => {
    while (running) await running;
    running = check().finally(() => {
      running = null;
    });
    await running;
  };

  await refresh();
  const timer = setInterval(() => {
    refresh().catch((error: unknown) => {
      log(`license check failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, CHECK_EVERY_MS);

  return {
    machineCode: options.machineCode,
    summary: () => summary,
    gymId: () => licensedGym,
    install: async (input) => {
      const codes = await installCodes(input, readCodes(codesFile), options.machineCode, keys);
      const server = await readServerLicense(codes, options.machineCode, keys);
      if ('license' in server) await ensureGym(db, server.license);
      writeFileSync(codesFile, JSON.stringify(codes, null, 2));
      log(`license installed: ${server.kind}`);
      await refresh();
      return summary;
    },
    createOwner: async (input) => {
      const gyms = await queryAsync(
        db,
        'select id, code from public.gyms where deleted_at is null',
      );
      const [gymId = '', gymCode = ''] = (gyms.length === 1 ? (gyms[0] ?? '') : '').split('\t');
      if (!gymId) throw new OwnerError('no_gym');
      const staff = await queryAsync(
        db,
        "select count(*) from public.staff_users where gym_id = :'gym_id'::uuid",
        { variables: { gym_id: gymId } },
      );
      if (staff[0] !== '0') throw new OwnerError('owner_exists');
      const username = normalizeUsername(input.username);
      if (!isValidUsername(username)) throw new OwnerError('invalid_username');
      const fullName = input.fullName.trim();
      if (fullName.length === 0 || fullName.length > 100) throw new OwnerError('invalid_name');
      const role = await queryAsync(
        db,
        "select id from public.roles where gym_id = :'gym_id'::uuid and key = 'owner'",
        { variables: { gym_id: gymId } },
      );

      const admin = createClient<Schema>(options.url, db.secrets.secretKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const temporaryPassword = generateTemporaryPassword();
      const created = await admin.auth.admin.createUser({
        email: staffEmail(username, gymCode),
        password: temporaryPassword,
        email_confirm: true,
      });
      if (created.error)
        throw new Error(`Auth refused the Owner's login: ${created.error.message}`);
      const inserted = await admin.from('staff_users').insert({
        id: created.data.user.id,
        gym_id: gymId,
        username,
        full_name: fullName,
        role_id: role[0] ?? '',
        all_branches: true,
        must_change_password: true,
      });
      if (inserted.error) {
        // Never a login without its staff account.
        await admin.auth.admin.deleteUser(created.data.user.id);
        throw new Error(`The Owner's account was not saved: ${inserted.error.message}`);
      }
      log(`first Owner made: ${username}`);
      return { username, temporaryPassword };
    },
    acceptClock: async () => {
      writeFileSync(clockFile, JSON.stringify(acceptClock(now())));
      log('the current time was accepted by an administrator on this PC');
      await refresh();
      return summary;
    },
    refresh,
    stop: () => {
      clearInterval(timer);
    },
  };
}
