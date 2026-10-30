import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Where the server's parts and data live. During development both are under
// %LOCALAPPDATA%\gym-spa (never in the repository); the installed server uses
// C:\ProgramData\gym-spa (step OF-f).

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The repository root (apps/server/src → ../../..). */
export const REPO = path.resolve(HERE, '..', '..', '..');

/** The server's own SQL: the Supabase roles, our migrations and (development only) the demo gym. */
export interface ResourcePaths {
  readonly compatSql: string;
  readonly migrations: string;
  readonly seed: string | null;
}

/**
 * Beside the bundled gym-server.mjs once installed (`pnpm server:bundle` puts sql\ and
 * migrations\ there); in the repository when run from source.
 */
export function resourcePaths(): ResourcePaths {
  if (existsSync(path.join(HERE, 'migrations'))) {
    return {
      compatSql: path.join(HERE, 'sql', 'compat.sql'),
      migrations: path.join(HERE, 'migrations'),
      seed: null,
    };
  }
  return {
    compatSql: path.join(REPO, 'apps', 'server', 'sql', 'compat.sql'),
    migrations: path.join(REPO, 'supabase', 'migrations'),
    seed: path.join(REPO, 'supabase', 'seed.sql'),
  };
}

function localAppData(): string {
  const value = process.env.LOCALAPPDATA;
  if (!value) throw new Error('LOCALAPPDATA is not set: the offline server runs on Windows only.');
  return value;
}

/** Downloads and built parts: GYM_SERVER_TOOLS, or %LOCALAPPDATA%\gym-spa\server-tools. */
export function toolsRoot(): string {
  return process.env.GYM_SERVER_TOOLS ?? path.join(localAppData(), 'gym-spa', 'server-tools');
}

/** The development server's data: GYM_SERVER_DATA, or %LOCALAPPDATA%\gym-spa\server-dev. */
export function devDataRoot(): string {
  return process.env.GYM_SERVER_DATA ?? path.join(localAppData(), 'gym-spa', 'server-dev');
}

/** The programs the server runs, inside a tools folder. */
export interface ToolPaths {
  readonly root: string;
  readonly downloads: string;
  readonly pgBin: string;
  readonly pgShare: string;
  readonly authExe: string;
  readonly authMigrations: string;
  readonly postgrestExe: string;
}

export function toolPaths(root: string = toolsRoot()): ToolPaths {
  return {
    root,
    downloads: path.join(root, 'downloads'),
    pgBin: path.join(root, 'pgsql', 'bin'),
    pgShare: path.join(root, 'pgsql', 'share'),
    authExe: path.join(root, 'auth', 'auth.exe'),
    authMigrations: path.join(root, 'auth', 'migrations'),
    postgrestExe: path.join(root, 'postgrest', 'postgrest.exe'),
  };
}

/** One server's data: the database, its secrets, the logs. */
export interface DataPaths {
  readonly root: string;
  readonly database: string;
  readonly secrets: string;
  readonly logs: string;
  readonly postgrestConfig: string;
  /** What the e2e helpers read to reach this server (development only). */
  readonly backendFile: string;
}

export function dataPaths(root: string): DataPaths {
  return {
    root,
    database: path.join(root, 'db'),
    secrets: path.join(root, 'server-secrets.json'),
    logs: path.join(root, 'logs'),
    postgrestConfig: path.join(root, 'postgrest.conf'),
    backendFile: path.join(root, 'backend.json'),
  };
}
