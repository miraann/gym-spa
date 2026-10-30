// pnpm test:offline: the database tests and the gym app's whole e2e suite against an offline
// server on this PC (spec §8, step 1f), the same suites `pnpm db:test` and `pnpm test:e2e` run
// against the local Supabase in Docker.
//
//   pnpm test:offline              a fresh development server (deleted and made again), pgTAP, e2e,
//                                  then the server's own integration tests (the license, OF-b)
//   pnpm test:offline --pgtap      pgTAP only
//   pnpm test:offline --e2e        e2e only
//   pnpm test:offline --int        the integration tests only (they make their own server)
//   pnpm test:offline --desktop    the offline edition's Windows build (apps/desktop/e2e/offline.spec.ts)
//                                  against a server of its own with one gym
//   pnpm test:offline --keep       reuse the server as it is instead of making it again
//
// Extra arguments after `--` go to Playwright (e.g. -- e2e/staff.spec.ts).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runPgTap } from '../pgtap.ts';
import { dataPaths, devDataRoot, REPO } from '../paths.ts';
import { DEV_PORTS } from '../ports.ts';
import {
  createServer,
  removeServer,
  startServer,
  stopLeftovers,
  type RunningServer,
} from '../stack.ts';

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pgtap: { type: 'boolean', default: false },
    e2e: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    int: { type: 'boolean', default: false },
    desktop: { type: 'boolean', default: false },
  },
});
const all = !flags.pgtap && !flags.e2e && !flags.int && !flags.desktop;
/** The desktop test's own server, on other ports and with no demo gym: its one gym is the test's. */
const DESKTOP_PORTS = { postgres: 44432, auth: 44499, rest: 44430, gateway: 44421 };
const root = devDataRoot();
const log = (line: string) => {
  console.log(line);
};
const options = { dataRoot: root, ports: DEV_PORTS, log };

/**
 * Runs pnpm without blocking: gym-server runs in this same process, and a synchronous child would
 * stop it from answering the tests. pnpm's own program (npm_execpath: a native .exe since pnpm 12,
 * a script before) runs without a shell in between.
 */
function pnpm(args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const own = process.env.npm_execpath;
  const options = { stdio: 'inherit' as const, env: { ...process.env, ...env } };
  const child =
    own === undefined
      ? spawn('corepack', ['pnpm', ...args], { ...options, shell: true })
      : own.toLowerCase().endsWith('.exe')
        ? spawn(own, args, options)
        : spawn(process.execPath, [own, ...args], options);
  return new Promise((resolve) => {
    child.on('error', () => {
      resolve(1);
    });
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

/** apps/server's integration tests: each makes its own server on other ports. */
function integration(): Promise<number> {
  log("\nthe server's integration tests");
  return pnpm(['--filter', '@gym/server', 'test:int'], {});
}

/** The offline edition's Windows build against a fresh server with no gym but the test's. */
async function desktop(): Promise<number> {
  const desktopRoot = `${root}-desktop`;
  const desktopOptions = { dataRoot: desktopRoot, ports: DESKTOP_PORTS, log };
  stopLeftovers(desktopOptions);
  removeServer(desktopRoot);
  createServer({ ...desktopOptions, seed: false });
  const server = await startServer(desktopOptions);
  try {
    log('\nbuilding the offline edition (apps/app/dist-offline) and the Windows shell');
    const built =
      (await pnpm(['--filter', '@gym/app', 'build:offline'], {})) ||
      (await pnpm(['--filter', '@gym/desktop', 'build'], {}));
    if (built !== 0) return built;
    log('\nthe offline edition in the Windows app');
    return await pnpm(
      ['--filter', '@gym/desktop', 'exec', 'playwright', 'test', 'e2e/offline.spec.ts'],
      {
        GYM_OFFLINE_WEB_ROOT: path.join(REPO, 'apps', 'app', 'dist-offline'),
        GYM_SERVER_URL: server.url,
        GYM_E2E_BACKEND: server.db.data.backendFile,
      },
    );
  } finally {
    await server.stop();
  }
}

/** The app's e2e suite, built for and run against this server. */
async function e2e(server: RunningServer): Promise<number> {
  const env = {
    // Vite takes these over the values in apps/app/.env.e2e.
    VITE_SUPABASE_URL: server.backend.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: server.backend.PUBLISHABLE_KEY,
    GYM_E2E_BACKEND: server.db.data.backendFile,
  };
  log('\nbuilding the app for the offline server');
  const built = await pnpm(['--filter', '@gym/app', 'exec', 'vite', 'build', '--mode', 'e2e'], env);
  if (built !== 0) return built;
  log('\nthe app e2e suite against the offline server');
  return pnpm(['--filter', '@gym/app', 'exec', 'playwright', 'test', ...positionals], env);
}

async function main(): Promise<number> {
  if (!all && !flags.pgtap && !flags.e2e) {
    return (flags.int ? await integration() : 0) + (flags.desktop ? await desktop() : 0);
  }
  stopLeftovers(options);
  if (!flags.keep || !existsSync(dataPaths(root).secrets)) {
    removeServer(root);
    createServer({ ...options, seed: true });
  }
  const server = await startServer(options);
  log(`offline server: ${server.url}`);
  let failures = 0;
  try {
    if (all || flags.pgtap) {
      log('\npgTAP (supabase/tests)');
      failures += runPgTap(server.db, log);
    }
    if (all || flags.e2e) failures += await e2e(server);
  } finally {
    await server.stop();
  }
  if (all || flags.int) failures += await integration();
  if (all || flags.desktop) failures += await desktop();
  return failures;
}

try {
  const failures = await main();
  if (failures > 0) {
    console.error('\n✖ The offline server failed tests (see above).');
    process.exitCode = 1;
  } else {
    console.log('\nAll passed on the offline server.');
  }
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
