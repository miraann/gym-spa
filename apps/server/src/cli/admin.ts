// gym-server-admin: the server's own settings from the server PC itself, for administrators and
// Click Group's support. The Windows app's server screen does the same (OF-c, OF-d).
//
//   gym-server-admin license                                     the machine code and the license
//   gym-server-admin license --license <code or .txt> [--activation <code or .txt>]
//   gym-server-admin owner --username <name> --full-name "<name>"  the first Owner (once)
//   gym-server-admin clock-accept                                after a wrong clock was corrected
//
// --data <folder>  the server's data folder, for its ports (default C:\ProgramData\gym-spa\server)
// --dev            the development server instead (pnpm server:dev start)
//
// It only talks to gym-server on 127.0.0.1, which answers these only to the server PC itself.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readServerConfig } from '../config.ts';
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
  },
});

function gatewayPort(): number {
  if (args.dev) return DEV_PORTS.gateway;
  const dataRoot =
    args.data ?? path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'gym-spa', 'server');
  return readServerConfig(dataRoot).ports.gateway;
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
      headers: { 'content-type': 'application/json' },
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
  } else {
    console.log('usage: gym-server-admin license | owner | clock-accept (see the file header)');
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
