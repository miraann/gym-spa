import { toLatinDigits } from './digits.ts';
import { WEEK_ORDER, type Weekday } from './plans.ts';

// The spa (Phase 6; supabase/migrations/20261028400000_spa_setup.sql, 20261028500000_spa_packages.sql
// and 20261028600000_spa_bookings.sql). The database decides; this file gives the screens the same
// limits, the working hours rules and the booking statuses.

/** A service's kind, which is also the kind of room it needs. */
export const SPA_KINDS = [
  'massage',
  'sauna',
  'steam',
  'jacuzzi',
  'facial',
  'moroccan_bath',
  'other',
] as const;
export type SpaKind = (typeof SPA_KINDS)[number];

export const SPA_GENDERS = ['any', 'male', 'female'] as const;
export type SpaGender = (typeof SPA_GENDERS)[number];

export const SPA_LIMITS = {
  serviceName: 80,
  roomName: 60,
  therapistName: 100,
  minDuration: 5,
  maxDuration: 480,
  maxCleanup: 60,
  maxCapacity: 20,
  maxCommission: 100,
  maxSessions: 100,
  maxValidDays: 3650,
  maxPrice: 1_000_000_000,
  maxWorkWindows: 28,
  note: 500,
} as const;

export const SPA_BOOKING_STATUSES = [
  'booked',
  'confirmed',
  'arrived',
  'completed',
  'no_show',
  'cancelled',
] as const;
export type SpaBookingStatus = (typeof SPA_BOOKING_STATUSES)[number];

/** What pays for a booking: at the door, a package of the member, or a plan's sessions. */
export const SPA_PAID_WITH = ['pay', 'package', 'plan'] as const;
export type SpaPaidWith = (typeof SPA_PAID_WITH)[number];

/** Whether a booking in this status holds its time (and uses a package or plan session). */
export function spaHoldsTime(status: SpaBookingStatus): boolean {
  return status !== 'no_show' && status !== 'cancelled';
}

/**
 * Whether a booking may go from one status to another, as set_spa_booking_status() and
 * arrive_spa_booking() allow it.
 */
export function canChangeSpaStatus(from: SpaBookingStatus, to: SpaBookingStatus): boolean {
  switch (to) {
    case 'confirmed':
      return from === 'booked';
    case 'arrived':
    case 'cancelled':
    case 'no_show':
      return from === 'booked' || from === 'confirmed';
    case 'completed':
      return from === 'arrived';
    case 'booked':
      return false;
  }
}

/** A window a therapist works on a weekday, Baghdad time: `09:00` to `17:00`, until `24:00` at most. */
export interface WorkWindow {
  readonly weekday: Weekday;
  readonly from: string;
  readonly until: string;
}

/** `09:30` as minutes after midnight; `24:00` only when it is the end of a window. */
export function clockMinutes(text: string, end = false): number | null {
  const latin = toLatinDigits(text.trim());
  if (end && latin === '24:00') return 1440;
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(latin);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Whether these windows are valid working hours (app.is_valid_spa_hours in the database). */
export function isValidWorkWindows(windows: readonly WorkWindow[]): boolean {
  if (windows.length > SPA_LIMITS.maxWorkWindows) return false;
  const spans = windows.map((window) => ({
    weekday: window.weekday,
    from: clockMinutes(window.from),
    until: clockMinutes(window.until, true),
  }));
  if (spans.some((span) => span.from === null || span.until === null || span.from >= span.until)) {
    return false;
  }
  return !spans.some((a, index) =>
    spans
      .slice(index + 1)
      .some(
        (b) =>
          a.weekday === b.weekday &&
          (a.from ?? 0) < (b.until ?? 0) &&
          (b.from ?? 0) < (a.until ?? 0),
      ),
  );
}

/**
 * Whether one window of the weekday covers a booking from `startMinute` to `endMinute` (minutes
 * after that day's midnight; a booking may end at 1440 but not later), like
 * app.therapist_works().
 */
export function worksDuring(
  windows: readonly WorkWindow[],
  weekday: Weekday,
  startMinute: number,
  endMinute: number,
): boolean {
  return windows.some((window) => {
    const from = clockMinutes(window.from);
    const until = clockMinutes(window.until, true);
    return (
      window.weekday === weekday &&
      from !== null &&
      until !== null &&
      from <= startMinute &&
      endMinute <= until
    );
  });
}

/** The calendar's rows: minutes after midnight from `fromHour` until `untilHour`, every `step`. */
export function spaDaySlots(fromHour: number, untilHour: number, step: number): number[] {
  const first = Math.max(0, Math.min(fromHour, 23)) * 60;
  const last = Math.max(first + 60, Math.min(untilHour, 24) * 60);
  const size = Math.max(5, step);
  const slots: number[] = [];
  for (let minute = first; minute < last; minute += size) slots.push(minute);
  return slots;
}

// Baghdad time (UTC+3, no summer time), which the calendar is drawn in.
const BAGHDAD_OFFSET_MS = 3 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function dayStartUtc(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}

/** The moment `minute` minutes after midnight of a Baghdad day (YYYY-MM-DD). */
export function baghdadMoment(day: string, minute: number): Date {
  return new Date(dayStartUtc(day) - BAGHDAD_OFFSET_MS + minute * 60_000);
}

/** A moment's Baghdad day (YYYY-MM-DD) and minutes after that day's midnight. */
export function baghdadClock(moment: Date | string): {
  readonly day: string;
  readonly minute: number;
} {
  const local = new Date(new Date(moment).getTime() + BAGHDAD_OFFSET_MS);
  return {
    day: local.toISOString().slice(0, 10),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** The day `count` days after `day` (YYYY-MM-DD; negative: before). */
export function addDays(day: string, count: number): string {
  return new Date(dayStartUtc(day) + count * DAY_MS).toISOString().slice(0, 10);
}

/** A day's ISO weekday (1 Monday … 7 Sunday). */
export function weekdayOf(day: string): Weekday {
  const sunday0 = new Date(dayStartUtc(day)).getUTCDay();
  return (sunday0 === 0 ? 7 : sunday0) as Weekday;
}

/** The first day of the gym week (Saturday, WEEK_ORDER) that `day` is in. */
export function weekStartOf(day: string): string {
  return addDays(day, -WEEK_ORDER.indexOf(weekdayOf(day)));
}
