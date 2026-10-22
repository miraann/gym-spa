// Bundles the Electron main process and the preload script into dist/. Bundling keeps the
// installed app free of node_modules, and sandboxed preload scripts must be a single file.
// smartcard's compiled native part (PC/SC card readers, step 2f) is copied next to them, into
// dist/native; without it (it couldn't be compiled here) the app has no PC/SC readers.
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const desktopDir = fileURLToPath(new URL('..', import.meta.url));
const shared = {
  absWorkingDir: desktopDir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'warning',
};

/** smartcard's compiled addon, or null when the optional dependency isn't installed or built. */
function smartcardAddon() {
  try {
    // Its entry point is dist/lib/index.js; its package.json isn't exported.
    const entry = createRequire(import.meta.url).resolve('smartcard');
    return path.resolve(path.dirname(entry), '../../build/Release/smartcard_napi.node');
  } catch {
    return null;
  }
}

/** A file's content, or null when it doesn't exist. */
async function contentOf(file) {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

async function copyNative() {
  const nativeDir = path.join(desktopDir, 'dist', 'native');
  const target = path.join(nativeDir, 'smartcard_napi.node');
  const addon = smartcardAddon();
  const content = addon === null ? null : await contentOf(addon);
  if (content === null) {
    await rm(nativeDir, { recursive: true, force: true });
    console.warn(
      'No PC/SC card readers in this build: smartcard is not installed or not built. ' +
        'Building it needs the tools in README → Windows app.',
    );
    return;
  }
  // Windows locks the file while an app started from this folder runs; it only changes when
  // smartcard is built again.
  if ((await contentOf(target))?.equals(content)) return;
  await mkdir(nativeDir, { recursive: true });
  await copyFile(addon, target);
}

await Promise.all([
  build({ ...shared, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' }),
  build({ ...shared, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs' }),
  copyNative(),
]);
