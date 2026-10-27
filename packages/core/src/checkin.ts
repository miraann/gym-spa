// What public.check_in() answers (supabase/migrations/20261027100000_check_in.sql). The database
// decides; the screens only show the answer.

export const CHECKIN_RESULTS = ['allowed', 'warning', 'already', 'denied'] as const;
export type CheckinResult = (typeof CHECKIN_RESULTS)[number];

/** Why a subscription can't be used now, in the order the database checks (app.checkin_steps()). */
export const CHECKIN_STEPS = [
  'PLAN_EXPIRED',
  'NOT_STARTED',
  'PLAN_FROZEN',
  'NO_VISITS_LEFT',
  'WRONG_BRANCH',
  'WRONG_DAY',
  'WRONG_TIME',
  'DAILY_LIMIT',
] as const;

/** Refusals checkin.override may pass over (attendance.override_reason). */
export const OVERRIDABLE_REASONS = ['NO_SUBSCRIPTION', ...CHECKIN_STEPS, 'DEBT'] as const;
export type OverridableReason = (typeof OVERRIDABLE_REASONS)[number];

export const CHECKIN_REASONS = [
  'CARD_INVALID',
  'CARD_BLOCKED',
  'MEMBER_NOT_ACTIVE',
  'ALREADY_CHECKED_IN',
  ...OVERRIDABLE_REASONS,
] as const;
export type CheckinReason = (typeof CHECKIN_REASONS)[number];

export const CHECKIN_WARNINGS = ['ENDS_SOON', 'FEW_VISITS', 'DEBT', 'BIRTHDAY'] as const;
export type CheckinWarning = (typeof CHECKIN_WARNINGS)[number];

export interface CheckinMember {
  readonly id: string;
  readonly full_name: string;
  readonly member_number: number;
  readonly gender: 'male' | 'female';
  readonly status: 'active' | 'suspended' | 'banned' | 'archived';
  readonly photo_updated_at: string | null;
}

export interface CheckinSubscription {
  readonly id: string;
  readonly name_ckb: string;
  readonly name_en: string | null;
  readonly name_ar: string | null;
  readonly kind: 'time' | 'visits' | 'hybrid' | 'unlimited';
  readonly start_date: string;
  readonly end_date: string | null;
  readonly visit_count: number | null;
  readonly visits_left: number | null;
  readonly allowed_days: number[] | null;
  readonly allowed_from: string | null;
  readonly allowed_until: string | null;
  readonly daily_visit_limit: number | null;
  readonly frozen_until: string | null;
}

export interface CheckinAnswer {
  readonly result: CheckinResult;
  readonly reason: CheckinReason | null;
  readonly warnings: CheckinWarning[];
  readonly attendance_id: string | null;
  readonly checked_in_at: string | null;
  /** already: when they came in. */
  readonly previous_at: string | null;
  /** CARD_BLOCKED: a stolen card or a blocked one. */
  readonly card_status: 'stolen' | 'blocked' | null;
  /** Let in although refused: what was passed over. */
  readonly overridden: OverridableReason | null;
  readonly member: CheckinMember | null;
  readonly subscription: CheckinSubscription | null;
  readonly owed_now: number | null;
}

/** Whether staff with checkin.override may let the member in anyway. */
export function canOverride(answer: CheckinAnswer): boolean {
  return (
    answer.result === 'denied' &&
    (OVERRIDABLE_REASONS as readonly string[]).includes(answer.reason ?? '')
  );
}
