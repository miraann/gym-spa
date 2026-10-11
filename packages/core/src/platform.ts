import { toLatinDigits } from './digits.ts';
import { MAX_PASSWORD_BYTES, type PasswordProblem } from './password.ts';

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

/**
 * A platform admin's own password is longer than a staff member's (MIN_PASSWORD_LENGTH): the panel
 * guards every gym. Checked by the panel; Auth itself enforces the project-wide minimum.
 */
export const ADMIN_MIN_PASSWORD_LENGTH = 12;

/** Why a platform admin's new password can't be used, or null when it's fine. */
export function adminPasswordProblem(password: string): PasswordProblem | null {
  if (Array.from(password).length < ADMIN_MIN_PASSWORD_LENGTH) return 'password_short';
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'password_long';
  return null;
}
