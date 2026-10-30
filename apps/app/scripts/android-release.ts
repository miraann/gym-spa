// Builds the release-signed Android app (spec §8, step 11b; README → Android app → Release builds):
//
//   pnpm android:release [--keystore <file>]
//
// On Click Group's PC, in a terminal, never in CI: the key's password is typed (hidden) and given
// only to the one Gradle run that signs, through its environment, with Gradle's daemon and
// configuration cache off so it stays in no background process and no file. Then it checks that
// the APK and the AAB are signed with exactly the certificate in android/release-signing.json, that
// the APK isn't debuggable and carries the right version, and copies both to release/.
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEYSTORE_ENV,
  PASSWORD_ENV,
  SigningError,
  apksignerFingerprints,
  defaultKeyStorePath,
  findAndroidSdk,
  findBuildTools,
  findJavaHome,
  jarFingerprints,
  javaTool,
  keyStoreFingerprint,
  parseBadging,
  parseReleaseSigning,
  versionCodeOf,
} from './android-signing.ts';
import { checkTerminal, fail, readHidden, run } from './terminal.ts';

const APP = fileURLToPath(new URL('../', import.meta.url));
const SIGNING_FILE = path.join(APP, 'android', 'release-signing.json');
const OUTPUTS = path.join(APP, 'android', 'app', 'build', 'outputs');
const APP_ID = 'site.clickgroup.gymspa';
const windows = process.platform === 'win32';

function option(name: string): string | null {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? fail(`${name} needs a value.`));
}

/** Runs a program; .bat files (apksigner on Windows) need a shell, so its arguments are quoted. */
function tool(command: string, args: string[], options: SpawnSyncOptions = {}) {
  const batch = windows && command.endsWith('.bat');
  const result = batch
    ? spawnSync(`"${command}" ${args.map((arg) => `"${arg}"`).join(' ')}`, {
        ...options,
        shell: true,
        encoding: 'utf8',
      })
    : spawnSync(command, args, { ...options, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
}

/** pnpm, also when this script runs under `corepack pnpm` (pnpm itself then isn't on PATH). */
function pnpm(args: string[]): void {
  // npm_execpath is pnpm's own program: a native .exe (pnpm 12), or a script that Node runs.
  const execPath = process.env.npm_execpath;
  const result =
    !execPath || !/pnpm/i.test(execPath)
      ? spawnSync(`pnpm ${args.join(' ')}`, { cwd: APP, stdio: 'inherit', shell: true })
      : /\.[cm]?js$/i.test(execPath)
        ? spawnSync(process.execPath, [execPath, ...args], { cwd: APP, stdio: 'inherit' })
        : spawnSync(execPath, args, { cwd: APP, stdio: 'inherit' });
  if (result.status !== 0) fail(`pnpm ${args.join(' ')} failed.`);
}

/** The Supabase address the web build talks to (its Content-Security-Policy), never a local one. */
function checkBackend(): string {
  const html = readFileSync(path.join(APP, 'dist', 'index.html'), 'utf8');
  const connect = /connect-src ([^;"]+)/.exec(html)?.[1] ?? fail('The build has no CSP.');
  const remote = connect.split(/\s+/).filter((source) => source.startsWith('https://'));
  if (/localhost|127\.0\.0\.1|http:\/\//.test(connect) || remote.length === 0) {
    fail(
      `The web build talks to ${connect}: a release must use the cloud project. ` +
        'Check VITE_SUPABASE_URL in apps/app/.env.local.',
    );
  }
  return remote.join(' ');
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** What is needed to build: found once by the command line, given directly by tests. */
export interface ReleaseTools {
  readonly javaHome: string;
  readonly buildTools: string;
}

export function findReleaseTools(): ReleaseTools {
  const javaHome =
    findJavaHome() ?? fail('No JDK found: install Android Studio, or set JAVA_HOME.');
  const sdk = findAndroidSdk() ?? fail('Android SDK not found: install Android Studio.');
  const buildTools = findBuildTools(sdk) ?? fail('No Android build-tools in the SDK.');
  return { javaHome, buildTools };
}

export function appVersion(): string {
  return (JSON.parse(readFileSync(path.join(APP, 'package.json'), 'utf8')) as { version: string })
    .version;
}

/**
 * Builds the web app and the signed APK and AAB, checks them, and copies them to `outDir`. The
 * password must already be checked against the key store (keyStoreFingerprint).
 */
export function buildRelease(options: {
  tools: ReleaseTools;
  keyStore: string;
  password: string;
  certificateSha256: string;
  outDir: string;
}): { apk: string; aab: string } {
  const { tools, keyStore, password, certificateSha256, outDir } = options;
  const { javaHome, buildTools } = tools;
  const version = appVersion();
  const versionCode = versionCodeOf(version);

  console.log(`
Building version ${version} (version code ${String(versionCode)})…`);
  pnpm(['run', 'android:sync']);
  console.log(`The app talks to ${checkBackend()}.`);
  // Gradle runs on the Java it uses for debug builds too (Android Studio's own may be too new for it).
  const toolEnv = { ...process.env, JAVA_HOME: process.env.JAVA_HOME ?? javaHome };
  const gradle = spawnSync(
    process.execPath,
    [
      path.join(APP, 'scripts', 'gradle.mjs'),
      '--no-daemon',
      '--no-configuration-cache',
      'clean',
      'assembleRelease',
      'bundleRelease',
    ],
    {
      cwd: APP,
      stdio: 'inherit',
      env: { ...process.env, [KEYSTORE_ENV]: keyStore, [PASSWORD_ENV]: password },
    },
  );
  if (gradle.status !== 0) fail('The Gradle build failed.');

  const apk = path.join(OUTPUTS, 'apk', 'release', 'app-release.apk');
  const aab = path.join(OUTPUTS, 'bundle', 'release', 'app-release.aab');
  if (!existsSync(apk)) fail('Gradle made no signed APK (app-release.apk).');
  if (!existsSync(aab)) fail('Gradle made no AAB (app-release.aab).');

  const apksigner = path.join(buildTools, windows ? 'apksigner.bat' : 'apksigner');
  const verified = tool(apksigner, ['verify', '--print-certs', '-v', apk], { env: toolEnv });
  const apkSigners = apksignerFingerprints(verified.output);
  if (!verified.ok || apkSigners.length !== 1 || apkSigners[0] !== certificateSha256) {
    fail(`The APK isn't signed with the release key:
${verified.output.trim()}`);
  }
  const badging = tool(path.join(buildTools, windows ? 'aapt2.exe' : 'aapt2'), [
    'dump',
    'badging',
    apk,
  ]);
  if (!badging.ok)
    fail(`aapt2 could not read the APK:
${badging.output.trim()}`);
  const apkInfo = parseBadging(badging.output);
  if (apkInfo.packageName !== APP_ID) fail(`The APK is ${apkInfo.packageName}, not ${APP_ID}.`);
  if (apkInfo.versionCode !== versionCode || apkInfo.versionName !== version) {
    fail(
      `The APK says version ${apkInfo.versionName} (${String(apkInfo.versionCode)}), ` +
        `expected ${version} (${String(versionCode)}).`,
    );
  }
  if (apkInfo.debuggable) fail('The release APK is debuggable.');
  const jarsigner = tool(javaTool(javaHome, 'jarsigner'), ['-verify', aab]);
  const aabSigners = jarFingerprints(javaHome, aab);
  if (!jarsigner.ok || aabSigners.length !== 1 || aabSigners[0] !== certificateSha256) {
    fail(`The AAB isn't signed with the release key:
${jarsigner.output.trim()}`);
  }
  console.log('✔ The APK and the AAB are signed with the release key; the APK is not debuggable.');

  mkdirSync(outDir, { recursive: true });
  const apkOut = path.join(outDir, `gym-spa-${version}.apk`);
  const aabOut = path.join(outDir, `gym-spa-${version}.aab`);
  copyFileSync(apk, apkOut);
  copyFileSync(aab, aabOut);
  return { apk: apkOut, aab: aabOut };
}

async function main(): Promise<void> {
  checkTerminal();
  if (!existsSync(SIGNING_FILE)) fail('No release key yet: run pnpm android:new-key first.');
  const signing = parseReleaseSigning(readFileSync(SIGNING_FILE, 'utf8'));
  const keyStore = path.resolve(option('--keystore') ?? defaultKeyStorePath());
  if (!existsSync(keyStore)) {
    fail(`${keyStore} isn't there: put it back with pnpm android:restore-key --file <backup>.`);
  }
  const tools = findReleaseTools();
  const password = await readHidden('Key password (hidden): ');
  if (keyStoreFingerprint(tools.javaHome, keyStore, password) !== signing.certificateSha256) {
    fail('This key store holds another key than the one in android/release-signing.json.');
  }
  const { apk, aab } = buildRelease({
    tools,
    keyStore,
    password,
    certificateSha256: signing.certificateSha256,
    outDir: path.join(APP, 'release'),
  });
  console.log(`
✔ ${apk}
    SHA-256 ${sha256(apk)}
✔ ${aab}
    SHA-256 ${sha256(aab)}

Install the APK on a tablet or phone directly (README → Android app → Release builds). A device
with a debug build must uninstall it first.`);
}

if (import.meta.main) {
  await run(async () => {
    try {
      await main();
    } catch (error) {
      if (error instanceof SigningError) fail(error.message);
      throw error;
    }
  });
}
