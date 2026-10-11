// `pnpm test:e2e` for the seller panel: builds the web deployment in e2e mode (the gym app with
// the panel under /seller/, local Supabase), checks that the seller-admin function is served, and
// runs Playwright. Needs `pnpm db:start` and `pnpm db:functions`.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const shell = process.platform === 'win32';
const app = fileURLToPath(new URL('../../app', import.meta.url));
const seller = fileURLToPath(new URL('..', import.meta.url));

const probe = await fetch('http://127.0.0.1:54321/functions/v1/seller-admin', {
  method: 'OPTIONS',
}).catch(() => null);
await probe?.body?.cancel();
if (probe?.status !== 204) {
  console.error(
    '✖ The seller-admin function is not served. Run `pnpm db:start` and `pnpm db:functions` first.',
  );
  process.exitCode = 1;
} else {
  execFileSync('node', ['scripts/build-web.mjs', 'e2e'], { cwd: app, stdio: 'inherit', shell });
  execFileSync('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], {
    cwd: seller,
    stdio: 'inherit',
    shell,
  });
}
