import { describe, expect, it } from 'vitest';
import { normalizePairingCode, pairingProof, serverIdentity } from './pairing.ts';

const FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).padStart(2, '0').toUpperCase(),
).join(':');
const OTHER = FINGERPRINT.replace(/^00/, 'FF');

describe('serverIdentity', () => {
  it('is the first 40 bits of the fingerprint, in the machine code alphabet', () => {
    // 00 01 02 03 04 → 00000 00000 00000 10000 00100 00000 11000 00100 → 0 0 0 16 4 0 24 4
    expect(serverIdentity(FINGERPRINT)).toBe('000G-40R4');
    expect(serverIdentity(OTHER)).not.toBe(serverIdentity(FINGERPRINT));
    expect(serverIdentity(OTHER)).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('refuses anything but a SHA-256 fingerprint', () => {
    expect(() => serverIdentity('AB:CD')).toThrow('Not a SHA-256 fingerprint');
    expect(() => serverIdentity(FINGERPRINT.toLowerCase())).toThrow();
  });
});

describe('pairingProof', () => {
  it('is the same for the same code and certificate, and differs otherwise', async () => {
    const proof = await pairingProof('482193', FINGERPRINT);
    expect(proof).toMatch(/^[\w-]{43}$/);
    expect(await pairingProof('482193', FINGERPRINT)).toBe(proof);
    expect(await pairingProof('482194', FINGERPRINT)).not.toBe(proof);
    expect(await pairingProof('482193', OTHER)).not.toBe(proof);
  });
});

describe('normalizePairingCode', () => {
  it('takes six digits however they were typed', () => {
    expect(normalizePairingCode('482193')).toBe('482193');
    expect(normalizePairingCode(' 482-193 ')).toBe('482193');
    expect(normalizePairingCode('٤٨٢١٩٣')).toBe('482193');
    expect(normalizePairingCode('۴۸۲۱۹۳')).toBe('482193');
  });

  it('refuses anything else', () => {
    expect(normalizePairingCode('48219')).toBeNull();
    expect(normalizePairingCode('4821933')).toBeNull();
    expect(normalizePairingCode('48a193')).toBeNull();
    expect(normalizePairingCode('')).toBeNull();
  });
});
