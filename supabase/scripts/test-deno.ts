// The staff module's tests in Deno, the runtime of the Edge Function (`pnpm test:deno`):
//   * the unit cases Vitest also runs in Node (packages/staff-admin/src/cases.ts);
//   * HTTP tests against the function as the local Supabase serves it.
// Needs `pnpm db:start`, and the function served: `pnpm db:functions` in another terminal.
// Deno itself is the pinned devDependency `deno` (the edge runtime's version).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fail, localSupabase, run } from './script-support';

async function main() {
  const { url, publishableKey, secretKey } = localSupabase();

  const probe = await fetch(`${url}/functions/v1/staff-admin`, { method: 'OPTIONS' }).catch(
    () => null,
  );
  await probe?.body?.cancel();
  if (probe?.status !== 204) {
    fail('The staff-admin function is not served. Run `pnpm db:functions` in another terminal.');
  }

  const deno = createRequire(import.meta.url).resolve('deno/bin.cjs');
  const config = ['--config', 'functions/staff-admin/deno.json'];
  // The function itself: the tests don't import it.
  const checked = spawnSync(
    process.execPath,
    [deno, 'check', ...config, 'functions/staff-admin/index.ts'],
    {
      stdio: 'inherit',
    },
  );
  if (checked.status !== 0) fail('The staff-admin function does not type-check.');

  const result = spawnSync(
    process.execPath,
    [deno, 'test', ...config, '--allow-env', '--allow-net', 'functions/staff-admin/'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        STAFF_ADMIN_TEST_URL: url,
        STAFF_ADMIN_TEST_PUBLISHABLE_KEY: publishableKey,
        STAFF_ADMIN_TEST_SECRET_KEY: secretKey,
      },
    },
  );
  if (result.status !== 0) fail('Deno tests failed.');
}

await run(main);
