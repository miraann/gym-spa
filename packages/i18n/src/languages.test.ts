import { describe, expect, it } from 'vitest';
import { localizedName } from './languages';

describe('localizedName', () => {
  const names = { nameCkb: 'لقی سەرەکی', nameEn: 'Main Branch', nameAr: null };

  it('picks the name in the language', () => {
    expect(localizedName(names, 'ckb')).toBe('لقی سەرەکی');
    expect(localizedName(names, 'en')).toBe('Main Branch');
  });

  it('falls back to Kurdish when there is no translation', () => {
    expect(localizedName(names, 'ar')).toBe('لقی سەرەکی');
  });
});
