import { describe, expect, it } from 'vitest';
import {
  CHECKIN_REASONS,
  CHECKIN_STEPS,
  CHECKIN_WARNINGS,
  OVERRIDABLE_REASONS,
  canOverride,
  type CheckinAnswer,
} from './checkin.ts';
import { latestFunctionBody, migrationsSql } from './sql-functions.test-helper.ts';

const DENIED: CheckinAnswer = {
  result: 'denied',
  reason: 'PLAN_EXPIRED',
  warnings: [],
  attendance_id: null,
  checked_in_at: null,
  previous_at: null,
  card_status: null,
  overridden: null,
  member: null,
  subscription: null,
  owed_now: null,
};

describe('canOverride', () => {
  it('passes over subscription and money refusals', () => {
    expect(canOverride(DENIED)).toBe(true);
    expect(canOverride({ ...DENIED, reason: 'DEBT' })).toBe(true);
  });

  it.each(['CARD_INVALID', 'CARD_BLOCKED', 'MEMBER_NOT_ACTIVE'] as const)(
    'never passes over %s',
    (reason) => {
      expect(canOverride({ ...DENIED, reason })).toBe(false);
    },
  );

  it('has nothing to pass over when they may come in', () => {
    expect(canOverride({ ...DENIED, result: 'already', reason: 'ALREADY_CHECKED_IN' })).toBe(false);
  });
});

describe('the codes match the database', () => {
  const body = latestFunctionBody('public.check_in');
  const sql = migrationsSql().join('\n');

  it('checks in the same order', () => {
    const steps = latestFunctionBody('app.checkin_steps');
    expect([...steps.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1])).toEqual([
      ...CHECKIN_STEPS,
    ]);
  });

  it('stores the same overridable reasons', () => {
    const allowed = /override_reason in \(([\s\S]*?)\)\),/.exec(sql)?.[1] ?? '';
    const stored = [...allowed.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    expect(stored.sort()).toEqual([...OVERRIDABLE_REASONS].sort());
  });

  it.each(
    CHECKIN_REASONS.filter((reason) => !(CHECKIN_STEPS as readonly string[]).includes(reason)),
  )('answers %s', (reason) => {
    expect(body).toContain(`'${reason}'`);
  });

  it.each(CHECKIN_WARNINGS)('warns %s', (warning) => {
    expect(body).toContain(`'"${warning}"'`);
  });
});
