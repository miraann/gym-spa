// Pairing a PC with the offline edition's server (spec §8, step OF-d). The server screen shows a
// 6-digit code and the server's identity; the new PC shows the identity of the certificate it
// sees, and the person checks that both screens show the same one. The PC then proves it knows the
// code for that certificate: an HMAC of the fingerprint keyed by the code. A different certificate
// in between (someone on the network pretending to be the server) gives a different identity on
// the PC's screen and a proof the server refuses. The code alone (a million values) could be
// guessed offline from a proof; the 8-character identity (40 bits) can't be matched by making
// certificates in the 10 minutes a code lives.

import { MACHINE_CODE_ALPHABET } from './license.ts';

/** How long a pairing code works. */
export const PAIRING_CODE_MINUTES = 10;
/** Wrong codes before a code stops working (a new one must be made). */
export const PAIRING_CODE_TRIES = 5;

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PAIRING_CODE = /^\d{6}$/;

export function isFingerprint(value: string): boolean {
  return FINGERPRINT.test(value);
}

/** Digits as the person typed them: Kurdish and Arabic digits too, spaces and dashes ignored. */
export function normalizePairingCode(input: string): string | null {
  const latin = input
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\s-]/g, '');
  return PAIRING_CODE.test(latin) ? latin : null;
}

function fingerprintBytes(fingerprint: string): Uint8Array {
  if (!isFingerprint(fingerprint)) throw new Error('Not a SHA-256 fingerprint');
  return Uint8Array.from(fingerprint.split(':'), (pair) => Number.parseInt(pair, 16));
}

/** The server's identity, XXXX-XXXX: the first 40 bits of its certificate's fingerprint. */
export function serverIdentity(fingerprint: string): string {
  const bytes = fingerprintBytes(fingerprint);
  let bits = 0;
  let value = 0;
  let text = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && text.length < 8) {
      text += MACHINE_CODE_ALPHABET[(value >> (bits - 5)) & 31] ?? '0';
      bits -= 5;
    }
    value &= (1 << bits) - 1;
    if (text.length === 8) break;
  }
  return `${text.slice(0, 4)}-${text.slice(4)}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** What the PC sends: HMAC-SHA256 of the fingerprint it sees, keyed by the code (base64url). */
export async function pairingProof(code: string, fingerprint: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`gym-spa pairing v1\n${code}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(fingerprint));
  return base64Url(new Uint8Array(mac));
}
