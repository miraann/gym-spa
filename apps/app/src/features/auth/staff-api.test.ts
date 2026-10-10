import { describe, expect, it } from 'vitest';
import { AuthFlowError, parsePinCheck, parseServerGym } from './staff-api';

describe('parsePinCheck', () => {
  it.each(['ok', 'locked_out', 'no_pin', 'no_branch_access', 'inactive', 'gym_locked'] as const)(
    'reads %s',
    (result) => {
      expect(parsePinCheck({ result })).toEqual({ result });
    },
  );

  it('reads the tries left after a wrong PIN', () => {
    expect(parsePinCheck({ result: 'wrong_pin', tries_left: 3 })).toEqual({
      result: 'wrong_pin',
      triesLeft: 3,
    });
  });

  it.each([null, 'ok', {}, { result: 'maybe' }, { result: 'wrong_pin' }])(
    'refuses an answer it does not know: %j',
    (data) => {
      expect(() => parsePinCheck(data)).toThrow(AuthFlowError);
    },
  );
});

describe('parseServerGym', () => {
  const row = {
    id: 'a0000000-0000-4000-8000-000000000001',
    code: 'demo',
    name_ckb: 'جیمی نموونە',
    name_en: 'Demo Gym',
    name_ar: null,
    edition: 'online',
    access: 'grace',
    paid_until: '2026-10-01T00:00:00+00:00',
  };

  it('reads the gym and its state', () => {
    expect(parseServerGym(row)).toEqual({
      id: row.id,
      code: 'demo',
      nameCkb: 'جیمی نموونە',
      nameEn: 'Demo Gym',
      nameAr: null,
      access: 'grace',
    });
  });

  it('is empty for staff without a gym (not active)', () => {
    expect(parseServerGym(null)).toBeNull();
  });

  it.each([
    { ...row, access: 'suspended' },
    { ...row, code: 'Not A Code' },
    { ...row, name_ckb: null },
  ])('refuses an answer it does not know: %j', (data) => {
    expect(() => parseServerGym(data)).toThrow(AuthFlowError);
  });
});
