// Publishes a version of the online edition's Windows app to the releases repository (spec §8,
// step 11c; README → Windows app → Updates):
//
//   pnpm desktop:publish
//
// Every installed online Windows app updates to what this publishes, so it runs only with the
// user's OK, in a terminal (the version is typed to confirm), never in CI. It builds the installer
// with the official update address, checks latest.yml and app-update.yml, then makes a DRAFT
// release v<version> in miraann/gym-spa-releases with the installer, its .blockmap, the previous
// version's .blockmap (so PCs download only the changed blocks) and latest.yml, and publishes it
// as the latest release only when every file is uploaded. It needs `gh` logged in with write
// access to that repository.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_UPDATE_URL, RELEASES_REPO } from '../update-feed.mjs';

const DESKTOP = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(DESKTOP, '..', '..');
const RELEASE = path.join(DESKTOP, 'release');

/** The version and installer file that latest.yml announces. */
export function parseLatestYml(text) {
  const version = /^version: (.+)$/m.exec(text)?.[1]?.trim();
  const file = /^path: (.+)$/m.exec(text)?.[1]?.trim();
  const sha512 = /^sha512: (.+)$/m.exec(text)?.[1]?.trim();
  if (!version || !file || !sha512) throw new Error('latest.yml has no version, path or sha512.');
  return { version, file, sha512 };
}

/** The installer's name for a version (electron-builder.config.mjs → nsis.artifactName). */
export function installerName(version) {
  return `gym-spa-setup-${version}.exe`;
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

/** Runs gh; returns its output, or null when it failed (e.g. no such release). */
function gh(args, { quiet = false } = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8', windowsHide: true });
  if (result.error) fail('gh (GitHub CLI) was not found.');
  if (result.status !== 0) {
    if (!quiet) console.error(result.stderr.trim());
    return null;
  }
  return result.stdout;
}

/** pnpm, also under `corepack pnpm` (pnpm 12's npm_execpath is a native program). */
function pnpm(args, env) {
  const execPath = process.env.npm_execpath;
  const options = { cwd: REPO_ROOT, stdio: 'inherit', env };
  const result =
    !execPath || !/pnpm/i.test(execPath)
      ? spawnSync(`pnpm ${args.join(' ')}`, { ...options, shell: true })
      : /\.[cm]?js$/i.test(execPath)
        ? spawnSync(process.execPath, [execPath, ...args], options)
        : spawnSync(execPath, args, options);
  if (result.status !== 0) fail(`pnpm ${args.join(' ')} failed.`);
}

async function main() {
  if (process.env.CI) fail('Never in CI: publishing reaches every installed Windows app.');
  if (!process.stdin.isTTY) fail('Run this in a terminal: the version is typed to confirm.');
  const { version } = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'apps/app/package.json'), 'utf8'),
  );
  const tag = `v${version}`;
  if (gh(['release', 'view', tag, '--repo', RELEASES_REPO], { quiet: true }) !== null) {
    fail(`${tag} is published already. Raise the version in apps/app/package.json first.`);
  }
  const latestTag = gh(
    ['release', 'view', '--repo', RELEASES_REPO, '--json', 'tagName', '--jq', '.tagName'],
    {
      quiet: true,
    },
  )?.trim();

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(
    `Every installed Windows app (online edition) will update to ${version}` +
      `${latestTag ? ` (now ${latestTag})` : ''}. Type ${version} to go on: `,
  );
  prompt.close();
  if (answer.trim() !== version) fail('Stopped. Nothing was published.');

  // The official address: GYM_UPDATE_URL must not point the published build elsewhere.
  const env = { ...process.env };
  delete env.GYM_UPDATE_URL;
  pnpm(['desktop:exe'], env);

  const latest = parseLatestYml(readFileSync(path.join(RELEASE, 'latest.yml'), 'utf8'));
  const installer = path.join(RELEASE, installerName(version));
  if (latest.version !== version || latest.file !== installerName(version)) {
    fail(`latest.yml announces ${latest.version} (${latest.file}), not ${version}.`);
  }
  if (!existsSync(installer) || !existsSync(`${installer}.blockmap`)) {
    fail(`${installer} or its .blockmap is missing.`);
  }
  const updateConfig = readFileSync(
    path.join(RELEASE, 'win-unpacked/resources/app-update.yml'),
    'utf8',
  );
  if (!updateConfig.includes(`url: ${OFFICIAL_UPDATE_URL}`)) {
    fail('The built app does not update from the releases repository.');
  }

  const files = [installer, `${installer}.blockmap`];
  const work = mkdtempSync(path.join(tmpdir(), 'gym-publish-'));
  try {
    if (latestTag) {
      // The previous version's blockmap, next to the new installer: electron-updater compares the
      // two and downloads only the blocks that changed.
      const previous = `${installerName(latestTag.replace(/^v/, ''))}.blockmap`;
      if (
        gh([
          'release',
          'download',
          latestTag,
          '--repo',
          RELEASES_REPO,
          '--pattern',
          previous,
          '--dir',
          work,
        ]) !== null
      ) {
        files.push(path.join(work, previous));
      }
    }
    files.push(path.join(RELEASE, 'latest.yml'));
    const notes = `Gym & Spa ${version} for Windows (online edition). Installed apps update themselves.`;
    if (
      gh([
        'release',
        'create',
        tag,
        '--repo',
        RELEASES_REPO,
        '--draft',
        '--title',
        version,
        '--notes',
        notes,
        ...files,
      ]) === null
    ) {
      fail(`Could not make the draft release ${tag}. Delete it on GitHub if it was half made.`);
    }
    if (
      gh(['release', 'edit', tag, '--repo', RELEASES_REPO, '--draft=false', '--latest']) === null
    ) {
      fail(`The draft ${tag} was uploaded but not published: publish it on GitHub, or delete it.`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // What the installed apps will read now.
  const served = await fetch(`${OFFICIAL_UPDATE_URL}latest.yml`).then((response) =>
    response.ok ? response.text() : '',
  );
  const announced = served ? parseLatestYml(served).version : null;
  console.log(
    announced === version
      ? `\n✔ ${tag} is the latest release; installed apps find it within an hour.`
      : `\n! ${tag} is published, but ${OFFICIAL_UPDATE_URL}latest.yml still says ${announced}. Check the release on GitHub.`,
  );
}

if (import.meta.main) await main();
