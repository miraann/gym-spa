import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearchText } from './search.ts';

describe('normalizeSearchText', () => {
  it('matches Arabic and Kurdish look-alike letters', () => {
    expect(normalizeSearchText('كيلي')).toBe(normalizeSearchText('کیلی'));
    expect(normalizeSearchText('جيمه')).toBe(normalizeSearchText('جیمە'));
  });

  it('matches Eastern Arabic and Latin digits, and any case', () => {
    expect(normalizeSearchText('Gym ٢٠٢٦')).toBe('gym 2026');
  });

  it('ignores Arabic vowel marks and tatweel', () => {
    expect(normalizeSearchText('جـيمُ')).toBe(normalizeSearchText('جیم'));
  });
});

describe('matchesSearch', () => {
  it('finds a text containing the query', () => {
    expect(matchesSearch('هەولێر', 'جیمی هەولێر', null)).toBe(true);
    expect(matchesSearch('HAWLER', 'hawler-fit')).toBe(true);
    expect(matchesSearch('سلێمانی', 'جیمی هەولێر')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesSearch('  ', 'anything')).toBe(true);
  });
});
