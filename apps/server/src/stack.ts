import { spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
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
  type Database,
} from './database.ts';
import { createGateway } from './gateway.ts';
import {
  OFFLINE_PUBLISHABLE_KEY,
  newServerSecrets,
  roleTokens,
  type ServerSecrets,
} from './keys.ts';
import { dataPaths, toolPaths, type ToolPaths } from './paths.ts';
import type { StackPorts } from './ports.ts';
import {
  gatewayUrl,
  httpOk,
  startAuth,
  startPostgres,
  startPostgrest,
  waitFor,
} from './processes.ts';

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
 * Stops what an interrupted development run left behind: Postgres of this data folder, and Auth
 * and PostgREST started from this tools folder. Nothing else on the PC is touched.
 */
export function stopLeftovers(options: StackOptions): void {
  const tools = options.tools ?? toolPaths();
  const data = dataPaths(options.dataRoot);
  if (existsSync(data.database)) pgCtlStop({ tools, data });
  const programs = [tools.authExe, tools.postgrestExe].map(
    (file) => `'${file.replaceAll("'", "''")}'`,
  );
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-Process auth, postgrest -ErrorAction SilentlyContinue | Where-Object { @(${programs.join(', ')}) -contains $_.Path } | Stop-Process -Force`,
    ],
    { stdio: 'ignore' },
  );
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

export interface RunningServer {
  readonly db: Database;
  readonly url: string;
  readonly backend: BackendFile;
  stop(): Promise<void>;
}

/** Starts Postgres, Auth, PostgREST and gym-server, applying any new migrations first. */
export async function startServer(options: StackOptions): Promise<RunningServer> {
  const log = options.log ?? (() => undefined);
  const db = openDatabase(options);
  mkdirSync(db.data.logs, { recursive: true });
  if (postgresReady(db)) {
    throw new Error(`Something already listens on port ${String(db.ports.postgres)}.`);
  }
  const children: ChildProcess[] = [];
  let gateway: http.Server | undefined;
  const stop = async () => {
    await new Promise<void>((resolve) => {
      if (gateway)
        gateway.close(() => {
          resolve();
        });
      else resolve();
    });
    for (const child of children.slice(1).reverse()) child.kill();
    pgCtlStop(db);
    children[0]?.kill();
  };
  try {
    children.push(startPostgres(db));
    await waitFor('Postgres', () => postgresReady(db));
    // Auth's tables first: our migrations refer to them.
    migrateAuth(db);
    const applied = applyMigrations(db, log);
    if (applied > 0) log(`${String(applied)} new migration(s) applied`);

    children.push(startAuth(db));
    await waitFor('Supabase Auth', () =>
      httpOk(`http://127.0.0.1:${String(db.ports.auth)}/health`),
    );

    children.push(startPostgrest(db));
    await waitFor('PostgREST', () => httpOk(`http://127.0.0.1:${String(db.ports.rest)}/`));

    const url = gatewayUrl(db.ports);
    const tokens = roleTokens(db.secrets);
    const staffAdmin = createStaffAdminHandler(
      supabaseStaffAdminPorts({
        url,
        secretKey: db.secrets.secretKey,
        publishableKey: OFFLINE_PUBLISHABLE_KEY,
      }),
    );
    const server = http.createServer(
      createGateway({
        keys: {
          publishableKey: OFFLINE_PUBLISHABLE_KEY,
          secretKey: db.secrets.secretKey,
          anonToken: tokens.anon,
          serviceToken: tokens.service,
        },
        authPort: db.ports.auth,
        restPort: db.ports.rest,
        staffAdmin,
        health: () => ({ ok: true }),
      }),
    );
    gateway = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(db.ports.gateway, '127.0.0.1', () => {
        resolve();
      });
    });
    const backend: BackendFile = {
      API_URL: url,
      PUBLISHABLE_KEY: OFFLINE_PUBLISHABLE_KEY,
      SECRET_KEY: db.secrets.secretKey,
    };
    writeFileSync(db.data.backendFile, JSON.stringify(backend, null, 2), { mode: 0o600 });
    return { db, url, backend, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
