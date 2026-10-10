import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

// The first check of every staff-admin request (defense in depth): the bearer token must be a
// staff session of this project, signed with one of its keys (its JWKS) and not expired. Done
// before any database call and long before the secret key is used. The database still makes the
// real permission checks under the same token.

/** What a token check found. unavailable: the project's keys could not be read. */
export type TokenCheck =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: 'invalid' | 'expired' | 'not_staff' | 'unavailable' };

export type TokenVerifier = (token: string) => Promise<TokenCheck>;

/**
 * The signature algorithms Supabase Auth can sign sessions with (local and cloud use ES256). A
 * symmetric token (HS256, like the legacy anon and service_role keys) never passes either way: a
 * key set holds only public keys, and jose refuses symmetric algorithms with one.
 */
export const TOKEN_ALGORITHMS = ['ES256', 'RS256', 'EdDSA'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Errors that mean "the keys could not be read", not "the token is bad". */
function keysUnavailable(error: unknown): boolean {
  return (
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid ||
    !(error instanceof errors.JOSEError)
  );
}

/** Checks tokens against these keys. */
export function jwksTokenVerifier(keys: JWTVerifyGetKey): TokenVerifier {
  return async (token) => {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, keys, {
        algorithms: [...TOKEN_ALGORITHMS],
        requiredClaims: ['exp', 'sub', 'role'],
      }));
    } catch (error) {
      if (error instanceof errors.JWTExpired) return { ok: false, reason: 'expired' };
      if (keysUnavailable(error)) return { ok: false, reason: 'unavailable' };
      return { ok: false, reason: 'invalid' };
    }
    // A logged-in user: not the anon or service_role key, and not an anonymous sign-in.
    if (
      payload.role !== 'authenticated' ||
      payload.is_anonymous === true ||
      typeof payload.sub !== 'string' ||
      !UUID.test(payload.sub)
    ) {
      return { ok: false, reason: 'not_staff' };
    }
    return { ok: true, userId: payload.sub };
  };
}

/**
 * Checks tokens against the project's published keys (<url>/auth/v1/.well-known/jwks.json). The
 * keys are fetched on first use and kept; a token signed with a new key fetches them again.
 */
export function projectTokenVerifier(url: string): TokenVerifier {
  const base = url.endsWith('/') ? url : `${url}/`;
  return jwksTokenVerifier(createRemoteJWKSet(new URL('auth/v1/.well-known/jwks.json', base)));
}
