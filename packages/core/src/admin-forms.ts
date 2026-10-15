import { toLatinDigits } from './digits.ts';

// Rules of the admin screens' fields, the same as the database's checks (a test compares them),
// so a form refuses what the server would refuse before anything is sent.

/** Same pattern as the phone checks on staff_users and branches. */
export const PHONE_PATTERN = /^\+?[0-9][0-9 ]{3,18}[0-9]$/;

/** The longest staff name (staff_users.full_name), role name (roles.name_*) and branch name. */
export const STAFF_NAME_MAX_LENGTH = 100;
export const ROLE_NAME_MAX_LENGTH = 60;
export const BRANCH_NAME_MAX_LENGTH = 100;

/**
 * A phone number as staff type it: digits typed on a Kurdish or Arabic keyboard become 0-9, no
 * spaces around it and single spaces inside. Empty means no phone.
 */
export function normalizePhone(input: string): string {
  return toLatinDigits(input).trim().replace(/\s+/g, ' ');
}

export function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(phone);
}

/** Text as names are stored: no spaces around it, inner runs of spaces made single. */
export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/** Like app.is_clean_text(): 1 to maxLength characters, no space at either end. */
export function isCleanText(value: string, maxLength: number): boolean {
  return value.length >= 1 && value.length <= maxLength && !/^\s|\s$/.test(value);
}
