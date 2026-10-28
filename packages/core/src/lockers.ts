import { toLatinDigits } from './digits.ts';

// Lockers (Phase 5; supabase/migrations/20261028200000_lockers.sql). The database decides who may
// hold a locker; this file gives the screens the status, the number rules and the order.

export const LOCKER_ZONES = ['men', 'women', 'mixed'] as const;
export type LockerZone = (typeof LOCKER_ZONES)[number];

export const LOCKER_KINDS = ['daily', 'rented'] as const;
export type LockerKind = (typeof LOCKER_KINDS)[number];

export const LOCKER_STATUSES = ['free', 'occupied', 'reserved', 'overdue', 'out_of_order'] as const;
export type LockerStatus = (typeof LOCKER_STATUSES)[number];

export const LOCKER_RELEASE_REASONS = [
  'returned',
  'checked_out',
  'renewed',
  'key_lost',
  'invoice_voided',
  'end_of_day',
] as const;
export type LockerReleaseReason = (typeof LOCKER_RELEASE_REASONS)[number];

/** 12 or A12: up to 3 capital Latin letters, then 1 to 4 digits (lockers.number). */
export const LOCKER_NUMBER_PATTERN = /^[A-Z]{0,3}[0-9]{1,4}$/;
export const LOCKER_PREFIX_PATTERN = /^[A-Z]{0,3}$/;
/** add_lockers() adds at most this many at once. */
export const LOCKER_MAX_ADD = 300;

/** A typed locker number as the database keeps it: Latin digits, capital letters, no spaces. */
export function normalizeLockerNumber(text: string): string {
  return toLatinDigits(text).replace(/\s+/g, '').toUpperCase();
}

/** The open assignment of a locker, as far as its status needs it. */
export interface LockerHolding {
  readonly kind: LockerKind;
  /** daily: the day it was given; rented: the first paid day (yyyy-mm-dd, Baghdad). */
  readonly startsOn: string;
  /** rented: the last paid day. */
  readonly endsOn: string | null;
}

/**
 * What the map shows for a locker on `today` (yyyy-mm-dd, Baghdad): out of order first, then free,
 * reserved (a rental that starts later), overdue (a rental past its last paid day, or a daily
 * locker from an earlier day not given back), otherwise occupied.
 */
export function lockerStatus(
  outOfOrder: boolean,
  holding: LockerHolding | null,
  today: string,
): LockerStatus {
  if (outOfOrder) return 'out_of_order';
  if (holding === null) return 'free';
  if (holding.kind === 'rented') {
    if (holding.startsOn > today) return 'reserved';
    if (holding.endsOn !== null && holding.endsOn < today) return 'overdue';
    return 'occupied';
  }
  return holding.startsOn < today ? 'overdue' : 'occupied';
}

/** Whether a member of this gender may have a locker in the zone (the database checks it too). */
export function lockerFitsGender(zone: LockerZone, gender: 'male' | 'female'): boolean {
  return zone === 'mixed' || (zone === 'men') === (gender === 'male');
}

/** Map order: by the letters, then by the number's value (2 before 10, A9 before B1). */
export function compareLockerNumbers(a: string, b: string): number {
  const [, aLetters = '', aDigits = '0'] = /^([A-Z]*)(\d*)$/.exec(a) ?? [];
  const [, bLetters = '', bDigits = '0'] = /^([A-Z]*)(\d*)$/.exec(b) ?? [];
  if (aLetters !== bLetters) return aLetters < bLetters ? -1 : 1;
  return Number(aDigits) - Number(bDigits);
}
