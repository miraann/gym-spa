import { describe, expect, it } from 'vitest';
import {
  LOCKER_NUMBER_PATTERN,
  clockToMinute,
  compareLockerNumbers,
  lockerFitsGender,
  lockerStatus,
  minuteAsBaghdadTime,
  minuteToClock,
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

describe('the night release time', () => {
  it('turns minutes into a time input value and back', () => {
    expect(minuteToClock(180)).toBe('03:00');
    expect(minuteToClock(1439)).toBe('23:59');
    expect(minuteToClock(0)).toBe('00:00');
    expect(clockToMinute('03:00')).toBe(180);
    expect(clockToMinute('٢٣:٣٠')).toBe(1410);
  });

  it.each(['', '3:00', '24:00', '12:60', 'noon'])('refuses %j', (text) => {
    expect(clockToMinute(text)).toBeNull();
  });

  it('gives a moment at that time in Baghdad', () => {
    expect(minuteAsBaghdadTime(180).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(minuteAsBaghdadTime(90).toISOString()).toBe('2025-12-31T22:30:00.000Z');
  });
});
