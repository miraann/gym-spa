import { describe, expect, it } from 'vitest';
import {
  DURATION_UNITS,
  PLAN_GENDERS,
  PLAN_KINDS,
  PLAN_LIMITS,
  WEEK_ORDER,
  isValidPlanPrice,
  normalizeWeekdays,
  planEndDate,
  planHasDuration,
  planHasVisits,
  type DurationUnit,
} from './plans.ts';
import { databaseTestSql, migrationsSql } from './sql-functions.test-helper.ts';

const plansSql = () =>
  migrationsSql().find((sql) => sql.includes('create table public.plans (')) ?? '';

/** The SQL list of a check like `kind in ('time', 'visits')`. */
function sqlList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * The end date cases of supabase/tests/320-plans.test.sql, which runs them through
 * app.plan_end_date(): one per line, as ('start', 'unit', count, 'expected').
 */
function sharedEndDateCases(): { start: string; unit: DurationUnit; count: number; end: string }[] {
  const sql = databaseTestSql('320-plans.test.sql');
  const block =
    /insert into end_date_cases \(start, unit, count, expected\) values\n([\s\S]*?);\n/.exec(sql);
  const lines = block?.[1]?.split('\n').filter((line) => line.trim() !== '') ?? [];
  return lines.map((line) => {
    const match = /^\s*\('([0-9-]{10})', '(month|day)', ([0-9]+), '([0-9-]{10})'\),?$/.exec(line);
    if (!match) throw new Error(`Unreadable end date case: ${line}`);
    return {
      start: match[1] ?? '',
      unit: match[2] === 'day' ? 'day' : 'month',
      count: Number(match[3]),
      end: match[4] ?? '',
    };
  });
}

describe('planEndDate', () => {
  const cases = sharedEndDateCases();

  it('has the database test cases', () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  it.each(cases)('$count $unit from $start ends on $end', ({ start, unit, count, end }) => {
    expect(planEndDate(start, unit, count)).toBe(end);
  });
});

describe('plan kinds', () => {
  it('time and hybrid end on a date; visits and hybrid count visits', () => {
    expect(PLAN_KINDS.filter(planHasDuration)).toEqual(['time', 'hybrid']);
    expect(PLAN_KINDS.filter(planHasVisits)).toEqual(['visits', 'hybrid']);
  });

  it("are the database's", () => {
    const sql = plansSql();
    expect(sql).toContain(`kind in (${sqlList(PLAN_KINDS)})`);
    expect(sql).toContain(`duration_unit in (${sqlList([...DURATION_UNITS].reverse())})`);
    expect(sql).toContain(`gender in (${sqlList(PLAN_GENDERS)})`);
    expect(sql).toContain(`(kind in ('time', 'hybrid')) = (duration_count is not null)`);
    expect(sql).toContain(`(kind in ('visits', 'hybrid')) = (visit_count is not null)`);
  });

  it("have the database's limits", () => {
    const sql = plansSql();
    expect(sql).toContain(`app.is_clean_text(name_ckb, ${String(PLAN_LIMITS.name)})`);
    expect(sql).toContain(`duration_count between 1 and ${String(PLAN_LIMITS.maxMonths)}`);
    expect(sql).toContain(`duration_count between 1 and ${String(PLAN_LIMITS.maxDays)}`);
    expect(sql).toContain(`visit_count between 1 and ${String(PLAN_LIMITS.maxVisits)}`);
    expect(sql).toContain(`price <= ${String(PLAN_LIMITS.maxPrice)}`);
    expect(sql).toContain(`daily_visit_limit between 1 and ${String(PLAN_LIMITS.maxDailyVisits)}`);
    expect(sql).toContain(`max_freeze_days between 0 and ${String(PLAN_LIMITS.maxFreezeDays)}`);
  });
});

describe('normalizeWeekdays', () => {
  it('keeps each day once, in order', () => {
    expect(normalizeWeekdays([5, 1, 3, 1])).toEqual([1, 3, 5]);
  });

  it('is null for every day, and for none', () => {
    expect(normalizeWeekdays([...WEEK_ORDER])).toBeNull();
    expect(normalizeWeekdays([])).toBeNull();
  });

  it("ignores what isn't a day", () => {
    expect(normalizeWeekdays([0, 8, 6])).toEqual([6]);
  });

  it('starts the week on Saturday', () => {
    expect(WEEK_ORDER[0]).toBe(6);
  });
});

describe('isValidPlanPrice', () => {
  it('accepts whole dinars from 0 to the limit', () => {
    expect(isValidPlanPrice(0)).toBe(true);
    expect(isValidPlanPrice(35_000)).toBe(true);
    expect(isValidPlanPrice(PLAN_LIMITS.maxPrice)).toBe(true);
  });

  it('refuses fractions, negatives and too much', () => {
    expect(isValidPlanPrice(1500.5)).toBe(false);
    expect(isValidPlanPrice(-1)).toBe(false);
    expect(isValidPlanPrice(PLAN_LIMITS.maxPrice + 1)).toBe(false);
    expect(isValidPlanPrice(Number.NaN)).toBe(false);
  });
});
