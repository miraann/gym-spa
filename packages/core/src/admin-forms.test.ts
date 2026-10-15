import { describe, expect, it } from 'vitest';
import {
  BRANCH_NAME_MAX_LENGTH,
  PHONE_PATTERN,
  ROLE_NAME_MAX_LENGTH,
  STAFF_NAME_MAX_LENGTH,
  isCleanText,
  isValidPhone,
  normalizeName,
  normalizePhone,
} from './admin-forms.ts';
import { latestFunctionBody, migrationsSql } from './sql-functions.test-helper.ts';

describe('phone numbers', () => {
  it('turns Kurdish and Arabic digits into 0-9 and tidies spaces', () => {
    expect(normalizePhone('  ٠٧٥٠  ١٢٣ ۴۵۶۷ ')).toBe('0750 123 4567');
  });

  it.each(['07501234567', '0750 123 4567', '+964 750 123 4567', '12345'])('accepts %s', (phone) => {
    expect(isValidPhone(phone)).toBe(true);
  });

  it.each(['', '1234', '0750-123-4567', ' 0750', '0750 ', '++964750'])('refuses "%s"', (phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });

  it('is the pattern of the database checks', () => {
    const sql = migrationsSql().join('\n');
    const checks = [...sql.matchAll(/phone ~ '([^']+)'/g)].map((match) => match[1]);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) expect(check).toBe(PHONE_PATTERN.source);
  });
});

describe('names', () => {
  it('trims and keeps single spaces', () => {
    expect(normalizeName('  ئارام   کەریم ')).toBe('ئارام کەریم');
  });

  it('accepts clean text up to the limit', () => {
    expect(isCleanText('ئارام', 100)).toBe(true);
    expect(isCleanText('x'.repeat(60), 60)).toBe(true);
  });

  it('refuses empty, too long, or spaces at either end', () => {
    expect(isCleanText('', 100)).toBe(false);
    expect(isCleanText('x'.repeat(61), 60)).toBe(false);
    expect(isCleanText(' ئارام', 100)).toBe(false);
    expect(isCleanText('ئارام ', 100)).toBe(false);
  });

  it('uses the limits of the database checks', () => {
    const sql = migrationsSql().join('\n');
    expect(sql).toContain(
      `full_name text not null check (app.is_clean_text(full_name, ${String(STAFF_NAME_MAX_LENGTH)}))`,
    );
    expect(sql).toContain(
      `name_ckb text not null check (app.is_clean_text(name_ckb, ${String(ROLE_NAME_MAX_LENGTH)}))`,
    );
    expect(sql).toContain(
      `name_ckb text not null check (app.is_clean_text(name_ckb, ${String(BRANCH_NAME_MAX_LENGTH)}))`,
    );
    const body = latestFunctionBody('app.is_clean_text');
    expect(body).toContain('length(value) between 1 and max_length');
    expect(body).toContain("value !~ '^\\s' and value !~ '\\s$'");
  });
});
