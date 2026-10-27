// Rules of plans (step 3b), the same as the database's (supabase/migrations/…_plans.sql; a test
// compares them), so the plan form refuses what the server would refuse before anything is sent.

/** The four combinations of an end date and a visit count. */
export const PLAN_KINDS = ['time', 'visits', 'hybrid', 'unlimited'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const DURATION_UNITS = ['month', 'day'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

export const PLAN_GENDERS = ['any', 'male', 'female'] as const;
export type PlanGender = (typeof PLAN_GENDERS)[number];

/** The limits of the plan columns (plans.*). */
export const PLAN_LIMITS = {
  name: 80,
  maxMonths: 120,
  maxDays: 3660,
  maxVisits: 1000,
  maxPrice: 1_000_000_000,
  maxDailyVisits: 10,
  maxFreezeDays: 365,
} as const;

/** Whether plans of this kind end on a date (time and hybrid). */
export function planHasDuration(kind: PlanKind): boolean {
  return kind === 'time' || kind === 'hybrid';
}

/** Whether plans of this kind count visits (visits and hybrid). */
export function planHasVisits(kind: PlanKind): boolean {
  return kind === 'visits' || kind === 'hybrid';
}

/** ISO days of the week (1 Monday … 7 Sunday) in the order a week is shown here: Saturday first. */
export const WEEK_ORDER = [6, 7, 1, 2, 3, 4, 5] as const;
export type Weekday = (typeof WEEK_ORDER)[number];

/**
 * Days as the database stores them (app.is_valid_weekdays): each once, in order, or null for
 * every day (all seven). No days at all is not a rule, so it is null too; the form refuses it.
 */
export function normalizeWeekdays(days: readonly number[]): Weekday[] | null {
  const chosen = WEEK_ORDER.filter((day) => days.includes(day)).sort((a, b) => a - b);
  return chosen.length === 0 || chosen.length === WEEK_ORDER.length ? null : chosen;
}

/** A calendar date as YYYY-MM-DD, in UTC so no time zone moves it. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(date: string): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * The last day of a plan that starts on `start` (YYYY-MM-DD), like app.plan_end_date(). In months:
 * the day before the same date n months later, or that month's last day when it has no such date
 * (from 31 Mar: 30 Apr), so nobody gets less than they paid for. In days: n - 1 days after the
 * start.
 */
export function planEndDate(start: string, unit: DurationUnit, count: number): string {
  const from = parseDate(start);
  if (unit === 'day') {
    from.setUTCDate(from.getUTCDate() + count - 1);
    return isoDate(from);
  }
  const day = from.getUTCDate();
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + count, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // The month has no such date: its last day is the end.
  if (day > lastDay)
    return isoDate(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), lastDay)));
  return isoDate(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day - 1)));
}

/** Whether a price is one the database accepts: whole dinars, from 0 up to the limit. */
export function isValidPlanPrice(price: number): boolean {
  return Number.isInteger(price) && price >= 0 && price <= PLAN_LIMITS.maxPrice;
}
