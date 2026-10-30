import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { authSigningKeys, publicKeySet, type ServerSecrets } from './keys.ts';
import type { DataPaths, ToolPaths } from './paths.ts';
import type { StackPorts } from './ports.ts';

// Supabase Auth and PostgREST: their settings, and running them as child processes of gym-server.

interface Stack {
  readonly tools: ToolPaths;
  readonly data: DataPaths;
  readonly secrets: ServerSecrets;
  readonly ports: StackPorts;
}

/** The address the app uses: gym-server's, which forwards /auth/v1 to Auth. */
export function gatewayUrl(ports: StackPorts): string {
  return `http://127.0.0.1:${String(ports.gateway)}`;
}

/**
 * Supabase Auth's settings: what the Supabase CLI gives its Auth container (`docker inspect`),
 * minus mail, phone and the providers we don't use, plus what Windows needs.
 */
export function authEnvironment(stack: Stack): NodeJS.ProcessEnv {
  const { secrets, ports } = stack;
  const issuer = `${gatewayUrl(ports)}/auth/v1`;
  return {
    // Windows needs these for its sockets and temp files; nothing else of the parent's.
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    API_EXTERNAL_URL: issuer,
    GOTRUE_API_HOST: '127.0.0.1',
    GOTRUE_API_PORT: String(ports.auth),
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${encodeURIComponent(secrets.passwords.authAdmin)}@127.0.0.1:${String(ports.postgres)}/postgres?sslmode=disable`,
    GOTRUE_DB_MIGRATIONS_PATH: stack.tools.authMigrations,
    // Auth keeps no idle connections by default, so every request opened a new one; on Windows
    // that is a new Postgres process plus a SCRAM login, and under load /token took seconds (the
    // auth spike). Keeping some open fixes it.
    GOTRUE_DB_MAX_POOL_SIZE: '20',
    GOTRUE_DB_MAX_IDLE_POOL_SIZE: '10',
    // Only used in e-mail links, which the offline edition never sends.
    GOTRUE_SITE_URL: 'http://localhost',
    GOTRUE_URI_ALLOW_LIST: 'http://localhost',
    GOTRUE_DISABLE_SIGNUP: 'true',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
    GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false',
    GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_PASSWORD_MIN_LENGTH: '8',
    // Two-step login is for Click Group's seller panel, which the offline edition doesn't have.
    GOTRUE_MFA_TOTP_ENROLL_ENABLED: 'false',
    GOTRUE_MFA_TOTP_VERIFY_ENABLED: 'false',
    // ES256 like the cloud: Auth publishes the public key set at /auth/v1/.well-known/jwks.json.
    GOTRUE_JWT_KEYS: authSigningKeys(secrets),
    GOTRUE_JWT_SECRET: secrets.jwtSecret,
    GOTRUE_JWT_VALID_METHODS: 'ES256',
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_JWT_ISSUER: issuer,
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
    GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '10',
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '150',
    GOTRUE_RATE_LIMIT_VERIFY: '30',
    // The same hook as the cloud: refuses a locked gym's staff (spec §2.6).
    GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: 'true',
    GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI: 'pg-functions://postgres/auth_hooks/custom_access_token',
    GOTRUE_LOG_LEVEL: 'info',
  };
}

/** PostgREST's settings file. The key set is a separate file it reads (`@path`). */
export function writePostgrestConfig(stack: Stack): void {
  const keySet = path.join(stack.data.root, 'jwks.json');
  writeFileSync(keySet, JSON.stringify(publicKeySet(stack.secrets)));
  // Forward slashes: Windows accepts them, and they need no escaping in the file.
  const slashes = (file: string) => file.replaceAll('\\', '/');
  writeFileSync(
    stack.data.postgrestConfig,
    [
      `db-uri = "postgres://authenticator:${encodeURIComponent(stack.secrets.passwords.authenticator)}@127.0.0.1:${String(stack.ports.postgres)}/postgres"`,
      'db-schemas = "public"',
      'db-extra-search-path = "public,extensions"',
      'db-anon-role = "anon"',
      'db-max-rows = 1000',
      `jwt-secret = "@${slashes(keySet)}"`,
      'server-host = "127.0.0.1"',
      `server-port = ${String(stack.ports.rest)}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
}

/** A child process whose output goes to logs/<name>.log. */
export function startChild(
  stack: Pick<Stack, 'data'>,
  name: string,
  file: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const log = createWriteStream(path.join(stack.data.logs, `${name}.log`), { flags: 'a' });
  const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return child;
}

/** Postgres itself, in the foreground of its child process (not through pg_ctl). */
export function startPostgres(stack: Stack): ChildProcess {
  return startChild(
    stack,
    'postgres',
    path.join(stack.tools.pgBin, 'postgres.exe'),
    // The port on the command line, so a changed server.json applies at the next start.
    ['-D', stack.data.database, '-p', String(stack.ports.postgres)],
    { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP },
  );
}

export function startAuth(stack: Stack): ChildProcess {
  return startChild(stack, 'auth', stack.tools.authExe, ['serve'], authEnvironment(stack));
}

/** PostgREST needs libpq and its DLLs from Postgres's bin folder on PATH. */
export function startPostgrest(stack: Stack): ChildProcess {
  writePostgrestConfig(stack);
  return startChild(stack, 'postgrest', stack.tools.postgrestExe, [stack.data.postgrestConfig], {
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PATH: `${stack.tools.pgBin};${process.env.SystemRoot ?? 'C:\\Windows'}\\System32`,
  });
}

/** Waits until check() says yes, or fails after `seconds`. */
export async function waitFor(
  label: string,
  check: () => boolean | Promise<boolean>,
  seconds = 60,
): Promise<void> {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start within ${String(seconds)} s.`);
}

/** Whether an HTTP endpoint answers without a server error. */
export function httpOk(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.on('error', () => {
      resolve(false);
    });
    request.setTimeout(2000, () => {
      request.destroy();
      resolve(false);
    });
  });
}
