import { describe, expect, it } from 'vitest';
import { resolvePermissions } from './permissions';

const catalog = ['members.create', 'members.view', 'payments.refund'];

describe('resolvePermissions', () => {
  it('gives a role its own rows, once each', () => {
    expect(
      resolvePermissions(
        'receptionist',
        ['members.view', 'members.create', 'members.view'],
        catalog,
      ),
    ).toEqual(['members.create', 'members.view']);
  });

  it('gives Super Admin the whole catalog, whatever its rows say', () => {
    expect(resolvePermissions('super_admin', [], catalog)).toEqual(catalog);
  });

  it('gives nothing without a role', () => {
    expect(resolvePermissions(null, ['members.view'], catalog)).toEqual([]);
  });
});
