import { toLatinDigits } from './digits.ts';

/**
 * A gym's code is part of every staff login (`<username>@<gym code>.staff.gym-spa.invalid`), so it
 * never changes. 3 to 20 characters: lowercase Latin letters and digits with single hyphens between
 * them, starting with a letter. The database checks the same rule (app.is_valid_gym_code); a test
 * keeps the two equal.
 */
export const GYM_CODE_PATTERN = /^[a-z](-?[a-z0-9])+$/;
export const GYM_CODE_MIN_LENGTH = 3;
export const GYM_CODE_MAX_LENGTH = 20;

/**
 * Codes no gym can have. The database refuses the same list (app.is_reserved_gym_code); a test
 * keeps the two equal.
 */
export const RESERVED_GYM_CODES: readonly string[] = [
  'admin',
  'seller',
  'support',
  'api',
  'www',
  'app',
  'login',
  'clickgroup',
  'gym-spa',
  'test',
  'root',
  'system',
];

/**
 * What staff type, as the gym code to look up: no surrounding spaces, lowercase, and digits typed
 * on a Kurdish or Arabic keyboard (٠-٩, ۰-۹) turned into 0-9.
 */
export function normalizeGymCode(input: string): string {
  return toLatinDigits(input.trim().toLowerCase());
}

export function isReservedGymCode(code: string): boolean {
  return RESERVED_GYM_CODES.includes(code);
}

/** A code a gym can have: the right form, and not reserved. Pass a normalized code. */
export function isValidGymCode(code: string): boolean {
  return (
    code.length >= GYM_CODE_MIN_LENGTH &&
    code.length <= GYM_CODE_MAX_LENGTH &&
    GYM_CODE_PATTERN.test(code) &&
    !isReservedGymCode(code)
  );
}

/** The gym code in a link like `https://…/?gym=hawler-fit`, if it is a valid one. */
export function gymCodeFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('gym');
  if (value === null) return null;
  const code = normalizeGymCode(value);
  return isValidGymCode(code) ? code : null;
}

/**
 * A gym's access state, as app.gym_access() on the server works it out (spec §2.6):
 *   - active: everything works.
 *   - grace: paid_until has passed, less than 30 days ago; everything still works.
 *   - read_only: suspended, or the grace period is over. Staff can log in and look.
 *   - locked: Click Group locked or closed it; its staff can't use it at all.
 */
export const GYM_ACCESS_STATES = ['active', 'grace', 'read_only', 'locked'] as const;
export type GymAccess = (typeof GYM_ACCESS_STATES)[number];

export function isGymAccess(value: unknown): value is GymAccess {
  return typeof value === 'string' && (GYM_ACCESS_STATES as readonly string[]).includes(value);
}
