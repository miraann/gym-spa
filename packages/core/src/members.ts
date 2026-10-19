import { toLatinDigits } from './digits.ts';
import { normalizeSearchText } from './search.ts';

// Rules of the member profile, the same as the database's (supabase/migrations/…_members.sql; a
// test compares them), so a form refuses what the server would refuse before anything is sent.

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * Statuses staff set (members.delete). Expired and frozen come from the subscriptions (Phase 3)
 * and are never stored on the member.
 */
export const MEMBER_STATUSES = ['active', 'suspended', 'banned', 'archived'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const REFERRAL_SOURCES = [
  'friend',
  'social_media',
  'passing_by',
  'advertisement',
  'other',
] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

/** The longest values of the member columns (members.*, member_health.*). */
export const MEMBER_LIMITS = {
  fullName: 100,
  emergencyContactName: 100,
  address: 300,
  goals: 1000,
  notes: 2000,
  statusReason: 300,
  medicalNotes: 2000,
  injuries: 2000,
  tag: 30,
  tags: 10,
} as const;

/** The earliest birth date the database accepts. */
export const MIN_BIRTH_DATE = '1900-01-01';

/** A stored phone: + and 8 to 15 digits (E.164). */
export const MEMBER_PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;
/** An Iraqi number (+964) must be a mobile: +9647 and 9 more digits. */
export const IRAQI_MOBILE_PATTERN = /^\+9647[0-9]{9}$/;

/** Spaces, dashes, dots, brackets and direction marks that people type or paste in a number. */
const PHONE_SEPARATORS = /[\s\-.()‎‏‪-‮⁦-⁩]/g;

/** Whether a stored phone (E.164) is one the database accepts. */
export function isValidMemberPhone(phone: string): boolean {
  return (
    MEMBER_PHONE_PATTERN.test(phone) &&
    (!phone.startsWith('+964') || IRAQI_MOBILE_PATTERN.test(phone))
  );
}

/**
 * A phone as staff type it, in the stored form (+9647501234567), or null when it isn't a valid
 * number. Iraqi mobiles may be typed as 0750 123 4567, 750 123 4567, +964 750…, 00964 750… or
 * +964 0750…, with Kurdish or Arabic digits too. Other countries need + (or 00) and their code.
 */
export function normalizeMemberPhone(input: string): string | null {
  let digits = toLatinDigits(input).replace(PHONE_SEPARATORS, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  let phone: string;
  if (digits.startsWith('+')) {
    phone = digits.replace(/^\+9640(?=7)/, '+964');
  } else if (/^07[0-9]{9}$/.test(digits)) {
    phone = `+964${digits.slice(1)}`;
  } else if (/^7[0-9]{9}$/.test(digits)) {
    phone = `+964${digits}`;
  } else if (/^9647[0-9]{9}$/.test(digits)) {
    phone = `+${digits}`;
  } else {
    return null;
  }
  return isValidMemberPhone(phone) ? phone : null;
}

/** A stored phone as people read it: Iraqi mobiles as 0750 123 4567, others as stored. */
export function formatMemberPhone(phone: string): string {
  if (!IRAQI_MOBILE_PATTERN.test(phone)) return phone;
  const local = `0${phone.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** A member number as shown and printed: at least 6 digits (000123). */
export function formatMemberNumber(memberNumber: number): string {
  return String(memberNumber).padStart(6, '0');
}

/** Like app.is_valid_member_tags(): at most 10, each 1 to 30 characters, trimmed, none twice. */
export function isValidMemberTags(tags: readonly string[]): boolean {
  return (
    tags.length <= MEMBER_LIMITS.tags &&
    new Set(tags).size === tags.length &&
    tags.every((tag) => tag.length >= 1 && tag.length <= MEMBER_LIMITS.tag && !/^\s|\s$/.test(tag))
  );
}

/** A query of only digits, spaces, +, - and brackets: a phone or a member number. */
export const MEMBER_NUMBER_QUERY = /^[+0-9 ()-]+$/;

/**
 * A search query in the form members.search_text is compared with (app.member_search_needle):
 * normalized, and digits only when it is a phone or a member number ("0750 123" → "0750123").
 * Empty means no search.
 */
export function memberSearchNeedle(query: string): string {
  const needle = normalizeSearchText(query);
  return MEMBER_NUMBER_QUERY.test(needle) ? needle.replace(/[^0-9]/g, '') : needle;
}
