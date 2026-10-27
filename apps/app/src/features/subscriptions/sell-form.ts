import {
  PAYMENT_METHODS,
  addMonths,
  daysBetween,
  isDiscountAllowed,
  isValidUsdAmount,
  parseDecimal,
  parseWholeNumber,
  planEndDate,
  splitInstallments,
  usdPayment,
  type PaymentMethod,
} from '@gym/core';
import { z } from 'zod';
import type { Plan } from '@/features/plans/plan-data';

// The sell form (step 3d): one function, saleDraft(), works out the sale from what is typed, for
// the summary on screen and for the form's checks alike, with the database's rules (packages/core
// keeps them equal). The database checks everything again. Messages are keys of
// subscriptions:sell.errors.

export const START_CHOICES = ['today', 'after', 'other'] as const;
export type StartChoice = (typeof START_CHOICES)[number];
export const PAY_CHOICES = ['full', 'part', 'later'] as const;
export type PayChoice = (typeof PAY_CHOICES)[number];
export const CURRENCIES = ['IQD', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];
/** Installments: from 2 to 12, one a month. */
export const INSTALLMENT_COUNT = [2, 12] as const;

export interface SellFormValues {
  planId: string;
  start: StartChoice;
  /** YYYY-MM-DD, for start = other. */
  startDate: string;
  discount: string;
  discountReason: string;
  pay: PayChoice;
  /** Dinars, for pay = part. */
  amount: string;
  currency: Currency;
  usdAmount: string;
  rate: string;
  method: PaymentMethod;
  reference: string;
  split: boolean;
  installmentCount: string;
  /** YYYY-MM-DD: the first installment; the others a month apart. */
  firstDue: string;
}

export interface SellContext {
  readonly plans: readonly Plan[];
  /** Baghdad's date. */
  readonly today: string;
  /** The day after the member's current subscription ends, if they have one. */
  readonly renewalStart: string | null;
  readonly maxDiscountPercent: number;
  /** payments.create: without it everything is sold on credit. */
  readonly canPay: boolean;
}

export type SellProblem =
  | 'plan'
  | 'startDate'
  | 'discount'
  | 'discountTooLarge'
  | 'discountReason'
  | 'amount'
  | 'usdAmount'
  | 'usdNotEnough'
  | 'rate'
  | 'installmentCount'
  | 'installments';

export interface SaleDraft {
  readonly plan: Plan | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly discount: number;
  readonly total: number;
  /** What the payment counts for, in dinars (0 without one). */
  readonly paidNow: number;
  /** Dollars: their value and the change given back in dinars. */
  readonly usd: { readonly value: number; readonly change: number } | null;
  readonly remaining: number;
  readonly installments: readonly { readonly dueDate: string; readonly amount: number }[];
  /** The first problem of each field. */
  readonly problems: Partial<Record<keyof SellFormValues, SellProblem>>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a YYYY-MM-DD string is a real date. */
function isDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function saleDraft(values: SellFormValues, context: SellContext): SaleDraft {
  const problems: Partial<Record<keyof SellFormValues, SellProblem>> = {};
  const plan = context.plans.find((each) => each.id === values.planId && each.isActive) ?? null;
  if (plan === null) problems.planId = 'plan';

  const startDate =
    values.start === 'today'
      ? context.today
      : values.start === 'after'
        ? context.renewalStart
        : isDate(values.startDate)
          ? values.startDate
          : null;
  // The database's window: from 30 days ago to a year ahead.
  if (
    startDate === null ||
    daysBetween(context.today, startDate) < -30 ||
    daysBetween(context.today, startDate) > 365
  ) {
    problems.startDate = 'startDate';
  }
  const endDate =
    plan?.durationUnit && plan.durationCount !== null && startDate !== null
      ? planEndDate(startDate, plan.durationUnit, plan.durationCount)
      : null;

  const price = plan?.price ?? 0;
  const typedDiscount = values.discount.trim() === '' ? 0 : parseWholeNumber(values.discount);
  let discount = 0;
  if (typedDiscount === null || !isDiscountAllowed(price, typedDiscount, 100)) {
    problems.discount = 'discount';
  } else if (!isDiscountAllowed(price, typedDiscount, context.maxDiscountPercent)) {
    problems.discount = 'discountTooLarge';
  } else {
    discount = typedDiscount;
    if (discount > 0 && values.discountReason.trim() === '') {
      problems.discountReason = 'discountReason';
    }
  }
  const total = price - discount;

  let paidNow = 0;
  let usd: SaleDraft['usd'] = null;
  if (context.canPay && total > 0 && values.pay !== 'later') {
    if (values.currency === 'USD') {
      const amount = parseDecimal(values.usdAmount);
      const rate = parseDecimal(values.rate);
      if (amount === null || !isValidUsdAmount(amount)) problems.usdAmount = 'usdAmount';
      if (rate === null || !isValidUsdAmount(rate)) problems.rate = 'rate';
      if (amount !== null && rate !== null && isValidUsdAmount(amount) && isValidUsdAmount(rate)) {
        const payment = usdPayment(amount, rate, total);
        usd = { value: payment.value, change: payment.change };
        paidNow = payment.counts;
        if (values.pay === 'full' && payment.counts < total) problems.usdAmount = 'usdNotEnough';
      }
    } else if (values.pay === 'full') {
      paidNow = total;
    } else {
      const amount = parseWholeNumber(values.amount);
      if (amount === null || amount <= 0 || amount > total) problems.amount = 'amount';
      else paidNow = amount;
    }
  }
  const remaining = total - paidNow;

  let installments: SaleDraft['installments'] = [];
  if (remaining > 0 && values.split) {
    const count = parseWholeNumber(values.installmentCount);
    const [min, max] = INSTALLMENT_COUNT;
    if (count === null || count < min || count > max) {
      problems.installmentCount = 'installmentCount';
    } else if (!isDate(values.firstDue) || values.firstDue < context.today) {
      problems.firstDue = 'installments';
    } else {
      const amounts = splitInstallments(remaining, count);
      if (amounts.length === 0) problems.installmentCount = 'installments';
      installments = amounts.map((amount, index) => ({
        dueDate: addMonths(values.firstDue, index),
        amount,
      }));
    }
  }

  return {
    plan,
    startDate,
    endDate,
    discount,
    total,
    paidNow,
    usd,
    remaining,
    installments,
    problems,
  };
}

/** The form's checks: saleDraft()'s problems. */
export function sellFormSchema(context: SellContext) {
  return z
    .object({
      planId: z.string(),
      start: z.enum(START_CHOICES),
      startDate: z.string(),
      discount: z.string(),
      discountReason: z.string(),
      pay: z.enum(PAY_CHOICES),
      amount: z.string(),
      currency: z.enum(CURRENCIES),
      usdAmount: z.string(),
      rate: z.string(),
      method: z.enum(PAYMENT_METHODS),
      reference: z.string(),
      split: z.boolean(),
      installmentCount: z.string(),
      firstDue: z.string(),
    })
    .superRefine((values, issues) => {
      const { problems } = saleDraft(values, context);
      for (const [path, message] of Object.entries(problems)) {
        issues.addIssue({ code: 'custom', path: [path], message });
      }
    });
}

/** A new sale's form: today, no discount, paid in full in cash (or on credit without payments.create). */
export function emptySellForm(context: SellContext, planId: string | null): SellFormValues {
  return {
    planId: planId ?? '',
    start: context.renewalStart ? 'after' : 'today',
    startDate: context.today,
    discount: '',
    discountReason: '',
    pay: context.canPay ? 'full' : 'later',
    amount: '',
    currency: 'IQD',
    usdAmount: '',
    rate: '',
    method: 'cash',
    reference: '',
    split: false,
    installmentCount: '2',
    firstDue: addMonths(context.today, 1),
  };
}
