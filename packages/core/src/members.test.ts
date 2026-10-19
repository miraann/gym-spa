import { describe, expect, it } from 'vitest';
import {
  BLOOD_TYPES,
  GENDERS,
  IRAQI_MOBILE_PATTERN,
  MEMBER_LIMITS,
  MEMBER_NUMBER_QUERY,
  MEMBER_PHONE_PATTERN,
  MEMBER_STATUSES,
  MIN_BIRTH_DATE,
  REFERRAL_SOURCES,
  formatMemberNumber,
  formatMemberPhone,
  isValidMemberPhone,
  isValidMemberTags,
  memberSearchNeedle,
  normalizeMemberPhone,
} from './members.ts';
import { latestFunctionBody, migrationsSql } from './sql-functions.test-helper.ts';

/** The SQL list of a check like `gender in ('male', 'female')`. */
function sqlList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

describe('normalizeMemberPhone', () => {
  it.each([
    ['0750 123 4567', '+9647501234567'],
    ['07501234567', '+9647501234567'],
    ['750 123 4567', '+9647501234567'],
    ['+964 750 123 4567', '+9647501234567'],
    ['+964 0750 123 4567', '+9647501234567'],
    ['00964 750 123 4567', '+9647501234567'],
    ['9647501234567', '+9647501234567'],
    ['٠٧٥٠ ١٢٣ ٤٥٦٧', '+9647501234567'],
    ['۰۷۷۰-۱۲۳-۴۵۶۷', '+9647701234567'],
    ['(0780) 123.4567', '+9647801234567'],
    ['‎+964 790 123 4567‎', '+9647901234567'],
    ['+90 532 123 45 67', '+905321234567'],
    ['0098 912 345 6789', '+989123456789'],
  ])('reads %s as %s', (input, phone) => {
    expect(normalizeMemberPhone(input)).toBe(phone);
  });

  it.each([
    '',
    '0750 123 456',
    '0750 123 45678',
    '0650 123 4567',
    '+964 1 234 5678',
    '+964 750 123 456',
    '532 123 45 67',
    '+0 123 456 789',
    '+1234567',
    '+1234567890123456',
    'abc',
  ])('refuses "%s"', (input) => {
    expect(normalizeMemberPhone(input)).toBeNull();
  });
});

describe('isValidMemberPhone', () => {
  it('accepts stored Iraqi mobiles and foreign numbers', () => {
    expect(isValidMemberPhone('+9647501234567')).toBe(true);
    expect(isValidMemberPhone('+905321234567')).toBe(true);
  });

  it('refuses Iraqi numbers that are not mobiles, and unstored forms', () => {
    expect(isValidMemberPhone('+96412345678')).toBe(false);
    expect(isValidMemberPhone('07501234567')).toBe(false);
    expect(isValidMemberPhone('+964 750 123 4567')).toBe(false);
  });

  it('is the rule of the database (app.is_valid_member_phone)', () => {
    const body = latestFunctionBody('app.is_valid_member_phone');
    expect(body).toContain(`value ~ '${MEMBER_PHONE_PATTERN.source}'`);
    expect(body).toContain(`value !~ '^\\+964' or value ~ '${IRAQI_MOBILE_PATTERN.source}'`);
  });
});

describe('formatMemberPhone', () => {
  it('shows Iraqi mobiles in the local form', () => {
    expect(formatMemberPhone('+9647501234567')).toBe('0750 123 4567');
  });

  it('shows other numbers as stored', () => {
    expect(formatMemberPhone('+905321234567')).toBe('+905321234567');
  });
});

describe('formatMemberNumber', () => {
  it('shows at least 6 digits', () => {
    expect(formatMemberNumber(1)).toBe('000001');
    expect(formatMemberNumber(123)).toBe('000123');
    expect(formatMemberNumber(1234567)).toBe('1234567');
  });

  it('is how the database writes the number into search_text', () => {
    expect(latestFunctionBody('app.member_search_text')).toContain(
      'lpad(member_number::text, greatest(6, length(member_number::text)), ',
    );
  });
});

describe('isValidMemberTags', () => {
  it('accepts up to 10 different tags of up to 30 characters', () => {
    expect(isValidMemberTags([])).toBe(true);
    expect(isValidMemberTags(['قوتابی', 'خێزان'])).toBe(true);
    expect(isValidMemberTags(Array.from({ length: 10 }, (_, i) => `t${String(i)}`))).toBe(true);
    expect(isValidMemberTags(['x'.repeat(30)])).toBe(true);
  });

  it('refuses too many, too long, empty, untrimmed or repeated tags', () => {
    expect(isValidMemberTags(Array.from({ length: 11 }, (_, i) => `t${String(i)}`))).toBe(false);
    expect(isValidMemberTags(['x'.repeat(31)])).toBe(false);
    expect(isValidMemberTags([''])).toBe(false);
    expect(isValidMemberTags([' قوتابی'])).toBe(false);
    expect(isValidMemberTags(['قوتابی', 'قوتابی'])).toBe(false);
  });

  it('uses the limits of the database (app.is_valid_member_tags)', () => {
    const body = latestFunctionBody('app.is_valid_member_tags');
    expect(body).toContain(`cardinality(tags) <= ${String(MEMBER_LIMITS.tags)}`);
    expect(body).toContain(`app.is_clean_text(t.tag, ${String(MEMBER_LIMITS.tag)})`);
  });
});

describe('memberSearchNeedle', () => {
  it('keeps only the digits of a phone or member number', () => {
    expect(memberSearchNeedle('0750 123 4567')).toBe('07501234567');
    expect(memberSearchNeedle('+964 750-123')).toBe('964750123');
    expect(memberSearchNeedle('٠٠٠١٢٣')).toBe('000123');
  });

  it('normalizes names like every search', () => {
    expect(memberSearchNeedle('  ڕێباز  كەريم ')).toBe('ریباز کەریم');
    expect(memberSearchNeedle('ريباز')).toBe(memberSearchNeedle('ڕێباز'));
  });

  it('is empty for an empty query', () => {
    expect(memberSearchNeedle('   ')).toBe('');
  });

  it('is the rule of the database (app.member_search_needle)', () => {
    const body = latestFunctionBody('app.member_search_needle');
    expect(body).toContain(`'${MEMBER_NUMBER_QUERY.source}'`);
    expect(body).toContain("regexp_replace(n.needle, '[^0-9]', '', 'g')");
    expect(body).toContain('app.normalize_search_text(');
  });
});

describe('the members table', () => {
  const sql = migrationsSql().join('\n');

  it('allows the same lists as the database', () => {
    expect(sql).toContain(`check (gender in (${sqlList(GENDERS)}))`);
    expect(sql).toContain(`check (status in (${sqlList(MEMBER_STATUSES)}))`);
    expect(sql).toContain(`check (referral_source in (${sqlList(REFERRAL_SOURCES)}))`);
    expect(sql).toContain(`check (blood_type in (${sqlList(BLOOD_TYPES)}))`);
  });

  it('uses the same text limits as the database', () => {
    const columns: readonly [string, number][] = [
      ['full_name', MEMBER_LIMITS.fullName],
      ['emergency_contact_name', MEMBER_LIMITS.emergencyContactName],
      ['address', MEMBER_LIMITS.address],
      ['goals', MEMBER_LIMITS.goals],
      ['notes', MEMBER_LIMITS.notes],
      ['status_reason', MEMBER_LIMITS.statusReason],
      ['medical_notes', MEMBER_LIMITS.medicalNotes],
      ['injuries', MEMBER_LIMITS.injuries],
    ];
    for (const [column, limit] of columns) {
      expect(sql).toContain(`check (app.is_clean_text(${column}, ${String(limit)}))`);
    }
  });

  it('has the same earliest birth date', () => {
    expect(sql).toContain(`check (birth_date >= date '${MIN_BIRTH_DATE}')`);
  });
});
