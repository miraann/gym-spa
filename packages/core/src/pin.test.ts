import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NO_PIN_ATTEMPTS,
  PIN_ITERATIONS,
  hashPin,
  isWeakPin,
  newPinProblem,
  normalizePin,
  parsePinHash,
  pinTriesLeft,
  recordWrongPin,
  verifyPin,
} from './pin';

// Hashing with the real count takes a few hundred ms; the rules don't depend on it.
const FAST = 1000;

describe('normalizePin', () => {
  it('drops spaces and reads Kurdish and Arabic digits', () => {
    expect(normalizePin(' ٤٨٢ ۹۱۷ ')).toBe('482917');
  });
});

describe('newPinProblem', () => {
  it.each(['482917', '051739', '909182'])('accepts %s', (pin) => {
    expect(newPinProblem(pin)).toBeNull();
  });

  it.each(['12345', '1234567', '12a456', ''])('needs exactly 6 digits: "%s"', (pin) => {
    expect(newPinProblem(pin)).toBe('pin_length');
  });

  it.each(['000000', '777777', '123456', '654321', '345678', '121212', '123123', '909090'])(
    'refuses the easy guess %s',
    (pin) => {
      expect(isWeakPin(pin)).toBe(true);
      expect(newPinProblem(pin)).toBe('pin_weak');
    },
  );
});

describe('hashPin / verifyPin', () => {
  it('accepts the right PIN and refuses others', async () => {
    const stored = await hashPin('482917', FAST);
    expect(await verifyPin('482917', stored)).toBe(true);
    expect(await verifyPin('482918', stored)).toBe(false);
    expect(await verifyPin('48291', stored)).toBe(false);
  });

  it('uses a fresh salt every time', async () => {
    const first = await hashPin('482917', FAST);
    const second = await hashPin('482917', FAST);
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('checks with the count stored in the hash, so the default can change later', async () => {
    const stored = await hashPin('482917', 2000);
    expect(stored.iterations).toBe(2000);
    expect(await verifyPin('482917', stored)).toBe(true);
    expect(await verifyPin('482917', { ...stored, iterations: 2001 })).toBe(false);
  });

  it('makes hashes the database accepts', async () => {
    const stored = await hashPin('482917', FAST);
    // The checks on staff_pins.salt and staff_pins.hash.
    expect(stored.salt).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/);
    expect(stored.hash).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(stored.algorithm).toBe('pbkdf2-sha256');
  });

  it('defaults to a count inside what the database allows', () => {
    const migrations = new URL('../../../supabase/migrations/', import.meta.url);
    const sql = readdirSync(migrations)
      .map((file) => readFileSync(new URL(file, migrations), 'utf8'))
      .join('\n');
    const match = /iterations integer not null check \(iterations between (\d+) and (\d+)\)/.exec(
      sql,
    );
    expect(match).not.toBeNull();
    expect(PIN_ITERATIONS).toBeGreaterThanOrEqual(Number(match?.[1]));
    expect(PIN_ITERATIONS).toBeLessThanOrEqual(Number(match?.[2]));
  });

  it('refuses to hash a PIN that is not 6 digits', async () => {
    await expect(hashPin('1234', FAST)).rejects.toThrow();
  });
});

describe('parsePinHash', () => {
  it('reads a staff_pins row', async () => {
    const stored = await hashPin('482917', FAST);
    expect(parsePinHash({ ...stored, staff_id: 'x', updated_at: 'y' })).toEqual(stored);
  });

  it.each([null, 'text', { algorithm: 'md5', iterations: 1, salt: 'a', hash: 'b' }, {}])(
    'ignores %j',
    (value) => {
      expect(parsePinHash(value)).toBeNull();
    },
  );
});

describe('lockout', () => {
  it('locks out on the last allowed wrong try', () => {
    let attempts = NO_PIN_ATTEMPTS;
    for (let index = 1; index < 5; index += 1) {
      attempts = recordWrongPin(attempts, 5);
      expect(attempts.lockedOut).toBe(false);
      expect(pinTriesLeft(attempts, 5)).toBe(5 - index);
    }
    attempts = recordWrongPin(attempts, 5);
    expect(attempts).toEqual({ failures: 5, lockedOut: true });
    expect(pinTriesLeft(attempts, 5)).toBe(0);
  });

  it('locks out at once if the limit was lowered below the tries already made', () => {
    const attempts = recordWrongPin({ failures: 4, lockedOut: false }, 3);
    expect(attempts.lockedOut).toBe(true);
    expect(pinTriesLeft(attempts, 3)).toBe(0);
  });
});
