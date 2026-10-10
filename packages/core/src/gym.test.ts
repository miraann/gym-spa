import { describe, expect, it } from 'vitest';
import {
  GYM_ACCESS_STATES,
  GYM_CODE_MAX_LENGTH,
  GYM_CODE_MIN_LENGTH,
  GYM_CODE_PATTERN,
  RESERVED_GYM_CODES,
  gymCodeFromSearch,
  isGymAccess,
  isReservedGymCode,
  isValidGymCode,
  normalizeGymCode,
} from './gym';
import { latestFunctionBody } from './sql-functions.test-helper';

describe('normalizeGymCode', () => {
  it('trims and lowercases', () => {
    expect(normalizeGymCode('  Hawler-Fit ')).toBe('hawler-fit');
  });

  it('turns digits typed on a Kurdish or Arabic keyboard into 0-9', () => {
    expect(normalizeGymCode('gym٢٠٢٦')).toBe('gym2026');
    expect(normalizeGymCode('gym۲۰۲۶')).toBe('gym2026');
  });
});

describe('isValidGymCode', () => {
  it.each(['abc', 'demo', 'hawler-fit', 'gym-a', 'slemani2', 'a1-b2-c3', 'a'.repeat(20)])(
    'accepts %s',
    (code) => {
      expect(isValidGymCode(code)).toBe(true);
    },
  );

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(21)],
    ['starts with a digit', '1gym'],
    ['starts with a hyphen', '-gym'],
    ['ends with a hyphen', 'gym-'],
    ['two hyphens in a row', 'gym--a'],
    ['an underscore', 'gym_a'],
    ['a space', 'gym a'],
    ['uppercase', 'Gym'],
    ['Kurdish letters', 'یانە'],
    ['empty', ''],
    ['reserved', 'seller'],
  ])('rejects %s', (_reason, code) => {
    expect(isValidGymCode(code)).toBe(false);
  });

  it('refuses every reserved code', () => {
    for (const code of RESERVED_GYM_CODES) {
      expect(isReservedGymCode(code)).toBe(true);
      expect(isValidGymCode(code)).toBe(false);
    }
  });
});

describe('the same rules as the database', () => {
  it('reserves exactly the codes app.is_reserved_gym_code() reserves', () => {
    const body = latestFunctionBody('app.is_reserved_gym_code');
    const list = /array\[([^\]]+)\]/.exec(body)?.[1] ?? '';
    const databaseCodes = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);

    expect(databaseCodes.length).toBeGreaterThan(0);
    expect([...databaseCodes].sort()).toEqual([...RESERVED_GYM_CODES].sort());
  });

  it('checks the same form as app.is_valid_gym_code()', () => {
    const body = latestFunctionBody('app.is_valid_gym_code');

    expect(/code ~ '([^']+)'/.exec(body)?.[1]).toBe(GYM_CODE_PATTERN.source);
    expect(/between (\d+) and (\d+)/.exec(body)?.slice(1).map(Number)).toEqual([
      GYM_CODE_MIN_LENGTH,
      GYM_CODE_MAX_LENGTH,
    ]);
  });

  it('knows the access states app.gym_access() returns', () => {
    const body = latestFunctionBody('app.gym_access');
    const states = new Set([...body.matchAll(/then '([a-z_]+)'/g)].map((match) => match[1]));

    expect([...states].sort()).toEqual([...GYM_ACCESS_STATES].sort());
  });
});

describe('gymCodeFromSearch', () => {
  it('reads ?gym= from a link', () => {
    expect(gymCodeFromSearch('?gym=hawler-fit')).toBe('hawler-fit');
    expect(gymCodeFromSearch('?lang=en&gym=Demo')).toBe('demo');
  });

  it('ignores a missing or invalid code', () => {
    expect(gymCodeFromSearch('')).toBeNull();
    expect(gymCodeFromSearch('?gym=')).toBeNull();
    expect(gymCodeFromSearch('?gym=no%20such')).toBeNull();
    expect(gymCodeFromSearch('?gym=admin')).toBeNull();
  });
});

describe('isGymAccess', () => {
  it.each(['active', 'grace', 'read_only', 'locked'])('accepts %s', (state) => {
    expect(isGymAccess(state)).toBe(true);
  });

  it.each(['suspended', '', null, 3])('rejects %s', (state) => {
    expect(isGymAccess(state)).toBe(false);
  });
});
