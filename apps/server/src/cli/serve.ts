// gym-server: the offline edition's server on the gym's server PC (spec §2.5). The Windows service
// runs it (OF-f); it can also be started by hand:
//
//   gym-server [--data <folder>] [--tools <folder>]
//
// --data   the server's data: database, keys, certificate, logs (default C:\ProgramData\gym-spa\server)
// --tools  where Postgres, Auth and PostgREST are (default: the folder of the running node.exe,
//          which is how the installer lays them out)
//
// The first start makes the database (without the demo gym; the gym comes from its license, OF-b)
// and leaves the data folder readable only by this account, SYSTEM and Administrators. Every start
// applies new migrations, keeps the three programs running, opens HTTPS for the LAN and runs the
// scheduled jobs. Ctrl+C (or the service stopping) stops everything cleanly.
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readServerConfig } from '../config.ts';
import { fileLog } from '../log.ts';
import { dataPaths, toolPaths } from '../paths.ts';
import { createServer, startServer, type RunningServer } from '../stack.ts';
import { SERVER_VERSION } from '../version.ts';
import { restrictFolder } from '../windows.ts';

const { values: args } = parseArgs({
  options: { data: { type: 'string' }, tools: { type: 'string' } },
});
const dataRoot =
  args.data ?? path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'gym-spa', 'server');
const tools = toolPaths(args.tools ?? path.dirname(process.execPath));
mkdirSync(dataRoot, { recursive: true });
const log = fileLog(path.join(dataPaths(dataRoot).logs, 'gym-server.log'), process.stdout.isTTY);

let server: RunningServer | null = null;
let stopping = false;

async function shutdown(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`stopping (${reason})`);
  await server?.stop();
  log('stopped');
  process.exit(0);
}

async function main(): Promise<void> {
  log(`gym-server ${SERVER_VERSION} starting; data ${dataRoot}`);
  const config = readServerConfig(dataRoot);
  const options = { dataRoot, ports: config.ports, tools, log };
  if (!existsSync(dataPaths(dataRoot).secrets)) {
    log('first start: making the database');
    restrictFolder(dataRoot);
    createServer({ ...options, seed: false });
  }
  server = await startServer({ ...options, lanPort: config.lanPort, jobs: true });
  log(`ready: ${server.url} for this PC, port ${String(config.lanPort)} for the LAN`);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

try {
  await main();
} catch (error) {
  log(`could not start: ${error instanceof Error ? error.message : String(error)}`);
  // The service manager starts it again later.
  process.exitCode = 1;
}
