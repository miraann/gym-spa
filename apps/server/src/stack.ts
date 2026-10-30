import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createStaffAdminHandler, supabaseStaffAdminPorts } from '@gym/staff-admin/server';
import {
  applyCompat,
  applyMigrations,
  applySeed,
  initdb,
  migrateAuth,
  pgCtlStart,
  pgCtlStop,
  postgresReady,
  queryAsync,
  type Database,
} from './database.ts';
import { createGateway } from './gateway.ts';
import { runScheduledJobs, type JobRunner } from './jobs.ts';
import {
  OFFLINE_PUBLISHABLE_KEY,
  newServerSecrets,
  roleTokens,
  type ServerSecrets,
} from './keys.ts';
import { dataPaths, toolPaths, type ToolPaths } from './paths.ts';
import { rotateLogs } from './log.ts';
import type { StackPorts } from './ports.ts';
import {
  gatewayUrl,
  httpOk,
  startAuth,
  startPostgres,
  startPostgrest,
  waitFor,
} from './processes.ts';
import { supervise, type ProgramStatus, type Supervised } from './supervisor.ts';
import { serverCertificate } from './tls.ts';
import { SERVER_VERSION } from './version.ts';

// One offline server: its database made once, then Postgres, Auth and PostgREST started behind
// gym-server. The development server (`pnpm server:dev`) and the e2e run (`pnpm test:offline`)
// use it; the installed Windows service (OF-f) will too.

export interface StackOptions {
  readonly dataRoot: string;
  readonly ports: StackPorts;
  readonly tools?: ToolPaths;
  readonly log?: (line: string) => void;
}

function readSecrets(file: string): ServerSecrets {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    parsed.version !== 1
  ) {
    throw new Error(`${file} is not a server secrets file.`);
  }
  return parsed as ServerSecrets;
}

/** The server's database and its parts, from an existing data folder. */
export function openDatabase(options: StackOptions): Database {
  const data = dataPaths(options.dataRoot);
  if (!existsSync(data.secrets)) {
    throw new Error(`No server in ${options.dataRoot}: make one first (pnpm server:dev init).`);
  }
  return {
    tools: options.tools ?? toolPaths(),
    data,
    secrets: readSecrets(data.secrets),
    ports: options.ports,
  };
}

/**
 * Makes a new server in an empty data folder: its secrets, the database, the Supabase roles,
 * Auth's and our migrations, and with `seed` the demo gym (development and tests only).
 */
export function createServer(options: StackOptions & { readonly seed: boolean }): Database {
  const log = options.log ?? (() => undefined);
  const data = dataPaths(options.dataRoot);
  if (existsSync(data.database)) {
    throw new Error(`${data.database} exists already.`);
  }
  const tools = options.tools ?? toolPaths();
  for (const part of [tools.pgBin, tools.authExe, tools.postgrestExe]) {
    if (!existsSync(part)) throw new Error(`${part} is missing: run pnpm server:tools first.`);
  }
  mkdirSync(data.logs, { recursive: true });
  const secrets = newServerSecrets();
  // Readable by this Windows account only (the installed server tightens it further, OF-a).
  writeFileSync(data.secrets, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  const db: Database = { tools, data, secrets, ports: options.ports };

  log('database (initdb)');
  initdb(db);
  pgCtlStart(db, path.join(data.logs, 'postgres-init.log'));
  try {
    log('Supabase roles and schemas');
    applyCompat(db);
    log('Supabase Auth migrations');
    migrateAuth(db);
    applyMigrations(db, log);
    if (options.seed) {
      log('seed.sql');
      applySeed(db);
    }
  } finally {
    pgCtlStop(db);
  }
  return db;
}

/**
 * Stops what an interrupted development run left behind: gym-server itself (a Node process running
 * one of apps/server's commands, listening on this server's gateway port), Postgres of this data folder, and Auth
 * and PostgREST started from this tools folder. Nothing else on the PC is touched.
 */
export function stopLeftovers(options: StackOptions): void {
  const tools = options.tools ?? toolPaths();
  const data = dataPaths(options.dataRoot);
  const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
  const programs = [tools.authExe, tools.postgrestExe].map(quote).join(', ');
  const script = [
    `$gateway = Get-NetTCPConnection -LocalPort ${String(options.ports.gateway)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
    'if ($gateway) {',
    '  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($gateway.OwningProcess)"',
    "  if ($owner.Name -eq 'node.exe' -and $owner.CommandLine -match 'src[\\\\/]cli[\\\\/](dev|serve|test-offline)\\.ts') { Stop-Process -Id $owner.ProcessId -Force }",
    '}',
    `Get-Process auth, postgrest -ErrorAction SilentlyContinue | Where-Object { @(${programs}) -contains $_.Path } | Stop-Process -Force`,
  ].join('\n');
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'ignore',
  });
  if (existsSync(data.database)) pgCtlStop({ tools, data });
}

/** Deletes a development server's data folder (never used for an installed server). */
export function removeServer(dataRoot: string): void {
  rmSync(dataRoot, { recursive: true, force: true });
}

/** What the e2e helpers read to reach a development server (`GYM_E2E_BACKEND`). */
export interface BackendFile {
  readonly API_URL: string;
  readonly PUBLISHABLE_KEY: string;
  readonly SECRET_KEY: string;
}

export interface StartOptions extends StackOptions {
  /** Opens HTTPS for the LAN on this port, on every network, with the server's own certificate. */
  readonly lanPort?: number;
  /** Runs the scheduled jobs (pg_cron's in the cloud). */
  readonly jobs?: boolean;
}

export interface ServerStatus {
  readonly ok: boolean;
  readonly version: string;
  readonly programs: readonly ProgramStatus[];
}

/** What /server/v1/info tells a PC (no key needed): which server and gym this is. */
export interface ServerInfo {
  readonly edition: 'offline';
  readonly version: string;
  /** The certificate's SHA-256 (AB:CD:…), when the LAN port is open. */
  readonly fingerprint: string | null;
  /** The server's gym; null until its license made it (OF-b), or while there are several. */
  readonly gym: { readonly code: string; readonly name: string } | null;
}

export interface RunningServer {
  readonly db: Database;
  readonly url: string;
  readonly backend: BackendFile;
  readonly fingerprint: string | null;
  status(): ServerStatus;
  info(): Promise<ServerInfo>;
  stop(): Promise<void>;
}

/** The server's gym: its one gym row. */
async function serverGym(db: Database): Promise<ServerInfo['gym']> {
  const rows = await queryAsync(
    db,
    'select code, name_ckb from public.gyms where deleted_at is null order by created_at limit 2',
  );
  if (rows.length !== 1) return null;
  const [code = '', name = ''] = (rows[0] ?? '').split('\t');
  return { code, name };
}

function listen(server: http.Server, port: number, host?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

/**
 * Starts Postgres, Auth and PostgREST (each kept running by the supervisor), applies any new
 * migrations, then opens gym-server: plain HTTP on 127.0.0.1 for the server PC itself, and with
 * `lanPort` HTTPS for the other PCs.
 */
export async function startServer(options: StartOptions): Promise<RunningServer> {
  const log = options.log ?? (() => undefined);
  const db = openDatabase(options);
  rotateLogs(db.data.logs, ['postgres.log', 'auth.log', 'postgrest.log']);
  if (postgresReady(db)) {
    throw new Error(`Something already listens on port ${String(db.ports.postgres)}.`);
  }
  const programs: Supervised[] = [];
  const servers: http.Server[] = [];
  let jobs: JobRunner | null = null;
  const stop = async () => {
    jobs?.stop();
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
            server.closeAllConnections();
          }),
      ),
    );
    for (const program of [...programs].reverse()) await program.stop();
  };
  const ready = (label: string, check: () => boolean | Promise<boolean>) => () =>
    waitFor(label, check);
  try {
    programs.push(
      supervise({
        name: 'postgres',
        start: () => startPostgres(db),
        ready: ready('Postgres', () => postgresReady(db)),
        // A clean stop, so the next start needs no recovery.
        halt: (child) => {
          pgCtlStop(db);
          child.kill();
        },
        log,
      }),
    );
    await waitFor('Postgres', () => postgresReady(db));
    // Auth's tables first: our migrations refer to them.
    migrateAuth(db);
    const applied = applyMigrations(db, log);
    if (applied > 0) log(`${String(applied)} new migration(s) applied`);

    const authHealth = `http://127.0.0.1:${String(db.ports.auth)}/health`;
    programs.push(
      supervise({
        name: 'auth',
        start: () => startAuth(db),
        ready: ready('Supabase Auth', () => httpOk(authHealth)),
        log,
      }),
    );
    await waitFor('Supabase Auth', () => httpOk(authHealth));

    const restRoot = `http://127.0.0.1:${String(db.ports.rest)}/`;
    programs.push(
      supervise({
        name: 'postgrest',
        start: () => startPostgrest(db),
        ready: ready('PostgREST', () => httpOk(restRoot)),
        log,
      }),
    );
    await waitFor('PostgREST', () => httpOk(restRoot));

    const url = gatewayUrl(db.ports);
    const certificate = options.lanPort === undefined ? null : serverCertificate(options.dataRoot);
    const status = (): ServerStatus => {
      const each = programs.map((program) => program.status());
      return {
        ok: each.every((program) => program.state === 'running'),
        version: SERVER_VERSION,
        programs: each,
      };
    };
    const info = async (): Promise<ServerInfo> => ({
      edition: 'offline',
      version: SERVER_VERSION,
      fingerprint: certificate?.fingerprint ?? null,
      gym: await serverGym(db),
    });
    const tokens = roleTokens(db.secrets);
    const handler = createGateway({
      keys: {
        publishableKey: OFFLINE_PUBLISHABLE_KEY,
        secretKey: db.secrets.secretKey,
        anonToken: tokens.anon,
        serviceToken: tokens.service,
      },
      authPort: db.ports.auth,
      restPort: db.ports.rest,
      // The staff module calls back into gym-server on the loopback address, with the secret key.
      staffAdmin: createStaffAdminHandler(
        supabaseStaffAdminPorts({
          url,
          secretKey: db.secrets.secretKey,
          publishableKey: OFFLINE_PUBLISHABLE_KEY,
        }),
      ),
      health: status,
      info,
    });
    const loopback = http.createServer(handler);
    servers.push(loopback);
    await listen(loopback, db.ports.gateway, '127.0.0.1');
    if (certificate !== null && options.lanPort !== undefined) {
      const lan = https.createServer({ key: certificate.key, cert: certificate.cert }, handler);
      servers.push(lan);
      await listen(lan, options.lanPort);
      log(`HTTPS for the LAN on port ${String(options.lanPort)} (${certificate.fingerprint})`);
    }
    if (options.jobs) {
      jobs = runScheduledJobs(async (sql) => {
        await queryAsync(db, sql);
      }, log);
    }

    const backend: BackendFile = {
      API_URL: url,
      PUBLISHABLE_KEY: OFFLINE_PUBLISHABLE_KEY,
      SECRET_KEY: db.secrets.secretKey,
    };
    writeFileSync(db.data.backendFile, JSON.stringify(backend, null, 2), { mode: 0o600 });
    return {
      db,
      url,
      backend,
      fingerprint: certificate?.fingerprint ?? null,
      status,
      info,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
