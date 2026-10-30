import type { ChildProcess } from 'node:child_process';

// Keeps one of the server's programs running: when it stops by itself, it is started again after
// a pause that grows (1 s, 2 s, 4 s … at most 60 s) and starts over once it has run for a minute,
// so a program that fails at once doesn't spin. Stopping on purpose never restarts it.

export type ProgramState = 'starting' | 'running' | 'waiting' | 'stopped';

export interface ProgramStatus {
  readonly name: string;
  readonly state: ProgramState;
  readonly restarts: number;
  /** When it last stopped by itself (ISO), if ever. */
  readonly lastExit: string | null;
}

export interface SupervisorClock {
  now(): number;
  later(callback: () => void, milliseconds: number): () => void;
}

const realClock: SupervisorClock = {
  now: () => Date.now(),
  later: (callback, milliseconds) => {
    const timer = setTimeout(callback, milliseconds);
    return () => {
      clearTimeout(timer);
    };
  },
};

export const FIRST_PAUSE_MS = 1000;
export const LONGEST_PAUSE_MS = 60_000;
/** Running this long counts as healthy: the next stop waits the first pause again. */
export const HEALTHY_AFTER_MS = 60_000;

/** The pause before restart number `attempt` (0-based). */
export function pauseBefore(attempt: number): number {
  return Math.min(LONGEST_PAUSE_MS, FIRST_PAUSE_MS * 2 ** attempt);
}

export interface Supervised {
  status(): ProgramStatus;
  /** Stops it for good (no restart); resolves when it has exited. */
  stop(): Promise<void>;
}

export interface SuperviseOptions {
  readonly name: string;
  readonly start: () => ChildProcess;
  /** Waits until it answers; a program that never does is stopped and restarted. */
  readonly ready?: () => Promise<void>;
  /** How to stop it on purpose (default: end the process). Postgres stops cleanly with pg_ctl. */
  readonly halt?: (child: ChildProcess) => void;
  readonly log: (line: string) => void;
  readonly clock?: SupervisorClock;
}

export function supervise(options: SuperviseOptions): Supervised {
  const clock = options.clock ?? realClock;
  let child: ChildProcess | null = null;
  let state: ProgramState = 'starting';
  let attempt = 0;
  let restarts = 0;
  let startedAt = 0;
  let lastExit: string | null = null;
  let cancelWait: (() => void) | null = null;
  let stopping = false;
  let exited: (() => void) | null = null;

  const launch = () => {
    state = 'starting';
    startedAt = clock.now();
    const current = options.start();
    child = current;
    current.on('exit', (code) => {
      if (child !== current) return;
      child = null;
      if (stopping) {
        state = 'stopped';
        exited?.();
        return;
      }
      lastExit = new Date(clock.now()).toISOString();
      if (clock.now() - startedAt >= HEALTHY_AFTER_MS) attempt = 0;
      const pause = pauseBefore(attempt);
      attempt += 1;
      state = 'waiting';
      options.log(
        `${options.name} stopped (exit ${String(code)}); starting it again in ${String(pause / 1000)} s`,
      );
      cancelWait = clock.later(() => {
        cancelWait = null;
        restarts += 1;
        launch();
      }, pause);
    });
    if (options.ready) {
      options.ready().then(
        () => {
          if (child === current) state = 'running';
        },
        () => {
          if (child === current && !stopping) {
            options.log(`${options.name} did not answer; stopping it to start again`);
            current.kill();
          }
        },
      );
    } else {
      state = 'running';
    }
  };

  launch();

  return {
    status: () => ({ name: options.name, state, restarts, lastExit }),
    stop: () => {
      stopping = true;
      cancelWait?.();
      cancelWait = null;
      const current = child;
      if (current === null) {
        state = 'stopped';
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        exited = resolve;
        if (options.halt) options.halt(current);
        else current.kill();
      });
    },
  };
}
