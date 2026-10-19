import { describe, expect, it } from 'vitest';
import { resolvePermissions } from './permissions.ts';

const catalog = ['members.create', 'members.view', 'payments.refund'];

describe('resolvePermissions', () => {
  it('gives a role its own rows, once each', () => {
    expect(
      resolvePermissions(
        { key: 'receptionist' },
        ['members.view', 'members.create', 'members.view'],
        catalog,
      ),
    ).toEqual(['members.create', 'members.view']);
  });

  it('gives the Owner the whole catalog, whatever its rows say', () => {
    expect(resolvePermissions({ key: 'owner' }, [], catalog)).toEqual(catalog);
  });

  it('gives the old Super Admin key nothing special (it was renamed Owner)', () => {
    expect(resolvePermissions({ key: 'super_admin' }, [], catalog)).toEqual([]);
  });

  it('gives a custom role (which has no key) its own rows', () => {
    expect(resolvePermissions({ key: null }, ['payments.refund', 'members.view'], catalog)).toEqual(
      ['members.view', 'payments.refund'],
    );
  });

  it('gives nothing without a role', () => {
    expect(resolvePermissions(null, ['members.view'], catalog)).toEqual([]);
  });
});
