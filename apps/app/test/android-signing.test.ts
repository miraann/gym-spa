// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import config from '../capacitor.config.ts';
import { makeReleaseKey, restoreReleaseKey } from '../scripts/android-key.ts';
import {
  KEY_ALIAS,
  SigningError,
  apksignerFingerprints,
  decryptKeyStore,
  defaultKeyStorePath,
  encryptKeyStore,
  findJavaHome,
  isInside,
  keyStoreFingerprint,
  keytoolFingerprints,
  normalizeFingerprint,
  parseBadging,
  parseKeyStoreBackup,
  parseReleaseSigning,
  releaseSigningText,
  versionCodeOf,
} from '../scripts/android-signing.ts';

const FINGERPRINT = Array.from({ length: 32 }, (_, i) => (i * 7).toString(16).padStart(2, '0'))
  .join(':')
  .toUpperCase();
const PASSWORD = 'a long test password';

function android(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../android/${file}`, import.meta.url)), 'utf8');
}

describe('the key store backup', () => {
  const keyStore = Buffer.from('not really a PKCS12 file, but bytes all the same');

  it('opens again with the password', () => {
    const backup = parseKeyStoreBackup(
      JSON.stringify(encryptKeyStore(keyStore, FINGERPRINT, PASSWORD)),
    );
    expect(backup.alias).toBe(KEY_ALIAS);
    expect(backup.certificateSha256).toBe(FINGERPRINT);
    expect(decryptKeyStore(backup, PASSWORD).equals(keyStore)).toBe(true);
    // The key store itself isn't in the file in clear.
    expect(JSON.stringify(backup)).not.toContain(keyStore.toString('base64'));
  });

  it('refuses a wrong password', () => {
    const backup = encryptKeyStore(keyStore, FINGERPRINT, PASSWORD);
    expect(() => decryptKeyStore(backup, `${PASSWORD}!`)).toThrow(SigningError);
  });

  it('refuses a changed fingerprint (the clear fields are bound to the ciphertext)', () => {
    const backup = encryptKeyStore(keyStore, FINGERPRINT, PASSWORD);
    const changed = { ...backup, certificateSha256: FINGERPRINT.replace(/^../, 'FF') };
    expect(() => decryptKeyStore(changed, PASSWORD)).toThrow('Wrong password, or the file');
  });

  it('refuses what is not a backup', () => {
    expect(() => parseKeyStoreBackup('{"format":"gym-spa-license-key-backup"}')).toThrow(
      SigningError,
    );
    expect(() => parseKeyStoreBackup('not json')).toThrow(SigningError);
  });
});

describe('fingerprints', () => {
  it('normalizes the tools’ spellings to AB:CD:…', () => {
    const hex = FINGERPRINT.replaceAll(':', '');
    expect(normalizeFingerprint(hex.toLowerCase())).toBe(FINGERPRINT);
    expect(normalizeFingerprint(FINGERPRINT.replaceAll(':', ' '))).toBe(FINGERPRINT);
    expect(normalizeFingerprint('AB:CD')).toBeNull();
  });

  it('reads keytool and apksigner output', () => {
    expect(
      keytoolFingerprints(
        `Alias name: gym-spa\nCertificate fingerprints:\n\t SHA1: 01:02\n\t SHA256: ${FINGERPRINT}\n`,
      ),
    ).toEqual([FINGERPRINT]);
    const digest = FINGERPRINT.replaceAll(':', '').toLowerCase();
    expect(
      apksignerFingerprints(
        `Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\n` +
          `Signer #1 certificate DN: CN=Click Group\nSigner #1 certificate SHA-256 digest: ${digest}\n` +
          `Signer #1 certificate SHA-1 digest: 0102\n`,
      ),
    ).toEqual([FINGERPRINT]);
  });

  it('keeps only valid release-signing files', () => {
    const signing = { alias: KEY_ALIAS, certificateSha256: FINGERPRINT, createdAt: 'x' };
    expect(parseReleaseSigning(releaseSigningText(signing))).toEqual(signing);
    expect(() =>
      parseReleaseSigning(
        JSON.stringify({ ...signing, certificateSha256: FINGERPRINT.toLowerCase() }),
      ),
    ).toThrow(SigningError);
    expect(() => parseReleaseSigning(JSON.stringify({ ...signing, alias: 'other' }))).toThrow(
      SigningError,
    );
  });
});

describe('the APK', () => {
  it('gets a version code that grows with every version', () => {
    expect(versionCodeOf('0.1.0')).toBe(1000);
    expect(versionCodeOf('1.2.3')).toBe(1_002_003);
    expect(versionCodeOf('1.2.3-beta.1')).toBe(1_002_003);
    expect(versionCodeOf('0.10.0')).toBeGreaterThan(versionCodeOf('0.9.999'));
    expect(() => versionCodeOf('1.2')).toThrow(SigningError);
    expect(() => versionCodeOf('1.1000.0')).toThrow(SigningError);
  });

  it('build.gradle uses the same version code formula', () => {
    const gradle = android('app/build.gradle');
    expect(gradle).toMatch(
      /\(versionParts\[1\] as int\) \* 1000000 \+ \(versionParts\[2\] as int\) \* 1000 \+ \(versionParts\[3\] as int\)/,
    );
    expect(gradle).toContain('versionCode appVersionCode');
    expect(gradle).toContain(`keyAlias '${KEY_ALIAS}'`);
  });

  it('reads aapt2’s description', () => {
    const output =
      "package: name='site.clickgroup.gymspa' versionCode='1000' versionName='0.1.0' platformBuildVersionName='16'\n" +
      "application-label:'جیم و سپا'\n";
    expect(parseBadging(output)).toEqual({
      packageName: 'site.clickgroup.gymspa',
      versionCode: 1000,
      versionName: '0.1.0',
      debuggable: false,
    });
    expect(parseBadging(`${output}application-debuggable\n`).debuggable).toBe(true);
  });

  it('keeps release builds quiet and private (spec §8, Phase 11 release checklist)', () => {
    // Debug logging would print every plugin call, the staff session too, to logcat.
    expect(config.loggingBehavior ?? 'debug').toBe('debug');
    const manifest = android('app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).not.toContain('usesCleartextTraffic="true"');
  });
});

describe('where the key store lives', () => {
  it('outside the repository', () => {
    const repo = fileURLToPath(new URL('../../../', import.meta.url));
    expect(isInside(defaultKeyStorePath(), repo)).toBe(false);
    expect(isInside(path.join(repo, 'apps', 'x.p12'), repo)).toBe(true);
    expect(isInside(`${path.resolve(repo)}-other`, repo)).toBe(false);
  });
});

const javaHome = findJavaHome();

describe.skipIf(javaHome === null)('with keytool (a throwaway key)', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'gym-android-key-'));
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });
  const java = javaHome ?? '';
  const file = path.join(folder, 'store', 'release.p12');
  const backupFile = path.join(folder, `key.gsakey`);
  const signingFile = path.join(folder, 'release-signing.json');

  it('makes the key, its backup and the signing file, and restores it', () => {
    const fingerprint = makeReleaseKey({
      javaHome: java,
      file,
      backupFile,
      signingFile,
      password: PASSWORD,
    });
    expect(normalizeFingerprint(fingerprint)).toBe(fingerprint);
    expect(keyStoreFingerprint(java, file, PASSWORD)).toBe(fingerprint);
    expect(parseReleaseSigning(readFileSync(signingFile, 'utf8')).certificateSha256).toBe(
      fingerprint,
    );
    const backup = parseKeyStoreBackup(readFileSync(backupFile, 'utf8'));
    expect(backup.certificateSha256).toBe(fingerprint);
    expect(readFileSync(backupFile, 'utf8')).not.toContain(PASSWORD);

    const restored = path.join(folder, 'restored', 'release.p12');
    restoreReleaseKey({ javaHome: java, backup, file: restored, password: PASSWORD });
    expect(keyStoreFingerprint(java, restored, PASSWORD)).toBe(fingerprint);
    expect(() => {
      restoreReleaseKey({ javaHome: java, backup, file: restored, password: PASSWORD });
    }).toThrow('exists already');
  }, 120_000);

  it('refuses a wrong password', () => {
    expect(() => keyStoreFingerprint(java, file, 'wrong password!!')).toThrow(SigningError);
  });

  it('removes a half-made key when its backup can’t be written', () => {
    const second = path.join(folder, 'second.p12');
    const takenBackup = path.join(folder, 'missing-folder', 'key.gsakey');
    expect(() => {
      makeReleaseKey({
        javaHome: java,
        file: second,
        backupFile: takenBackup,
        signingFile: path.join(folder, 'second.json'),
        password: PASSWORD,
      });
    }).toThrow();
    expect(() => readFileSync(second)).toThrow();
  }, 120_000);
});
