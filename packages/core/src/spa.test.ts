import { describe, expect, it } from 'vitest';
import {
  SPA_BOOKING_STATUSES,
  canChangeSpaStatus,
  clockMinutes,
  isValidWorkWindows,
  spaDaySlots,
  spaHoldsTime,
  worksDuring,
  type WorkWindow,
} from './spa.ts';

describe('clockMinutes', () => {
  it('reads HH:MM, with Kurdish digits too', () => {
    expect(clockMinutes('09:30')).toBe(570);
    expect(clockMinutes('٠٩:٣٠')).toBe(570);
    expect(clockMinutes('00:00')).toBe(0);
  });

  it('takes 24:00 only as an end', () => {
    expect(clockMinutes('24:00')).toBeNull();
    expect(clockMinutes('24:00', true)).toBe(1440);
  });

  it.each(['9:30', '24:30', '12:60', ''])('refuses %j', (text) => {
    expect(clockMinutes(text, true)).toBeNull();
  });
});

describe('isValidWorkWindows', () => {
  const window = (weekday: WorkWindow['weekday'], from: string, until: string): WorkWindow => ({
    weekday,
    from,
    until,
  });

  it('takes windows that end at midnight, and two on one day that do not overlap', () => {
    expect(isValidWorkWindows([window(1, '09:00', '13:00'), window(1, '16:00', '24:00')])).toBe(
      true,
    );
    expect(isValidWorkWindows([])).toBe(true);
  });

  it('refuses overlapping windows of one day, but not of two days', () => {
    expect(isValidWorkWindows([window(2, '09:00', '13:00'), window(2, '12:00', '15:00')])).toBe(
      false,
    );
    expect(isValidWorkWindows([window(2, '09:00', '13:00'), window(3, '12:00', '15:00')])).toBe(
      true,
    );
  });

  it('refuses a window that ends before it starts, or a time that is not one', () => {
    expect(isValidWorkWindows([window(1, '13:00', '09:00')])).toBe(false);
    expect(isValidWorkWindows([window(1, '9am', '13:00')])).toBe(false);
  });

  it('refuses more than 28 windows', () => {
    const days = [1, 2, 3, 4, 5, 6, 7] as const;
    const many = Array.from({ length: 29 }, (_, index) => {
      const hour = String(Math.floor(index / 7) * 2).padStart(2, '0');
      return window(days[index % 7] ?? 1, `${hour}:00`, `${hour}:30`);
    });
    expect(isValidWorkWindows(many.slice(0, 28))).toBe(true);
    expect(isValidWorkWindows(many)).toBe(false);
  });
});

describe('worksDuring', () => {
  const hours: WorkWindow[] = [
    { weekday: 1, from: '09:00', until: '13:00' },
    { weekday: 1, from: '16:00', until: '24:00' },
  ];

  it('is true when one window covers the whole booking', () => {
    expect(worksDuring(hours, 1, 9 * 60, 10 * 60)).toBe(true);
    expect(worksDuring(hours, 1, 23 * 60, 1440)).toBe(true);
  });

  it('is false across a break, on another day, or past midnight', () => {
    expect(worksDuring(hours, 1, 12 * 60 + 30, 13 * 60 + 30)).toBe(false);
    expect(worksDuring(hours, 2, 9 * 60, 10 * 60)).toBe(false);
    expect(worksDuring(hours, 1, 23 * 60 + 30, 1470)).toBe(false);
  });
});

describe('the statuses', () => {
  it('hold the time until a booking is cancelled or a no-show', () => {
    expect(SPA_BOOKING_STATUSES.filter(spaHoldsTime)).toEqual([
      'booked',
      'confirmed',
      'arrived',
      'completed',
    ]);
  });

  it('change as the database allows', () => {
    expect(canChangeSpaStatus('booked', 'confirmed')).toBe(true);
    expect(canChangeSpaStatus('confirmed', 'arrived')).toBe(true);
    expect(canChangeSpaStatus('arrived', 'completed')).toBe(true);
    expect(canChangeSpaStatus('confirmed', 'no_show')).toBe(true);
    expect(canChangeSpaStatus('arrived', 'cancelled')).toBe(false);
    expect(canChangeSpaStatus('booked', 'completed')).toBe(false);
    expect(canChangeSpaStatus('cancelled', 'booked')).toBe(false);
  });
});

describe('spaDaySlots', () => {
  it('lists the rows of the calendar', () => {
    expect(spaDaySlots(8, 10, 30)).toEqual([480, 510, 540, 570]);
    expect(spaDaySlots(22, 24, 60)).toEqual([1320, 1380]);
  });

  it('shows at least one hour', () => {
    expect(spaDaySlots(10, 9, 60)).toEqual([600]);
  });
});
