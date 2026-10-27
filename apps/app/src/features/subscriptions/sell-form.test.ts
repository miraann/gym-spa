import { describe, expect, it } from 'vitest';
import type { Plan } from '@/features/plans/plan-data';
import { emptySellForm, saleDraft, type SellContext, type SellFormValues } from './sell-form';

const monthly: Plan = {
  id: 'monthly',
  nameCkb: 'مانگانە',
  nameEn: null,
  nameAr: null,
  kind: 'time',
  durationUnit: 'month',
  durationCount: 1,
  visitCount: null,
  price: 35_000,
  gender: 'any',
  branchIds: null,
  allowedDays: null,
  allowedFrom: null,
  allowedUntil: null,
  dailyVisitLimit: null,
  maxFreezeDays: 7,
  isActive: true,
};
const visits: Plan = {
  ...monthly,
  id: 'visits',
  kind: 'visits',
  durationUnit: null,
  durationCount: null,
  visitCount: 12,
  price: 30_000,
};

const context: SellContext = {
  plans: [monthly, visits],
  today: '2026-10-24',
  renewalStart: null,
  maxDiscountPercent: 10,
  canPay: true,
};

function draft(values: Partial<SellFormValues>, overrides: Partial<SellContext> = {}) {
  const full = { ...context, ...overrides };
  return saleDraft({ ...emptySellForm(full, 'monthly'), ...values }, full);
}

describe('saleDraft', () => {
  it('sells the plan from today, paid in full in cash', () => {
    expect(draft({})).toMatchObject({
      startDate: '2026-10-24',
      endDate: '2026-11-23',
      total: 35_000,
      paidNow: 35_000,
      remaining: 0,
      problems: {},
    });
  });

  it('needs a plan on sale', () => {
    expect(draft({ planId: '' }).problems.planId).toBe('plan');
    expect(draft({ planId: 'gone' }).problems.planId).toBe('plan');
  });

  it('a plan of visits has no end date', () => {
    expect(draft({ planId: 'visits' })).toMatchObject({ endDate: null, total: 30_000 });
  });

  it('starts after the current subscription when the member renews', () => {
    expect(draft({}, { renewalStart: '2026-11-24' })).toMatchObject({
      startDate: '2026-11-24',
      endDate: '2026-12-23',
    });
  });

  it('starts from 30 days ago to a year ahead', () => {
    expect(draft({ start: 'other', startDate: '2026-09-24' }).problems.startDate).toBeUndefined();
    expect(draft({ start: 'other', startDate: '2026-09-23' }).problems.startDate).toBe('startDate');
    expect(draft({ start: 'other', startDate: '2027-10-25' }).problems.startDate).toBe('startDate');
    expect(draft({ start: 'other', startDate: '2026-02-30' }).problems.startDate).toBe('startDate');
  });

  it('takes a discount within the seller’s share, with a reason', () => {
    expect(draft({ discount: '3,500', discountReason: 'خوێندکار' })).toMatchObject({
      discount: 3_500,
      total: 31_500,
      problems: {},
    });
    expect(draft({ discount: '3500' }).problems.discountReason).toBe('discountReason');
    expect(draft({ discount: '3501' }).problems.discount).toBe('discountTooLarge');
    expect(draft({ discount: '40000' }).problems.discount).toBe('discount');
    expect(draft({ discount: '10.5' }).problems.discount).toBe('discount');
  });

  it('takes part now and leaves the rest owing, in installments if chosen', () => {
    const part = draft({
      pay: 'part',
      amount: '15000',
      split: true,
      installmentCount: '2',
      firstDue: '2026-11-24',
    });
    expect(part).toMatchObject({ paidNow: 15_000, remaining: 20_000, problems: {} });
    expect(part.installments).toEqual([
      { dueDate: '2026-11-24', amount: 10_000 },
      { dueDate: '2026-12-24', amount: 10_000 },
    ]);
    expect(draft({ pay: 'part', amount: '40000' }).problems.amount).toBe('amount');
    expect(draft({ pay: 'part', amount: '0' }).problems.amount).toBe('amount');
  });

  it('refuses installments due before today', () => {
    expect(
      draft({ pay: 'later', split: true, installmentCount: '3', firstDue: '2026-10-23' }).problems
        .firstDue,
    ).toBe('installments');
  });

  it('counts dollars for what is owed and gives the rest back', () => {
    expect(draft({ currency: 'USD', usdAmount: '30', rate: '1310' })).toMatchObject({
      paidNow: 35_000,
      usd: { value: 39_300, change: 4_300 },
      remaining: 0,
      problems: {},
    });
    expect(draft({ currency: 'USD', usdAmount: '20', rate: '1310' }).problems.usdAmount).toBe(
      'usdNotEnough',
    );
    expect(draft({ pay: 'part', currency: 'USD', usdAmount: '20', rate: '1310' })).toMatchObject({
      paidNow: 26_200,
      remaining: 8_800,
      problems: {},
    });
    expect(draft({ currency: 'USD', usdAmount: '20.005', rate: '1310' }).problems.usdAmount).toBe(
      'usdAmount',
    );
    expect(draft({ currency: 'USD', usdAmount: '20', rate: '' }).problems.rate).toBe('rate');
  });

  it('sells on credit without payments.create', () => {
    expect(draft({}, { canPay: false })).toMatchObject({
      paidNow: 0,
      remaining: 35_000,
      problems: {},
    });
    expect(emptySellForm({ ...context, canPay: false }, null).pay).toBe('later');
  });
});
