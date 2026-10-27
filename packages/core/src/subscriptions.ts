// What a member's subscriptions are on a day (steps 3d and 3f): the stored status says whether a
// sale still stands (spec §4.2); expired, not started yet and frozen come from the dates and the
// freezes, and are never stored.

/** Stored statuses (subscriptions.status). */
export const SUBSCRIPTION_STATUSES = [
  'active',
  'cancelled',
  'voided',
  'replaced',
  'transferred',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** What a subscription is on a day: a sale that stands is upcoming, current, frozen or expired. */
export type SubscriptionState =
  Exclude<SubscriptionStatus, 'active'> | 'upcoming' | 'current' | 'frozen' | 'expired';

/** A freeze (subscription_freezes): planned from startDate to endDate, or ended early. */
export interface FreezeDates {
  readonly startDate: string;
  readonly endDate: string;
  /** Ended early: the first day back. */
  readonly endedOn: string | null;
}

export interface SubscriptionDates {
  readonly status: SubscriptionStatus;
  /** YYYY-MM-DD. */
  readonly startDate: string;
  /** Its last day (YYYY-MM-DD); null for plans of visits or unlimited plans. */
  readonly endDate: string | null;
  readonly freezes?: readonly FreezeDates[];
}

/** Whether a freeze keeps the subscription frozen on `date`, like app.is_frozen(). */
export function isFrozenOn(freeze: FreezeDates, date: string): boolean {
  return freeze.startDate <= date && date < (freeze.endedOn ?? nextDay(freeze.endDate));
}

/** The days a freeze keeps the subscription frozen in all, like app.frozen_days(). */
export function frozenDays(freeze: FreezeDates): number {
  return Math.max(0, daysBetween(freeze.startDate, freeze.endedOn ?? nextDay(freeze.endDate)));
}

/** What the subscription is on `today` (Baghdad's date, YYYY-MM-DD). */
export function subscriptionState(
  subscription: SubscriptionDates,
  today: string,
): SubscriptionState {
  if (subscription.status !== 'active') return subscription.status;
  if (subscription.startDate > today) return 'upcoming';
  if (subscription.endDate !== null && subscription.endDate < today) return 'expired';
  if (subscription.freezes?.some((freeze) => isFrozenOn(freeze, today))) return 'frozen';
  return 'current';
}

function dayNumber(date: string): number {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Days from `from` to `to` (YYYY-MM-DD): 0 on the same day, negative before it. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The day after `date` (YYYY-MM-DD). */
export function nextDay(date: string): string {
  return new Date((dayNumber(date) + 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The same day `count` months after `date` (YYYY-MM-DD), or that month's last day when it has no
 * such day, like Postgres' date + interval (31 Jan + 1 month: 28 Feb). For installments a month
 * apart.
 */
export function addMonths(date: string, count: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + count + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + count, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10);
}

/**
 * When a renewal starts: the day after the last day of the member's current and upcoming
 * subscriptions that end on a date, or null when none of them runs past today.
 */
export function renewalStart(
  subscriptions: readonly SubscriptionDates[],
  today: string,
): string | null {
  const ends = subscriptions
    .filter((each) => {
      const state = subscriptionState(each, today);
      return state === 'current' || state === 'frozen' || state === 'upcoming';
    })
    .map((each) => each.endDate)
    .filter((end): end is string => end !== null && end >= today)
    .sort();
  const last = ends.at(-1);
  return last === undefined ? null : nextDay(last);
}
