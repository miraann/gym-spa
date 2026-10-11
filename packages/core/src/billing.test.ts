import { describe, expect, it } from 'vitest';
import {
  GRACE_DAYS,
  billingNotice,
  billingNoticeAudience,
  isBillingNoticeDismissible,
  paidUntilFromDate,
  type BillingNotice,
} from './billing.ts';
import { latestFunctionBody } from './sql-functions.test-helper.ts';

/** A moment in Baghdad time (UTC+3). */
const baghdad = (local: string) => new Date(`${local}+03:00`);

/** Paid through 31 December 2026: until 1 January 00:00 in Baghdad. */
const PAID_UNTIL = '2026-12-31T21:00:00.000Z';

const active = { access: 'active', paidUntil: PAID_UNTIL, suspended: false } as const;

describe('paidUntilFromDate', () => {
  it('is the end of that day in Baghdad', () => {
    expect(paidUntilFromDate('2026-12-31')).toBe(PAID_UNTIL);
    expect(paidUntilFromDate('2027-02-28')).toBe('2027-02-28T21:00:00.000Z');
  });

  it.each(['2026-02-30', '31-12-2026', '2026-13-01', ''])('refuses %j', (date) => {
    expect(() => paidUntilFromDate(date)).toThrow();
  });
});

describe('billingNotice before the end', () => {
  it.each([
    ['2026-11-30T12:00', 'none', null, null],
    ['2026-12-01T23:59', 'none', null, null],
    ['2026-12-02T00:00', 'ending', 30, 30],
    ['2026-12-24T00:00', 'ending', 30, 8],
    ['2026-12-25T00:00', 'ending', 7, 7],
    ['2026-12-30T00:00', 'ending', 7, 2],
    ['2026-12-31T00:00', 'ending', 1, 1],
    ['2026-12-31T23:59', 'ending', 1, 1],
  ] as const)('at %s Baghdad time: %s, stage %s, %s days left', (at, kind, stage, daysLeft) => {
    const notice = billingNotice(active, baghdad(at));
    if (kind === 'none') {
      // 31 or more days left: the first stage begins at 30.
      expect(notice).toEqual({ kind: 'none' });
      return;
    }
    expect(notice).toEqual({
      kind: 'ending',
      stage,
      daysLeft,
      lastPaidAt: '2026-12-31T20:59:59.999Z',
    });
  });

  it('counts Baghdad days, not UTC days', () => {
    // 22:30 UTC on 30 December is already 31 December in Baghdad: the last paid day.
    expect(billingNotice(active, new Date('2026-12-30T22:30:00Z'))).toMatchObject({
      stage: 1,
      daysLeft: 1,
    });
  });

  it('says 1 day when the server still says active but the device clock runs ahead', () => {
    expect(billingNotice(active, baghdad('2027-01-02T10:00'))).toMatchObject({
      kind: 'ending',
      stage: 1,
      daysLeft: 1,
    });
  });

  it('has nothing to say without an end date', () => {
    expect(billingNotice({ ...active, paidUntil: null }, baghdad('2026-12-31T10:00'))).toEqual({
      kind: 'none',
    });
  });
});

describe('billingNotice after the end', () => {
  const grace = { ...active, access: 'grace' } as const;

  it('counts the grace days until the gym becomes read-only', () => {
    expect(billingNotice(grace, baghdad('2027-01-01T08:00'))).toEqual({
      kind: 'grace',
      daysLeft: GRACE_DAYS,
      lastPaidAt: '2026-12-31T20:59:59.999Z',
      readOnlyAt: '2027-01-30T21:00:00.000Z',
    });
    expect(billingNotice(grace, baghdad('2027-01-30T23:00'))).toMatchObject({ daysLeft: 1 });
  });

  it('read-only: suspended by Click Group, or the subscription ran out', () => {
    expect(billingNotice({ ...active, access: 'read_only', suspended: true })).toEqual({
      kind: 'read_only',
      reason: 'suspended',
    });
    expect(billingNotice({ ...active, access: 'read_only' })).toEqual({
      kind: 'read_only',
      reason: 'ended',
    });
  });

  it('a locked gym says nothing here (the app locks)', () => {
    expect(billingNotice({ ...active, access: 'locked' })).toEqual({ kind: 'none' });
  });
});

describe('who sees it, and closing it', () => {
  const ending = (stage: 30 | 7 | 1): BillingNotice => ({
    kind: 'ending',
    stage,
    daysLeft: stage,
    lastPaidAt: PAID_UNTIL,
  });

  it('read-only is for everyone; the dates only for billing.view', () => {
    expect(billingNoticeAudience({ kind: 'read_only', reason: 'ended' })).toBe('everyone');
    expect(billingNoticeAudience(ending(30))).toBe('billing');
    expect(
      billingNoticeAudience({ kind: 'grace', daysLeft: 3, lastPaidAt: '', readOnlyAt: '' }),
    ).toBe('billing');
    expect(billingNoticeAudience({ kind: 'none' })).toBeNull();
  });

  it('only the 30- and 7-day warnings can be closed', () => {
    expect(isBillingNoticeDismissible(ending(30))).toBe(true);
    expect(isBillingNoticeDismissible(ending(7))).toBe(true);
    expect(isBillingNoticeDismissible(ending(1))).toBe(false);
    expect(
      isBillingNoticeDismissible({ kind: 'grace', daysLeft: 3, lastPaidAt: '', readOnlyAt: '' }),
    ).toBe(false);
    expect(isBillingNoticeDismissible({ kind: 'read_only', reason: 'ended' })).toBe(false);
  });
});

describe('the same grace period as app.gym_access()', () => {
  it('uses 30 days', () => {
    const body = latestFunctionBody('app.gym_access');
    expect(/paid_until \+ interval '(\d+) days'/.exec(body)?.[1]).toBe(String(GRACE_DAYS));
  });
});
