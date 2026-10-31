import type { MessageNames } from '@gym/core';
import { describe, expect, it } from 'vitest';
import { badgeCount, groupBell, relativeTime, shiftDay, unreadRows } from './bell-groups';
import type { StaffNotification } from './notification-data';

const water: MessageNames = { ckb: 'ئاو', en: 'Water', ar: null };
const towel: MessageNames = { ckb: 'خاولی', en: null, ar: null };

function reminders(
  id: string,
  branchId: string,
  notifyOn: string,
  count: number,
  read = false,
  createdAt = `${notifyOn}T06:00:00Z`,
): StaffNotification {
  return {
    id,
    kind: 'reminders_ready',
    branchId,
    subjectId: branchId,
    notifyOn,
    createdAt,
    read,
    count,
  };
}

function low(
  id: string,
  branchId: string,
  subjectId: string,
  notifyOn: string,
  product = water,
  read = false,
): StaffNotification {
  return {
    id,
    kind: 'low_stock',
    branchId,
    subjectId,
    notifyOn,
    createdAt: `${notifyOn}T08:00:00Z`,
    read,
    product,
    quantity: 1,
  };
}

describe('groupBell', () => {
  it('makes one row per kind and day, the branches merged, newest day first', () => {
    const days = groupBell(
      [
        reminders('r1', 'main', '2026-10-31', 9),
        reminders('r2', 'east', '2026-10-31', 1, true),
        low('l1', 'main', 'water', '2026-10-31'),
        low('l2', 'east', 'water', '2026-10-31'),
        low('l3', 'east', 'towel', '2026-10-31', towel),
        reminders('r3', 'main', '2026-10-30', 4, true),
      ],
      '2026-10-25',
    );
    expect(days.map((day) => day.day)).toEqual(['2026-10-31', '2026-10-30']);
    const today = days[0]?.rows ?? [];
    expect(today.map((row) => row.kind)).toEqual(['low_stock', 'reminders_ready']);
    const reminderRow = today[1];
    expect(reminderRow?.total).toBe(10);
    expect(reminderRow?.branches).toEqual([
      { branchId: 'main', count: 9 },
      { branchId: 'east', count: 1 },
    ]);
    expect(reminderRow?.ids).toEqual(['r1', 'r2']);
    expect(reminderRow?.unread).toBe(true);
    // A product low in two branches counts once; each branch counts its own.
    const lowRow = today[0];
    expect(lowRow?.total).toBe(2);
    expect(lowRow?.products).toEqual([water, towel]);
    expect(lowRow?.branches).toEqual([
      { branchId: 'east', count: 2 },
      { branchId: 'main', count: 1 },
    ]);
    expect(days[1]?.rows[0]?.unread).toBe(false);
  });

  it('leaves out days older than the bell shows', () => {
    expect(groupBell([reminders('r1', 'main', '2026-10-20', 3)], '2026-10-25')).toEqual([]);
  });
});

describe('the badge', () => {
  it('counts the rows not read, and says 9+ above nine', () => {
    const days = groupBell(
      [
        reminders('r1', 'main', '2026-10-31', 2),
        low('l1', 'main', 'water', '2026-10-31', water, true),
        reminders('r2', 'main', '2026-10-30', 1),
      ],
      '2026-10-25',
    );
    expect(unreadRows(days)).toBe(2);
    expect(badgeCount(4)).toEqual({ value: 4, more: false });
    expect(badgeCount(9)).toEqual({ value: 9, more: false });
    expect(badgeCount(12)).toEqual({ value: 9, more: true });
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-31T09:00:00Z');
  it('says now, minutes or hours ago for today', () => {
    const at = (iso: string) => relativeTime(iso, '2026-10-31', '2026-10-31', '2026-10-30', now);
    expect(at('2026-10-31T08:59:40Z')).toEqual({ kind: 'now' });
    expect(at('2026-10-31T08:35:00Z')).toEqual({ kind: 'minutes', count: 25 });
    expect(at('2026-10-31T06:10:00Z')).toEqual({ kind: 'hours', count: 2 });
    // A clock a little ahead of the server never says "in the future".
    expect(at('2026-10-31T09:00:30Z')).toEqual({ kind: 'now' });
  });

  it('says yesterday, and the time of day for older days', () => {
    expect(
      relativeTime('2026-10-30T07:00:00Z', '2026-10-30', '2026-10-31', '2026-10-30', now),
    ).toEqual({
      kind: 'yesterday',
    });
    expect(
      relativeTime('2026-10-28T07:00:00Z', '2026-10-28', '2026-10-31', '2026-10-30', now),
    ).toEqual({
      kind: 'time',
    });
  });
});

describe('shiftDay', () => {
  it('moves across months and years', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-10-31', -6)).toBe('2026-10-25');
  });
});
