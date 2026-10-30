// pnpm server:dev: an offline server on this PC for development and tests (spec §8, step 1f).
// Its data is in %LOCALAPPDATA%\gym-spa\server-dev (GYM_SERVER_DATA); it uses ports 45421
// (gym-server), 45432, 45499 and 45430, next to the local Supabase in Docker.
//
//   pnpm server:dev init     a new server with the demo gym (seed.sql); --no-seed for an empty one
//   pnpm server:dev start    runs it in the foreground (Ctrl+C stops it); prints the address and
//                            writes backend.json for the e2e helpers (GYM_E2E_BACKEND); --lan also
//                            opens HTTPS on port 47200 for other PCs, --jobs runs the scheduled jobs,
//                            --license checks a license with the shipped keys (gym-server-admin --dev)
//   pnpm server:dev reset    deletes it and makes a new one
//   pnpm server:dev stop     stops what an interrupted run left running (its own programs only)
//   pnpm server:dev psql     psql as postgres (more arguments are passed on)
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { psql } from '../database.ts';
import { dataPaths, devDataRoot } from '../paths.ts';
import { DEV_PORTS, LAN_PORT } from '../ports.ts';
import { createServer, openDatabase, removeServer, startServer, stopLeftovers } from '../stack.ts';

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    'no-seed': { type: 'boolean', default: false },
    lan: { type: 'boolean', default: false },
    jobs: { type: 'boolean', default: false },
    license: { type: 'boolean', default: false },
  },
});
const command = positionals[0];
const root = devDataRoot();
const options = {
  dataRoot: root,
  ports: DEV_PORTS,
  log: (line: string) => {
    console.log(line);
  },
};

function init(): void {
  createServer({ ...options, seed: flags['no-seed'] !== true });
  console.log(`server made in ${root}`);
}

async function start(): Promise<void> {
  if (!existsSync(dataPaths(root).secrets)) init();
  const server = await startServer({
    ...options,
    ...(flags.lan === true ? { lanPort: LAN_PORT } : {}),
    jobs: flags.jobs === true,
    ...(flags.license === true ? { license: {} } : {}),
  });
  console.log(`gym-server: ${server.url}`);
  console.log(`e2e: GYM_E2E_BACKEND=${server.db.data.backendFile}`);
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    void server.stop().then(() => {
      console.log('stopped');
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

try {
  if (command === 'init') init();
  else if (command === 'start') await start();
  else if (command === 'reset') {
    stopLeftovers(options);
    removeServer(root);
    init();
  } else if (command === 'stop') {
    stopLeftovers(options);
  } else if (command === 'psql') {
    // Everything after "psql" goes to psql as it was typed (parseArgs would take -c for itself).
    const rest = process.argv.slice(process.argv.indexOf('psql') + 1);
    const result = psql(openDatabase(options), 'postgres', rest, { inherit: true });
    process.exitCode = result.status ?? 1;
  } else {
    console.log('usage: pnpm server:dev init | start | reset | stop | psql');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
