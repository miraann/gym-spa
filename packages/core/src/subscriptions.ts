// What a member's subscriptions are on a day (step 3d): the stored status says whether a sale
// still stands (spec §4.2); expired and not started yet come from the dates and are never stored.
// Frozen comes with step 3f.

/** Stored statuses (subscriptions.status). */
export const SUBSCRIPTION_STATUSES = [
  'active',
  'cancelled',
  'voided',
  'replaced',
  'transferred',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** What a subscription is on a day: a sale that stands is upcoming, current or expired. */
export type SubscriptionState =
  Exclude<SubscriptionStatus, 'active'> | 'upcoming' | 'current' | 'expired';

export interface SubscriptionDates {
  readonly status: SubscriptionStatus;
  /** YYYY-MM-DD. */
  readonly startDate: string;
  /** Its last day (YYYY-MM-DD); null for plans of visits or unlimited plans. */
  readonly endDate: string | null;
}

/** What the subscription is on `today` (Baghdad's date, YYYY-MM-DD). */
export function subscriptionState(
  subscription: SubscriptionDates,
  today: string,
): SubscriptionState {
  if (subscription.status !== 'active') return subscription.status;
  if (subscription.startDate > today) return 'upcoming';
  if (subscription.endDate !== null && subscription.endDate < today) return 'expired';
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
      return state === 'current' || state === 'upcoming';
    })
    .map((each) => each.endDate)
    .filter((end): end is string => end !== null && end >= today)
    .sort();
  const last = ends.at(-1);
  return last === undefined ? null : nextDay(last);
}
