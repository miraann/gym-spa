import { describe, expect, it } from 'vitest';
import { isWeakPin, newPinProblem, normalizePin } from './pin.ts';

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
