// gym-server-admin: the server's own settings from the server PC itself, for administrators and
// Click Group's support. The Windows app's server screen does the same (OF-c, OF-d).
//
//   gym-server-admin license                                     the machine code and the license
//   gym-server-admin license --license <code or .txt> [--activation <code or .txt>]
//   gym-server-admin owner --username <name> --full-name "<name>"  the first Owner (once)
//   gym-server-admin clock-accept                                after a wrong clock was corrected
//   gym-server-admin pairing-code                                a code to pair a new PC (OF-d)
//   gym-server-admin pcs [--remove <id>]                         the paired PCs
//   gym-server-admin backup                                      a backup now (OF-e)
//   gym-server-admin backups [--time HH:MM] [--copy-to <folder>]  the backups and their settings
//   gym-server-admin restore --name <file> --gym <code>          puts a backup back
//
// --data <folder>  the server's data folder, for its ports (default C:\ProgramData\gym-spa\server)
// --dev            the development server instead (pnpm server:dev start)
//
// It only talks to gym-server on 127.0.0.1, which answers these only to the server PC itself, and
// shows the server's secret key, read from the data folder: only the server's account and
// Administrators can read it, so run it as an administrator.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readServerConfig } from '../config.ts';
import { dataPaths, devDataRoot } from '../paths.ts';
import { DEV_PORTS } from '../ports.ts';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: 'string' },
    dev: { type: 'boolean', default: false },
    license: { type: 'string' },
    activation: { type: 'string' },
    username: { type: 'string' },
    'full-name': { type: 'string' },
    remove: { type: 'string' },
    time: { type: 'string' },
    'copy-to': { type: 'string' },
    name: { type: 'string' },
    gym: { type: 'string' },
  },
});

function dataRoot(): string {
  if (args.dev) return devDataRoot();
  return args.data ?? path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'gym-spa', 'server');
}

function gatewayPort(): number {
  return args.dev ? DEV_PORTS.gateway : readServerConfig(dataRoot()).ports.gateway;
}

/** The server's secret key, from its data folder. */
function secretKey(): string {
  const file = dataPaths(dataRoot()).secrets;
  try {
    const secrets = JSON.parse(readFileSync(file, 'utf8')) as { secretKey?: unknown };
    if (typeof secrets.secretKey === 'string') return secrets.secretKey;
  } catch {
    // Unreadable: the message below.
  }
  throw new Error(`Could not read ${file}: run this as an administrator on the server PC.`);
}

/** A code given as itself, or as the .txt file the seller panel downloads. */
function code(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (/^GS[LA]1\./.test(value.trim())) return value.trim();
  if (!existsSync(value)) throw new Error(`${value} is neither a code nor a file.`);
  return readFileSync(value, 'utf8').trim();
}

async function call(method: 'GET' | 'POST', name: string, body?: unknown): Promise<unknown> {
  const response = await fetch(
    `http://127.0.0.1:${String(gatewayPort())}/server/v1/admin/${name}`,
    {
      method,
      headers: { 'content-type': 'application/json', apikey: secretKey() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(`gym-server refused (${String(response.status)}): ${JSON.stringify(answer)}`);
  return answer;
}

async function main(): Promise<void> {
  const command = positionals[0];
  let answer: unknown;
  if (command === 'license' && (args.license !== undefined || args.activation !== undefined)) {
    answer = await call('POST', 'license', {
      license: code(args.license),
      activation: code(args.activation),
    });
  } else if (command === 'license') {
    answer = await call('GET', 'license');
  } else if (command === 'owner') {
    answer = await call('POST', 'owner', {
      username: args.username ?? '',
      fullName: args['full-name'] ?? '',
    });
    console.log(
      'The temporary password is shown only now; the Owner must change it at the first login.',
    );
  } else if (command === 'clock-accept') {
    answer = await call('POST', 'clock-accept');
  } else if (command === 'pairing-code') {
    answer = await call('POST', 'pairing-code');
  } else if (command === 'pcs' && args.remove !== undefined) {
    answer = await call('POST', 'pcs-remove', { id: args.remove });
  } else if (command === 'pcs') {
    answer = await call('GET', 'pcs');
  } else if (command === 'backup') {
    answer = await call('POST', 'backups-now');
  } else if (command === 'backups' && (args.time !== undefined || args['copy-to'] !== undefined)) {
    answer = await call('POST', 'backups-settings', {
      ...(args.time === undefined ? {} : { time: args.time }),
      ...(args['copy-to'] === undefined ? {} : { copyTo: args['copy-to'] || null }),
    });
  } else if (command === 'backups') {
    answer = await call('GET', 'backups');
  } else if (command === 'restore') {
    answer = await call('POST', 'backups-restore', {
      name: args.name ?? '',
      gymCode: args.gym ?? '',
    });
  } else {
    console.log(
      'usage: gym-server-admin license | owner | clock-accept | pairing-code | pcs | backup | backups | restore (see the file header)',
    );
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(answer, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
