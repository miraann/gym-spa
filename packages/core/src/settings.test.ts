import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SETTINGS, isSettingKey, parseSettingValue, resolveSetting } from './settings.ts';

describe('parseSettingValue', () => {
  it('reads whole numbers inside the allowed range', () => {
    expect(parseSettingValue('security.pin_max_attempts', 4)).toBe(4);
    expect(parseSettingValue('security.idle_lock_minutes', 240)).toBe(240);
  });

  it.each([2, 11, 4.5, '5', null, undefined, { value: 5 }])('ignores %j', (value) => {
    expect(parseSettingValue('security.pin_max_attempts', value)).toBeNull();
  });
});

describe('resolveSetting', () => {
  const rows = [
    { branch_id: null, key: 'security.idle_lock_minutes', value: 20 },
    { branch_id: 'b1', key: 'security.idle_lock_minutes', value: 5 },
    { branch_id: 'b2', key: 'security.idle_lock_minutes', value: 9999 },
  ];

  it("uses the branch's own value first", () => {
    expect(resolveSetting('security.idle_lock_minutes', rows, 'b1')).toBe(5);
  });

  it('then the value for every branch, also when the branch value is invalid', () => {
    expect(resolveSetting('security.idle_lock_minutes', rows, 'b3')).toBe(20);
    expect(resolveSetting('security.idle_lock_minutes', rows, 'b2')).toBe(20);
    expect(resolveSetting('security.idle_lock_minutes', rows, null)).toBe(20);
  });

  it('then the default', () => {
    expect(resolveSetting('security.pin_max_attempts', rows, 'b1')).toBe(5);
  });
});

describe('the rules match the database', () => {
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  const sql = readdirSync(migrations)
    .map((file) => readFileSync(new URL(file, migrations), 'utf8'))
    .join('\n');

  it.each(Object.entries(SETTINGS))('%s', (key, rule) => {
    expect(isSettingKey(key)).toBe(true);
    expect(sql).toContain(
      `when '${key}' then app.is_json_integer(value, ${String(rule.min)}, ${String(rule.max)})`,
    );
    expect(rule.default).toBeGreaterThanOrEqual(rule.min);
    expect(rule.default).toBeLessThanOrEqual(rule.max);
  });
});
