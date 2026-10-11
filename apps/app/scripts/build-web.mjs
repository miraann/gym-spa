// The web deployment (Vercel): the gym app, with the seller panel copied in under /seller/
// (spec §2.6). Two separate builds; only their outputs meet. Pass a Vite mode as the first
// argument (e.g. `e2e`); the default is production.
//
//   node scripts/build-web.mjs        what Vercel runs (vercel.json → buildCommand)
//   node scripts/build-web.mjs e2e    the end-to-end tests' build (local Supabase)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
const modeArgs = mode ? ['--mode', mode] : [];
const app = fileURLToPath(new URL('..', import.meta.url));
const seller = fileURLToPath(new URL('../../seller', import.meta.url));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = (cwd, args) =>
  execFileSync(pnpm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

run(app, ['exec', 'vite', 'build', ...modeArgs]);
run(seller, ['exec', 'vite', 'build', ...modeArgs]);

const from = fileURLToPath(new URL('../../seller/dist/', import.meta.url));
const to = fileURLToPath(new URL('../dist/seller/', import.meta.url));
if (!existsSync(`${from}index.html`))
  throw new Error('The seller panel did not build (apps/seller/dist).');
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('Seller panel copied to dist/seller/');
