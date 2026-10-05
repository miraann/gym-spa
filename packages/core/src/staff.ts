/**
 * Staff log in with a username. Supabase Auth needs an email address, so each username maps to an
 * internal address on a reserved domain: `.invalid` never resolves, so no mail can ever go there.
 */
export const STAFF_EMAIL_DOMAIN = 'staff.gym-spa.invalid';

/**
 * Lowercase Latin letters, digits, `.`, `_` and `-`, starting with a letter, 3 to 32 characters.
 * The database checks the same pattern on staff_users.username (a test keeps the two equal).
 */
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,31}$/;

// Arabic-Indic (٠-٩, used with Arabic and Kurdish keyboards) and Extended Arabic-Indic (۰-۹).
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigit(digit: string): string {
  const code = digit.codePointAt(0) ?? 0;
  return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
}

/**
 * What staff type, as the username to look up: no surrounding spaces, lowercase, and digits typed
 * on a Kurdish or Arabic keyboard (٠-٩, ۰-۹) turned into 0-9.
 */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(EASTERN_DIGITS, toLatinDigit);
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** The internal Auth email of a staff member. Pass a normalized, valid username. */
export function staffEmail(username: string): string {
  if (!isValidUsername(username)) {
    throw new Error(`Not a valid username: "${username}"`);
  }
  return `${username}@${STAFF_EMAIL_DOMAIN}`;
}
