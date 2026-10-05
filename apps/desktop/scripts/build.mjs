// Bundles the Electron main process and the preload script into dist/. Bundling keeps the
// installed app free of node_modules, and sandboxed preload scripts must be a single file.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const shared = {
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'warning',
};

await Promise.all([
  build({ ...shared, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' }),
  build({ ...shared, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs' }),
]);
