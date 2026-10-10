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
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    fail('`supabase status` did not show the API URL and secret key.');
  }
  return { url, secretKey };
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
