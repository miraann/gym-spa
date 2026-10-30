import { createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  authSigningKeys,
  newServerSecrets,
  publicKeySet,
  roleTokens,
  signToken,
} from '../src/keys.ts';

function parts(token: string): { header: unknown; payload: unknown; valid: boolean } {
  const [header = '', payload = '', signature = ''] = token.split('.');
  const decode = (part: string): unknown => JSON.parse(Buffer.from(part, 'base64url').toString());
  return { header: decode(header), payload: decode(payload), valid: signature !== '' };
}

describe('server keys', () => {
  const secrets = newServerSecrets();

  it('makes different passwords and keys for every server', () => {
    const other = newServerSecrets();
    expect(other.passwords.postgres).not.toBe(secrets.passwords.postgres);
    expect(other.signingKey.d).not.toBe(secrets.signingKey.d);
    expect(other.secretKey).not.toBe(secrets.secretKey);
    expect(secrets.secretKey).toMatch(/^sb_secret_[\w-]{40,}$/);
  });

  it('signs ES256 tokens that the published public key verifies', () => {
    const token = signToken(secrets, { role: 'anon' });
    const [header = '', payload = '', signature = ''] = token.split('.');
    const [jwk] = publicKeySet(secrets).keys;
    const key = createPublicKey({ key: jwk as never, format: 'jwk' });
    const ok = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
    expect(ok).toBe(true);
    expect(parts(token).header).toEqual({ alg: 'ES256', typ: 'JWT', kid: secrets.signingKey.kid });
  });

  it('publishes only the public half', () => {
    const set = publicKeySet(secrets);
    expect(set.keys).toHaveLength(1);
    expect(set.keys[0]).not.toHaveProperty('d');
    expect(set.keys[0]).toMatchObject({ kid: secrets.signingKey.kid, alg: 'ES256', use: 'sig' });
  });

  it('gives Auth the private key in the form the Supabase CLI does', () => {
    const [key] = JSON.parse(authSigningKeys(secrets)) as Record<string, unknown>[];
    expect(key).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      alg: 'ES256',
      use: 'sig',
      key_ops: ['sign', 'verify'],
      kid: secrets.signingKey.kid,
    });
    expect(key).toHaveProperty('d');
  });

  it('makes the anon and service tokens with their roles, for 10 years', () => {
    const now = Date.UTC(2026, 9, 30);
    const { anon, service } = roleTokens(secrets, now);
    const iat = now / 1000;
    expect(parts(anon).payload).toEqual({
      iss: 'gym-server',
      role: 'anon',
      iat,
      exp: iat + 10 * 365 * 24 * 60 * 60,
    });
    expect(parts(service).payload).toMatchObject({ role: 'service_role' });
  });
});
