// Click Group's Android release signing key (spec §8, step 11b; README → Android app → Release
// builds). Run by the user on Click Group's own PC, in a terminal, never by CI:
//
//   pnpm android:new-key [--backup-dir <USB stick>] [--keystore <file>] [--replace]
//       makes the key store (keytool, PKCS12, RSA 4096, 30 years) with one password typed twice
//       (hidden), writes ONE encrypted backup and checks it opens again, and writes the
//       certificate's public fingerprint into apps/app/android/release-signing.json. Then: commit
//       that file. Every later release must be signed with this key, forever.
//   pnpm android:restore-key --file <backup> [--keystore <file>]
//       puts the key store back from a backup (a new PC). Its fingerprint must be the committed one.
//
// The key store lives outside the repository (default %USERPROFILE%\.gym-spa\android). The
// password is never printed, logged, put on a command line or written to disk.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_EXTENSION,
  KEY_ALIAS,
  MIN_PASSWORD_LENGTH,
  SigningError,
  createKeyStore,
  decryptKeyStore,
  defaultKeyStorePath,
  encryptKeyStore,
  findJavaHome,
  isInside,
  keyStoreFingerprint,
  parseKeyStoreBackup,
  parseReleaseSigning,
  releaseSigningText,
  type KeyStoreBackup,
} from './android-signing.ts';
import { checkTerminal, confirm, fail, readHidden, run } from './terminal.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const SIGNING_FILE = fileURLToPath(
  new URL('../android/release-signing.json', import.meta.url),
);

/**
 * Makes the key store at `file`, its backup at `backupFile` (opened again to check it), and the
 * release-signing file. Neither file may exist. On any failure the key store is removed again: a
 * key without its backup and its fingerprint in the repository is useless.
 */
export function makeReleaseKey(options: {
  javaHome: string;
  file: string;
  backupFile: string;
  signingFile: string;
  password: string;
}): string {
  const { javaHome, file, backupFile, signingFile, password } = options;
  if (existsSync(file)) throw new SigningError(`${file} exists already.`);
  if (existsSync(backupFile)) throw new SigningError(`${backupFile} exists already.`);
  mkdirSync(path.dirname(file), { recursive: true });
  createKeyStore(javaHome, file, password);
  try {
    const certificateSha256 = keyStoreFingerprint(javaHome, file, password);
    const keyStore = readFileSync(file);
    writeFileSync(
      backupFile,
      `${JSON.stringify(encryptKeyStore(keyStore, certificateSha256, password), null, 2)}\n`,
      { flag: 'wx' },
    );
    const reopened = decryptKeyStore(
      parseKeyStoreBackup(readFileSync(backupFile, 'utf8')),
      password,
    );
    if (!reopened.equals(keyStore)) {
      throw new SigningError(
        `The backup at ${backupFile} doesn't open again. Delete it and retry.`,
      );
    }
    writeFileSync(
      signingFile,
      releaseSigningText({
        alias: KEY_ALIAS,
        certificateSha256,
        createdAt: new Date().toISOString(),
      }),
    );
    return certificateSha256;
  } catch (error) {
    rmSync(file, { force: true });
    throw error;
  }
}

/** Writes the backup's key store to `file` (which must not exist) and checks it opens. */
export function restoreReleaseKey(options: {
  javaHome: string;
  backup: KeyStoreBackup;
  file: string;
  password: string;
}): void {
  const { javaHome, backup, file, password } = options;
  if (existsSync(file)) throw new SigningError(`${file} exists already.`);
  const keyStore = decryptKeyStore(backup, password);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, keyStore, { flag: 'wx' });
  try {
    if (keyStoreFingerprint(javaHome, file, password) !== backup.certificateSha256) {
      throw new SigningError('The restored key store holds another certificate than its backup.');
    }
  } catch (error) {
    rmSync(file, { force: true });
    throw error;
  }
}

// The command line ---------------------------------------------------------------------------------

function option(name: string): string | null {
  const args = process.argv.slice(3);
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? fail(`${name} needs a value.`));
}

function keyStorePath(): string {
  const file = path.resolve(option('--keystore') ?? defaultKeyStorePath());
  if (isInside(file, REPO)) fail('The key store never goes inside the repository.');
  if (existsSync(file)) {
    fail(`${file} exists already. Nothing was changed.`);
  }
  return file;
}

function javaHome(): string {
  return (
    findJavaHome() ??
    fail('keytool was not found: install Android Studio, or set JAVA_HOME to a JDK (17 or newer).')
  );
}

function committedFingerprint(): string | null {
  return existsSync(SIGNING_FILE)
    ? parseReleaseSigning(readFileSync(SIGNING_FILE, 'utf8')).certificateSha256
    : null;
}

async function newKey(): Promise<void> {
  const file = keyStorePath();
  const folder = path.resolve(option('--backup-dir') ?? path.join(homedir(), 'Desktop'));
  if (!existsSync(folder)) fail(`The backup folder ${folder} doesn't exist.`);
  if (isInside(folder, REPO)) fail('The backup never goes inside the repository.');
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const backupFile = path.join(folder, `gym-spa-android-key-${day}${BACKUP_EXTENSION}`);
  if (existsSync(backupFile)) fail(`${backupFile} exists already. Nothing was changed.`);
  const java = javaHome();
  checkTerminal();

  if (committedFingerprint() === null) {
    await confirm(`A new Android release key in ${file}, its backup in ${backupFile}.`);
  } else {
    if (!process.argv.includes('--replace')) {
      fail(
        'The repository already names a release key (apps/app/android/release-signing.json). A new ' +
          'key means installed apps can never be updated again: they must be uninstalled. Put the ' +
          'key back with pnpm android:restore-key; only if it is lost or leaked, pass --replace.',
      );
    }
    await confirm(
      'A NEW release key: every installed Android app must then be uninstalled and installed again.',
      'replace',
    );
  }

  const password = await readHidden(
    `Key password (at least ${String(MIN_PASSWORD_LENGTH)} characters, hidden): `,
  );
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) {
    fail(`The password needs at least ${String(MIN_PASSWORD_LENGTH)} characters.`);
  }
  if ((await readHidden('The same password again (hidden): ')) !== password) {
    fail('The two passwords differ. Nothing was changed.');
  }

  const fingerprint = makeReleaseKey({
    javaHome: java,
    file,
    backupFile,
    signingFile: SIGNING_FILE,
    password,
  });
  console.log(`✔ Key store made: ${file}`);
  console.log('✔ Its encrypted backup was written and opened again.');
  console.log('✔ The certificate fingerprint is in apps/app/android/release-signing.json:');
  console.log(`    ${fingerprint}`);
  console.log(`
Next:
  1. Move the backup to the USB stick if it isn't there yet, then delete any other copy (and empty
     the Recycle Bin):
       ${backupFile}
     Keep the password in Click Group's password manager, never next to the USB stick.
  2. Tell Claude: it commits release-signing.json.
  3. Build a release: pnpm android:release`);
}

async function restoreKey(): Promise<void> {
  const backupFile = option('--file') ?? fail('Pass --file <the backup>.');
  if (!existsSync(backupFile)) fail(`${backupFile} doesn't exist.`);
  const backup = parseKeyStoreBackup(readFileSync(backupFile, 'utf8'));
  const committed = committedFingerprint();
  if (committed !== null && committed !== backup.certificateSha256) {
    fail('This backup holds another key than the one in apps/app/android/release-signing.json.');
  }
  const file = keyStorePath();
  const java = javaHome();
  checkTerminal();
  const password = await readHidden('Key password (hidden): ');
  restoreReleaseKey({ javaHome: java, backup, file, password });
  if (committed === null) {
    writeFileSync(
      SIGNING_FILE,
      releaseSigningText({
        alias: backup.alias,
        certificateSha256: backup.certificateSha256,
        createdAt: backup.createdAt,
      }),
    );
  }
  console.log(`✔ The key store is back in ${file}. Build a release with pnpm android:release.`);
}

if (import.meta.main) {
  await run(async () => {
    try {
      const command = process.argv[2];
      if (command === 'new') await newKey();
      else if (command === 'restore') await restoreKey();
      else fail('Use pnpm android:new-key or pnpm android:restore-key.');
    } catch (error) {
      // Their messages never hold the password.
      if (error instanceof SigningError) fail(error.message);
      throw error;
    }
  });
}
