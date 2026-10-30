import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { authEnvironment } from './processes.ts';
import type { ServerSecrets } from './keys.ts';
import { REPO, type DataPaths, type ToolPaths } from './paths.ts';
import type { StackPorts } from './ports.ts';

// The server's database: made once with initdb, then the Supabase roles (sql/compat.sql),
// Supabase Auth's own migrations, and ours from supabase/migrations, recorded in
// supabase_migrations.schema_migrations like the Supabase CLI does, so an update applies only
// the new ones.

export type DatabaseUser = 'supabase_admin' | 'postgres';

export interface Database {
  readonly tools: ToolPaths;
  readonly data: DataPaths;
  readonly secrets: ServerSecrets;
  readonly ports: StackPorts;
}

function exe(tools: ToolPaths, name: string): string {
  return path.join(tools.pgBin, `${name}.exe`);
}

function passwordOf(secrets: ServerSecrets, user: DatabaseUser): string {
  return user === 'supabase_admin' ? secrets.passwords.supabaseAdmin : secrets.passwords.postgres;
}

/** Runs psql on the server's database; the password goes in the environment, never an argument. */
export function psql(
  db: Database,
  user: DatabaseUser,
  args: readonly string[],
  options: { input?: string; inherit?: boolean } = {},
): SpawnSyncReturns<string> {
  const result = spawnSync(
    exe(db.tools, 'psql'),
    [
      '-X',
      '-h',
      '127.0.0.1',
      '-p',
      String(db.ports.postgres),
      '-U',
      user,
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      ...args,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PGPASSWORD: passwordOf(db.secrets, user), PGCLIENTENCODING: 'UTF8' },
      ...(options.input === undefined ? {} : { input: options.input }),
      ...(options.inherit ? { stdio: 'inherit' } : {}),
    },
  );
  if (result.error) throw result.error;
  return result;
}

function must(result: SpawnSyncReturns<string>, what: string): SpawnSyncReturns<string> {
  if (result.status !== 0) {
    throw new Error(
      `${what} failed (${String(result.status)}):\n${result.stderr || result.stdout}`,
    );
  }
  return result;
}

/** A query's rows as tab-separated lines, as postgres. */
export function query(db: Database, sql: string, user: DatabaseUser = 'postgres'): string[] {
  const result = must(psql(db, user, ['-q', '-t', '-A', '-F', '\t', '-c', sql]), 'A query');
  return result.stdout.split(/\r?\n/).filter((line) => line !== '');
}

/** Whether Postgres answers on its port. */
export function postgresReady(db: Pick<Database, 'tools' | 'ports'>): boolean {
  const result = spawnSync(
    exe(db.tools, 'pg_isready'),
    ['-q', '-h', '127.0.0.1', '-p', String(db.ports.postgres)],
    { stdio: 'ignore' },
  );
  return result.status === 0;
}

/**
 * Starts Postgres with pg_ctl and waits. stdio 'ignore': on Windows the server inherits pg_ctl's
 * pipes, and spawnSync would wait for them to close, that is until the server stops.
 */
export function pgCtlStart(db: Database, logFile: string): void {
  const result = spawnSync(
    exe(db.tools, 'pg_ctl'),
    ['start', '-w', '-t', '60', '-D', db.data.database, '-l', logFile],
    { stdio: 'ignore' },
  );
  if (result.status !== 0) throw new Error(`Postgres did not start (see ${logFile}).`);
}

export function pgCtlStop(db: Pick<Database, 'tools' | 'data'>): void {
  spawnSync(exe(db.tools, 'pg_ctl'), ['stop', '-w', '-m', 'fast', '-D', db.data.database], {
    stdio: 'ignore',
  });
}

/** A new, empty database folder: supabase_admin is the superuser, as on Supabase. */
export function initdb(db: Database): void {
  const passwordFile = path.join(db.data.root, 'initdb-password.txt');
  writeFileSync(passwordFile, db.secrets.passwords.supabaseAdmin, { mode: 0o600 });
  try {
    must(
      spawnSync(
        exe(db.tools, 'initdb'),
        [
          '-D',
          db.data.database,
          '-U',
          'supabase_admin',
          `--pwfile=${passwordFile}`,
          '--auth=scram-sha-256',
          '--encoding=UTF8',
          '--locale-provider=icu',
          '--icu-locale=en-US',
          '--locale=en-US',
        ],
        { encoding: 'utf8' },
      ),
      'initdb',
    );
  } finally {
    rmSync(passwordFile, { force: true });
  }
  // Only the server PC itself reaches Postgres: everything else goes through gym-server.
  appendFileSync(
    path.join(db.data.database, 'postgresql.auto.conf'),
    [
      `port = ${String(db.ports.postgres)}`,
      "listen_addresses = '127.0.0.1'",
      "timezone = 'UTC'",
      // pg_dump and the e2e suite open many connections at once; Auth and PostgREST keep pools.
      'max_connections = 200',
      '',
    ].join('\n'),
  );
}

/** The Supabase roles and schemas (sql/compat.sql). */
export function applyCompat(db: Database): void {
  must(
    psql(db, 'supabase_admin', [
      '-q',
      '-f',
      path.join(REPO, 'apps', 'server', 'sql', 'compat.sql'),
      '-v',
      `authenticator_password=${db.secrets.passwords.authenticator}`,
      '-v',
      `postgres_password=${db.secrets.passwords.postgres}`,
      '-v',
      `auth_admin_password=${db.secrets.passwords.authAdmin}`,
    ]),
    'compat.sql',
  );
}

/** Supabase Auth's own migrations (`auth migrate`); it skips those it has run already. */
export function migrateAuth(db: Database): void {
  const result = spawnSync(db.tools.authExe, ['migrate'], {
    encoding: 'utf8',
    env: authEnvironment(db),
  });
  if (result.error) throw result.error;
  writeFileSync(path.join(db.data.logs, 'auth-migrate.log'), `${result.stdout}${result.stderr}`);
  if (result.status !== 0) throw new Error(`auth migrate failed:\n${result.stderr}`);
}

export interface Migration {
  /** The timestamp before the first underscore, as the Supabase CLI reads it. */
  readonly version: string;
  readonly name: string;
  readonly file: string;
}

const MIGRATION_FILE = /^(\d{14})_(.+)\.sql$/;

/** The migrations in a folder, oldest first. Other files are refused rather than skipped. */
export function migrationsIn(folder: string, files: readonly string[]): Migration[] {
  return files
    .filter((file) => file.endsWith('.sql'))
    .map((file) => {
      const match = MIGRATION_FILE.exec(file);
      if (!match?.[1] || !match[2]) throw new Error(`Not a migration file name: ${file}`);
      return { version: match[1], name: match[2], file: path.join(folder, file) };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * The migrations still to apply. A recorded version that is no longer in the folder, or a new one
 * older than the last recorded, means this isn't the database these migrations belong to: stop.
 */
export function pendingMigrations(
  all: readonly Migration[],
  applied: readonly string[],
): Migration[] {
  const known = new Set(all.map((migration) => migration.version));
  const missing = applied.filter((version) => !known.has(version));
  if (missing.length > 0) {
    throw new Error(`The database has migrations this version doesn't know: ${missing.join(', ')}`);
  }
  const done = new Set(applied);
  const last = [...applied].sort().at(-1);
  const pending = all.filter((migration) => !done.has(migration.version));
  const older = pending.filter((migration) => last !== undefined && migration.version < last);
  if (older.length > 0) {
    throw new Error(
      `Migrations older than the last applied one (${String(last)}) are missing: ${older.map((m) => m.version).join(', ')}`,
    );
  }
  return pending;
}

/** Our migrations not applied yet, each in one transaction together with its record. */
export function applyMigrations(db: Database, log?: (line: string) => void): number {
  const folder = path.join(REPO, 'supabase', 'migrations');
  const all = migrationsIn(folder, readdirSync(folder));
  const applied = query(db, 'select version from supabase_migrations.schema_migrations');
  const pending = pendingMigrations(all, applied);
  for (const migration of pending) {
    log?.(`migration ${path.basename(migration.file)}`);
    must(
      psql(db, 'postgres', [
        '-q',
        '-1',
        '-f',
        migration.file,
        '-c',
        `insert into supabase_migrations.schema_migrations (version, name) values ('${migration.version}', '${migration.name.replaceAll("'", "''")}')`,
      ]),
      path.basename(migration.file),
    );
  }
  return pending.length;
}

/** supabase/seed.sql (the demo gym): development and tests only, never on a gym's server. */
export function applySeed(db: Database): void {
  must(
    psql(db, 'postgres', ['-q', '-1', '-f', path.join(REPO, 'supabase', 'seed.sql')]),
    'seed.sql',
  );
}
