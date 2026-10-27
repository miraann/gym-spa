import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_STATUSES,
  addMonths,
  daysBetween,
  nextDay,
  renewalStart,
  subscriptionState,
  type SubscriptionDates,
} from './subscriptions.ts';
import { migrationsSql } from './sql-functions.test-helper.ts';

const today = '2026-10-24';

function sold(
  startDate: string,
  endDate: string | null,
  status: SubscriptionDates['status'] = 'active',
) {
  return { status, startDate, endDate };
}

describe('subscriptionState', () => {
  it('is current from its first day through its last', () => {
    expect(subscriptionState(sold('2026-10-24', '2026-11-23'), today)).toBe('current');
    expect(subscriptionState(sold('2026-09-25', '2026-10-24'), today)).toBe('current');
  });

  it('is upcoming before it starts and expired after its last day', () => {
    expect(subscriptionState(sold('2026-10-25', '2026-11-24'), today)).toBe('upcoming');
    expect(subscriptionState(sold('2026-09-24', '2026-10-23'), today)).toBe('expired');
  });

  it('never expires by date without an end date', () => {
    expect(subscriptionState(sold('2025-01-01', null), today)).toBe('current');
  });

  it('is what was done to it, whatever the dates', () => {
    expect(subscriptionState(sold('2026-10-24', '2026-11-23', 'cancelled'), today)).toBe(
      'cancelled',
    );
    expect(subscriptionState(sold('2026-10-24', '2026-11-23', 'voided'), today)).toBe('voided');
  });

  it("has the database's statuses", () => {
    const sql =
      migrationsSql().find((each) => each.includes('create table public.subscriptions (')) ?? '';
    expect(sql).toContain(
      `status in (${SUBSCRIPTION_STATUSES.map((status) => `'${status}'`).join(', ')})`,
    );
  });
});

describe('days', () => {
  it('counts days across months and years', () => {
    expect(daysBetween('2026-10-24', '2026-10-24')).toBe(0);
    expect(daysBetween('2026-10-24', '2026-11-23')).toBe(30);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-10-24', '2026-10-20')).toBe(-4);
  });

  it('gives the next day', () => {
    expect(nextDay('2026-10-24')).toBe('2026-10-25');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });
});

describe('addMonths', () => {
  it("keeps the day, or takes the month's last one", () => {
    expect(addMonths('2026-10-24', 1)).toBe('2026-11-24');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-10-24', 0)).toBe('2026-10-24');
  });
});

describe('renewalStart', () => {
  it('is the day after the last current or upcoming end', () => {
    expect(
      renewalStart([sold('2026-10-01', '2026-10-31'), sold('2026-11-01', '2026-11-30')], today),
    ).toBe('2026-12-01');
  });

  it('is none when nothing runs past today', () => {
    expect(renewalStart([sold('2026-09-01', '2026-09-30')], today)).toBeNull();
    expect(renewalStart([sold('2026-10-01', null)], today)).toBeNull();
    expect(renewalStart([sold('2026-10-01', '2026-12-31', 'cancelled')], today)).toBeNull();
    expect(renewalStart([], today)).toBeNull();
  });

  it('counts a subscription ending today', () => {
    expect(renewalStart([sold('2026-09-25', '2026-10-24')], today)).toBe('2026-10-25');
  });
});
