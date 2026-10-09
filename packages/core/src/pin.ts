import { toLatinDigits } from './digits';

// The PIN that unlocks the app on a device, also offline. It is hashed on the device and the hash
// is kept in staff_pins (only its owner can read it), so the same PIN works on every device the
// staff member has logged in on. Keep the rules in step with the staff_pins checks in
// supabase/migrations/20261005100100_access_control.sql.

export const PIN_LENGTH = 6;
export const PIN_ALGORITHM = 'pbkdf2-sha256';
/**
 * PBKDF2-SHA256 rounds for new PINs. The hash keeps its own count, so changing this only affects
 * PINs set afterwards. The database accepts 100,000 to 10,000,000.
 */
export const PIN_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

/** A hashed PIN, as stored in staff_pins and cached on the device. */
export interface PinHash {
  readonly algorithm: typeof PIN_ALGORITHM;
  readonly iterations: number;
  /** Base64 */
  readonly salt: string;
  /** Base64 */
  readonly hash: string;
}

/** What the person typed, as the PIN to check: no spaces, Kurdish/Arabic digits as 0-9. */
export function normalizePin(input: string): string {
  return toLatinDigits(input.replace(/\s/g, ''));
}

export function isWellFormedPin(pin: string): boolean {
  return new RegExp(`^[0-9]{${String(PIN_LENGTH)}}$`).test(pin);
}

/**
 * PINs anyone would guess first: one digit repeated (111111), a run up or down (123456, 987654),
 * or a repeated pair or triple (121212, 123123).
 */
export function isWeakPin(pin: string): boolean {
  const digits = Array.from(pin, Number);
  const steps = new Set(digits.slice(1).map((digit, index) => digit - (digits[index] ?? 0)));
  if (steps.size === 1) {
    const [step] = steps;
    if (step === 0 || step === 1 || step === -1) return true;
  }
  return /^(\d\d)\1\1$/.test(pin) || /^(\d\d\d)\1$/.test(pin);
}

export type PinProblem = 'pin_length' | 'pin_weak';

/** Why a new PIN can't be used, or null when it's fine. */
export function newPinProblem(pin: string): PinProblem | null {
  if (!isWellFormedPin(pin)) return 'pin_length';
  if (isWeakPin(pin)) return 'pin_weak';
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function derive(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Hashes a new PIN with a fresh random salt. */
export async function hashPin(pin: string, iterations: number = PIN_ITERATIONS): Promise<PinHash> {
  if (!isWellFormedPin(pin)) throw new Error('A PIN is exactly 6 digits');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt, iterations);
  return { algorithm: PIN_ALGORITHM, iterations, salt: toBase64(salt), hash: toBase64(hash) };
}

/** Compares in constant time, so the time taken says nothing about how close a guess was. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  if (!isWellFormedPin(pin)) return false;
  const hash = await derive(pin, fromBase64(stored.salt), stored.iterations);
  return sameBytes(hash, fromBase64(stored.hash));
}

/** Reads a staff_pins row (or a cached copy); null when it isn't a PIN hash we can check. */
export function parsePinHash(value: unknown): PinHash | null {
  if (typeof value !== 'object' || value === null) return null;
  const record: Partial<Record<keyof PinHash, unknown>> = value;
  const { algorithm, iterations, salt, hash } = record;
  if (
    algorithm !== PIN_ALGORITHM ||
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    typeof salt !== 'string' ||
    typeof hash !== 'string'
  ) {
    return null;
  }
  return { algorithm, iterations, salt, hash };
}

/** Wrong PIN tries on one device, counted per staff member. */
export interface PinAttempts {
  readonly failures: number;
  /** Too many wrong tries: only a password login (online) unlocks this staff member again. */
  readonly lockedOut: boolean;
}

export const NO_PIN_ATTEMPTS: PinAttempts = { failures: 0, lockedOut: false };

export function recordWrongPin(attempts: PinAttempts, maxAttempts: number): PinAttempts {
  const failures = attempts.failures + 1;
  return { failures, lockedOut: failures >= maxAttempts };
}

/** Tries left before the lockout (0 once locked out). */
export function pinTriesLeft(attempts: PinAttempts, maxAttempts: number): number {
  return Math.max(0, maxAttempts - attempts.failures);
}
