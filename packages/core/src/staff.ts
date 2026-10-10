import { toLatinDigits } from './digits';
import { isValidGymCode } from './gym';

/**
 * Staff log in with their gym's code and a username. Supabase Auth needs an email address, so each
 * login maps to an internal address on a reserved domain: `.invalid` never resolves, so no mail
 * can ever go there.
 */
export const STAFF_EMAIL_DOMAIN = 'staff.gym-spa.invalid';

/**
 * Lowercase Latin letters, digits, `.`, `_` and `-`, starting with a letter, 3 to 32 characters.
 * The database checks the same pattern on staff_users.username (a test keeps the two equal).
 * Usernames are unique within a gym, not across gyms.
 */
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,31}$/;

/**
 * What staff type, as the username to look up: no surrounding spaces, lowercase, and digits typed
 * on a Kurdish or Arabic keyboard (٠-٩, ۰-۹) turned into 0-9.
 */
export function normalizeUsername(input: string): string {
  return toLatinDigits(input.trim().toLowerCase());
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/**
 * The internal Auth email of a staff member: `<username>@<gym code>.staff.gym-spa.invalid`. The
 * database refuses a staff account whose Auth email isn't exactly this (app.check_staff_login).
 * Pass a normalized, valid username and gym code.
 */
export function staffEmail(username: string, gymCode: string): string {
  if (!isValidUsername(username)) {
    throw new Error(`Not a valid username: "${username}"`);
  }
  if (!isValidGymCode(gymCode)) {
    throw new Error(`Not a valid gym code: "${gymCode}"`);
  }
  return `${username}@${gymCode}.${STAFF_EMAIL_DOMAIN}`;
}
