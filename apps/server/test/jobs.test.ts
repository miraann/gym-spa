import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runScheduledJobs, SCHEDULED_JOBS, untilNextRun } from '../src/jobs.ts';
import { REPO } from '../src/paths.ts';

describe('the scheduled jobs', () => {
  it('are the cloud pg_cron jobs, with the same schedule and command', () => {
    const folder = path.join(REPO, 'supabase', 'migrations');
    const text = readdirSync(folder)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(path.join(folder, file), 'utf8'))
      .join('\n');
    const scheduled = [
      ...text.matchAll(
        /cron\.schedule\(\s*'([^']+)',\s*'\*\/(\d+) \* \* \* \*',\s*'([^']+)'\s*\)/g,
      ),
    ].map(([, name, every, sql]) => ({ name, everyMinutes: Number(every), sql }));
    expect(scheduled).toHaveLength(SCHEDULED_JOBS.length);
    expect(SCHEDULED_JOBS).toEqual(expect.arrayContaining(scheduled));
  });
});

describe('untilNextRun', () => {
  const at = (iso: string) => Date.parse(iso);

  it('waits for the next minute divisible by the period, like cron', () => {
    expect(untilNextRun(at('2026-10-30T09:12:30Z'), 5)).toBe(2.5 * 60_000);
    expect(untilNextRun(at('2026-10-30T09:15:00Z'), 5)).toBe(5 * 60_000);
    expect(untilNextRun(at('2026-10-30T09:59:59Z'), 15)).toBe(1000);
    expect(untilNextRun(at('2026-10-30T09:00:00.001Z'), 15)).toBe(15 * 60_000 - 1);
  });
});

describe('runScheduledJobs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs each job at its moments and logs a failure without stopping', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-30T09:00:00Z') });
    const ran: string[] = [];
    const lines: string[] = [];
    const runner = runScheduledJobs(
      (sql) => {
        ran.push(sql);
        return sql.includes('fail') ? Promise.reject(new Error('boom')) : Promise.resolve();
      },
      (line) => {
        lines.push(line);
      },
      [
        { name: 'five', everyMinutes: 5, sql: 'select five()' },
        { name: 'broken', everyMinutes: 15, sql: 'select fail()' },
      ],
    );
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(ran.filter((sql) => sql === 'select five()')).toHaveLength(3);
    expect(ran.filter((sql) => sql === 'select fail()')).toHaveLength(1);
    expect(lines).toEqual(['job broken failed: boom']);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(ran.filter((sql) => sql === 'select fail()')).toHaveLength(2);
    runner.stop();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(ran).toHaveLength(8);
  });

  it('never starts a run while the last one is still going', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-30T09:00:00Z') });
    let started = 0;
    const runner = runScheduledJobs(
      () => {
        started += 1;
        return new Promise(() => undefined);
      },
      () => undefined,
      [{ name: 'slow', everyMinutes: 5, sql: 'select slow()' }],
    );
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(started).toBe(1);
    runner.stop();
  });
});
