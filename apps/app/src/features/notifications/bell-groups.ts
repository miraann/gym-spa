import type { MessageNames } from '@gym/core';
import type { StaffNotification } from './notification-data';

// The bell panel (step D-4g, the user's design of 2026-10-30): the notifications of the last 7
// days, one row per kind and day with the branches merged, newest day first.

/** How many days the bell shows (today and the 6 before); older ones are on /notifications. */
export const BELL_DAYS = 7;

export type BellKind = StaffNotification['kind'];

/** One row of the bell: a kind on a day, every branch's notifications together. */
export interface BellRow {
  readonly key: string;
  readonly kind: BellKind;
  readonly day: string;
  /** The notifications in it, to mark read. */
  readonly ids: readonly string[];
  readonly unread: boolean;
  /** Per branch: reminders collected, or products low; most first. */
  readonly branches: readonly { readonly branchId: string; readonly count: number }[];
  /** Reminders collected, or products low (each product once, whatever the branches). */
  readonly total: number;
  /** Low stock: the products, each once, in the order they became low. */
  readonly products: readonly MessageNames[];
  /** When the newest of them came. */
  readonly createdAt: string;
}

export interface BellDay {
  readonly day: string;
  readonly rows: readonly BellRow[];
}

/** The notifications from `since` on, grouped by day (newest first) and kind. */
export function groupBell(notifications: readonly StaffNotification[], since: string): BellDay[] {
  const rows = new Map<
    string,
    {
      kind: BellKind;
      day: string;
      ids: string[];
      unread: boolean;
      branches: Map<string, number>;
      total: number;
      products: Map<string, MessageNames>;
      createdAt: string;
    }
  >();
  for (const notification of notifications) {
    if (notification.notifyOn < since) continue;
    const key = `${notification.notifyOn}:${notification.kind}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        kind: notification.kind,
        day: notification.notifyOn,
        ids: [],
        unread: false,
        branches: new Map(),
        total: 0,
        products: new Map(),
        createdAt: notification.createdAt,
      };
      rows.set(key, row);
    }
    row.ids.push(notification.id);
    row.unread ||= !notification.read;
    if (notification.createdAt > row.createdAt) row.createdAt = notification.createdAt;
    const amount = notification.kind === 'reminders_ready' ? notification.count : 1;
    row.branches.set(
      notification.branchId,
      (row.branches.get(notification.branchId) ?? 0) + amount,
    );
    if (notification.kind === 'reminders_ready') {
      row.total += notification.count;
    } else if (!row.products.has(notification.subjectId)) {
      row.products.set(notification.subjectId, notification.product);
      row.total += 1;
    }
  }

  const days = new Map<string, BellRow[]>();
  for (const [key, row] of rows) {
    const list = days.get(row.day) ?? [];
    list.push({
      key,
      kind: row.kind,
      day: row.day,
      ids: row.ids,
      unread: row.unread,
      branches: [...row.branches]
        .map(([branchId, count]) => ({ branchId, count }))
        .sort((a, b) => b.count - a.count),
      total: row.total,
      products: [...row.products.values()],
      createdAt: row.createdAt,
    });
    days.set(row.day, list);
  }
  return [...days]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, list]) => ({
      day,
      rows: list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    }));
}

/** The rows not read yet: the bell's badge. */
export function unreadRows(days: readonly BellDay[]): number {
  return days.reduce((total, day) => total + day.rows.filter((row) => row.unread).length, 0);
}

/** The badge's text: the number, or "9+" above nine. */
export function badgeCount(count: number): { readonly value: number; readonly more: boolean } {
  return count > 9 ? { value: 9, more: true } : { value: count, more: false };
}

export type RelativeTime =
  | { readonly kind: 'now' }
  | { readonly kind: 'minutes'; readonly count: number }
  | { readonly kind: 'hours'; readonly count: number }
  | { readonly kind: 'yesterday' }
  | { readonly kind: 'time' };

/**
 * When a row came, as the panel says it: today "now", minutes or hours ago; yesterday's rows
 * "yesterday"; older ones their time of day (the day is their heading).
 */
export function relativeTime(
  createdAt: string,
  day: string,
  today: string,
  yesterday: string,
  now: number,
): RelativeTime {
  if (day === yesterday) return { kind: 'yesterday' };
  if (day !== today) return { kind: 'time' };
  const minutes = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60_000));
  if (minutes < 1) return { kind: 'now' };
  if (minutes < 60) return { kind: 'minutes', count: minutes };
  return { kind: 'hours', count: Math.floor(minutes / 60) };
}

/** A `YYYY-MM-DD` day moved by whole days. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
