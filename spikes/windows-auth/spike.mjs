// Auth spike (throwaway): the offline edition's server stack, running natively on this Windows PC
// from F:\spikes-tools. Nothing is installed as a service or added to startup; `start` runs in the
// foreground and Ctrl+C (or `stop`) ends everything.
//
//   node spikes/windows-auth/spike.mjs init    one time: new database on port 55432, Supabase roles,
//                                               Supabase Auth's migrations, our migrations, seed
//   node spikes/windows-auth/spike.mjs start   Postgres + Supabase Auth + PostgREST + API proxy
//   node spikes/windows-auth/spike.mjs stop    stops a stack left running
//   node spikes/windows-auth/spike.mjs keys    prints the API URL and keys as JSON
//   node spikes/windows-auth/spike.mjs pgtap   runs supabase/tests against port 55432
//   node spikes/windows-auth/spike.mjs psql    opens psql as postgres (extra args are passed on)
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TOOLS = 'F:\\spikes-tools';
const PG_BIN = path.join(TOOLS, 'pgsql-17', 'pgsql', 'bin');
const DATA = path.join(TOOLS, 'pgdata');
const LOGS = path.join(TOOLS, 'logs');
const SECRETS_FILE = path.join(TOOLS, 'spike-secrets.json');
const AUTH_EXE = path.join(TOOLS, 'auth', 'auth.exe');
const AUTH_MIGRATIONS = path.join(TOOLS, 'src', 'auth', 'migrations');
const POSTGREST_EXE = path.join(TOOLS, 'postgrest', 'postgrest.exe');
// Never 5432 (or 54322): those belong to a real Postgres and to the local Supabase in Docker.
const PORTS = { postgres: 55432, auth: 55499, rest: 55430, api: 55421 };
const API_URL = `http://127.0.0.1:${PORTS.api}`;

// ---------------------------------------------------------------------------------------------
// Secrets and keys

function secrets() {
  if (existsSync(SECRETS_FILE)) return JSON.parse(readFileSync(SECRETS_FILE, 'utf8'));
  const random = () => randomBytes(24).toString('base64url');
  const created = {
    supabaseAdminPassword: random(),
    postgresPassword: random(),
    authAdminPassword: random(),
    authenticatorPassword: random(),
    jwtSecret: randomBytes(48).toString('base64url'),
  };
  mkdirSync(TOOLS, { recursive: true });
  writeFileSync(SECRETS_FILE, JSON.stringify(created, null, 2));
  return created;
}

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString(
    'base64url',
  );
}

/** An HS256 JWT, like the anon and service_role keys of a self-hosted Supabase. */
function signJwt(payload, secret) {
  const unsigned = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function keys() {
  const { jwtSecret } = secrets();
  const iat = 1791504000; // fixed, so the keys stay the same between runs
  const exp = iat + 10 * 365 * 24 * 3600;
  return {
    apiUrl: API_URL,
    anonKey: signJwt({ iss: 'supabase', role: 'anon', iat, exp }, jwtSecret),
    serviceKey: signJwt({ iss: 'supabase', role: 'service_role', iat, exp }, jwtSecret),
  };
}

// ---------------------------------------------------------------------------------------------
// Processes

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

function mustRun(file, args, options = {}) {
  const result = run(file, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(file)} ${args.join(' ')} failed (${String(result.status)}):\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
  return result;
}

function pgEnv(password) {
  return { ...process.env, PGPASSWORD: password, PGCLIENTENCODING: 'UTF8' };
}

/** psql against the spike database. user: supabase_admin or postgres. */
function psql(user, args, options = {}) {
  const s = secrets();
  const password = user === 'supabase_admin' ? s.supabaseAdminPassword : s.postgresPassword;
  return run(
    path.join(PG_BIN, 'psql.exe'),
    [
      '-X',
      '-h',
      '127.0.0.1',
      '-p',
      String(PORTS.postgres),
      '-U',
      user,
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      ...args,
    ],
    { env: pgEnv(password), ...options },
  );
}

function authEnv() {
  const s = secrets();
  return {
    ...process.env,
    // The same settings the Supabase CLI gives its Auth container (docker inspect), minus mail and
    // phone, plus HS256 instead of ES256 signing keys (simpler for the spike).
    API_EXTERNAL_URL: `${API_URL}/auth/v1`,
    GOTRUE_API_HOST: '127.0.0.1',
    GOTRUE_API_PORT: String(PORTS.auth),
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${s.authAdminPassword}@127.0.0.1:${String(PORTS.postgres)}/postgres?sslmode=disable`,
    GOTRUE_DB_MIGRATIONS_PATH: AUTH_MIGRATIONS,
    // Auth keeps no idle connections by default (MaxIdlePoolSize 0), so every request opens a new
    // one. On Windows each connection is a new Postgres process plus a SCRAM login: under load
    // that made /token and /user take 2-3 s. Keeping a few open fixes it.
    GOTRUE_DB_MAX_POOL_SIZE: '20',
    GOTRUE_DB_MAX_IDLE_POOL_SIZE: '10',
    GOTRUE_SITE_URL: 'http://localhost:5173',
    GOTRUE_URI_ALLOW_LIST: 'http://localhost:4173,http://localhost:4174',
    GOTRUE_DISABLE_SIGNUP: 'true',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
    GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false',
    GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_JWT_SECRET: s.jwtSecret,
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_JWT_ISSUER: `${API_URL}/auth/v1`,
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
    GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '10',
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '150',
    GOTRUE_RATE_LIMIT_VERIFY: '30',
    GOTRUE_LOG_LEVEL: 'info',
  };
}

function postgrestConfig() {
  const s = secrets();
  const file = path.join(TOOLS, 'postgrest.conf');
  writeFileSync(
    file,
    [
      `db-uri = "postgres://authenticator:${s.authenticatorPassword}@127.0.0.1:${String(PORTS.postgres)}/postgres"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      'db-max-rows = 1000',
      `jwt-secret = "${s.jwtSecret}"`,
      'server-host = "127.0.0.1"',
      `server-port = ${String(PORTS.rest)}`,
      '',
    ].join('\n'),
  );
  return file;
}

async function waitFor(label, check, seconds = 30) {
  for (let i = 0; i < seconds * 4; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start within ${String(seconds)} s (see ${LOGS})`);
}

function httpOk(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function postgresReady() {
  return (
    run(path.join(PG_BIN, 'pg_isready.exe'), ['-h', '127.0.0.1', '-p', String(PORTS.postgres)])
      .status === 0
  );
}

// ---------------------------------------------------------------------------------------------
// init

async function init() {
  if (existsSync(DATA)) {
    throw new Error(
      `${DATA} exists already. Run stop, delete that folder, then init again to start over.`,
    );
  }
  mkdirSync(LOGS, { recursive: true });
  const s = secrets();

  // supabase_admin is the superuser, as on Supabase; postgres is created by compat.sql.
  const pwfile = path.join(TOOLS, 'initdb-password.txt');
  writeFileSync(pwfile, s.supabaseAdminPassword);
  try {
    mustRun(path.join(PG_BIN, 'initdb.exe'), [
      '-D',
      DATA,
      '-U',
      'supabase_admin',
      `--pwfile=${pwfile}`,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale-provider=icu',
      '--icu-locale=en-US',
      '--locale=en-US',
    ]);
  } finally {
    rmSync(pwfile, { force: true });
  }
  writeFileSync(
    path.join(DATA, 'postgresql.auto.conf'),
    `port = ${String(PORTS.postgres)}\nlisten_addresses = '127.0.0.1'\n`,
    { flag: 'a' },
  );

  // stdio 'ignore': on Windows the server inherits pg_ctl's pipes, and spawnSync would wait for
  // them to close (that is, until the server stops).
  mustRun(
    path.join(PG_BIN, 'pg_ctl.exe'),
    ['start', '-w', '-D', DATA, '-l', path.join(LOGS, 'postgres-init.log')],
    { stdio: 'ignore' },
  );
  try {
    console.log('Supabase roles and schemas (compat.sql)');
    let result = psql('supabase_admin', [
      '-q',
      '-f',
      path.join(HERE, 'compat.sql'),
      '-v',
      `authenticator_password=${s.authenticatorPassword}`,
      '-v',
      `postgres_password=${s.postgresPassword}`,
      '-v',
      `auth_admin_password=${s.authAdminPassword}`,
    ]);
    if (result.status !== 0) throw new Error(result.stderr);

    console.log('Supabase Auth migrations');
    const authLog = createWriteStream(path.join(LOGS, 'auth-migrate.log'));
    result = run(AUTH_EXE, ['migrate'], { env: authEnv() });
    authLog.end(`${result.stdout}${result.stderr}`);
    if (result.status !== 0) throw new Error(`auth migrate failed:\n${result.stderr}`);

    const migrations = readdirSync(path.join(REPO, 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of migrations) {
      console.log(`migration ${file}`);
      result = psql('postgres', [
        '-q',
        '-1',
        '-f',
        path.join(REPO, 'supabase', 'migrations', file),
      ]);
      if (result.status !== 0) throw new Error(`${file}:\n${result.stderr}`);
    }
    console.log('seed.sql');
    result = psql('postgres', ['-q', '-1', '-f', path.join(REPO, 'supabase', 'seed.sql')]);
    if (result.status !== 0) throw new Error(`seed.sql:\n${result.stderr}`);
  } finally {
    run(path.join(PG_BIN, 'pg_ctl.exe'), ['stop', '-w', '-m', 'fast', '-D', DATA]);
  }
  console.log('init done');
}

// ---------------------------------------------------------------------------------------------
// start: the stack in the foreground

const API_PREFIXES = [
  { prefix: '/auth/v1', port: PORTS.auth },
  { prefix: '/rest/v1', port: PORTS.rest },
];

/** One address for the app, like Supabase's API gateway: /auth/v1 and /rest/v1, plus CORS. */
function startProxy() {
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin;
    const cors = {
      'access-control-allow-origin': origin ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': 'content-range, content-profile, x-supabase-api-version',
      vary: 'Origin',
    };
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        ...cors,
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
        'access-control-allow-headers': request.headers['access-control-request-headers'] ?? '*',
        'access-control-max-age': '3600',
      });
      response.end();
      return;
    }
    const target = API_PREFIXES.find(
      (t) =>
        request.url === t.prefix ||
        request.url.startsWith(`${t.prefix}/`) ||
        request.url.startsWith(`${t.prefix}?`),
    );
    if (!target) {
      response.writeHead(404, { ...cors, 'content-type': 'application/json' });
      response.end('{"message":"no route"}');
      return;
    }
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: target.port,
        method: request.method,
        path: request.url.slice(target.prefix.length) || '/',
        headers: { ...request.headers, host: `127.0.0.1:${String(target.port)}` },
      },
      (upstreamResponse) => {
        const headers = { ...upstreamResponse.headers };
        for (const name of Object.keys(headers)) {
          if (name.startsWith('access-control-')) delete headers[name];
        }
        response.writeHead(upstreamResponse.statusCode ?? 502, { ...headers, ...cors });
        upstreamResponse.pipe(response);
      },
    );
    upstream.on('error', (error) => {
      response.writeHead(502, { ...cors, 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: `upstream: ${error.message}` }));
    });
    request.pipe(upstream);
  });
  server.listen(PORTS.api, '127.0.0.1');
  return server;
}

function startChild(name, file, args, env) {
  const log = createWriteStream(path.join(LOGS, `${name}.log`), { flags: 'a' });
  const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('exit', (code) => console.log(`${name} exited (${String(code)})`));
  return child;
}

async function start() {
  if (!existsSync(DATA)) throw new Error('Run init first.');
  mkdirSync(LOGS, { recursive: true });
  const children = [];
  const pgPath = `${PG_BIN};${process.env.PATH ?? ''}`;

  if (postgresReady())
    throw new Error(`Something already listens on ${String(PORTS.postgres)}. Run stop first.`);
  children.push(
    startChild('postgres', path.join(PG_BIN, 'postgres.exe'), ['-D', DATA], process.env),
  );
  await waitFor('Postgres', () => postgresReady());

  children.push(startChild('auth', AUTH_EXE, ['serve'], authEnv()));
  await waitFor('Supabase Auth', () => httpOk(`http://127.0.0.1:${String(PORTS.auth)}/health`));

  children.push(
    startChild('postgrest', POSTGREST_EXE, [postgrestConfig()], { ...process.env, PATH: pgPath }),
  );
  await waitFor('PostgREST', () => httpOk(`http://127.0.0.1:${String(PORTS.rest)}/`));

  const proxy = startProxy();
  console.log(
    `stack running: ${API_URL} (auth ${String(PORTS.auth)}, rest ${String(PORTS.rest)}, postgres ${String(PORTS.postgres)})`,
  );

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    proxy.close();
    for (const child of children.slice(1)) child.kill();
    run(path.join(PG_BIN, 'pg_ctl.exe'), ['stop', '-w', '-m', 'fast', '-D', DATA]);
    process.exitCode = 0;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function stop() {
  run(path.join(PG_BIN, 'pg_ctl.exe'), ['stop', '-w', '-m', 'fast', '-D', DATA]);
  // Only the spike's own executables, by their full path.
  run('powershell.exe', [
    '-NoProfile',
    '-Command',
    "Get-Process auth, postgrest, postgres, node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like 'F:\\spikes-tools\\*' -or ($_.ProcessName -eq 'node' -and (Get-CimInstance Win32_Process -Filter \"ProcessId=$($_.Id)\").CommandLine -like '*windows-auth*spike.mjs*start*') } | Stop-Process -Force",
  ]);
  console.log('stopped');
}

// ---------------------------------------------------------------------------------------------
// pgtap: supabase/tests in name order, one psql session per file (as pg_prove does)

function pgtap() {
  const dir = path.join(REPO, 'supabase', 'tests');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let failedFiles = 0;
  let total = 0;
  for (const file of files) {
    const result = psql('postgres', ['-q', '-t', '-A', '-f', path.join(dir, file)]);
    const lines = `${result.stdout}`.split(/\r?\n/);
    const plan = lines.find((l) => /^1\.\.\d+$/.test(l));
    const planned = plan ? Number(plan.slice(3)) : NaN;
    const ok = lines.filter((l) => /^ok \d+/.test(l)).length;
    const notOk = lines.filter((l) => /^not ok \d+/.test(l));
    const passed = result.status === 0 && notOk.length === 0 && ok === planned;
    total += ok + notOk.length;
    if (!passed) failedFiles += 1;
    console.log(`${passed ? 'ok    ' : 'FAILED'} ${file} (${String(ok)}/${String(planned)})`);
    if (!passed) {
      for (const line of notOk) console.log(`   ${line}`);
      const diag = lines.filter((l) => l.startsWith('#')).slice(0, 20);
      for (const line of diag) console.log(`   ${line}`);
      if (result.stderr)
        console.log(`   ${result.stderr.trim().split(/\r?\n/).slice(0, 10).join('\n   ')}`);
    }
  }
  console.log(
    `${String(files.length - failedFiles)}/${String(files.length)} files passed, ${String(total)} tests`,
  );
  if (failedFiles > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------------------------

const command = process.argv[2];
try {
  if (command === 'init') await init();
  else if (command === 'start') await start();
  else if (command === 'stop') stop();
  else if (command === 'keys') console.log(JSON.stringify(keys(), null, 2));
  else if (command === 'pgtap') pgtap();
  else if (command === 'psql') {
    const result = psql('postgres', process.argv.slice(3), { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  } else {
    console.log(
      'usage: node spikes/windows-auth/spike.mjs init | start | stop | keys | pgtap | psql',
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
