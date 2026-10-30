// The scheduled jobs that pg_cron runs in the cloud (spec §8, steps 5d and 9a). The offline server
// has no pg_cron, so gym-server runs the same functions on the same schedule, as postgres like
// pg_cron does. A test compares this list with the migrations' cron.schedule calls.

export interface ScheduledJob {
  /** pg_cron's job name in the cloud. */
  readonly name: string;
  /** Runs at every minute of the hour divisible by this (cron's `*\/n * * * *`). */
  readonly everyMinutes: number;
  readonly sql: string;
}

export const SCHEDULED_JOBS: readonly ScheduledJob[] = [
  {
    name: 'release-daily-lockers',
    everyMinutes: 5,
    sql: 'select app.release_daily_lockers_at_night()',
  },
  { name: 'collect-reminders', everyMinutes: 15, sql: 'select app.collect_reminders()' },
];

/** Milliseconds from `now` to the next minute divisible by `everyMinutes`, like cron. */
export function untilNextRun(now: number, everyMinutes: number): number {
  const minute = 60_000;
  const period = everyMinutes * minute;
  // Whole minutes of the UTC clock; the periods used divide an hour, so Baghdad's offset (+3 h)
  // gives the same moments.
  const next = Math.floor(now / period) * period + period;
  return next - now;
}

export interface JobRunner {
  stop(): void;
}

/**
 * Runs each job at its moments. A run still going when the next is due is not started twice; a
 * failure is logged and the job runs again next time.
 */
export function runScheduledJobs(
  run: (sql: string) => Promise<void>,
  log: (line: string) => void,
  jobs: readonly ScheduledJob[] = SCHEDULED_JOBS,
): JobRunner {
  const timers = new Set<NodeJS.Timeout>();
  let stopped = false;
  for (const job of jobs) {
    let busy = false;
    const schedule = () => {
      if (stopped) return;
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          schedule();
          if (busy) return;
          busy = true;
          run(job.sql)
            .catch((error: unknown) => {
              log(
                `job ${job.name} failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            })
            .finally(() => {
              busy = false;
            });
        },
        untilNextRun(Date.now(), job.everyMinutes),
      );
      timers.add(timer);
    };
    schedule();
  }
  return {
    stop: () => {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
