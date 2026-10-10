// Shared by the admin scripts in this folder: the connection to Supabase with the secret key, and
// stopping with a message. The secret key is used only here, on this computer: it never goes into
// the app or into git.
import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@gym/db';

/**
 * Stops a script with a message. Thrown instead of process.exit(): exiting while a fetch
 * connection is still open crashes Node on Windows (libuv assertion UV_HANDLE_CLOSING).
 */
export class ScriptError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

export function fail(message: string): never {
  throw new ScriptError(message);
}

function connection(remote: boolean): { url: string; secretKey: string } {
  if (remote) {
    try {
      process.loadEnvFile('.env.local');
    } catch {
      // Not there: the variables may come from the environment instead.
    }
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secretKey) {
      fail(
        'Set SUPABASE_URL and SUPABASE_SECRET_KEY in supabase/.env.local (see supabase/.env.example).',
      );
    }
    return { url, secretKey };
  }

  const { url, secretKey } = localSupabase();
  return { url, secretKey };
}

/** The local Supabase's address and keys (`supabase status`). */
export function localSupabase(): {
  url: string;
  publishableKey: string;
  secretKey: string;
  /** The legacy anon key (a signed JWT with role anon), when the project still has one. */
  anonKey: string | undefined;
} {
  let status: Record<string, string | undefined>;
  try {
    const output = execSync('supabase status --output json --workdir ..', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    status = JSON.parse(output) as Record<string, string | undefined>;
  } catch {
    fail('Local Supabase is not running. Start it with `pnpm db:start`.');
  }
  const url = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) {
    fail('`supabase status` did not show the API URL and keys.');
  }
  return { url, publishableKey, secretKey, anonKey: status.ANON_KEY };
}

/**
 * A client with the secret key: local Supabase, or with remote the project in supabase/.env.local
 * (SUPABASE_URL, SUPABASE_SECRET_KEY). Prints which project it talks to, so it can be checked.
 */
export function connect(remote: boolean): SupabaseClient<Database> {
  const { url, secretKey } = connection(remote);
  console.log(`Supabase: ${url}`);
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Runs a script's main(): a ScriptError ends it with its message and exit code. */
export async function run(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof ScriptError)) throw error;
    console.error(`\n✖ ${error.message}`);
    process.exitCode = error.exitCode;
  }
}

/**
 * Reads a line without showing what is typed (a password). Outside a terminal it stops and points
 * to the environment variable that can give the value instead.
 */
export function readHidden(question: string, environmentVariable: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    fail(`Run this in a terminal, or pass the password in ${environmentVariable}.`);
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          if (char === '\u0003') reject(new ScriptError('Cancelled.', 130));
          else resolve(value);
          return;
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}
