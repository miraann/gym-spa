// Settings that devices read. The server checks the same rules (app.is_valid_setting in
// supabase/migrations/20261005100200_devices_and_settings.sql); this file adds the defaults used
// when no row exists.

interface IntegerSetting {
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

export const SETTINGS = {
  /** Wrong PIN tries before the device asks for the password again. */
  'security.pin_max_attempts': { min: 3, max: 10, default: 5 },
  /** Minutes without activity before the app locks. */
  'security.idle_lock_minutes': { min: 1, max: 240, default: 10 },
  /** Minutes after a visit in which another scan counts nothing ("already in"). */
  'checkin.cooldown_minutes': { min: 1, max: 720, default: 60 },
  /** Hours a visit counts as inside when nobody checks the member out. */
  'checkin.visit_hours': { min: 1, max: 24, default: 3 },
  /** 1: money owed now above checkin.debt_limit refuses entry; 0: it is only a warning. */
  'checkin.deny_for_debt': { min: 0, max: 1, default: 0 },
  /** Dinars a member may owe now and still come in, when checkin.deny_for_debt is 1. */
  'checkin.debt_limit': { min: 0, max: 1_000_000_000, default: 0 },
  /** Dinars a rented locker costs per month; 0: not set, so lockers can't be rented yet. */
  'lockers.rent_month_price': { min: 0, max: 1_000_000_000, default: 0 },
  /** Dinars charged for a lost locker key; 0: no fee. */
  'lockers.lost_key_fee': { min: 0, max: 1_000_000_000, default: 0 },
  /** When each night the daily lockers not given back are released: minutes after midnight in Baghdad. */
  'lockers.night_release_minute': { min: 0, max: 1439, default: 180 },
} as const satisfies Record<string, IntegerSetting>;

export type SettingKey = keyof typeof SETTINGS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

/** A stored value (settings.value, jsonb) if it's valid for the key. */
export function parseSettingValue(key: SettingKey, value: unknown): number | null {
  const rule: IntegerSetting = SETTINGS[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= rule.min && value <= rule.max ? value : null;
}

export interface SettingRow {
  /** null: applies to every branch */
  readonly branch_id: string | null;
  readonly key: string;
  /** jsonb, as PostgREST returns it */
  readonly value: unknown;
}

/**
 * The value that applies in a branch: the branch's own row, then the row for every branch, then
 * the default. Invalid values are skipped.
 */
export function resolveSetting(
  key: SettingKey,
  rows: readonly SettingRow[],
  branchId: string | null,
): number {
  const matching = rows.filter((row) => row.key === key);
  const own = branchId ? matching.find((row) => row.branch_id === branchId) : undefined;
  const shared = matching.find((row) => row.branch_id === null);
  return (
    parseSettingValue(key, own?.value) ??
    parseSettingValue(key, shared?.value) ??
    SETTINGS[key].default
  );
}
