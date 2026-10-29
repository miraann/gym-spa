// The public halves of Click Group's license signing keys (spec §2.6, offline licenses), by kid.
// Only public keys are ever written here: the private key lives in the seller-admin Edge Function's
// secrets and on Click Group's encrypted backup, never in the repo (README → Licenses).
//
// Adding a key: `pnpm license:new-key` writes its line here. Keep every key that signed a license
// still in use, so those licenses keep working.
// A leaked key: move its kid from LICENSE_PUBLIC_KEYS to REVOKED_LICENSE_KIDS in the next release,
// after every license and activation has been issued again with a new key.

/** kid → the raw 32-byte Ed25519 public key, base64url. Never a `test-` kid (a test checks). */
export const LICENSE_PUBLIC_KEYS: Readonly<Record<string, string>> = {};

/** Kids that must never be accepted again (a leaked key). */
export const REVOKED_LICENSE_KIDS: readonly string[] = [];
