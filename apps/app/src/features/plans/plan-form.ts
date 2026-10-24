import {
  DURATION_UNITS,
  PLAN_GENDERS,
  PLAN_KINDS,
  PLAN_LIMITS,
  isCleanText,
  isValidPlanPrice,
  normalizeName,
  normalizeWeekdays,
  parseWholeNumber,
  planHasDuration,
  planHasVisits,
} from '@gym/core';
import { z } from 'zod';
import type { Plan, PlanDraft } from './plan-data';

// The plan form's rules, the same as the database's (packages/core keeps them equal). Messages
// are keys of plans:form.errors; those with limits get them from PLAN_FORM_LIMITS.

/** The {{min}} and {{max}} of the messages that have them. */
export const PLAN_FORM_LIMITS = {
  durationCount: { month: [1, PLAN_LIMITS.maxMonths], day: [1, PLAN_LIMITS.maxDays] },
  visitCount: [1, PLAN_LIMITS.maxVisits],
  dailyLimit: [1, PLAN_LIMITS.maxDailyVisits],
  freezeDays: [0, PLAN_LIMITS.maxFreezeDays],
} as const;

const optionalName = z
  .string()
  .transform(normalizeName)
  .refine((value) => value === '' || isCleanText(value, PLAN_LIMITS.name), 'name');

function inRange(value: number | null, [min, max]: readonly [number, number]): boolean {
  return value !== null && value >= min && value <= max;
}

export const planFormSchema = z
  .object({
    nameCkb: z
      .string()
      .transform(normalizeName)
      .refine((value) => isCleanText(value, PLAN_LIMITS.name), 'nameRequired'),
    nameEn: optionalName,
    nameAr: optionalName,
    kind: z.enum(PLAN_KINDS),
    durationCount: z.string(),
    durationUnit: z.enum(DURATION_UNITS),
    visitCount: z.string(),
    price: z.string().refine((value) => {
      const price = parseWholeNumber(value);
      return price !== null && isValidPlanPrice(price);
    }, 'price'),
    gender: z.enum(PLAN_GENDERS),
    allBranches: z.boolean(),
    branchIds: z.array(z.string()),
    allDays: z.boolean(),
    days: z.array(z.number()),
    allDay: z.boolean(),
    from: z.string(),
    until: z.string(),
    dailyLimit: z.string(),
    freezeDays: z.string(),
    isActive: z.boolean(),
  })
  .superRefine((values, context) => {
    const issue = (path: string, message = path) => {
      context.addIssue({ code: 'custom', path: [path], message });
    };
    if (
      planHasDuration(values.kind) &&
      !inRange(
        parseWholeNumber(values.durationCount),
        PLAN_FORM_LIMITS.durationCount[values.durationUnit],
      )
    ) {
      issue('durationCount');
    }
    if (
      planHasVisits(values.kind) &&
      !inRange(parseWholeNumber(values.visitCount), PLAN_FORM_LIMITS.visitCount)
    ) {
      issue('visitCount');
    }
    if (!values.allBranches && values.branchIds.length === 0) issue('branchIds', 'branches');
    if (!values.allDays && values.days.length === 0) issue('days');
    if (
      !values.allDay &&
      !(values.from !== '' && values.until !== '' && values.from < values.until)
    ) {
      issue('until', 'hours');
    }
    if (
      values.dailyLimit.trim() !== '' &&
      !inRange(parseWholeNumber(values.dailyLimit), PLAN_FORM_LIMITS.dailyLimit)
    ) {
      issue('dailyLimit');
    }
    if (
      planHasDuration(values.kind) &&
      !inRange(parseWholeNumber(values.freezeDays), PLAN_FORM_LIMITS.freezeDays)
    ) {
      issue('freezeDays');
    }
  })
  .transform((values): PlanDraft => {
    const hasDuration = planHasDuration(values.kind);
    return {
      nameCkb: values.nameCkb,
      nameEn: values.nameEn || null,
      nameAr: values.nameAr || null,
      kind: values.kind,
      durationUnit: hasDuration ? values.durationUnit : null,
      durationCount: hasDuration ? parseWholeNumber(values.durationCount) : null,
      visitCount: planHasVisits(values.kind) ? parseWholeNumber(values.visitCount) : null,
      price: parseWholeNumber(values.price) ?? 0,
      gender: values.gender,
      branchIds: values.allBranches ? null : values.branchIds,
      allowedDays: values.allDays ? null : normalizeWeekdays(values.days),
      allowedFrom: values.allDay ? null : values.from,
      allowedUntil: values.allDay ? null : values.until,
      dailyVisitLimit: parseWholeNumber(values.dailyLimit),
      // Only a plan with an end date can be frozen.
      maxFreezeDays: hasDuration ? (parseWholeNumber(values.freezeDays) ?? 0) : 0,
      isActive: values.isActive,
    };
  });

export type PlanFormValues = z.input<typeof planFormSchema>;

/** The form for a plan, or an empty one (a monthly plan on sale for everyone, everywhere). */
export function planFormValues(plan: Plan | null): PlanFormValues {
  return {
    nameCkb: plan?.nameCkb ?? '',
    nameEn: plan?.nameEn ?? '',
    nameAr: plan?.nameAr ?? '',
    kind: plan?.kind ?? 'time',
    durationCount: String(plan?.durationCount ?? 1),
    durationUnit: plan?.durationUnit ?? 'month',
    visitCount: plan?.visitCount == null ? '' : String(plan.visitCount),
    price: plan ? String(plan.price) : '',
    gender: plan?.gender ?? 'any',
    allBranches: !plan?.branchIds,
    branchIds: plan?.branchIds ? [...plan.branchIds] : [],
    allDays: !plan?.allowedDays,
    days: plan?.allowedDays ? [...plan.allowedDays] : [],
    allDay: !plan?.allowedFrom,
    from: plan?.allowedFrom ?? '',
    until: plan?.allowedUntil ?? '',
    dailyLimit: plan?.dailyVisitLimit == null ? '' : String(plan.dailyVisitLimit),
    freezeDays: String(plan?.maxFreezeDays ?? 0),
    isActive: plan?.isActive ?? true,
  };
}
