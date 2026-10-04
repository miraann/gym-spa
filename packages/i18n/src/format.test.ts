import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatTime,
  localizeDigits,
} from './format';

// Sunday 4 October 2026, 14:30 in Baghdad (UTC+3).
const AFTERNOON = new Date('2026-10-04T11:30:00Z');
// 22:30 UTC is already 01:30 on Monday 5 October in Baghdad.
const AFTER_MIDNIGHT = new Date('2026-10-04T22:30:00Z');

const ckb = { language: 'ckb', digits: 'latn' } as const;
const ckbArab = { language: 'ckb', digits: 'arab' } as const;
const en = { language: 'en', digits: 'latn' } as const;
const ar = { language: 'ar', digits: 'latn' } as const;

describe('localizeDigits', () => {
  it('keeps Western digits by default', () => {
    expect(localizeDigits('B1-D03-000457', 'latn')).toBe('B1-D03-000457');
  });

  it('converts to Eastern Arabic digits', () => {
    expect(localizeDigits('0123456789', 'arab')).toBe('٠١٢٣٤٥٦٧٨٩');
  });
});

describe('formatNumber', () => {
  it('groups thousands with Western digits', () => {
    expect(formatNumber(1234567, ckb)).toBe('1,234,567');
  });

  it('uses Arabic separators with Eastern Arabic digits', () => {
    expect(formatNumber(1234567, ckbArab)).toBe('١٬٢٣٤٬٥٦٧');
  });

  it('respects fixed fraction digits', () => {
    expect(formatNumber(70.5, { ...en, fractionDigits: 1 })).toBe('70.5');
    expect(formatNumber(70, { ...en, fractionDigits: 1 })).toBe('70.0');
  });
});

describe('formatMoney', () => {
  it('formats IQD without decimals, Kurdish symbol after the amount', () => {
    expect(formatMoney(25000, 'IQD', ckb)).toBe('25,000 د.ع');
    expect(formatMoney(25000, 'IQD', ar)).toBe('25,000 د.ع');
    expect(formatMoney(25000, 'IQD', en)).toBe('25,000 IQD');
  });

  it('rounds IQD to whole dinars', () => {
    expect(formatMoney(24999.6, 'IQD', ckb)).toBe('25,000 د.ع');
  });

  it('formats IQD with Eastern Arabic digits', () => {
    expect(formatMoney(25000, 'IQD', ckbArab)).toBe('٢٥٬٠٠٠ د.ع');
  });

  it('formats USD with 2 decimals', () => {
    expect(formatMoney(12.5, 'USD', en)).toBe('$12.50');
    expect(formatMoney(12.5, 'USD', ckb)).toBe('12.50 $');
  });
});

describe('formatDate', () => {
  it('uses Sorani month names with the izafe suffix', () => {
    expect(formatDate(AFTERNOON, ckb)).toBe('4ی تشرینی یەکەمی 2026');
  });

  it('uses Eastern Arabic digits when selected', () => {
    expect(formatDate(AFTERNOON, ckbArab)).toBe('٤ی تشرینی یەکەمی ٢٠٢٦');
  });

  it('formats English and Arabic long dates', () => {
    expect(formatDate(AFTERNOON, en)).toBe('4 October 2026');
    expect(formatDate(AFTERNOON, ar)).toBe('4 تشرين الأول 2026');
  });

  it('formats short dates as day/month/year', () => {
    expect(formatDate(AFTERNOON, { ...ckb, style: 'short' })).toBe('04/10/2026');
    expect(formatDate(AFTERNOON, { ...ckbArab, style: 'short' })).toBe('٠٤/١٠/٢٠٢٦');
  });

  it('adds the weekday in the full style', () => {
    expect(formatDate(AFTERNOON, { ...ckb, style: 'full' })).toBe(
      'یەکشەممە، 4ی تشرینی یەکەمی 2026',
    );
    expect(formatDate(AFTERNOON, { ...en, style: 'full' })).toBe('Sunday, 4 October 2026');
    expect(formatDate(AFTERNOON, { ...ar, style: 'full' })).toBe('الأحد، 4 تشرين الأول 2026');
  });

  it('uses the Baghdad calendar day, not the UTC day', () => {
    expect(formatDate(AFTER_MIDNIGHT, { ...ckb, style: 'full' })).toBe(
      'دووشەممە، 5ی تشرینی یەکەمی 2026',
    );
  });

  it('accepts ISO strings and timestamps', () => {
    expect(formatDate('2026-01-15T09:00:00Z', ckb)).toBe('15ی کانوونی دووەمی 2026');
    expect(formatDate(AFTERNOON.getTime(), en)).toBe('4 October 2026');
  });

  it('throws on invalid dates instead of showing garbage', () => {
    expect(() => formatDate('not a date', ckb)).toThrow(RangeError);
  });
});

describe('formatTime', () => {
  it('uses a 12-hour clock with the language’s AM/PM words', () => {
    expect(formatTime(AFTERNOON, ckb)).toBe('2:30 د.ن');
    expect(formatTime(AFTERNOON, en)).toBe('2:30 PM');
    expect(formatTime(AFTERNOON, ar)).toBe('2:30 م');
  });

  it('shows Baghdad time after midnight as AM', () => {
    expect(formatTime(AFTER_MIDNIGHT, ckb)).toBe('1:30 پ.ن');
  });

  it('shows noon and midnight as 12', () => {
    expect(formatTime(new Date('2026-10-04T09:00:00Z'), en)).toBe('12:00 PM');
    expect(formatTime(new Date('2026-10-04T21:00:00Z'), en)).toBe('12:00 AM');
  });
});

describe('formatDateTime', () => {
  it('joins date and time per language', () => {
    expect(formatDateTime(AFTERNOON, ckb)).toBe('4ی تشرینی یەکەمی 2026، 2:30 د.ن');
    expect(formatDateTime(AFTERNOON, { ...en, style: 'short' })).toBe('04/10/2026, 2:30 PM');
    expect(formatDateTime(AFTERNOON, ckbArab)).toBe('٤ی تشرینی یەکەمی ٢٠٢٦، ٢:٣٠ د.ن');
  });
});
