import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from './password.ts';

describe('newPasswordProblem', () => {
  it('accepts 8 characters or more', () => {
    expect(newPasswordProblem('Gym-2026')).toBeNull();
    expect(newPasswordProblem('وشەینهێنی')).toBeNull();
  });

  it('needs at least 8 characters', () => {
    expect(newPasswordProblem('Gym-202')).toBe('password_short');
  });

  it('refuses what bcrypt would cut off', () => {
    expect(newPasswordProblem('a'.repeat(72))).toBeNull();
    expect(newPasswordProblem('a'.repeat(73))).toBe('password_long');
    // 2 bytes per Kurdish letter
    expect(newPasswordProblem('ش'.repeat(37))).toBe('password_long');
  });

  it('matches the minimum length Supabase Auth checks', () => {
    const config = readFileSync(new URL('../../../supabase/config.toml', import.meta.url), 'utf8');
    expect(config).toContain(`minimum_password_length = ${String(MIN_PASSWORD_LENGTH)}`);
  });
});
