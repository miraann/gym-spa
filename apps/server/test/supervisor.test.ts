import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  HEALTHY_AFTER_MS,
  LONGEST_PAUSE_MS,
  pauseBefore,
  supervise,
  type SupervisorClock,
} from '../src/supervisor.ts';

/** A program that only exits when told to. */
class FakeChild extends EventEmitter {
  killed = false;
  kill(): boolean {
    this.killed = true;
    queueMicrotask(() => this.emit('exit', null));
    return true;
  }
  crash(code = 1): void {
    this.emit('exit', code);
  }
}

class FakeClock implements SupervisorClock {
  time = 0;
  private timers: { at: number; callback: () => void }[] = [];
  now(): number {
    return this.time;
  }
  later(callback: () => void, milliseconds: number): () => void {
    const timer = { at: this.time + milliseconds, callback };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((each) => each !== timer);
    };
  }
  /** Moves time on, running what is due. */
  advance(milliseconds: number): void {
    this.time += milliseconds;
    const due = this.timers.filter((timer) => timer.at <= this.time);
    this.timers = this.timers.filter((timer) => timer.at > this.time);
    for (const timer of due) timer.callback();
  }
  pending(): number {
    return this.timers.length;
  }
}

function setUp() {
  const clock = new FakeClock();
  const children: FakeChild[] = [];
  const lines: string[] = [];
  const program = supervise({
    name: 'auth',
    start: () => {
      const child = new FakeChild();
      children.push(child);
      return child as unknown as ChildProcess;
    },
    log: (line) => {
      lines.push(line);
    },
    clock,
  });
  return { clock, children, lines, program };
}

describe('pauses', () => {
  it('double from 1 s up to 60 s', () => {
    expect([0, 1, 2, 3, 5, 6, 20].map(pauseBefore)).toEqual([
      1000,
      2000,
      4000,
      8000,
      32_000,
      LONGEST_PAUSE_MS,
      LONGEST_PAUSE_MS,
    ]);
  });
});

describe('supervise', () => {
  it('starts the program and reports it running', () => {
    const { children, program } = setUp();
    expect(children).toHaveLength(1);
    expect(program.status()).toEqual({
      name: 'auth',
      state: 'running',
      restarts: 0,
      lastExit: null,
    });
  });

  it('starts a program that stopped by itself again, after a growing pause', () => {
    const { clock, children, lines, program } = setUp();
    children[0]?.crash(3);
    expect(program.status().state).toBe('waiting');
    expect(lines[0]).toBe('auth stopped (exit 3); starting it again in 1 s');
    clock.advance(999);
    expect(children).toHaveLength(1);
    clock.advance(1);
    expect(children).toHaveLength(2);
    children[1]?.crash();
    clock.advance(1999);
    expect(children).toHaveLength(2);
    clock.advance(1);
    expect(children).toHaveLength(3);
    expect(program.status()).toMatchObject({ state: 'running', restarts: 2 });
  });

  it('waits the first pause again after a healthy run', () => {
    const { clock, children, lines } = setUp();
    children[0]?.crash();
    clock.advance(1000);
    clock.advance(HEALTHY_AFTER_MS);
    children[1]?.crash();
    expect(lines.at(-1)).toContain('again in 1 s');
  });

  it('never restarts a program stopped on purpose', async () => {
    const { clock, children, program } = setUp();
    await program.stop();
    expect(children[0]?.killed).toBe(true);
    expect(program.status().state).toBe('stopped');
    clock.advance(LONGEST_PAUSE_MS);
    expect(children).toHaveLength(1);
  });

  it('cancels a pending restart when stopped while waiting', async () => {
    const { clock, children, program } = setUp();
    children[0]?.crash();
    expect(clock.pending()).toBe(1);
    await program.stop();
    expect(clock.pending()).toBe(0);
    clock.advance(LONGEST_PAUSE_MS);
    expect(children).toHaveLength(1);
  });
});
