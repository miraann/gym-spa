// Click Group's license signing key (spec §2.6, step MT-5; README → Licenses). Run by the user on
// Click Group's own PC, in a terminal, never by CI:
//
//   pnpm license:new-key --kid 2026-1 [--backup-dir <folder>] [--replace]
//       makes a new Ed25519 key pair in memory, writes ONE backup file encrypted with a password
//       typed twice (hidden), checks the file opens again, puts the private key into the cloud
//       project's secret LICENSE_SIGNING_KEY through the Management API, and writes the public key
//       into packages/core/src/license-keys.ts. Then: commit that file and release.
//   pnpm license:restore-key --file <backup> [--replace]
//       opens a backup (password typed, hidden) and puts its key into the secret again (a new
//       project, or a secret removed by mistake). Its public key must already be in the code.
//
// The private key is never printed, logged, put on a command line or written to disk unencrypted.
// The cloud project is the linked one (supabase/.temp/project-ref) or --project-ref; the
// Management API needs a personal access token: SUPABASE_ACCESS_TOKEN, or typed (hidden).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  LICENSE_KID_PATTERN,
  LICENSE_PUBLIC_KEYS,
  REVOKED_LICENSE_KIDS,
  SHIPPED_LICENSE_KEYS,
  generateLicenseKey,
  importLicenseSigningKey,
  isTestLicenseKid,
  keyRingOf,
  LicenseKeyError,
} from '@gym/core';
import {
  BACKUP_EXTENSION,
  BackupError,
  MIN_BACKUP_PASSWORD_LENGTH,
  SECRET_NAME,
  decryptBackup,
  encryptBackup,
  parseBackup,
  secretDigestMatches,
  secretsApi,
  SecretsApiError,
  withPublicKey,
  type SecretsApi,
} from './license-key-backup';
import { ask, fail, readHidden, run } from './script-support';

const REPO = path.resolve('..');
const KEYS_FILE = path.join(REPO, 'packages', 'core', 'src', 'license-keys.ts');

function option(name: string): string | null {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? fail(`${name} needs a value.`));
}

const replace = process.argv.includes('--replace');

function insideRepo(folder: string): boolean {
  const relative = path.relative(REPO, path.resolve(folder));
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function projectRef(): string {
  const given = option('--project-ref');
  if (given !== null) return given;
  const linked = path.resolve('.temp', 'project-ref');
  if (!existsSync(linked)) fail('No linked project: pass --project-ref <ref>.');
  return readFileSync(linked, 'utf8').trim();
}

/** A terminal is needed: the passwords are typed hidden, never taken from the environment. */
function checkTerminal(): void {
  if (process.env.CI) fail("Never in CI: run this on Click Group's own PC.");
  if (!process.stdin.isTTY) fail('Run this in a terminal: the passwords are typed, hidden.');
}

async function confirm(question: string): Promise<void> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await ask(prompt, `${question} Type yes to go on: `);
  prompt.close();
  if (answer.trim().toLowerCase() !== 'yes') fail('Stopped. Nothing was changed.');
}

async function connect(): Promise<{ ref: string; api: SecretsApi }> {
  const ref = projectRef();
  const token =
    process.env.SUPABASE_ACCESS_TOKEN ??
    (await readHidden('Supabase personal access token (hidden): ', 'SUPABASE_ACCESS_TOKEN'));
  const api = secretsApi(ref, token.trim());
  const names = (await api.list()).map((secret) => secret.name);
  if (names.includes(SECRET_NAME) && !replace) {
    fail(
      `The project already has ${SECRET_NAME}. Replacing it is a key rotation: pass --replace ` +
        '(README → Licenses → a lost or leaked key).',
    );
  }
  return { ref, api };
}

/** Puts the key into the secret, then checks Supabase lists it (and its digest, when it shows one). */
async function putSecret(api: SecretsApi, privateJwk: string): Promise<void> {
  await api.set(SECRET_NAME, privateJwk);
  const listed = (await api.list()).find((secret) => secret.name === SECRET_NAME);
  if (listed === undefined) {
    fail(
      `${SECRET_NAME} was not listed after setting it. Run pnpm license:restore-key with the backup.`,
    );
  }
  const digest = secretDigestMatches(listed.value, privateJwk);
  if (digest === 'no') fail(`${SECRET_NAME} arrived changed. Run restore-key with the backup.`);
  console.log(
    digest === 'yes'
      ? `✔ ${SECRET_NAME} is set, and its digest matches.`
      : `✔ ${SECRET_NAME} is set (Supabase showed no digest to compare).`,
  );
}

async function newKey(): Promise<void> {
  const kid = option('--kid') ?? fail('Pass --kid, e.g. --kid 2026-1 (README → Licenses).');
  if (!LICENSE_KID_PATTERN.test(kid)) fail('A kid has 3 to 32 of a-z, 0-9 and "-".');
  if (isTestLicenseKid(kid)) fail('test- kids are for local test keys only.');
  if (Object.hasOwn(LICENSE_PUBLIC_KEYS, kid) || REVOKED_LICENSE_KIDS.includes(kid)) {
    fail(`The kid ${kid} was used before: choose a new one.`);
  }
  const folder = path.resolve(option('--backup-dir') ?? path.join(homedir(), 'Desktop'));
  if (!existsSync(folder)) fail(`The backup folder ${folder} doesn't exist.`);
  if (insideRepo(folder))
    fail('The backup never goes inside the repository: choose another folder.');
  const file = path.join(folder, `gym-spa-license-key-${kid}${BACKUP_EXTENSION}`);
  if (existsSync(file)) fail(`${file} exists already. Nothing was changed.`);
  checkTerminal();

  const { ref, api } = await connect();
  await confirm(`A new license signing key "${kid}" for the project ${ref}.`);

  const password = await readHidden(
    `Backup password (at least ${String(MIN_BACKUP_PASSWORD_LENGTH)} characters, hidden): `,
    'none',
  );
  if (Array.from(password).length < MIN_BACKUP_PASSWORD_LENGTH) {
    fail(`The password needs at least ${String(MIN_BACKUP_PASSWORD_LENGTH)} characters.`);
  }
  if ((await readHidden('The same password again (hidden): ', 'none')) !== password) {
    fail('The two passwords differ. Nothing was changed.');
  }

  const { privateJwk, publicKey } = await generateLicenseKey(kid);
  // The backup first, opened again: without it a lost secret would mean a lost key.
  writeFileSync(
    file,
    `${JSON.stringify(encryptBackup(privateJwk, { kid, publicKey }, password), null, 2)}\n`,
    {
      flag: 'wx',
    },
  );
  if (decryptBackup(parseBackup(readFileSync(file, 'utf8')), password) !== privateJwk) {
    fail(
      `The backup at ${file} doesn't open again. Nothing else was changed; delete it and retry.`,
    );
  }
  console.log(`✔ Encrypted backup written and checked.`);

  // The key signs, and its public half checks what it signed, before it goes anywhere.
  await importLicenseSigningKey(privateJwk, keyRingOf({ kid, publicKey }));
  // The public key before the secret: if setting the secret fails, restore-key works at once.
  writeFileSync(KEYS_FILE, withPublicKey(readFileSync(KEYS_FILE, 'utf8'), kid, publicKey));
  console.log(`✔ Public key "${kid}" written into packages/core/src/license-keys.ts:`);
  console.log(`    ${publicKey}`);
  await putSecret(api, privateJwk);
  console.log(`
Next:
  1. Move the backup to the USB stick, then delete it from this PC (and empty the Recycle Bin):
       ${file}
     Keep the password in Click Group's password manager, never next to the USB stick.
  2. Tell Claude: it commits license-keys.ts and releases it. Until that release the function
     refuses to sign with "${kid}" (its public half isn't shipped yet).`);
}

async function restoreKey(): Promise<void> {
  const file = option('--file') ?? fail('Pass --file <the backup>.');
  if (!existsSync(file)) fail(`${file} doesn't exist.`);
  const backup = parseBackup(readFileSync(file, 'utf8'));
  if (LICENSE_PUBLIC_KEYS[backup.kid] !== backup.publicKey) {
    fail(`The key "${backup.kid}" isn't the shipped one in license-keys.ts (or was revoked).`);
  }
  checkTerminal();
  const { ref, api } = await connect();
  await confirm(`Put the key "${backup.kid}" back into ${SECRET_NAME} of the project ${ref}.`);
  const privateJwk = decryptBackup(backup, await readHidden('Backup password (hidden): ', 'none'));
  await importLicenseSigningKey(privateJwk, SHIPPED_LICENSE_KEYS);
  await putSecret(api, privateJwk);
  console.log('Done. The function reads the secret at its next start (redeploy it to be sure).');
}

await run(async () => {
  try {
    const command = process.argv[2];
    if (command === 'new') await newKey();
    else if (command === 'restore') await restoreKey();
    else fail('Use pnpm license:new-key or pnpm license:restore-key.');
  } catch (error) {
    // Their messages never hold a key or a password.
    if (
      error instanceof BackupError ||
      error instanceof LicenseKeyError ||
      error instanceof SecretsApiError
    ) {
      fail(error.message);
    }
    throw error;
  }
});
