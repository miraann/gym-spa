// Auth spike (throwaway): runs the web app's e2e suite (apps/app/e2e) against the Windows stack
// instead of the local Supabase in Docker. The repo's tests are not changed: they are copied to
// F:\spikes-tools\e2e and three things are patched in the copy:
//   - support/backend.ts reads the API URL and keys from spike.mjs instead of `supabase status`;
//   - bundle.spec.ts expects the stack's address in the build instead of 127.0.0.1:54321;
//   - playwright.config.ts serves the build from F:\spikes-tools\dist on port 4174.
// Start the stack first (spike.mjs start). Extra arguments go to `playwright test`.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..', '..', 'apps', 'app');
const TOOLS = 'F:\\spikes-tools';
const COPY = path.join(TOOLS, 'e2e');
const DIST = path.join(TOOLS, 'dist');

const keys = JSON.parse(
  execFileSync(process.execPath, [path.join(HERE, 'spike.mjs'), 'keys'], { encoding: 'utf8' }),
);

function patch(file, from, to) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(from))
    throw new Error(`${file}: "${from.slice(0, 60)}" not found; the e2e code changed`);
  writeFileSync(file, text.replace(from, to));
}

rmSync(COPY, { recursive: true, force: true });
mkdirSync(COPY, { recursive: true });
cpSync(path.join(APP, 'e2e'), COPY, { recursive: true });
// The tests are ES modules (apps/app/package.json says so for the originals).
writeFileSync(path.join(COPY, 'package.json'), '{ "type": "module" }\n');
// Module resolution for the copy: a junction to the app's node_modules.
spawnSync(
  'cmd.exe',
  ['/c', 'mklink', '/J', path.join(COPY, 'node_modules'), path.join(APP, 'node_modules')],
  { stdio: 'ignore' },
);
if (!existsSync(path.join(COPY, 'node_modules', '@playwright')))
  throw new Error('node_modules junction failed');

patch(
  path.join(COPY, 'support', 'backend.ts'),
  'function status(): LocalStatus {',
  `function status(): LocalStatus {
  localStatus ??= ${JSON.stringify({ API_URL: keys.apiUrl, SECRET_KEY: keys.serviceKey, PUBLISHABLE_KEY: keys.anonKey })};`,
);
patch(
  path.join(COPY, 'bundle.spec.ts'),
  "new URL('../dist', import.meta.url)",
  `new URL('../dist', import.meta.url) /* ${DIST} */`,
);
patch(
  path.join(COPY, 'bundle.spec.ts'),
  "text.includes('http://127.0.0.1:54321')",
  `text.includes(${JSON.stringify(keys.apiUrl)})`,
);

const config = readFileSync(path.join(APP, 'playwright.config.ts'), 'utf8')
  .replace("testDir: './e2e'", "testDir: '.'")
  .replace('const PORT = 4173;', 'const PORT = 4174;')
  .replace(
    'pnpm exec vite preview --port',
    `pnpm --dir ${JSON.stringify(APP).replaceAll('\\\\', '/')} exec vite preview --outDir ${JSON.stringify(DIST).replaceAll('\\\\', '/')} --port`,
  );
writeFileSync(path.join(COPY, 'playwright.config.ts'), config);

console.log(`build for ${keys.apiUrl}`);
const build = spawnSync(
  'pnpm',
  ['exec', 'vite', 'build', '--mode', 'e2e', '--outDir', DIST, '--emptyOutDir'],
  {
    cwd: APP,
    shell: true,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      VITE_SUPABASE_URL: keys.apiUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: keys.anonKey,
    },
  },
);
if (build.status !== 0) throw new Error('build failed');

const result = spawnSync(
  'pnpm',
  [
    '--dir',
    APP,
    'exec',
    'playwright',
    'test',
    '--config',
    path.join(COPY, 'playwright.config.ts'),
    ...process.argv.slice(2),
  ],
  {
    shell: true,
    stdio: 'inherit',
  },
);
process.exitCode = result.status ?? 1;
