/**
 * Temporary passwords: made by the server for a new account and for a password reset, shown to
 * the manager once, and replaced by the staff member at their first login (must_change_password).
 * Never stored or logged by the staff module.
 *
 * Lowercase letters and digits only, without look-alikes (0 o, 1 l i), so they can be read out
 * and typed on a phone without mistakes. 14 characters of 31 give about 69 bits.
 */
export const TEMPORARY_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const TEMPORARY_PASSWORD_LENGTH = 14;

/** Fills the array with random bytes (crypto.getRandomValues in Node and Deno). */
export type RandomBytes = (bytes: Uint8Array) => void;

const secureRandom: RandomBytes = (bytes) => {
  crypto.getRandomValues(bytes);
};

/** The largest multiple of the alphabet's size that fits in a byte: higher bytes are skipped, so
 * every character is equally likely. */
const LIMIT = 256 - (256 % TEMPORARY_PASSWORD_ALPHABET.length);

export function generateTemporaryPassword(random: RandomBytes = secureRandom): string {
  for (;;) {
    let password = '';
    const bytes = new Uint8Array(32);
    while (password.length < TEMPORARY_PASSWORD_LENGTH) {
      random(bytes);
      for (const byte of bytes) {
        if (byte >= LIMIT || password.length === TEMPORARY_PASSWORD_LENGTH) continue;
        password += TEMPORARY_PASSWORD_ALPHABET.charAt(byte % TEMPORARY_PASSWORD_ALPHABET.length);
      }
    }
    // At least one letter and one digit, for projects that require both.
    if (/[a-z]/.test(password) && /[0-9]/.test(password)) return password;
  }
}
