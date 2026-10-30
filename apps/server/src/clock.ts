// Clock tampering (spec §2.6): the offline server never trusts the PC clock alone. It keeps the
// latest moment it has ever seen, from the clock and from the newest row of the audit log (every
// change writes one), and when the clock is more than 48 hours behind that, the license counts as
// expired (read-only, with a Kurdish warning) until the clock is right again.
//
// A clock set too far ahead by mistake and then corrected would look like tampering, and its
// future-dated rows stay in the database. An administrator on the server PC can then accept the
// current time (`gym-server-admin clock accept`, logged): the latest moment starts again from now,
// and rows written before that are only counted up to it.

export const CLOCK_TOLERANCE_MS = 48 * 60 * 60 * 1000;

export interface ClockState {
  /** The latest moment seen (ISO). */
  readonly latest: string;
  /** After an accept: audit rows dated later than this don't count (ISO). */
  readonly acceptedAt: string | null;
}

export interface ClockCheck {
  /** The clock is more than 48 hours behind what the server has seen. */
  readonly behind: boolean;
  /** The latest moment seen, including this check. */
  readonly latest: number;
  /** What to store for the next check. */
  readonly next: ClockState;
}

/**
 * One check. `newestRow` is the newest audit row's time (null: no rows yet), already limited to
 * the accept moment by the caller's query when there was one.
 */
export function checkClock(
  now: number,
  stored: ClockState | null,
  newestRow: number | null,
): ClockCheck {
  const remembered = stored === null ? Number.NEGATIVE_INFINITY : Date.parse(stored.latest);
  const seen = Math.max(remembered, newestRow ?? Number.NEGATIVE_INFINITY);
  const behind = Number.isFinite(seen) && now < seen - CLOCK_TOLERANCE_MS;
  // While the clock is behind, what was seen stays; otherwise the clock moves it on.
  const latest = behind ? seen : Math.max(seen, now);
  return {
    behind,
    latest,
    next: { latest: new Date(latest).toISOString(), acceptedAt: stored?.acceptedAt ?? null },
  };
}

/** After an administrator accepted the current time. */
export function acceptClock(now: number): ClockState {
  const moment = new Date(now).toISOString();
  return { latest: moment, acceptedAt: moment };
}

/** Reads a stored state (clock.json); anything unreadable counts as none. */
export function parseClockState(text: string | null): ClockState | null {
  if (text === null) return null;
  try {
    const raw = JSON.parse(text) as Partial<ClockState>;
    if (typeof raw.latest !== 'string' || Number.isNaN(Date.parse(raw.latest))) return null;
    const accepted =
      typeof raw.acceptedAt === 'string' && !Number.isNaN(Date.parse(raw.acceptedAt))
        ? raw.acceptedAt
        : null;
    return { latest: raw.latest, acceptedAt: accepted };
  } catch {
    return null;
  }
}
