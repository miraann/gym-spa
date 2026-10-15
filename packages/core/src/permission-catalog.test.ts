import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  discountLimit,
  isPermissionKey,
  rolePermissionsToSave,
} from './permission-catalog.ts';
import { migrationsSql } from './sql-functions.test-helper.ts';

/**
 * The catalog the migrations leave behind: every `insert into public.permissions` (the first one
 * multiplies its sort orders by 10), minus every `delete from public.permissions where key = ...`,
 * ordered by sort_order.
 */
function catalogFromMigrations(): { key: string; module: string }[] {
  const rows = new Map<string, { module: string; order: number }>();
  for (const sql of migrationsSql()) {
    for (const statement of sql.split(';')) {
      if (/insert into public\.permissions\b/.test(statement)) {
        const factor = /p\.sort_order \* (\d+)/.exec(statement)?.[1];
        for (const [, key = '', module = '', order = ''] of statement.matchAll(
          /\('([a-z0-9_.]+)', '([a-z_]+)', (\d+)\)/g,
        )) {
          rows.set(key, { module, order: Number(order) * Number(factor ?? 1) });
        }
      }
      const deleted = /delete from public\.permissions where key = '([^']+)'/.exec(statement)?.[1];
      if (deleted) rows.delete(deleted);
    }
  }
  return [...rows]
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key, { module }]) => ({ key, module }));
}

describe('the permission catalog', () => {
  it('is the same as the database catalog, in the same order and modules', () => {
    expect(PERMISSIONS.map(({ key, module }) => ({ key, module }))).toEqual(
      catalogFromMigrations(),
    );
  });

  it('groups each module once, in catalog order', () => {
    const modules = PERMISSION_GROUPS.map((group) => group.module);
    expect(new Set(modules).size).toBe(modules.length);
    expect(PERMISSION_GROUPS.flatMap((group) => group.keys)).toEqual(
      PERMISSIONS.map((permission) => permission.key),
    );
  });

  it('has no key that is also the start of another (labels nest by dots)', () => {
    const keys = PERMISSIONS.map((permission) => permission.key);
    expect(keys.filter((key) => keys.some((other) => other.startsWith(`${key}.`)))).toEqual([]);
  });

  it('knows its own keys only', () => {
    expect(isPermissionKey('members.view')).toBe(true);
    expect(isPermissionKey('members.fly')).toBe(false);
    expect(isPermissionKey(undefined)).toBe(false);
  });

  it('reads the limit of a discount permission', () => {
    expect(discountLimit('discount.apply.max_25')).toBe(25);
    expect(discountLimit('discount.apply.any')).toBeNull();
    expect(discountLimit('members.view')).toBeNull();
  });
});

describe('rolePermissionsToSave', () => {
  it('saves the chosen permissions, sorted and once each', () => {
    expect(rolePermissionsToSave(['payments.view', 'members.view', 'members.view'], [])).toEqual([
      'members.view',
      'payments.view',
    ]);
  });

  it('drops keys it does not know from the choice', () => {
    expect(rolePermissionsToSave(['members.fly', 'members.view'], [])).toEqual(['members.view']);
  });

  it('keeps permissions the role has that this app does not know yet', () => {
    expect(
      rolePermissionsToSave(['members.view'], ['members.view', 'payments.view', 'future.thing']),
    ).toEqual(['future.thing', 'members.view']);
  });
});
