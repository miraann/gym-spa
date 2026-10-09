/** Same as minimum_password_length in supabase/config.toml (set it in the cloud project too). */
export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt, which Supabase Auth uses, only reads the first 72 bytes. */
export const MAX_PASSWORD_BYTES = 72;

export type PasswordProblem = 'password_short' | 'password_long';

/** Why a new password can't be used, or null when it's fine. */
export function newPasswordProblem(password: string): PasswordProblem | null {
  // Characters, not UTF-16 units: a Kurdish letter counts once.
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) return 'password_short';
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'password_long';
  return null;
}
