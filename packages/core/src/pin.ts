import { toLatinDigits } from './digits.ts';

// The PIN that switches staff on a shared device. The server hashes and checks it, and counts wrong
// tries (set_my_pin, unlock_with_pin). These rules let the screen explain a bad PIN before sending
// it; keep them in step with app.is_weak_pin in supabase/migrations/20261009100000_online_only.sql.

export const PIN_LENGTH = 6;

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
