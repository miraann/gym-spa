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
  /** Hours of unsynced data on a device before managers are alerted. */
  'sync.unsynced_alert_hours': { min: 1, max: 168, default: 24 },
} as const satisfies Record<string, IntegerSetting>;

export type SettingKey = keyof typeof SETTINGS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

/** A stored value (JSON text, as kept in the local database) if it's valid for the key. */
export function parseSettingValue(key: SettingKey, json: string | null | undefined): number | null {
  if (json === null || json === undefined) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const rule: IntegerSetting = SETTINGS[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= rule.min && value <= rule.max ? value : null;
}

export interface SettingRow {
  /** null: applies to every branch */
  readonly branch_id: string | null;
  readonly key: string;
  readonly value: string | null;
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
