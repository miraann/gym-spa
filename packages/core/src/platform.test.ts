import { describe, expect, it } from 'vitest';
import {
  ADMIN_EMAIL_MAX_LENGTH,
  adminPasswordProblem,
  ADMIN_EMAIL_PATTERN,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_LENGTH,
  isValidAdminEmail,
  looksLikeRecoveryCode,
  normalizeAdminEmail,
  normalizeRecoveryCode,
} from './platform.ts';
import { latestFunctionBody } from './sql-functions.test-helper.ts';

describe('platform admin addresses', () => {
  it('accepts a real, lowercase address', () => {
    expect(isValidAdminEmail('ali@clickgroup.site')).toBe(true);
    expect(isValidAdminEmail('sara.k+panel@mail.example.com')).toBe(true);
  });

  it.each([
    ['capitals', 'Ali@ClickGroup.site'],
    ['a staff login address', 'owner@demo.staff.gym-spa.invalid'],
    ['any .invalid address', 'ali@example.invalid'],
    ['no domain', 'ali@clickgroup'],
    ['no @', 'clickgroup.site'],
    ['spaces', 'ali @clickgroup.site'],
  ])('refuses %s', (_, email) => {
    expect(isValidAdminEmail(email)).toBe(false);
  });

  it('normalizes what is typed', () => {
    expect(normalizeAdminEmail('  Ali@ClickGroup.Site ')).toBe('ali@clickgroup.site');
  });

  it('checks the same form as app.is_valid_admin_email()', () => {
    const body = latestFunctionBody('app.is_valid_admin_email');
    expect(/email ~ '([^']+)'/.exec(body)?.[1]).toBe(ADMIN_EMAIL_PATTERN.source);
    expect(/length\(email\) <= (\d+)/.exec(body)?.[1]).toBe(String(ADMIN_EMAIL_MAX_LENGTH));
    expect(body).toContain("email !~ '\\.invalid$'");
  });
});

describe('recovery codes', () => {
  it('compares letters and digits only, like the database', () => {
    expect(normalizeRecoveryCode('ABCD-efgh jkmn-PQRS')).toBe('abcdefghjkmnpqrs');
    expect(normalizeRecoveryCode('abcd-efgh-٢٣٤٥-pqrs')).toBe('abcdefgh2345pqrs');
  });

  it('knows what can be a code before asking the server', () => {
    expect(looksLikeRecoveryCode('kkkk-mmmm-nnnn-pppp')).toBe(true);
    expect(looksLikeRecoveryCode('kkkk-mmmm-nnnn')).toBe(false);
    expect(looksLikeRecoveryCode('kkkk-mmmm-nnnn-ppp0')).toBe(false);
  });

  it('uses the alphabet and length of app.new_recovery_code()', () => {
    const body = latestFunctionBody('app.new_recovery_code');
    expect(/alphabet constant text := '([^']+)'/.exec(body)?.[1]).toBe(RECOVERY_CODE_ALPHABET);
    expect(/length\(code\) < (\d+)/.exec(body)?.[1]).toBe(String(RECOVERY_CODE_LENGTH));
  });
});

describe('platform admin passwords', () => {
  it('need at least 12 characters, counted as letters', () => {
    expect(adminPasswordProblem('short-pass1')).toBe('password_short');
    expect(adminPasswordProblem('long-enough-1')).toBeNull();
    expect(adminPasswordProblem('وشەینهێنیی12')).toBeNull();
  });

  it('fit in what Auth reads (72 bytes)', () => {
    expect(adminPasswordProblem('ە'.repeat(40))).toBe('password_long');
  });
});
