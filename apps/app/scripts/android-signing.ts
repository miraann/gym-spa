// The pieces of `pnpm android:new-key`, `android:restore-key` and `android:release` (spec §8,
// step 11b) that can be tested without a terminal: the encrypted backup of the key store, the
// release-signing file in the repository, the version code, reading fingerprints from the tools'
// output, and finding those tools. The key store and its password pass through here only in
// memory: never printed, logged, put on a command line or written to disk unencrypted.
import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** The key's name inside the key store. Gradle and the checks use it. */
export const KEY_ALIAS = 'gym-spa';
export const KEY_DNAME = 'CN=Click Group, O=Click Group, C=IQ';
export const KEY_SIZE = 4096;
/** 30 years: Google Play wants keys valid until after 22 October 2033. */
export const KEY_VALIDITY_DAYS = 30 * 365;
/** A long password: the backup may sit on a USB stick that gets lost. */
export const MIN_PASSWORD_LENGTH = 12;
/** The environment variables of the one Gradle (or keytool) run that needs the key store. */
export const KEYSTORE_ENV = 'GYM_ANDROID_KEYSTORE';
export const PASSWORD_ENV = 'GYM_ANDROID_KEYSTORE_PASSWORD';

export const BACKUP_FORMAT = 'gym-spa-android-key-backup';
export const BACKUP_EXTENSION = '.gsakey';

/** Where the key store lives on Click Group's PC: outside the repository, this Windows user only. */
export function defaultKeyStorePath(home: string = homedir()): string {
  return path.join(home, '.gym-spa', 'android', 'gym-spa-release.p12');
}

/** Whether `target` is `folder` or inside it. */
export function isInside(target: string, folder: string): boolean {
  const relative = path.relative(path.resolve(folder), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// The backup ---------------------------------------------------------------------------------------
// The same scheme as the license key backup (supabase/scripts/license-key-backup.ts), kept as its
// own code so a change here can never change the license backup format by accident.

/** scrypt with 128 MiB of memory: slow to guess on any hardware, under a second here. */
const KDF = { name: 'scrypt', N: 2 ** 17, r: 8, p: 1 } as const;
const MAX_MEMORY = 256 * 1024 * 1024;

export interface KeyStoreBackup {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: 1;
  readonly alias: string;
  /** The certificate's SHA-256 fingerprint (public): which key this is, without the password. */
  readonly certificateSha256: string;
  readonly createdAt: string;
  readonly kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  readonly cipher: { name: 'aes-256-gcm'; iv: string; tag: string };
  /** The PKCS12 key store file, encrypted. */
  readonly data: string;
}

export class SigningError extends Error {
  override readonly name = 'SigningError';
}

function derive(password: string, salt: Buffer, kdf: { N: number; r: number; p: number }): Buffer {
  return scryptSync(password.normalize('NFC'), salt, 32, { ...kdf, maxmem: MAX_MEMORY });
}

/** The clear fields are bound to the ciphertext: changing any of them makes decrypting fail. */
function associatedData(backup: Omit<KeyStoreBackup, 'cipher' | 'data'>): Buffer {
  return Buffer.from(
    JSON.stringify([
      backup.format,
      backup.version,
      backup.alias,
      backup.certificateSha256,
      backup.createdAt,
      backup.kdf,
    ]),
  );
}

export function encryptKeyStore(
  keyStore: Buffer,
  certificateSha256: string,
  password: string,
  now: Date = new Date(),
): KeyStoreBackup {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header = {
    format: BACKUP_FORMAT,
    version: 1,
    alias: KEY_ALIAS,
    certificateSha256,
    createdAt: now.toISOString(),
    kdf: { ...KDF, salt: salt.toString('base64') },
  } as const;
  const cipher = createCipheriv('aes-256-gcm', derive(password, salt, KDF), iv);
  cipher.setAAD(associatedData(header));
  const data = Buffer.concat([cipher.update(keyStore), cipher.final()]);
  return {
    ...header,
    cipher: {
      name: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    },
    data: data.toString('base64'),
  };
}

/** Reads a backup file's text; throws SigningError when it isn't one. */
export function parseKeyStoreBackup(text: string): KeyStoreBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SigningError('This is not an Android key backup file.');
  }
  const backup = value as Partial<KeyStoreBackup> | null;
  if (
    backup?.format !== BACKUP_FORMAT ||
    backup.version !== 1 ||
    typeof backup.alias !== 'string' ||
    typeof backup.certificateSha256 !== 'string' ||
    typeof backup.createdAt !== 'string' ||
    backup.kdf?.name !== 'scrypt' ||
    backup.cipher?.name !== 'aes-256-gcm' ||
    typeof backup.data !== 'string'
  ) {
    throw new SigningError('This is not an Android key backup file.');
  }
  return backup as KeyStoreBackup;
}

/** The key store file; SigningError for a wrong password or a changed file (no difference). */
export function decryptKeyStore(backup: KeyStoreBackup, password: string): Buffer {
  try {
    const { kdf, cipher } = backup;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derive(password, Buffer.from(kdf.salt, 'base64'), kdf),
      Buffer.from(cipher.iv, 'base64'),
    );
    decipher.setAAD(associatedData(backup));
    decipher.setAuthTag(Buffer.from(cipher.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(backup.data, 'base64')), decipher.final()]);
  } catch {
    throw new SigningError('Wrong password, or the file was changed.');
  }
}

// The release-signing file (committed: only public facts) -------------------------------------------

/** apps/app/android/release-signing.json: which certificate every release must be signed with. */
export interface ReleaseSigning {
  readonly alias: string;
  readonly certificateSha256: string;
  readonly createdAt: string;
}

export function parseReleaseSigning(text: string): ReleaseSigning {
  const value = JSON.parse(text) as Partial<ReleaseSigning> | null;
  if (
    value?.alias !== KEY_ALIAS ||
    typeof value.certificateSha256 !== 'string' ||
    normalizeFingerprint(value.certificateSha256) !== value.certificateSha256 ||
    typeof value.createdAt !== 'string'
  ) {
    throw new SigningError('apps/app/android/release-signing.json is not valid.');
  }
  return value as ReleaseSigning;
}

export function releaseSigningText(signing: ReleaseSigning): string {
  return `${JSON.stringify(signing, null, 2)}\n`;
}

// Fingerprints -----------------------------------------------------------------------------------

/** "ab cd…", "abcd…" or "AB:CD:…" → "AB:CD:…" (32 bytes), or null when it isn't a SHA-256. */
export function normalizeFingerprint(text: string): string | null {
  const hex = text.replace(/[\s:]/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  return hex.match(/../g)?.join(':') ?? null;
}

/**
 * The SHA-256 fingerprints in keytool's output (`-list -v`, `-printcert -jarfile`): one per
 * certificate, so a caller can insist on exactly one.
 */
export function keytoolFingerprints(output: string): string[] {
  return [...output.matchAll(/SHA-?256:\s*([0-9A-Fa-f:]{95})/g)].flatMap((match) => {
    const fingerprint = normalizeFingerprint(match[1] ?? '');
    return fingerprint === null ? [] : [fingerprint];
  });
}

/** The signers' certificate fingerprints in `apksigner verify --print-certs` output. */
export function apksignerFingerprints(output: string): string[] {
  return [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-fA-F]{64})\s*$/gm)]
    .map((match) => normalizeFingerprint(match[1] ?? ''))
    .filter((fingerprint): fingerprint is string => fingerprint !== null);
}

// The APK's identity -----------------------------------------------------------------------------

/**
 * Android's version code from the app version: major × 1,000,000 + minor × 1,000 + patch, so every
 * release is higher than the one before (0.1.0 → 1000). The same formula is in
 * android/app/build.gradle; `android:release` checks the built APK carries this number.
 */
export function versionCodeOf(version: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) throw new SigningError(`The version ${version} is not like 1.2.3.`);
  const [major, minor, patch] = match.slice(1, 4).map(Number) as [number, number, number];
  if (minor > 999 || patch > 999 || major > 2099) {
    throw new SigningError(`The version ${version} is too large for an Android version code.`);
  }
  return major * 1_000_000 + minor * 1_000 + patch;
}

export interface ApkBadging {
  readonly packageName: string;
  readonly versionCode: number;
  readonly versionName: string;
  readonly debuggable: boolean;
}

/** What `aapt2 dump badging` says about an APK. */
export function parseBadging(output: string): ApkBadging {
  const match = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m.exec(output);
  if (!match) throw new SigningError('aapt2 did not describe the APK.');
  return {
    packageName: match[1] ?? '',
    versionCode: Number(match[2]),
    versionName: match[3] ?? '',
    debuggable: /^application-debuggable/m.test(output),
  };
}

// keytool ----------------------------------------------------------------------------------------
// The password goes to keytool through the environment of its own process only (`:env`), never on
// its command line, where other programs on the PC could read it.

function keytool(
  javaHome: string,
  args: string[],
  password?: string,
): { ok: boolean; output: string } {
  const result = spawnSync(
    javaTool(javaHome, 'keytool'),
    // English output, whatever the PC's language: the fingerprint is read from it.
    ['-J-Duser.language=en', '-J-Duser.country=US', ...args],
    {
      encoding: 'utf8',
      env: password === undefined ? process.env : { ...process.env, [PASSWORD_ENV]: password },
      windowsHide: true,
    },
  );
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
}

/** Makes the release key store at `file` (which must not exist yet). */
export function createKeyStore(javaHome: string, file: string, password: string): void {
  const { ok, output } = keytool(
    javaHome,
    [
      '-genkeypair',
      '-storetype',
      'PKCS12',
      '-keystore',
      file,
      '-storepass:env',
      PASSWORD_ENV,
      '-alias',
      KEY_ALIAS,
      '-keyalg',
      'RSA',
      '-keysize',
      String(KEY_SIZE),
      '-sigalg',
      'SHA256withRSA',
      '-validity',
      String(KEY_VALIDITY_DAYS),
      '-dname',
      KEY_DNAME,
    ],
    password,
  );
  // keytool's messages never hold the password.
  if (!ok) throw new SigningError(`keytool could not make the key store:\n${output.trim()}`);
}

/** The release key's certificate fingerprint; SigningError for a wrong password or another file. */
export function keyStoreFingerprint(javaHome: string, file: string, password: string): string {
  const { ok, output } = keytool(
    javaHome,
    ['-list', '-v', '-keystore', file, '-storepass:env', PASSWORD_ENV, '-alias', KEY_ALIAS],
    password,
  );
  if (!ok) {
    throw new SigningError(
      /password was incorrect|keystore password/i.test(output)
        ? 'Wrong password for the key store.'
        : `keytool could not open the key store:\n${output.trim()}`,
    );
  }
  const fingerprints = keytoolFingerprints(output);
  if (fingerprints.length !== 1 || fingerprints[0] === undefined) {
    throw new SigningError('The key store does not hold exactly one certificate.');
  }
  return fingerprints[0];
}

/** The certificates a signed jar (an AAB) carries. */
export function jarFingerprints(javaHome: string, file: string): string[] {
  const { ok, output } = keytool(javaHome, ['-printcert', '-jarfile', file]);
  return ok ? keytoolFingerprints(output) : [];
}

// Finding the tools ------------------------------------------------------------------------------

const windows = process.platform === 'win32';

/** The JDKs to look in: JAVA_HOME, then the one that comes with Android Studio. */
function javaHomes(env: NodeJS.ProcessEnv): string[] {
  const homes = [env.JAVA_HOME];
  if (windows) {
    for (const base of [
      env.ProgramFiles,
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'),
    ]) {
      if (base) homes.push(path.join(base, 'Android', 'Android Studio', 'jbr'));
    }
  } else if (process.platform === 'darwin') {
    homes.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
  } else {
    homes.push('/opt/android-studio/jbr', path.join(homedir(), 'android-studio', 'jbr'));
  }
  return homes.filter((home): home is string => Boolean(home));
}

/** A JDK with keytool and jarsigner, or null. */
export function findJavaHome(env: NodeJS.ProcessEnv = process.env): string | null {
  return (
    javaHomes(env).find((home) =>
      existsSync(path.join(home, 'bin', windows ? 'keytool.exe' : 'keytool')),
    ) ?? null
  );
}

export function javaTool(javaHome: string, name: 'keytool' | 'jarsigner'): string {
  return path.join(javaHome, 'bin', windows ? `${name}.exe` : name);
}

/** The newest Android build-tools folder (apksigner, aapt2), or null. */
export function findBuildTools(sdkDir: string): string | null {
  const root = path.join(sdkDir, 'build-tools');
  if (!existsSync(root)) return null;
  const versions = readdirSync(root)
    .filter((name) => /^\d+\.\d+\.\d+/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const newest = versions.at(-1);
  return newest === undefined ? null : path.join(root, newest);
}

/** Where `node scripts/gradle.mjs` looks for the Android SDK. */
export function findAndroidSdk(env: NodeJS.ProcessEnv = process.env): string | null {
  const fallback = windows
    ? path.join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
    : process.platform === 'darwin'
      ? path.join(homedir(), 'Library', 'Android', 'sdk')
      : path.join(homedir(), 'Android', 'Sdk');
  return (
    [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, fallback].find(
      (dir): dir is string => dir !== undefined && dir !== '' && existsSync(dir),
    ) ?? null
  );
}
