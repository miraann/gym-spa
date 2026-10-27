import { describe, expect, it } from 'vitest';
import { parseDecimal, parseWholeNumber, toLatinDigits } from './digits.ts';

describe('toLatinDigits', () => {
  it('reads Arabic-Indic and Extended Arabic-Indic digits', () => {
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789 0123456789');
  });
});

describe('parseWholeNumber', () => {
  it.each([
    ['25000', 25_000],
    ['25,000', 25_000],
    ['25 000', 25_000],
    ['٢٥٬٠٠٠', 25_000],
    ['۲۵۰۰۰', 25_000],
    [' 0 ', 0],
    ['1,000,000', 1_000_000],
  ])('reads "%s" as %d', (input, value) => {
    expect(parseWholeNumber(input)).toBe(value);
  });

  it.each(['', ' ', '25.5', '-5', '+5', '25k', 'abc', '1234567890123456'])(
    'refuses "%s"',
    (input) => {
      expect(parseWholeNumber(input)).toBeNull();
    },
  );
});

describe('parseDecimal', () => {
  it.each([
    ['1310', 1310],
    ['1,310.5', 1310.5],
    ['١٣١٠٫٥', 1310.5],
    ['12.35', 12.35],
    ['0.01', 0.01],
  ])('reads "%s" as %d', (input, value) => {
    expect(parseDecimal(input)).toBe(value);
  });

  it.each(['', '.5', '1.', '1.234', '-1', '1e3', 'abc'])('refuses "%s"', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});
