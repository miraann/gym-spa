import { createPrivateKey, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';

// The server's own keys and passwords, made once when its database is created. Auth signs
// sessions with an ES256 key, like the cloud project, so it publishes a key set that PostgREST and
// the staff module check tokens against (spec §2.5). The anon and service tokens are signed with
// the same key; the service token never leaves the server PC.

/** A P-256 private key as a JWK (with its public half). */
export interface EcPrivateJwk {
  readonly kty: 'EC';
  readonly crv: 'P-256';
  readonly x: string;
  readonly y: string;
  readonly d: string;
}

export interface ServerSecrets {
  readonly version: 1;
  readonly passwords: {
    /** The superuser, as on Supabase. */
    readonly supabaseAdmin: string;
    /** Runs our migrations; owns the database. */
    readonly postgres: string;
    /** Supabase Auth's own login. */
    readonly authAdmin: string;
    /** PostgREST's login. */
    readonly authenticator: string;
  };
  /** Auth's session signing key. */
  readonly signingKey: EcPrivateJwk & { readonly kid: string };
  /** Auth requires a symmetric secret too; nothing is signed with it while a key is set. */
  readonly jwtSecret: string;
  /** For the server PC's own tools (loopback only): the gateway swaps it for the service token. */
  readonly secretKey: string;
}

/**
 * What the app sends as its key. Public by design, like Supabase's publishable keys: the gateway
 * swaps it for the anon token. It is the same for every offline server, so one build of the app
 * works with any gym's server; what keeps other devices out is the PC's pairing (OF-d).
 */
export const OFFLINE_PUBLISHABLE_KEY = 'sb_publishable_gym-spa-offline';

const random = (bytes = 24) => randomBytes(bytes).toString('base64url');

export function newServerSecrets(): ServerSecrets {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  if (!jwk.x || !jwk.y || !jwk.d) throw new Error('The new signing key has no coordinates.');
  return {
    version: 1,
    passwords: {
      supabaseAdmin: random(),
      postgres: random(),
      authAdmin: random(),
      authenticator: random(),
    },
    signingKey: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, kid: randomUUID() },
    jwtSecret: random(48),
    secretKey: `sb_secret_${random(32)}`,
  };
}

/** GOTRUE_JWT_KEYS: the private key Auth signs with, in the form Supabase's CLI gives it. */
export function authSigningKeys(secrets: ServerSecrets): string {
  return JSON.stringify([
    { ...secrets.signingKey, use: 'sig', key_ops: ['sign', 'verify'], alg: 'ES256', ext: true },
  ]);
}

/** The public key set (JWKS) that PostgREST checks tokens against. */
export function publicKeySet(secrets: ServerSecrets): { keys: Record<string, unknown>[] } {
  const { kty, crv, x, y, kid } = secrets.signingKey;
  return { keys: [{ kty, crv, x, y, kid, use: 'sig', key_ops: ['verify'], alg: 'ES256' }] };
}

/** An ES256 JWT signed with the server's key. */
export function signToken(secrets: ServerSecrets, payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = { alg: 'ES256', typ: 'JWT', kid: secrets.signingKey.kid };
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const key = createPrivateKey({ key: { ...secrets.signingKey }, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}

/** The anon and service_role tokens the gateway puts in place of the two keys (10 years). */
export function roleTokens(
  secrets: ServerSecrets,
  now: number = Date.now(),
): { anon: string; service: string } {
  const iat = Math.floor(now / 1000);
  const exp = iat + 10 * 365 * 24 * 60 * 60;
  return {
    anon: signToken(secrets, { iss: 'gym-server', role: 'anon', iat, exp }),
    service: signToken(secrets, { iss: 'gym-server', role: 'service_role', iat, exp }),
  };
}
