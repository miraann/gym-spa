// One test run or database reset at a time on this PC's local Supabase (CLAUDE.md, the rule "one
// Claude session per project folder"). On 2026-10-30 two Claude sessions and the VS Code
// Playwright extension used the one local database at once, and the end-to-end tests failed in a
// different place on every run.
//
// The holder writes .tmp/local-supabase.lock with its process id and what it runs; anyone else
// starting a run is refused while that process lives. A lock whose process is gone is taken over.
// Child processes inherit the holder's token (LOCK_ENV), so a run started inside a held lock (the
// Playwright global setup inside `pnpm test:e2e`, the app's run inside the root `test:e2e`) goes on.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCK_ENV = 'GYM_LOCAL_LOCK';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFAULT_LOCK_FILE = path.join(ROOT, '.tmp', 'local-supabase.lock');

export interface LockHolder {
  readonly token: string;
  readonly pid: number;
  /** What runs, e.g. "app test:e2e" or "db:reset". */
  readonly what: string;
  /** The Claude Code session that started it, or null when a person or an editor did. */
  readonly claudeSession: string | null;
  readonly startedAt: string;
}

export class LocalLockError extends Error {
  readonly holder: LockHolder;

  constructor(holder: LockHolder, what: string, file: string) {
    super(refusal(holder, what, file));
    this.name = 'LocalLockError';
    this.holder = holder;
  }
}

export interface LockOptions {
  readonly file?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly pid?: number;
  readonly now?: Date;
  /** Whether a process still runs; replaced by tests. */
  readonly isAlive?: (pid: number) => boolean;
}

/** Whether the process exists. EPERM: it does, but belongs to someone else. */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readHolder(file: string = DEFAULT_LOCK_FILE): LockHolder | null {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const value = JSON.parse(text) as Partial<LockHolder>;
    if (typeof value.token !== 'string' || typeof value.pid !== 'number') return null;
    return {
      token: value.token,
      pid: value.pid,
      what: typeof value.what === 'string' ? value.what : '?',
      claudeSession: typeof value.claudeSession === 'string' ? value.claudeSession : null,
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : '?',
    };
  } catch {
    // Half written or damaged: nobody can be shown as its holder, so it counts as gone.
    return null;
  }
}

/**
 * Takes the lock for `what`, or throws LocalLockError while another live process holds it. Returns
 * the function that gives it back (a no-op inside a lock this process already shares).
 */
export function acquireLocalLock(what: string, options: LockOptions = {}): () => void {
  const file = options.file ?? DEFAULT_LOCK_FILE;
  const env = options.env ?? process.env;
  const isAlive = options.isAlive ?? processIsAlive;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = readHolder(file);
    if (current) {
      if (env[LOCK_ENV] === current.token) return () => undefined;
      if (isAlive(current.pid)) throw new LocalLockError(current, what, file);
    }
    // Free, damaged or left behind by a process that is gone.
    rmSync(file, { force: true });
    const holder: LockHolder = {
      token: randomUUID(),
      pid: options.pid ?? process.pid,
      what,
      claudeSession: env.CLAUDE_CODE_SESSION_ID ?? null,
      startedAt: (options.now ?? new Date()).toISOString(),
    };
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      // 'wx': fails when another run created it since we looked, so only one of them wins.
      writeFileSync(file, `${JSON.stringify(holder, null, 2)}\n`, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    env[LOCK_ENV] = holder.token;
    return () => {
      if (readHolder(file)?.token === holder.token) rmSync(file, { force: true });
      if (env[LOCK_ENV] === holder.token) Reflect.deleteProperty(env, LOCK_ENV);
    };
  }
  const holder = readHolder(file);
  if (holder) throw new LocalLockError(holder, what, file);
  throw new Error(`Could not take ${file}.`);
}

function refusal(holder: LockHolder, what: string, file: string): string {
  const by = holder.claudeSession
    ? `Claude Code session ${holder.claudeSession}`
    : 'a terminal or an editor (not Claude Code)';
  return [
    `✖ "${what}" can't start: the local Supabase is in use.`,
    `  "${holder.what}" runs since ${holder.startedAt}, started by ${by} (process ${String(holder.pid)}).`,
    '  Two runs on one local database make each other fail. Wait until it ends, or stop it.',
    '  One Claude session per project folder (CLAUDE.md).',
    `  If nothing runs any more, delete ${path.relative(ROOT, file)}.`,
  ].join('\n');
}
