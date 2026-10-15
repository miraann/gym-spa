import { describe, expect, it, vi } from 'vitest';
import { adminErrorKey } from './admin-errors';
import { StaffAdminCallError } from './staff-admin-api';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

/** An error as PostgREST returns it: the guard's key is the message. */
const postgrest = (code: string, message: string) => ({ code, message, details: '', hint: '' });

describe('adminErrorKey', () => {
  it('keeps the staff module own key', () => {
    expect(adminErrorKey(new StaffAdminCallError('username_taken'), 'create')).toBe(
      'username_taken',
    );
  });

  it('reads a guard key from the message', () => {
    expect(adminErrorKey(postgrest('42501', 'cannot_grant_role'), 'save')).toBe(
      'cannot_grant_role',
    );
    expect(adminErrorKey(postgrest('42501', 'cannot_edit_own_role'), 'save')).toBe(
      'cannot_edit_own_role',
    );
    expect(adminErrorKey(postgrest('23514', 'role_in_use'), 'delete')).toBe('role_in_use');
    expect(adminErrorKey(postgrest('42501', 'gym_read_only'), 'save')).toBe('gym_read_only');
  });

  it('calls a refusal without a key permission_denied', () => {
    expect(
      adminErrorKey(postgrest('42501', 'new row violates row-level security policy'), 'save'),
    ).toBe('permission_denied');
  });

  it('calls a broken check invalid_request', () => {
    expect(adminErrorKey(postgrest('23514', 'new row violates check constraint'), 'save')).toBe(
      'invalid_request',
    );
  });

  it('knows a lost connection', () => {
    expect(adminErrorKey(new TypeError('Failed to fetch'), 'save')).toBe('network');
    expect(adminErrorKey({ message: 'Failed to fetch' }, 'save')).toBe('network');
  });

  it('calls anything else unexpected', () => {
    expect(adminErrorKey(new Error('boom'), 'save')).toBe('unexpected');
  });
});
