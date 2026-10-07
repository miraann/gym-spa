import { describe, expect, it } from 'vitest';
import { classifyUploadError, rejectionKey } from './upload';

describe('classifyUploadError', () => {
  it.each([
    ['no network (fetch failed)', { status: 0, message: 'TypeError: Failed to fetch' }],
    ['server error', { status: 500, code: 'XX000' }],
    ['database unavailable', { status: 503 }],
    ['rate limited', { status: 429 }],
    ['expired session', { status: 401, code: 'PGRST301', message: 'JWT expired' }],
  ])('retries: %s', (_name, error) => {
    expect(classifyUploadError(error)).toBe('retry');
  });

  it.each([
    [
      'RLS refused the row',
      { status: 403, code: '42501', message: 'new row violates row-level security policy' },
    ],
    ['a guard', { status: 403, code: '42501', message: 'cannot_grant_role' }],
    ['a check constraint', { status: 400, code: '23514', message: 'violates check constraint' }],
    ['bad data', { status: 400, code: '22P02', message: 'invalid input syntax for type uuid' }],
    ['a raised exception', { status: 400, code: 'P0001', message: 'unknown role' }],
    ['an unknown column', { status: 400, code: 'PGRST204', message: 'Could not find the column' }],
  ])('rejects: %s', (_name, error) => {
    expect(classifyUploadError(error)).toBe('reject');
  });
});

describe('rejectionKey', () => {
  it('uses the stable key a guard raises', () => {
    expect(rejectionKey({ status: 403, code: '42501', message: 'cannot_edit_own_account' })).toBe(
      'cannot_edit_own_account',
    );
  });

  it.each([
    ['42501', 'new row violates row-level security policy for table "branches"', 'not_allowed'],
    ['23505', 'duplicate key value violates unique constraint', 'duplicate'],
    ['23503', 'insert or update violates foreign key constraint', 'missing_reference'],
    ['23514', 'new row violates check constraint', 'invalid_value'],
    ['22P02', 'invalid input syntax', 'invalid_value'],
    ['XX000', 'Something else went wrong', 'rejected'],
  ])('gives other errors a generic key (%s)', (code, message, key) => {
    expect(rejectionKey({ status: 400, code, message })).toBe(key);
  });
});
