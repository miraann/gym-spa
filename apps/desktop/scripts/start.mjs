// Starts the desktop app from this folder: `node scripts/start.mjs [--dev]`.
// Clears ELECTRON_RUN_AS_NODE, which tools started from VS Code inherit: with it set, Electron
// runs as plain Node and the app never opens.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const desktopDir = fileURLToPath(new URL('..', import.meta.url));

spawn(String(electronPath), ['.', ...process.argv.slice(2)], {
  cwd: desktopDir,
  env,
  stdio: 'inherit',
}).on('exit', (code) => {
  process.exit(code ?? 0);
});
