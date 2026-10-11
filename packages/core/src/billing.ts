import type { GymAccess } from './gym.ts';

// The gym's subscription with Click Group, as the gym app shows it (spec §2.6): warnings 30, 7 and
// 1 day before it ends, the 30-day grace period after it, and the read-only state. The server
// decides the state itself (app.gym_access, its access field in my_gym()); this only words it and
// counts the days, in Baghdad calendar days.

/** Days of grace after paid_until before the gym becomes read-only (as in app.gym_access). */
export const GRACE_DAYS = 30;

/** Warning stages before the end of the subscription. */
export const BILLING_STAGES = [30, 7, 1] as const;
export type BillingStage = (typeof BILLING_STAGES)[number];

export type BillingNotice =
  | { readonly kind: 'none' }
  /** The subscription ends soon. daysLeft: Baghdad days until the first unpaid day (1 on the last paid day). */
  | {
      readonly kind: 'ending';
      readonly stage: BillingStage;
      readonly daysLeft: number;
      /** The last paid moment: its Baghdad date is the last paid day. */
      readonly lastPaidAt: string;
    }
  /** The subscription ended; everything still works until readOnlyAt. */
  | {
      readonly kind: 'grace';
      readonly daysLeft: number;
      readonly lastPaidAt: string;
      /** When the gym becomes read-only: its Baghdad date is the first read-only day. */
      readonly readOnlyAt: string;
    }
  /** View only: Click Group suspended it, or the grace period ended. */
  | { readonly kind: 'read_only'; readonly reason: 'suspended' | 'ended' };

export interface GymBilling {
  readonly access: GymAccess;
  /** ISO time; null: no end. */
  readonly paidUntil: string | null;
  readonly suspended: boolean;
}

const DAY_MS = 86_400_000;
/** Iraq has kept UTC+3 all year since 2008 (no daylight saving). */
const BAGHDAD_OFFSET_MS = 3 * 3_600_000;

/** The Baghdad calendar day of a moment, as a day number. */
function baghdadDay(ms: number): number {
  return Math.floor((ms + BAGHDAD_OFFSET_MS) / DAY_MS);
}

const NONE: BillingNotice = { kind: 'none' };

function stageFor(daysLeft: number): BillingStage | null {
  if (daysLeft > 30) return null;
  if (daysLeft > 7) return 30;
  if (daysLeft > 1) return 7;
  return 1;
}

/** What the gym app says about the subscription now. A locked gym says nothing here: the app locks. */
export function billingNotice(gym: GymBilling, now: Date | number = Date.now()): BillingNotice {
  if (gym.access === 'locked') return NONE;
  if (gym.access === 'read_only') {
    return { kind: 'read_only', reason: gym.suspended ? 'suspended' : 'ended' };
  }
  if (gym.paidUntil === null) return NONE;
  const end = Date.parse(gym.paidUntil);
  if (Number.isNaN(end)) return NONE;
  const today = baghdadDay(typeof now === 'number' ? now : now.getTime());
  const lastPaidAt = new Date(end - 1).toISOString();

  if (gym.access === 'grace') {
    const readOnlyAt = end + GRACE_DAYS * DAY_MS;
    return {
      kind: 'grace',
      daysLeft: Math.max(1, baghdadDay(readOnlyAt) - today),
      lastPaidAt,
      readOnlyAt: new Date(readOnlyAt).toISOString(),
    };
  }

  // Active. The server says it hasn't ended; a device clock that runs ahead still shows 1 day.
  const daysLeft = Math.max(1, baghdadDay(end) - today);
  const stage = stageFor(daysLeft);
  return stage === null ? NONE : { kind: 'ending', stage, daysLeft, lastPaidAt };
}

/**
 * Who sees a notice: read-only concerns everyone (nothing can be saved); the subscription's dates
 * only those with billing.view.
 */
export function billingNoticeAudience(notice: BillingNotice): 'everyone' | 'billing' | null {
  if (notice.kind === 'none') return null;
  return notice.kind === 'read_only' ? 'everyone' : 'billing';
}

/** The 30- and 7-day warnings can be closed until the next stage; the 1-day one and later can't. */
export function isBillingNoticeDismissible(notice: BillingNotice): boolean {
  return notice.kind === 'ending' && notice.stage !== 1;
}

/**
 * paid_until for a subscription paid through a Baghdad calendar date (YYYY-MM-DD): the end of
 * that day, i.e. 00:00 of the next day in Baghdad. The seller panel picks dates this way.
 */
export function paidUntilFromDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a date: "${date}"`);
  const [, year, month, day] = match.map(Number);
  const start = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const checked = new Date(start);
  if (
    checked.getUTCFullYear() !== year ||
    checked.getUTCMonth() + 1 !== month ||
    checked.getUTCDate() !== day
  ) {
    throw new Error(`Not a date: "${date}"`);
  }
  return new Date(start + DAY_MS - BAGHDAD_OFFSET_MS).toISOString();
}

/** The Baghdad calendar date (YYYY-MM-DD) of a moment. */
export function baghdadDateOf(moment: Date | number): string {
  const ms = typeof moment === 'number' ? moment : moment.getTime();
  return new Date(ms + BAGHDAD_OFFSET_MS).toISOString().slice(0, 10);
}

/** The last paid Baghdad date of a paid_until (the inverse of paidUntilFromDate). */
export function paidDateOf(paidUntil: string): string {
  return baghdadDateOf(Date.parse(paidUntil) - 1);
}

/**
 * A date (YYYY-MM-DD) some months later, kept within the month: 31 January + 1 month is
 * 28 (or 29) February.
 */
export function addMonthsToDate(date: string, months: number): string {
  paidUntilFromDate(date);
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
