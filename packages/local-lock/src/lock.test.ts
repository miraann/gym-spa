import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCK_ENV, LocalLockError, acquireLocalLock, processIsAlive, readHolder } from './lock.ts';

let folder: string;
let file: string;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'local-lock-'));
  file = path.join(folder, '.tmp', 'local-supabase.lock');
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

const alive = () => true;
const gone = () => false;

describe('acquireLocalLock', () => {
  it('writes who holds the lock, and removes it when given back', () => {
    const env: NodeJS.ProcessEnv = { CLAUDE_CODE_SESSION_ID: 'session-a' };
    const release = acquireLocalLock('db:reset', { file, env, pid: 1234, isAlive: alive });

    const holder = readHolder(file);
    expect(holder).toMatchObject({ pid: 1234, what: 'db:reset', claudeSession: 'session-a' });
    expect(env[LOCK_ENV]).toBe(holder?.token);

    release();
    expect(readHolder(file)).toBeNull();
    expect(env[LOCK_ENV]).toBeUndefined();
  });

  it('refuses a second run while the holder lives, and says who holds it', () => {
    acquireLocalLock('app test:e2e', {
      file,
      env: { CLAUDE_CODE_SESSION_ID: 'session-a' },
      pid: 1234,
      isAlive: alive,
    });

    const second = () =>
      acquireLocalLock('db:reset', {
        file,
        env: { CLAUDE_CODE_SESSION_ID: 'session-b' },
        isAlive: alive,
      });
    expect(second).toThrow(LocalLockError);
    expect(second).toThrow(/"db:reset" can't start/);
    expect(second).toThrow(
      /"app test:e2e" runs since .*Claude Code session session-a \(process 1234\)/,
    );
  });

  it('names a run started outside Claude Code', () => {
    acquireLocalLock('playwright test (apps/app)', { file, env: {}, pid: 99, isAlive: alive });
    expect(() => acquireLocalLock('db:test', { file, env: {}, isAlive: alive })).toThrow(
      /a terminal or an editor \(not Claude Code\)/,
    );
  });

  it('takes over a lock whose process is gone', () => {
    acquireLocalLock('app test:e2e', { file, env: {}, pid: 1234, isAlive: alive });
    const env: NodeJS.ProcessEnv = {};
    acquireLocalLock('db:reset', { file, env, pid: 5678, isAlive: gone });
    expect(readHolder(file)).toMatchObject({ pid: 5678, what: 'db:reset' });
  });

  it('takes over a damaged lock file', () => {
    acquireLocalLock('db:test', { file, env: {}, isAlive: alive });
    writeFileSync(file, '{"pid": 12');
    acquireLocalLock('db:reset', { file, env: {}, pid: 5678, isAlive: alive });
    expect(readHolder(file)?.what).toBe('db:reset');
  });

  it('lets a run inside the held lock go on, without giving the lock back early', () => {
    const env: NodeJS.ProcessEnv = {};
    const outer = acquireLocalLock('app test:e2e', { file, env, pid: 1234, isAlive: alive });
    // The child process inherits the token (the Playwright global setup inside pnpm test:e2e).
    const inner = acquireLocalLock('playwright test (apps/app)', {
      file,
      env: { ...env },
      isAlive: alive,
    });
    inner();
    expect(readHolder(file)?.what).toBe('app test:e2e');
    outer();
    expect(readHolder(file)).toBeNull();
  });

  it('never removes a lock that another run took over', () => {
    const release = acquireLocalLock('db:test', { file, env: {}, pid: 1234, isAlive: alive });
    acquireLocalLock('db:reset', { file, env: {}, pid: 5678, isAlive: gone });
    release();
    expect(readHolder(file)?.what).toBe('db:reset');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ pid: 5678 });
  });
});

describe('processIsAlive', () => {
  it('knows this process, and not a process id nobody uses', () => {
    expect(processIsAlive(process.pid)).toBe(true);
    expect(processIsAlive(2 ** 30)).toBe(false);
  });
});
