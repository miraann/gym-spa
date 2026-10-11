import { execSync } from 'node:child_process';
import type { Backend } from './fixture.ts';

// The local Supabase for the integration tests in Node (`pnpm test:int`): its address and keys, and
// SQL straight into its database for what no API may do (removing test platform admins, making a
// login look older). Local only: nothing here ever reaches a cloud project.

export interface LocalBackend extends Backend {
  /** The legacy anon key: a valid, signed JWT with role anon (HS256). */
  readonly legacyAnonKey: string | null;
}

export function localBackend(): LocalBackend {
  let output: string;
  try {
    output = execSync(
      'pnpm --silent --filter @gym/supabase exec supabase status --output json --workdir ..',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    throw new Error('Local Supabase is not running. Start it with pnpm db:start.');
  }
  const status = JSON.parse(output) as Record<string, string | undefined>;
  const url = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) throw new Error('`supabase status` misses keys');
  return { url, publishableKey, secretKey, legacyAnonKey: status.ANON_KEY ?? null };
}

/** The local database's container (`supabase_db_` + project_id in supabase/config.toml). */
const DATABASE_CONTAINER = 'supabase_db_gym-spa';

/** Runs SQL as postgres in the local database and returns its output (tuples only). */
export function localSql(sql: string): string {
  return execSync(
    `docker exec -i ${DATABASE_CONTAINER} psql -U postgres -X -q -v ON_ERROR_STOP=1 -tA`,
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}
