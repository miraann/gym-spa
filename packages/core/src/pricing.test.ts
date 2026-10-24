import { describe, expect, it } from 'vitest';
import {
  DISCOUNT_PERMISSIONS,
  installmentProblem,
  isDiscountAllowed,
  isValidUsdAmount,
  maxDiscountPercent,
  splitInstallments,
  usdToIqd,
} from './pricing.ts';
import { databaseTestSql, latestFunctionBody } from './sql-functions.test-helper.ts';

/** The rows of `insert into <table> (...) values` in supabase/tests/330-selling.test.sql. */
function sharedCases(table: string): string[][] {
  const sql = databaseTestSql('330-selling.test.sql');
  const block = new RegExp(`insert into ${table} \\([^)]*\\) values\\n([\\s\\S]*?);\\n`).exec(sql);
  const lines = block?.[1]?.split('\n').filter((line) => line.trim() !== '') ?? [];
  return lines.map((line) => {
    const match = /^\s*\(([^)]*)\),?$/.exec(line);
    if (!match) throw new Error(`Unreadable case: ${line}`);
    return (match[1] ?? '').split(',').map((value) => value.trim());
  });
}

describe('usdToIqd', () => {
  const cases = sharedCases('usd_cases').map(([amount, rate, expected]) => ({
    amount: Number(amount),
    rate: Number(rate),
    expected: Number(expected),
  }));

  it('has the database test cases', () => {
    expect(cases.length).toBeGreaterThan(5);
  });

  it.each(cases)('$amount dollars at $rate are $expected dinars', ({ amount, rate, expected }) => {
    expect(usdToIqd(amount, rate)).toBe(expected);
  });

  it('is the rule of the database (app.usd_to_iqd)', () => {
    expect(latestFunctionBody('app.usd_to_iqd')).toContain('round(p_amount * p_rate)');
  });
});

describe('isDiscountAllowed', () => {
  const cases = sharedCases('discount_cases').map(([price, discount, maxPercent, expected]) => ({
    price: Number(price),
    discount: Number(discount),
    maxPercent: Number(maxPercent),
    expected: expected === 'true',
  }));

  it('has the database test cases', () => {
    expect(cases.length).toBeGreaterThan(5);
  });

  it.each(cases)(
    '$discount off $price at most $maxPercent%: $expected',
    ({ price, discount, maxPercent, expected }) => {
      expect(isDiscountAllowed(price, discount, maxPercent)).toBe(expected);
    },
  );
});

describe('maxDiscountPercent', () => {
  it('is the highest discount permission', () => {
    expect(maxDiscountPercent(new Set(['discount.apply.max_10', 'discount.apply.max_25']))).toBe(
      25,
    );
    expect(maxDiscountPercent(new Set(['discount.apply.any']))).toBe(100);
    expect(maxDiscountPercent(new Set(['payments.view']))).toBe(0);
  });

  it("has the database's permissions and shares (app.max_discount_percent)", () => {
    const body = latestFunctionBody('app.max_discount_percent');
    for (const [key, percent] of DISCOUNT_PERMISSIONS) {
      expect(body).toContain(`when app.has_permission('${key}') then ${String(percent)}`);
    }
  });
});

describe('isValidUsdAmount', () => {
  it('accepts cents', () => {
    expect(isValidUsdAmount(12.35)).toBe(true);
    expect(isValidUsdAmount(1310)).toBe(true);
  });

  it('refuses fractions of a cent, nothing and negatives', () => {
    expect(isValidUsdAmount(10.005)).toBe(false);
    expect(isValidUsdAmount(0)).toBe(false);
    expect(isValidUsdAmount(-1)).toBe(false);
    expect(isValidUsdAmount(Number.NaN)).toBe(false);
  });
});

describe('splitInstallments', () => {
  it('splits into whole dinars, the first ones taking the rest', () => {
    expect(splitInstallments(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(splitInstallments(21_500, 2)).toEqual([10_750, 10_750]);
    expect(splitInstallments(5, 2)).toEqual([3, 2]);
  });

  it('gives nothing when there is too little to split', () => {
    expect(splitInstallments(1, 2)).toEqual([]);
    expect(splitInstallments(100, 0)).toEqual([]);
  });
});

describe('installmentProblem', () => {
  const today = '2026-10-24';

  it('accepts dates from today on, in order, adding up to what is left', () => {
    expect(
      installmentProblem(
        [
          { dueDate: '2026-10-24', amount: 10_000 },
          { dueDate: '2026-11-24', amount: 11_500 },
        ],
        21_500,
        today,
      ),
    ).toBeNull();
    expect(installmentProblem([], 21_500, today)).toBeNull();
  });

  it('says what is wrong', () => {
    expect(installmentProblem([{ dueDate: '2026-11-24', amount: 0 }], 0, today)).toBe('amount');
    expect(installmentProblem([{ dueDate: '2026-11-24', amount: 10.5 }], 10.5, today)).toBe(
      'amount',
    );
    expect(installmentProblem([{ dueDate: '2026-10-23', amount: 100 }], 100, today)).toBe('date');
    expect(
      installmentProblem(
        [
          { dueDate: '2026-11-24', amount: 50 },
          { dueDate: '2026-11-24', amount: 50 },
        ],
        100,
        today,
      ),
    ).toBe('order');
    expect(installmentProblem([{ dueDate: '2026-11-24', amount: 90 }], 100, today)).toBe('sum');
  });
});
