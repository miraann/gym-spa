import { PERMISSIONS, PERMISSION_GROUPS } from '@gym/core';
import { resources } from '@gym/i18n';
import { describe, expect, it } from 'vitest';

/** The leaves of a translation tree, as dotted paths. */
function leafPaths(tree: unknown, prefix = ''): string[] {
  if (typeof tree === 'string') return [prefix];
  if (tree === null || typeof tree !== 'object') return [];
  return Object.entries(tree).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

// The other languages are compared with Kurdish by packages/i18n's parity tests.
const { permissions } = resources.ckb;

describe('permission labels', () => {
  it('label exactly the permissions of the catalog', () => {
    expect(leafPaths(permissions.items).sort()).toEqual(
      PERMISSIONS.map((permission) => permission.key).sort(),
    );
  });

  it('name exactly the modules of the catalog', () => {
    expect(Object.keys(permissions.modules).sort()).toEqual(
      PERMISSION_GROUPS.map((group) => group.module).sort(),
    );
  });

  it('show the limit of every discount permission', () => {
    for (const language of ['ckb', 'en', 'ar'] as const) {
      const {
        max_10: max10,
        max_25: max25,
        max_50: max50,
      } = resources[language].permissions.items.discount.apply;
      for (const label of [max10, max25, max50]) expect(label).toContain('{{max}}');
    }
  });
});
