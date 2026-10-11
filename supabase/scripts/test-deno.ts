// The Edge Functions' tests in Deno, their runtime (`pnpm test:deno`), for staff-admin and
// seller-admin:
//   * the unit cases Vitest also runs in Node (packages/staff-admin/src/cases.ts,
//     packages/seller-admin/src/cases.ts);
//   * HTTP tests against the functions as the local Supabase serves them.
// Needs `pnpm db:start`, and the functions served: `pnpm db:functions` in another terminal.
// Deno itself is the pinned devDependency `deno` (the edge runtime's version).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fail, localSupabase, run } from './script-support';

const FUNCTIONS = ['staff-admin', 'seller-admin'] as const;

async function main() {
  const { url, publishableKey, secretKey, anonKey } = localSupabase();

  for (const name of FUNCTIONS) {
    const probe = await fetch(`${url}/functions/v1/${name}`, { method: 'OPTIONS' }).catch(
      () => null,
    );
    await probe?.body?.cancel();
    if (probe?.status !== 204) {
      fail(`The ${name} function is not served. Run \`pnpm db:functions\` in another terminal.`);
    }
  }

  const deno = createRequire(import.meta.url).resolve('deno/bin.cjs');
  for (const name of FUNCTIONS) {
    const config = ['--config', `functions/${name}/deno.json`];
    // The function itself: the tests don't import it.
    const checked = spawnSync(
      process.execPath,
      [deno, 'check', ...config, `functions/${name}/index.ts`],
      { stdio: 'inherit' },
    );
    if (checked.status !== 0) fail(`The ${name} function does not type-check.`);

    const result = spawnSync(
      process.execPath,
      [
        deno,
        'test',
        ...config,
        '--allow-env',
        '--allow-net',
        // seller-admin's HTTP test removes its platform admins with SQL in the local database.
        '--allow-run=docker',
        `functions/${name}/`,
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          STAFF_ADMIN_TEST_URL: url,
          STAFF_ADMIN_TEST_PUBLISHABLE_KEY: publishableKey,
          STAFF_ADMIN_TEST_SECRET_KEY: secretKey,
          ...(anonKey ? { STAFF_ADMIN_TEST_ANON_KEY: anonKey } : {}),
        },
      },
    );
    if (result.status !== 0) fail(`Deno tests of ${name} failed.`);
  }
}

await run(main);
