import { describe, expect, it } from 'vitest';
import {
  SEARCH_IGNORED,
  SEARCH_LOOK_ALIKES,
  matchesSearch,
  normalizeSearchText,
} from './search.ts';
import { latestFunctionBody } from './sql-functions.test-helper.ts';

describe('normalizeSearchText', () => {
  it('matches Arabic and Kurdish look-alike letters', () => {
    expect(normalizeSearchText('كيلي')).toBe(normalizeSearchText('کیلی'));
    expect(normalizeSearchText('جيمه')).toBe(normalizeSearchText('جیمە'));
  });

  it('matches Kurdish names typed on an Arabic keyboard', () => {
    expect(normalizeSearchText('ريباز')).toBe(normalizeSearchText('ڕێباز'));
    expect(normalizeSearchText('كوران')).toBe(normalizeSearchText('گۆران'));
    expect(normalizeSearchText('بشتيوان')).toBe(normalizeSearchText('پشتیوان'));
    expect(normalizeSearchText('هەفال')).toBe(normalizeSearchText('هەڤاڵ'));
    expect(normalizeSearchText('زيلا')).toBe(normalizeSearchText('ژیلا'));
    expect(normalizeSearchText('جيا')).toBe(normalizeSearchText('چیا'));
  });

  it('matches Eastern Arabic and Latin digits, and any case', () => {
    expect(normalizeSearchText('Gym ٢٠٢٦')).toBe('gym 2026');
    expect(normalizeSearchText('۰۷۵۰')).toBe('0750');
  });

  it('ignores Arabic vowel marks, tatweel and invisible joiners', () => {
    expect(normalizeSearchText('جـيمُ')).toBe(normalizeSearchText('جیم'));
    expect(normalizeSearchText('ون‌بوو')).toBe(normalizeSearchText('ونبوو'));
    expect(normalizeSearchText('‏گۆران‎')).toBe(normalizeSearchText('گۆران'));
  });

  it('keeps single spaces only', () => {
    expect(normalizeSearchText('  ئارام \t  کەریم ')).toBe('ئارام کەریم');
  });
});

describe('the database compares member searches the same way (app.normalize_search_text)', () => {
  const body = latestFunctionBody('app.normalize_search_text');

  it('ignores the same characters', () => {
    expect(body).toContain(`'${SEARCH_IGNORED.source}'`);
  });

  it('makes the same letters and digits one', () => {
    // translate(<text>, '<from letters>', '<to letters>'): the two long quoted strings.
    // Each letter is one code point, so Array.from splits them correctly.
    const translate = /'([^']{20,})',\s*'([^']{20,})'/.exec(body);
    expect(translate).not.toBeNull();
    const from = Array.from(translate?.[1] ?? '');
    const to = Array.from(translate?.[2] ?? '');
    expect(from).toHaveLength(to.length);
    const sqlMap = new Map(from.map((letter, index) => [letter, to[index]]));
    const expected = new Map<string, string>(Object.entries(SEARCH_LOOK_ALIKES));
    for (const [index, digit] of Array.from('٠١٢٣٤٥٦٧٨٩').entries())
      expected.set(digit, String(index));
    for (const [index, digit] of Array.from('۰۱۲۳۴۵۶۷۸۹').entries())
      expected.set(digit, String(index));
    expect(sqlMap).toEqual(expected);
  });

  it('lowers case and keeps single spaces', () => {
    expect(body).toContain('lower(value)');
    expect(body).toContain("'\\s+', ' ', 'g'");
    expect(body).toContain('btrim(');
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
