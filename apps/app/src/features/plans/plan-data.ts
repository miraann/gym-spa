import {
  DURATION_UNITS,
  PLAN_GENDERS,
  PLAN_KINDS,
  WEEK_ORDER,
  type DurationUnit,
  type PlanGender,
  type PlanKind,
  type Weekday,
} from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The plans screen's server calls (step 3b): every plan of the gym (everyone sees them, they are
// needed to sell), and adding or changing one with save_plan (plans.manage, with access to every
// branch the plan works in).

export const PLANS_QUERY = 'plans';

export interface Plan extends LocalizedNames {
  readonly id: string;
  readonly kind: PlanKind;
  readonly durationUnit: DurationUnit | null;
  readonly durationCount: number | null;
  readonly visitCount: number | null;
  /** Whole dinars. */
  readonly price: number;
  readonly gender: PlanGender;
  /** null: every branch. */
  readonly branchIds: readonly string[] | null;
  /** ISO days (1 Monday … 7 Sunday); null: every day. */
  readonly allowedDays: readonly Weekday[] | null;
  /** HH:MM, Baghdad time; both null: all day. */
  readonly allowedFrom: string | null;
  readonly allowedUntil: string | null;
  readonly dailyVisitLimit: number | null;
  readonly maxFreezeDays: number;
  readonly isActive: boolean;
}

/** The plan as the form edits it (and save_plan takes it). */
export type PlanDraft = Omit<Plan, 'id'>;

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return values.find((each) => each === value) ?? fallback;
}

/** Postgres gives a time as HH:MM:SS. */
function toMinutes(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5);
}

/** On sale first, then cheapest first. */
function byShelf(a: Plan, b: Plan): number {
  return Number(b.isActive) - Number(a.isActive) || a.price - b.price;
}

export function usePlans() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [PLANS_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await requireClient(client)
        .from('plans')
        .select(
          'id, name_ckb, name_en, name_ar, kind, duration_unit, duration_count, visit_count, price, gender, all_branches, allowed_days, allowed_from, allowed_until, daily_visit_limit, max_freeze_days, is_active, plan_branches (branch_id)',
        );
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          nameCkb: row.name_ckb,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          kind: oneOf(PLAN_KINDS, row.kind, 'time'),
          durationUnit:
            row.duration_unit === null ? null : oneOf(DURATION_UNITS, row.duration_unit, 'month'),
          durationCount: row.duration_count,
          visitCount: row.visit_count,
          price: row.price,
          gender: oneOf(PLAN_GENDERS, row.gender, 'any'),
          branchIds: row.all_branches ? null : row.plan_branches.map((each) => each.branch_id),
          allowedDays:
            row.allowed_days === null
              ? null
              : WEEK_ORDER.filter((day) => row.allowed_days?.includes(day)).sort((a, b) => a - b),
          allowedFrom: toMinutes(row.allowed_from),
          allowedUntil: toMinutes(row.allowed_until),
          dailyVisitLimit: row.daily_visit_limit,
          maxFreezeDays: row.max_freeze_days,
          isActive: row.is_active,
        }))
        .sort(byShelf);
    },
  });
}

/** Adds a plan (its id made here) or changes one; the answer is its id. */
export function useSavePlan() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, plan }: { planId: string | null; plan: PlanDraft }) => {
      const id = planId ?? crypto.randomUUID();
      // Empty values are left out: the function's defaults are none (and every branch, every day).
      const { error } = await requireClient(client).rpc('save_plan', {
        p_id: id,
        p_name_ckb: plan.nameCkb,
        p_kind: plan.kind,
        p_price: plan.price,
        p_gender: plan.gender,
        p_max_freeze_days: plan.maxFreezeDays,
        p_is_active: plan.isActive,
        ...(plan.nameEn ? { p_name_en: plan.nameEn } : {}),
        ...(plan.nameAr ? { p_name_ar: plan.nameAr } : {}),
        ...(plan.durationUnit === null ? {} : { p_duration_unit: plan.durationUnit }),
        ...(plan.durationCount === null ? {} : { p_duration_count: plan.durationCount }),
        ...(plan.visitCount === null ? {} : { p_visit_count: plan.visitCount }),
        ...(plan.branchIds === null ? {} : { p_branch_ids: [...plan.branchIds] }),
        ...(plan.allowedDays === null ? {} : { p_allowed_days: [...plan.allowedDays] }),
        ...(plan.allowedFrom === null ? {} : { p_allowed_from: plan.allowedFrom }),
        ...(plan.allowedUntil === null ? {} : { p_allowed_until: plan.allowedUntil }),
        ...(plan.dailyVisitLimit === null ? {} : { p_daily_visit_limit: plan.dailyVisitLimit }),
      });
      if (error) throw error;
      return id;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [PLANS_QUERY] }),
  });
}
