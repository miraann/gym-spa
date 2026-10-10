import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { latestFunctionBody } from './sql-functions.test-helper';
import {
  STAFF_EMAIL_DOMAIN,
  USERNAME_PATTERN,
  isValidUsername,
  normalizeUsername,
  staffEmail,
} from './staff';

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Ali.Karim ')).toBe('ali.karim');
  });

  it('turns digits typed on a Kurdish or Arabic keyboard into 0-9', () => {
    expect(normalizeUsername('reception٠١٢٣٤٥٦٧٨٩')).toBe('reception0123456789');
    expect(normalizeUsername('desk۰۱۲۳۴۵۶۷۸۹')).toBe('desk0123456789');
  });
});

describe('isValidUsername', () => {
  it.each(['ali', 'reception_1', 'ali.karim', 'desk-2', 'a'.repeat(32)])(
    'accepts %s',
    (username) => {
      expect(isValidUsername(username)).toBe(true);
    },
  );

  it.each([
    ['too short', 'al'],
    ['too long', 'a'.repeat(33)],
    ['starts with a digit', '1ali'],
    ['uppercase', 'Ali'],
    ['a space', 'ali karim'],
    ['an @', 'ali@desk'],
    ['Kurdish letters', 'ئاری'],
    ['empty', ''],
  ])('rejects %s', (_reason, username) => {
    expect(isValidUsername(username)).toBe(false);
  });
});

describe('staffEmail', () => {
  it('maps a username in a gym to its internal Auth email', () => {
    expect(staffEmail('ali.karim', 'hawler-fit')).toBe(
      'ali.karim@hawler-fit.staff.gym-spa.invalid',
    );
  });

  it('gives the same username in two gyms two different logins', () => {
    expect(staffEmail('owner', 'gym-a')).not.toBe(staffEmail('owner', 'gym-b'));
  });

  it('uses a reserved domain that can never receive mail', () => {
    expect(STAFF_EMAIL_DOMAIN.endsWith('.invalid')).toBe(true);
  });

  it('refuses an invalid username or gym code', () => {
    expect(() => staffEmail('Ali Karim', 'demo')).toThrow();
    expect(() => staffEmail('ali', 'Demo Gym')).toThrow();
    expect(() => staffEmail('ali', 'admin')).toThrow();
  });

  it('is the email the database expects (app.check_staff_login)', () => {
    const body = latestFunctionBody('app.check_staff_login');

    expect(body).toContain(`new.username || '@' || g.code || '.${STAFF_EMAIL_DOMAIN}'`);
  });
});

describe('USERNAME_PATTERN', () => {
  it('is the same pattern the database checks', () => {
    const migrations = new URL('../../../supabase/migrations/', import.meta.url);
    const sql = readdirSync(migrations)
      .map((file) => readFileSync(new URL(file, migrations), 'utf8'))
      .find((text) => text.includes('create table public.staff_users'));
    const databasePattern = sql?.match(
      /username text not null unique check \(username ~ '([^']+)'\)/,
    )?.[1];

    expect(databasePattern).toBe(USERNAME_PATTERN.source);
  });
});
