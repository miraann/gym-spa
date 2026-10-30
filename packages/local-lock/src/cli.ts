// Runs a command while holding the local Supabase lock (lock.ts). Used by the package scripts that
// use the local database: test runs and resets.
//
//   node packages/local-lock/src/cli.ts <what> "<command>" [arguments...]
//
// The command runs in a shell, so it may chain steps ("vite build && playwright test"); quote it,
// or the package script's own shell runs the later steps outside the lock. Arguments after it
// (what `pnpm test:e2e e2e/cash.spec.ts` adds) go to its last step.
import { spawn } from 'node:child_process';
import { LocalLockError, acquireLocalLock } from './lock.ts';

const [what, command, ...extra] = process.argv.slice(2);
if (!what || !command) {
  console.error('Usage: node packages/local-lock/src/cli.ts <what> "<command>" [arguments...]');
  process.exit(2);
}

/** One argument for the shell: quoted when it has spaces or characters the shell would read. */
function shellArgument(argument: string): string {
  return /^[\w@+=:,./-]+$/.test(argument) ? argument : `"${argument.replaceAll('"', '\\"')}"`;
}

let release: () => void;
try {
  release = acquireLocalLock(what);
} catch (error) {
  if (!(error instanceof LocalLockError)) throw error;
  console.error(error.message);
  process.exit(1);
}

// Ctrl+C reaches the command too; this process waits for it to end, then gives the lock back.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const)
  process.on(signal, () => undefined);

const child = spawn([command, ...extra.map(shellArgument)].join(' '), {
  shell: true,
  stdio: 'inherit',
});
child.on('error', (error) => {
  release();
  console.error(error);
  process.exit(1);
});
child.on('exit', (code) => {
  release();
  process.exit(code ?? 1);
});
