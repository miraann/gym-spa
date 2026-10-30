// pnpm test:offline: the database tests and the gym app's whole e2e suite against an offline
// server on this PC (spec §8, step 1f), the same suites `pnpm db:test` and `pnpm test:e2e` run
// against the local Supabase in Docker.
//
//   pnpm test:offline              a fresh development server (deleted and made again), pgTAP, e2e
//   pnpm test:offline --pgtap      pgTAP only
//   pnpm test:offline --e2e        e2e only
//   pnpm test:offline --keep       reuse the server as it is instead of making it again
//
// Extra arguments after `--` go to Playwright (e.g. -- e2e/staff.spec.ts).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runPgTap } from '../pgtap.ts';
import { dataPaths, devDataRoot } from '../paths.ts';
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
  },
});
const both = !flags.pgtap && !flags.e2e;
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
  stopLeftovers(options);
  if (!flags.keep || !existsSync(dataPaths(root).secrets)) {
    removeServer(root);
    createServer({ ...options, seed: true });
  }
  const server = await startServer(options);
  log(`offline server: ${server.url}`);
  let failures = 0;
  try {
    if (both || flags.pgtap) {
      log('\npgTAP (supabase/tests)');
      failures += runPgTap(server.db, log);
    }
    if (both || flags.e2e) failures += await e2e(server);
  } finally {
    await server.stop();
  }
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
