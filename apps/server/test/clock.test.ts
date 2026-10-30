import { describe, expect, it } from 'vitest';
import { acceptClock, checkClock, CLOCK_TOLERANCE_MS, parseClockState } from '../src/clock.ts';

const at = (iso: string) => Date.parse(iso);
const HOUR = 60 * 60 * 1000;

describe('checkClock', () => {
  it('starts from the clock, or the newest row, on a new server', () => {
    expect(checkClock(at('2026-10-30T10:00:00Z'), null, null)).toEqual({
      behind: false,
      latest: at('2026-10-30T10:00:00Z'),
      next: { latest: '2026-10-30T10:00:00.000Z', acceptedAt: null },
    });
    const restored = checkClock(at('2026-10-30T10:00:00Z'), null, at('2027-03-01T00:00:00Z'));
    expect(restored.behind).toBe(true);
  });

  it('moves the latest moment on with the clock', () => {
    const first = checkClock(at('2026-10-30T10:00:00Z'), null, null);
    const later = checkClock(at('2026-10-30T10:01:00Z'), first.next, at('2026-10-30T10:00:30Z'));
    expect(later.behind).toBe(false);
    expect(later.next.latest).toBe('2026-10-30T10:01:00.000Z');
  });

  it('allows the clock up to 48 hours behind (a wrong time zone, a summer-time slip)', () => {
    const stored = { latest: '2026-10-30T10:00:00.000Z', acceptedAt: null };
    const now = at('2026-10-30T10:00:00Z') - CLOCK_TOLERANCE_MS;
    const check = checkClock(now, stored, null);
    expect(check.behind).toBe(false);
    expect(check.next.latest).toBe(stored.latest);
  });

  it('catches a clock set back more than 48 hours, and keeps what it saw', () => {
    const stored = { latest: '2026-10-30T10:00:00.000Z', acceptedAt: null };
    const check = checkClock(at('2026-10-28T09:00:00Z'), stored, null);
    expect(check.behind).toBe(true);
    expect(check.next.latest).toBe(stored.latest);
  });

  it('catches it from the audit log when the stored state was deleted', () => {
    expect(checkClock(at('2026-01-01T00:00:00Z'), null, at('2026-10-30T10:00:00Z')).behind).toBe(
      true,
    );
  });

  it('works again once the clock is right', () => {
    const stored = { latest: '2026-10-30T10:00:00.000Z', acceptedAt: null };
    expect(checkClock(at('2026-10-30T10:05:00Z'), stored, at('2026-10-30T10:04:00Z')).behind).toBe(
      false,
    );
    expect(checkClock(at('2026-10-29T09:00:00Z') + HOUR, stored, null).behind).toBe(false);
  });
});

describe('accepting the current time', () => {
  it('starts again from now', () => {
    const accepted = acceptClock(at('2026-10-30T10:00:00Z'));
    expect(accepted).toEqual({
      latest: '2026-10-30T10:00:00.000Z',
      acceptedAt: '2026-10-30T10:00:00.000Z',
    });
    expect(checkClock(at('2026-10-30T10:01:00Z'), accepted, null)).toMatchObject({
      behind: false,
      next: { acceptedAt: '2026-10-30T10:00:00.000Z' },
    });
  });
});

describe('parseClockState', () => {
  it('reads what was written, and ignores anything broken', () => {
    expect(parseClockState('{"latest":"2026-10-30T10:00:00.000Z","acceptedAt":null}')).toEqual({
      latest: '2026-10-30T10:00:00.000Z',
      acceptedAt: null,
    });
    expect(parseClockState(null)).toBeNull();
    expect(parseClockState('{')).toBeNull();
    expect(parseClockState('{"latest":"yesterday"}')).toBeNull();
    expect(parseClockState('{"latest":"2026-10-30T10:00:00Z","acceptedAt":"x"}')).toEqual({
      latest: '2026-10-30T10:00:00Z',
      acceptedAt: null,
    });
  });
});
