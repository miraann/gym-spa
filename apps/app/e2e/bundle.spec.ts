// The build may contain only the VITE_* variables the app reads one by one. Vite turns any other
// use of import.meta.env, also inside a library, into an object with every variable of the build,
// and on Vercel those include its own (git author, commit messages, project ids). The lint rule
// gym/no-import-meta-env-object covers our code; this checks the real build.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
/** From .env.e2e: a variable the app never reads. */
const UNUSED = { name: 'VITE_E2E_UNUSED', value: 'unused-variable-must-not-reach-the-bundle' };

/** Every file the browser can load: pages, scripts, the service worker and the manifest. */
async function builtFiles(): Promise<string[]> {
  const entries = await readdir(DIST, { recursive: true });
  return entries
    .filter((entry) => /\.(?:html|js|mjs|webmanifest)$/.test(entry))
    .map((entry) => path.join(DIST, entry));
}

test('only the variables the app reads reach the browser', async () => {
  const files = await builtFiles();
  expect(files.length).toBeGreaterThan(0);

  const leaks: string[] = [];
  let readsBackend = false;
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (text.includes(UNUSED.value) || text.includes(UNUSED.name)) {
      leaks.push(path.relative(DIST, file));
    }
    if (text.includes('http://127.0.0.1:54321')) readsBackend = true;
  }

  // The scan sees the real e2e build: the backend address the app reads is in it.
  expect(readsBackend).toBe(true);
  expect(leaks).toEqual([]);
});
