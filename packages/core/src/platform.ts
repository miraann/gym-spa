import { toLatinDigits } from './digits.ts';

// Click Group's platform admins (spec §2.6, step MT-3): rules the seller panel and the seller-admin
// function share with the database. Tests compare them with the SQL (app.is_valid_admin_email,
// app.new_recovery_code).

/** A platform admin's login address, as app.is_valid_admin_email() checks it. */
export const ADMIN_EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const ADMIN_EMAIL_MAX_LENGTH = 254;

/** Auth keeps addresses lowercase. */
export function normalizeAdminEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** A real, lowercase address that can receive mail: never a staff login (`.invalid`). */
export function isValidAdminEmail(email: string): boolean {
  return (
    email.length <= ADMIN_EMAIL_MAX_LENGTH &&
    email === email.toLowerCase() &&
    ADMIN_EMAIL_PATTERN.test(email) &&
    !email.endsWith('.invalid')
  );
}

/** Recovery codes: 16 characters without look-alikes (no 0/o, 1/l/i), shown xxxx-xxxx-xxxx-xxxx. */
export const RECOVERY_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const RECOVERY_CODE_LENGTH = 16;

/**
 * What the database compares (app.recovery_code_hash): letters and digits only, lowercase. Digits
 * typed on a Kurdish or Arabic keyboard become 0-9 first.
 */
export function normalizeRecoveryCode(input: string): string {
  return toLatinDigits(input)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Whether a typed code can be a recovery code at all (before asking the server). */
export function looksLikeRecoveryCode(input: string): boolean {
  const code = normalizeRecoveryCode(input);
  return (
    code.length === RECOVERY_CODE_LENGTH &&
    code.split('').every((character) => RECOVERY_CODE_ALPHABET.includes(character))
  );
}
