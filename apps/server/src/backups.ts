import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { queryAsync, type Database } from './database.ts';

// The offline server's backups (spec §2.5, step OF-e): every day at a set time (02:00 Baghdad by
// default) the whole database, Auth's logins with it, is dumped with pg_dump into the data folder's
// backups; the newest 30 are kept, and a copy goes to a second folder when one is set (a USB stick,
// another disk). Restoring loads a backup into a new database next to the running one, checks it is
// this gym's, then swaps the two by renaming them; the database it replaced is kept until the next
// restore. The safety backup made first means a restore can always be undone.

export const KEEP_BACKUPS = 30;
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NAME = /^[a-z0-9-]+\.dump$/;

export type BackupKind = 'daily' | 'manual' | 'before-restore' | 'before-update';

export interface BackupSettings {
  /** HH:MM in Baghdad. */
  readonly time: string;
  /** A second folder every backup is copied to; null: none. */
  readonly copyTo: string | null;
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = { time: '02:00', copyTo: null };

export interface BackupEntry {
  readonly name: string;
  readonly size: number;
  readonly createdAt: string;
}

export class BackupError extends Error {
  constructor(
    readonly key:
      | 'invalid_time'
      | 'invalid_folder'
      | 'backup_not_found'
      | 'confirm_mismatch'
      | 'backup_failed'
      | 'restore_failed'
      | 'backup_other_gym'
      | 'busy',
    readonly detail = '',
  ) {
    super(key);
  }
}

export function parseBackupSettings(text: string | null): BackupSettings {
  if (text === null) return DEFAULT_BACKUP_SETTINGS;
  try {
    const raw = JSON.parse(text) as Partial<BackupSettings>;
    return {
      time:
        typeof raw.time === 'string' && TIME.test(raw.time)
          ? raw.time
          : DEFAULT_BACKUP_SETTINGS.time,
      copyTo: typeof raw.copyTo === 'string' && raw.copyTo.trim() !== '' ? raw.copyTo : null,
    };
  } catch {
    return DEFAULT_BACKUP_SETTINGS;
  }
}

/** Milliseconds from `now` to the next HH:MM in Baghdad (UTC+3 all year: no summer time since 2008). */
export function untilBackup(now: number, time: string): number {
  const match = TIME.exec(time);
  if (!match) throw new BackupError('invalid_time');
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  const baghdad = now + BAGHDAD_OFFSET_MS;
  const dayStart = Math.floor(baghdad / DAY_MS) * DAY_MS;
  let next = dayStart + minutes * 60_000;
  if (next <= baghdad) next += DAY_MS;
  return next - baghdad;
}

/** gymcode-YYYYMMDD-HHMMSS-kind.dump, in Baghdad time, so names sort by time. */
export function backupName(gymCode: string | null, now: number, kind: BackupKind): string {
  const stamp = new Date(now + BAGHDAD_OFFSET_MS)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);
  return `${gymCode ?? 'server'}-${stamp}-${kind}.dump`;
}

/** The backups beyond the newest `keep`, oldest first, to delete. */
export function toPrune(entries: readonly BackupEntry[], keep: number = KEEP_BACKUPS): string[] {
  return [...entries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name))
    .slice(keep)
    .map((entry) => entry.name);
}

function listFolder(folder: string): BackupEntry[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => NAME.test(name))
    .map((name) => {
      const stat = statSync(path.join(folder, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function run(file: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, windowsHide: true });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(file)} exited with ${String(code)}`));
    });
  });
}

export interface BackupService {
  readonly folder: string;
  settings(): BackupSettings;
  setSettings(next: { time?: string; copyTo?: string | null }): BackupSettings;
  list(): BackupEntry[];
  backUp(kind: BackupKind): Promise<BackupEntry>;
  /** Puts a backup back; `gymCode` must be the gym's, typed by the person to confirm. */
  restore(name: string, gymCode: string): Promise<void>;
  stop(): void;
}

export interface BackupOptions {
  readonly db: Database;
  readonly dataRoot: string;
  readonly log: (line: string) => void;
  /** Make the daily backups (the installed server); without it, only on request. */
  readonly schedule: boolean;
  /** The gym this server's license is for (a backup of another gym is refused); null: none yet. */
  readonly licenseGymId: () => string | null;
  /** Stops Auth and PostgREST around the swap, and brings them back (with any new migrations). */
  readonly pauseApi: () => Promise<void>;
  readonly resumeApi: () => Promise<void>;
  readonly now?: () => number;
}

export function startBackupService(options: BackupOptions): BackupService {
  const { db, log } = options;
  const folder = path.join(options.dataRoot, 'backups');
  const settingsFile = path.join(options.dataRoot, 'backups.json');
  const now = options.now ?? (() => Date.now());
  const exe = (name: string) => path.join(db.tools.pgBin, `${name}.exe`);
  const env = {
    ...process.env,
    PGPASSWORD: db.secrets.passwords.supabaseAdmin,
    PGCLIENTENCODING: 'UTF8',
  };
  const connection = ['-h', '127.0.0.1', '-p', String(db.ports.postgres), '-U', 'supabase_admin'];
  let settings = parseBackupSettings(
    existsSync(settingsFile) ? readFileSync(settingsFile, 'utf8') : null,
  );
  let timer: NodeJS.Timeout | null = null;
  let busy = false;
  mkdirSync(folder, { recursive: true });

  const gymCode = async (): Promise<string | null> => {
    const rows = await queryAsync(
      db,
      'select code from public.gyms where deleted_at is null order by created_at limit 2',
    );
    return rows.length === 1 ? (rows[0] ?? null) : null;
  };

  const copyAway = (name: string) => {
    if (settings.copyTo === null) return;
    try {
      mkdirSync(settings.copyTo, { recursive: true });
      copyFileSync(path.join(folder, name), path.join(settings.copyTo, name));
      for (const old of toPrune(listFolder(settings.copyTo)))
        rmSync(path.join(settings.copyTo, old), { force: true });
    } catch (error) {
      log(
        `backup copy to ${settings.copyTo} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const backUp = async (kind: BackupKind): Promise<BackupEntry> => {
    const name = backupName(await gymCode(), now(), kind);
    const file = path.join(folder, name);
    const partial = `${file}.partial`;
    try {
      await run(
        exe('pg_dump'),
        [...connection, '-d', 'postgres', '-Fc', '-Z', '6', '-f', partial],
        env,
      );
    } catch (error) {
      rmSync(partial, { force: true });
      throw new BackupError(
        'backup_failed',
        error instanceof Error ? error.message : String(error),
      );
    }
    renameSync(partial, file);
    for (const old of toPrune(listFolder(folder))) rmSync(path.join(folder, old), { force: true });
    copyAway(name);
    log(`backup made: ${name}`);
    const stat = statSync(file);
    return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
  };

  const schedule = () => {
    if (!options.schedule) return;
    timer = setTimeout(
      () => {
        backUp('daily')
          .catch((error: unknown) => {
            log(`daily backup failed: ${error instanceof Error ? error.message : String(error)}`);
          })
          .finally(schedule);
      },
      untilBackup(now(), settings.time),
    );
  };
  schedule();

  const sql = (statement: string, database = 'template1') =>
    queryAsync(db, statement, { user: 'supabase_admin', database });

  /** Renames the live database aside and the restored one in; retried while a connection slips in. */
  const swap = async () => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await sql(`select pg_terminate_backend(pid) from pg_stat_activity
                    where datname in ('postgres', 'gym_restore') and pid <> pg_backend_pid()`);
        await sql('drop database if exists postgres_before_restore');
        await sql('alter database postgres rename to postgres_before_restore');
        await sql('alter database gym_restore rename to postgres');
        return;
      } catch (error) {
        if (attempt >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  };

  return {
    folder,
    settings: () => settings,
    setSettings: (next) => {
      const time = next.time ?? settings.time;
      if (!TIME.test(time)) throw new BackupError('invalid_time');
      const typed = next.copyTo === undefined ? settings.copyTo : next.copyTo;
      const copyTo = typed === null || typed.trim() === '' ? null : typed.trim();
      if (copyTo !== null && !path.isAbsolute(copyTo)) throw new BackupError('invalid_folder');
      settings = { time, copyTo };
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
      if (timer) clearTimeout(timer);
      schedule();
      log(`backups: every day at ${time}${copyTo ? `, copied to ${copyTo}` : ''}`);
      return settings;
    },
    list: () => listFolder(folder),
    backUp: async (kind) => {
      if (busy) throw new BackupError('busy');
      busy = true;
      try {
        return await backUp(kind);
      } finally {
        busy = false;
      }
    },
    restore: async (name, confirmCode) => {
      if (!NAME.test(name) || !existsSync(path.join(folder, name)))
        throw new BackupError('backup_not_found');
      const code = await gymCode();
      if (code !== null && confirmCode.trim().toLowerCase() !== code)
        throw new BackupError('confirm_mismatch');
      if (busy) throw new BackupError('busy');
      busy = true;
      try {
        await backUp('before-restore');
        await sql('drop database if exists gym_restore');
        await sql('create database gym_restore owner postgres');
        try {
          await run(
            exe('pg_restore'),
            [...connection, '-d', 'gym_restore', '--exit-on-error', path.join(folder, name)],
            env,
          );
        } catch (error) {
          await sql('drop database if exists gym_restore');
          throw new BackupError(
            'restore_failed',
            error instanceof Error ? error.message : String(error),
          );
        }
        const licensed = options.licenseGymId();
        const gyms = await sql(
          'select id::text from public.gyms where deleted_at is null',
          'gym_restore',
        );
        if (licensed !== null && !gyms.includes(licensed)) {
          await sql('drop database if exists gym_restore');
          throw new BackupError('backup_other_gym');
        }
        await options.pauseApi();
        try {
          await swap();
          log(`restored ${name}; the database before it is kept as postgres_before_restore`);
        } finally {
          await options.resumeApi();
        }
      } finally {
        busy = false;
      }
    },
    stop: () => {
      if (timer) clearTimeout(timer);
    },
  };
}
