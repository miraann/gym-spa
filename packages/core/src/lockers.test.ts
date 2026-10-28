import { describe, expect, it } from 'vitest';
import {
  LOCKER_NUMBER_PATTERN,
  compareLockerNumbers,
  lockerFitsGender,
  lockerStatus,
  normalizeLockerNumber,
} from './lockers.ts';

const today = '2026-10-28';

describe('lockerStatus', () => {
  it('out of order wins over everything', () => {
    expect(lockerStatus(true, null, today)).toBe('out_of_order');
    expect(lockerStatus(true, { kind: 'daily', startsOn: today, endsOn: null }, today)).toBe(
      'out_of_order',
    );
  });

  it('nobody holding it is free', () => {
    expect(lockerStatus(false, null, today)).toBe('free');
  });

  it('a daily locker given today is occupied, one from an earlier day is overdue', () => {
    expect(lockerStatus(false, { kind: 'daily', startsOn: today, endsOn: null }, today)).toBe(
      'occupied',
    );
    expect(
      lockerStatus(false, { kind: 'daily', startsOn: '2026-10-27', endsOn: null }, today),
    ).toBe('overdue');
  });

  it('a rental is reserved before it starts, occupied while paid, overdue after', () => {
    const rental = { kind: 'rented', startsOn: '2026-10-01', endsOn: '2026-10-31' } as const;
    expect(lockerStatus(false, { ...rental, startsOn: '2026-10-29' }, today)).toBe('reserved');
    expect(lockerStatus(false, rental, today)).toBe('occupied');
    expect(lockerStatus(false, { ...rental, endsOn: today }, today)).toBe('occupied');
    expect(lockerStatus(false, { ...rental, endsOn: '2026-10-27' }, today)).toBe('overdue');
  });
});

describe('lockerFitsGender', () => {
  it('mixed takes everyone, the other zones one gender', () => {
    expect(lockerFitsGender('mixed', 'male')).toBe(true);
    expect(lockerFitsGender('mixed', 'female')).toBe(true);
    expect(lockerFitsGender('men', 'male')).toBe(true);
    expect(lockerFitsGender('men', 'female')).toBe(false);
    expect(lockerFitsGender('women', 'female')).toBe(true);
    expect(lockerFitsGender('women', 'male')).toBe(false);
  });
});

describe('locker numbers', () => {
  it('are normalized to Latin digits and capital letters', () => {
    expect(normalizeLockerNumber(' a ١٢ ')).toBe('A12');
    expect(LOCKER_NUMBER_PATTERN.test('A12')).toBe(true);
    expect(LOCKER_NUMBER_PATTERN.test('ABCD1')).toBe(false);
    expect(LOCKER_NUMBER_PATTERN.test('12345')).toBe(false);
    expect(LOCKER_NUMBER_PATTERN.test('A')).toBe(false);
  });

  it('sort by letters, then by value', () => {
    expect(['10', 'B1', '2', 'A9', 'A10', '1'].sort(compareLockerNumbers)).toEqual([
      '1',
      '2',
      '10',
      'A9',
      'A10',
      'B1',
    ]);
  });
});
