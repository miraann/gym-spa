import { addMonthsToDate, baghdadDateOf, billingStageFor, paidUntilFromDate } from './billing.ts';
import type { BillingStage } from './billing.ts';
import { toLatinDigits } from './digits.ts';
import { GYM_CODE_PATTERN } from './gym.ts';
import { LICENSE_PUBLIC_KEYS, REVOKED_LICENSE_KIDS } from './license-keys.ts';

// Offline licenses (spec §2.6, step MT-5): the codes the seller panel issues and the offline server
// checks. One module for every side: the seller-admin Edge Function signs (Deno), the offline
// server verifies (Node), the seller panel words the dates. Ed25519 through WebCrypto, so no
// library and the same code everywhere.
//
//   license     GSL1.<payload>.<signature>
//   activation  GSA1.<payload>.<signature>
//
// The payload is base64url (no padding) of UTF-8 JSON with short keys; the signature is Ed25519
// over the ASCII text "GSL1.<payload>" (or "GSA1.…"), so one kind can never pass as the other. The
// database compares the payload of every code it stores with its own fields (migration
// 20261030100000_licenses), so the keys here and there must match.

export const LICENSE_PREFIX = 'GSL1';
export const ACTIVATION_PREFIX = 'GSA1';

/** Longer codes are refused before any decoding (a real license is about 350 characters). */
export const MAX_LICENSE_CODE_LENGTH = 2000;

/** A key's id: 3 to 32 of a-z, 0-9 and "-", starting and ending with a letter or digit. */
export const LICENSE_KID_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/** Throwaway local keys (`pnpm db:functions` makes one). No shipped server knows them. */
export function isTestLicenseKid(kid: string): boolean {
  return kid.startsWith('test-');
}

export const LICENSE_TYPES = ['yearly', 'perpetual'] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

/** The furthest a yearly license may end (an early renewal still fits), in months from its issue. */
export const YEARLY_MAX_MONTHS = 24;
/** The furthest a perpetual license's updates may run, in months from its issue. */
export const PERPETUAL_MAX_MONTHS = 60;
/** Max branches and devices a license may name (null: no limit, as for online gyms). */
export const LICENSE_MAX_LIMIT = 10_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FEATURE_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_FEATURES = 20;

export interface License {
  readonly licenseId: string;
  readonly kid: string;
  readonly gymId: string;
  readonly gymCode: string;
  /** The gym's Kurdish name. */
  readonly gymName: string;
  readonly type: LicenseType;
  /** Null: no limit. */
  readonly maxBranches: number | null;
  readonly maxDevices: number | null;
  /** Edition features. None are defined yet: every license has all of them, and the list is empty. */
  readonly features: readonly string[];
  /** Baghdad calendar dates (YYYY-MM-DD); a date means the end of that day in Baghdad. */
  readonly issuedOn: string;
  /** Yearly: the last day it works before the grace period. Null for perpetual. */
  readonly expiresOn: string | null;
  /** Perpetual: the last build date it may install. Null for yearly. */
  readonly updatesUntil: string | null;
}

/** Binds a gym to its server PC (not to one license: a renewal needs only a new license code). */
export interface Activation {
  readonly activationId: string;
  readonly kid: string;
  readonly gymId: string;
  /** Normalized: 20 characters, no dashes (normalizeMachineCode). */
  readonly machineCode: string;
  readonly issuedOn: string;
}

// Base64url and bytes ---------------------------------------------------------------------------

/** Bytes WebCrypto accepts (Uint8Array<ArrayBuffer> in newer TypeScript; not generic in Deno's). */
type Bytes = ReturnType<InstanceType<typeof TextEncoder>['encode']>;
/** WebCrypto's key type (named so in browsers and Deno; Node's types keep it under webcrypto). */
type WebCryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Null unless it is canonical base64url without padding (one spelling per value). */
function fromBase64Url(text: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  let binary: string;
  try {
    binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return toBase64Url(bytes) === text ? bytes : null;
}

function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

function isValidDate(date: unknown): date is string {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) return false;
  try {
    paidUntilFromDate(date);
    return true;
  } catch {
    return false;
  }
}

function isLimit(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= LICENSE_MAX_LIMIT)
  );
}

/** Like app.is_clean_text(): 1 to max characters, no space at either end. */
function isCleanText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.length >= 1 && value.length <= max && !/^\s|\s$/.test(value)
  );
}

// Payloads --------------------------------------------------------------------------------------

/** The license's payload object, keys in a fixed order (the database builds the same one). */
export function licensePayload(license: License): Record<string, unknown> {
  return {
    v: 1,
    lid: license.licenseId,
    kid: license.kid,
    gid: license.gymId,
    gc: license.gymCode,
    gn: license.gymName,
    t: license.type,
    mb: license.maxBranches,
    md: license.maxDevices,
    f: [...license.features],
    iat: license.issuedOn,
    ...(license.type === 'yearly' ? { exp: license.expiresOn } : { upd: license.updatesUntil }),
  };
}

export function activationPayload(activation: Activation): Record<string, unknown> {
  return {
    v: 1,
    aid: activation.activationId,
    kid: activation.kid,
    gid: activation.gymId,
    mc: activation.machineCode,
    iat: activation.issuedOn,
  };
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Why a license's own fields can't be signed or accepted, or null when they are fine. */
export function licenseProblem(license: License): string | null {
  if (!UUID_PATTERN.test(license.licenseId)) return 'license id';
  if (!LICENSE_KID_PATTERN.test(license.kid)) return 'kid';
  if (!UUID_PATTERN.test(license.gymId)) return 'gym id';
  if (!GYM_CODE_PATTERN.test(license.gymCode) || license.gymCode.length > 20) return 'gym code';
  if (!isCleanText(license.gymName, 100)) return 'gym name';
  if (!LICENSE_TYPES.includes(license.type)) return 'type';
  if (!isLimit(license.maxBranches) || !isLimit(license.maxDevices)) return 'limits';
  if (
    license.features.length > MAX_FEATURES ||
    new Set(license.features).size !== license.features.length ||
    !license.features.every((feature) => FEATURE_PATTERN.test(feature))
  ) {
    return 'features';
  }
  if (!isValidDate(license.issuedOn)) return 'issue date';
  if (license.type === 'yearly') {
    if (license.updatesUntil !== null || !isValidDate(license.expiresOn)) return 'expiry date';
  } else if (license.expiresOn !== null || !isValidDate(license.updatesUntil)) {
    return 'updates date';
  }
  return null;
}

function licenseFromPayload(value: unknown): License | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const yearly = value.t === 'yearly';
  const keys = [
    'v',
    'lid',
    'kid',
    'gid',
    'gc',
    'gn',
    't',
    'mb',
    'md',
    'f',
    'iat',
    yearly ? 'exp' : 'upd',
  ];
  if (!hasExactKeys(value, keys)) return null;
  const { lid, kid, gid, gc, gn, t, mb, md, f, iat, exp, upd } = value;
  if (
    typeof lid !== 'string' ||
    typeof kid !== 'string' ||
    typeof gid !== 'string' ||
    typeof gc !== 'string' ||
    typeof gn !== 'string' ||
    (t !== 'yearly' && t !== 'perpetual') ||
    !isLimit(mb) ||
    !isLimit(md) ||
    !Array.isArray(f) ||
    !f.every((feature): feature is string => typeof feature === 'string') ||
    typeof iat !== 'string'
  ) {
    return null;
  }
  const license: License = {
    licenseId: lid,
    kid,
    gymId: gid,
    gymCode: gc,
    gymName: gn,
    type: t,
    maxBranches: mb,
    maxDevices: md,
    features: f,
    issuedOn: iat,
    expiresOn: yearly && typeof exp === 'string' ? exp : null,
    updatesUntil: !yearly && typeof upd === 'string' ? upd : null,
  };
  return licenseProblem(license) === null ? license : null;
}

/** Why an activation's fields can't be signed or accepted, or null when they are fine. */
export function activationProblem(activation: Activation): string | null {
  if (!UUID_PATTERN.test(activation.activationId)) return 'activation id';
  if (!LICENSE_KID_PATTERN.test(activation.kid)) return 'kid';
  if (!UUID_PATTERN.test(activation.gymId)) return 'gym id';
  if (normalizeMachineCode(activation.machineCode) !== activation.machineCode)
    return 'machine code';
  if (!isValidDate(activation.issuedOn)) return 'issue date';
  return null;
}

function activationFromPayload(value: unknown): Activation | null {
  if (!isRecord(value) || value.v !== 1) return null;
  if (!hasExactKeys(value, ['v', 'aid', 'kid', 'gid', 'mc', 'iat'])) return null;
  const { aid, kid, gid, mc, iat } = value;
  if (
    typeof aid !== 'string' ||
    typeof kid !== 'string' ||
    typeof gid !== 'string' ||
    typeof mc !== 'string' ||
    typeof iat !== 'string'
  ) {
    return null;
  }
  const activation: Activation = {
    activationId: aid,
    kid,
    gymId: gid,
    machineCode: mc,
    issuedOn: iat,
  };
  return activationProblem(activation) === null ? activation : null;
}

// Codes -----------------------------------------------------------------------------------------

interface SplitCode {
  readonly signingInput: string;
  readonly payload: unknown;
  readonly signature: Bytes;
}

/** A code's parts, without checking the signature. Null when it isn't a code of this kind. */
function splitCode(code: string, prefix: string): SplitCode | null {
  const text = code.trim();
  if (text.length > MAX_LICENSE_CODE_LENGTH) return null;
  const parts = text.split('.');
  if (parts.length !== 3 || parts[0] !== prefix) return null;
  const [, payloadText = '', signatureText = ''] = parts;
  const payloadBytes = fromBase64Url(payloadText);
  const signature = fromBase64Url(signatureText);
  if (payloadBytes === null || signature?.length !== 64) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes));
  } catch {
    return null;
  }
  return { signingInput: `${prefix}.${payloadText}`, payload, signature };
}

/** A license code's contents, without checking its signature (for showing it, never for trusting it). */
export function readLicenseCode(code: string): License | null {
  const split = splitCode(code, LICENSE_PREFIX);
  return split === null ? null : licenseFromPayload(split.payload);
}

/** An activation code's contents, without checking its signature. */
export function readActivationCode(code: string): Activation | null {
  const split = splitCode(code, ACTIVATION_PREFIX);
  return split === null ? null : activationFromPayload(split.payload);
}

/** Why a code was refused. */
export type LicenseCodeProblem =
  /** Not a code of this kind, or its contents are malformed. */
  | 'format'
  /** Signed by a key this program doesn't know (or a local test key). */
  | 'unknown_key'
  /** Signed by a key that leaked. */
  | 'revoked_key'
  /** The signature doesn't match: changed or forged. */
  | 'signature';

export type Checked<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: LicenseCodeProblem };

/** kid → raw public key (base64url). Production code passes LICENSE_PUBLIC_KEYS. */
export type LicensePublicKeys = Readonly<Record<string, string>>;

export interface LicenseKeyRing {
  readonly publicKeys: LicensePublicKeys;
  readonly revoked: readonly string[];
}

export const SHIPPED_LICENSE_KEYS: LicenseKeyRing = {
  publicKeys: LICENSE_PUBLIC_KEYS,
  revoked: REVOKED_LICENSE_KIDS,
};

async function importPublicKey(raw: string): Promise<WebCryptoKey | null> {
  const bytes = fromBase64Url(raw);
  if (bytes?.length !== 32) return null;
  try {
    return await crypto.subtle.importKey('raw', bytes, { name: 'Ed25519' }, false, ['verify']);
  } catch {
    return null;
  }
}

async function checkSigned<T extends { readonly kid: string }>(
  code: string,
  prefix: string,
  read: (payload: unknown) => T | null,
  keys: LicenseKeyRing,
): Promise<Checked<T>> {
  const split = splitCode(code, prefix);
  const value = split === null ? null : read(split.payload);
  if (split === null || value === null) return { ok: false, problem: 'format' };
  if (keys.revoked.includes(value.kid)) return { ok: false, problem: 'revoked_key' };
  const raw = Object.hasOwn(keys.publicKeys, value.kid) ? keys.publicKeys[value.kid] : undefined;
  const key = raw === undefined ? null : await importPublicKey(raw);
  if (key === null) return { ok: false, problem: 'unknown_key' };
  const valid = await crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    split.signature,
    utf8(split.signingInput),
  );
  return valid ? { ok: true, value } : { ok: false, problem: 'signature' };
}

/** A license code checked against the keys: its contents only when the signature is good. */
export function verifyLicenseCode(code: string, keys: LicenseKeyRing = SHIPPED_LICENSE_KEYS) {
  return checkSigned(code, LICENSE_PREFIX, licenseFromPayload, keys);
}

/** An activation code checked against the keys. The caller compares its gym and machine code. */
export function verifyActivationCode(code: string, keys: LicenseKeyRing = SHIPPED_LICENSE_KEYS) {
  return checkSigned(code, ACTIVATION_PREFIX, activationFromPayload, keys);
}

// Signing ---------------------------------------------------------------------------------------

/** A loaded signing key. The private half stays inside the CryptoKey and is never exported. */
export interface LicenseSigningKey {
  readonly kid: string;
  /** The raw public key, base64url, as LICENSE_PUBLIC_KEYS holds it. */
  readonly publicKey: string;
  sign(data: Bytes): Promise<Bytes>;
}

export type LicenseKeyProblem =
  /** Not an Ed25519 private key JWK with a valid kid, or its halves don't belong together. */
  | 'invalid'
  /** Its kid is in REVOKED_LICENSE_KIDS. */
  | 'revoked'
  /** Not a test key, and its public half isn't the one in LICENSE_PUBLIC_KEYS (not shipped yet). */
  | 'not_shipped';

/** Never carries any part of the key: only why it can't be used. */
export class LicenseKeyError extends Error {
  override readonly name = 'LicenseKeyError';
  constructor(readonly problem: LicenseKeyProblem) {
    super(`license signing key: ${problem}`);
  }
}

/**
 * Loads the signing key from its JWK text (the LICENSE_SIGNING_KEY secret) and checks it before it
 * signs anything: its two halves belong together, its kid isn't revoked, and unless it's a test
 * key, its public half is the shipped one, so no server ever gets a code it can't check.
 */
export async function importLicenseSigningKey(
  jwkText: string,
  keys: LicenseKeyRing = SHIPPED_LICENSE_KEYS,
): Promise<LicenseSigningKey> {
  let jwk: unknown;
  try {
    jwk = JSON.parse(jwkText);
  } catch {
    throw new LicenseKeyError('invalid');
  }
  if (
    !isRecord(jwk) ||
    jwk.kty !== 'OKP' ||
    jwk.crv !== 'Ed25519' ||
    typeof jwk.d !== 'string' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.kid !== 'string' ||
    !LICENSE_KID_PATTERN.test(jwk.kid)
  ) {
    throw new LicenseKeyError('invalid');
  }
  const { kid, x, d } = jwk;
  if (keys.revoked.includes(kid)) throw new LicenseKeyError('revoked');
  const shipped = Object.hasOwn(keys.publicKeys, kid) ? keys.publicKeys[kid] : undefined;
  if (shipped !== x && !isTestLicenseKid(kid)) throw new LicenseKeyError('not_shipped');

  let privateKey: WebCryptoKey;
  const publicKey = await importPublicKey(x);
  try {
    privateKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', d, x },
      { name: 'Ed25519' },
      false,
      ['sign'],
    );
  } catch {
    throw new LicenseKeyError('invalid');
  }
  if (publicKey === null) throw new LicenseKeyError('invalid');

  const sign = async (data: Bytes): Promise<Bytes> =>
    new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, data));
  // The halves belong together: what the private half signs, the public half accepts.
  const probe = utf8(`gym-spa license key check ${kid}`);
  if (!(await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, await sign(probe), probe))) {
    throw new LicenseKeyError('invalid');
  }
  return { kid, publicKey: x, sign };
}

async function signPayload(
  prefix: string,
  payload: Record<string, unknown>,
  key: LicenseSigningKey,
): Promise<string> {
  const signingInput = `${prefix}.${toBase64Url(utf8(JSON.stringify(payload)))}`;
  const signature = await key.sign(utf8(signingInput));
  return `${signingInput}.${toBase64Url(signature)}`;
}

/**
 * The signed license code. The caller then verifies it with the key's public half (as every server
 * will) before handing it out.
 */
export function signLicense(license: License, key: LicenseSigningKey): Promise<string> {
  const problem = licenseProblem(license);
  if (problem !== null) throw new Error(`Invalid license: ${problem}`);
  if (license.kid !== key.kid) throw new Error('The license names another key');
  return signPayload(LICENSE_PREFIX, licensePayload(license), key);
}

export function signActivation(activation: Activation, key: LicenseSigningKey): Promise<string> {
  const problem = activationProblem(activation);
  if (problem !== null) throw new Error(`Invalid activation: ${problem}`);
  if (activation.kid !== key.kid) throw new Error('The activation names another key');
  return signPayload(ACTIVATION_PREFIX, activationPayload(activation), key);
}

/** The ring of exactly one key, to check what it signed. */
export function keyRingOf(key: Pick<LicenseSigningKey, 'kid' | 'publicKey'>): LicenseKeyRing {
  return { publicKeys: { [key.kid]: key.publicKey }, revoked: [] };
}

function isKeyPair(value: unknown): value is { readonly privateKey: WebCryptoKey } {
  return typeof value === 'object' && value !== null && 'privateKey' in value;
}

/**
 * A new key pair, for the key scripts only (`pnpm license:new-key`, the local test key). The
 * private JWK text goes straight into a secret or an encrypted file; never print or log it.
 */
export async function generateLicenseKey(
  kid: string,
): Promise<{ privateJwk: string; publicKey: string }> {
  if (!LICENSE_KID_PATTERN.test(kid)) throw new Error('A kid has 3 to 32 of a-z, 0-9 and "-"');
  const pair: unknown = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  if (!isKeyPair(pair)) throw new Error('No Ed25519 key pair');
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  if (typeof jwk.d !== 'string' || typeof jwk.x !== 'string') throw new Error('No Ed25519 key');
  return {
    privateJwk: JSON.stringify({ kty: 'OKP', crv: 'Ed25519', d: jwk.d, x: jwk.x, kid }),
    publicKey: jwk.x,
  };
}

// Dates -----------------------------------------------------------------------------------------

/** Why a license's end date (expiry or updates-until) can't be chosen, or null when it can. */
export function licenseDateProblem(
  type: LicenseType,
  issuedOn: string,
  validUntil: string,
): 'invalid_date' | 'too_soon' | 'too_far' | null {
  if (!isValidDate(issuedOn) || !isValidDate(validUntil)) return 'invalid_date';
  if (validUntil <= issuedOn) return 'too_soon';
  const furthest = addMonthsToDate(
    issuedOn,
    type === 'yearly' ? YEARLY_MAX_MONTHS : PERPETUAL_MAX_MONTHS,
  );
  return validUntil > furthest ? 'too_far' : null;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

/** A license's state now, in Baghdad days, for the warnings (30/7/1 days, as for subscriptions). */
export type LicenseState =
  /** Works. stage and daysLeft count to the end of a yearly license; null for perpetual. */
  | {
      readonly kind: 'active';
      readonly daysLeft: number | null;
      readonly stage: BillingStage | null;
    }
  /** A yearly license ended; everything still works for daysLeft more days (30 in all). */
  | { readonly kind: 'grace'; readonly daysLeft: number; readonly readOnlyOn: string }
  /** Read-only: the grace period ended. */
  | { readonly kind: 'expired' };

/** Grace after a yearly license ends (the same 30 days as an online subscription). */
export const LICENSE_GRACE_DAYS = 30;

export function licenseState(
  license: Pick<License, 'type' | 'expiresOn'>,
  now: Date | number = Date.now(),
): LicenseState {
  if (license.type === 'perpetual' || license.expiresOn === null) {
    return { kind: 'active', daysLeft: null, stage: null };
  }
  const today = dayNumber(baghdadDateOf(now));
  // Days until the first day it no longer works (1 on its last day).
  const daysLeft = dayNumber(license.expiresOn) + 1 - today;
  if (daysLeft >= 1) return { kind: 'active', daysLeft, stage: billingStageFor(daysLeft) };
  const graceLeft = daysLeft + LICENSE_GRACE_DAYS;
  if (graceLeft >= 1) {
    const readOnlyOn = new Date((dayNumber(license.expiresOn) + 1 + LICENSE_GRACE_DAYS) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return { kind: 'grace', daysLeft: graceLeft, readOnlyOn };
  }
  return { kind: 'expired' };
}

/** A perpetual license's updates: the warnings before "updates until", and after it. */
export type LicenseUpdates =
  | { readonly kind: 'none' }
  | { readonly kind: 'ending'; readonly daysLeft: number; readonly stage: BillingStage }
  | { readonly kind: 'ended' };

export function licenseUpdates(
  license: Pick<License, 'type' | 'updatesUntil'>,
  now: Date | number = Date.now(),
): LicenseUpdates {
  if (license.type !== 'perpetual' || license.updatesUntil === null) return { kind: 'none' };
  const daysLeft = dayNumber(license.updatesUntil) + 1 - dayNumber(baghdadDateOf(now));
  if (daysLeft < 1) return { kind: 'ended' };
  const stage = billingStageFor(daysLeft);
  return stage === null ? { kind: 'none' } : { kind: 'ending', daysLeft, stage };
}

// Machine codes ---------------------------------------------------------------------------------
// What the offline server shows and the seller panel turns into an activation code: 16 characters
// from SHA-256 of the Windows machine id and the motherboard serial, plus 4 check characters, in
// Crockford base32 (no I, L, O, U), shown XXXX-XXXX-XXXX-XXXX-XXXX. The check catches any one
// wrong character and any two swapped neighbours. app.normalize_machine_code() in Postgres is the
// same; a shared list of cases keeps them equal.

export const MACHINE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const MACHINE_CODE_LENGTH = 20;
const MACHINE_DATA_LENGTH = 16;
/** A prime just under 2^20, so the check fits in 4 characters. */
const MACHINE_CHECK_MODULUS = 1_048_573;

function machineCheck(data: string): string {
  let check = 0;
  for (const character of data) {
    check = (check * 33 + MACHINE_CODE_ALPHABET.indexOf(character) + 1) % MACHINE_CHECK_MODULUS;
  }
  let text = '';
  for (let index = 0; index < 4; index += 1) {
    text = (MACHINE_CODE_ALPHABET[check % 32] ?? '0') + text;
    check = Math.floor(check / 32);
  }
  return text;
}

/**
 * The machine code as stored and signed (20 characters, no dashes), or null when it can't be one.
 * Forgiving with what people type: lowercase, spaces and dashes, O for 0, I or L for 1, Kurdish and
 * Arabic digits.
 */
export function normalizeMachineCode(input: string): string | null {
  const code = toLatinDigits(input)
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length !== MACHINE_CODE_LENGTH) return null;
  if (!/^[0-9A-HJKMNP-TV-Z]+$/.test(code)) return null;
  const data = code.slice(0, MACHINE_DATA_LENGTH);
  return machineCheck(data) === code.slice(MACHINE_DATA_LENGTH) ? code : null;
}

/** XXXX-XXXX-XXXX-XXXX-XXXX, for reading aloud and showing. */
export function formatMachineCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** The machine code of a PC, from its Windows machine id and motherboard serial. */
export async function machineCodeFrom(machineId: string, boardSerial: string): Promise<string> {
  const text = `gym-spa machine v1\n${machineId.trim().toLowerCase()}\n${boardSerial.trim().toUpperCase()}`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(text)));
  let bits = 0;
  let value = 0;
  let data = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && data.length < MACHINE_DATA_LENGTH) {
      data += MACHINE_CODE_ALPHABET[(value >> (bits - 5)) & 31] ?? '0';
      bits -= 5;
    }
    value &= (1 << bits) - 1;
    if (data.length === MACHINE_DATA_LENGTH) break;
  }
  return data + machineCheck(data);
}
