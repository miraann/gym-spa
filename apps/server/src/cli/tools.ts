// pnpm server:tools: gets the offline server's parts into the tools folder (paths.ts), once.
//
//   pnpm server:tools                       download, check, unpack, build Auth
//   pnpm server:tools --downloads-from DIR  take already downloaded files from DIR first (still
//                                           checked by SHA-256), e.g. the auth spike's downloads
//
// Every download is checked against the SHA-256 pinned in versions.ts before it is unpacked; Auth
// is built from its pinned commit with auth/auth-windows.patch. Needs git, and Docker for pgTAP
// (taken from the local Supabase's database image, tests only). Running it again skips what is
// already there.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { REPO, toolPaths } from '../paths.ts';
import { AUTH, GO, PGTAP, POSTGRES, POSTGREST, type PinnedDownload } from '../versions.ts';

const { values: args } = parseArgs({ options: { 'downloads-from': { type: 'string' } } });
const tools = toolPaths();
const TAR = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');

function say(line: string): void {
  console.log(line);
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** The pinned file in the downloads folder, downloaded (or copied) and checked. */
async function download(pinned: PinnedDownload): Promise<string> {
  mkdirSync(tools.downloads, { recursive: true });
  const name = path.basename(new URL(pinned.url).pathname);
  const file = path.join(tools.downloads, name);
  if (existsSync(file) && (await sha256Of(file)) === pinned.sha256) return file;

  const partial = `${file}.partial`;
  const local = args['downloads-from'] ? path.join(args['downloads-from'], name) : undefined;
  if (local && existsSync(local)) {
    say(`copying ${name}`);
    copyFileSync(local, partial);
  } else {
    say(`downloading ${pinned.url}`);
    const response = await fetch(pinned.url);
    if (!response.ok || !response.body) {
      throw new Error(`${pinned.url} answered ${String(response.status)}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  }
  const actual = await sha256Of(partial);
  if (actual !== pinned.sha256) {
    rmSync(partial, { force: true });
    throw new Error(`${name}: SHA-256 ${actual} is not the pinned ${pinned.sha256}. Not used.`);
  }
  renameSync(partial, file);
  return file;
}

function run(
  file: string,
  cliArgs: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const result = spawnSync(file, cliArgs, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(file)} ${cliArgs.join(' ')} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

/** Unpacks a zip into a fresh folder with Windows' own tar. */
function unzip(zip: string, into: string): void {
  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });
  run(TAR, ['-xf', zip, '-C', into]);
}

/** Postgres: only bin, lib and share (no pgAdmin, StackBuilder, docs or headers). */
async function postgres(): Promise<void> {
  const marker = path.join(tools.root, 'pgsql', `${POSTGRES.version}.ok`);
  if (existsSync(marker)) return;
  const zip = await download(POSTGRES);
  const unpacked = path.join(tools.root, 'tmp-pgsql');
  say('unpacking Postgres');
  unzip(zip, unpacked);
  const target = path.join(tools.root, 'pgsql');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const part of ['bin', 'lib', 'share']) {
    renameSync(path.join(unpacked, 'pgsql', part), path.join(target, part));
  }
  rmSync(unpacked, { recursive: true, force: true });
  writeFileSync(marker, '');
}

async function postgrest(): Promise<void> {
  if (existsSync(tools.postgrestExe)) return;
  const zip = await download(POSTGREST);
  say('unpacking PostgREST');
  unzip(zip, path.dirname(tools.postgrestExe));
}

/** Supabase Auth from its pinned commit, patched for Windows, built with the pinned Go. */
async function auth(): Promise<void> {
  const versionFile = path.join(path.dirname(tools.authExe), 'version.txt');
  if (existsSync(tools.authExe) && existsSync(versionFile)) {
    if (readFileSync(versionFile, 'utf8').trim() === AUTH.commit) return;
  }
  const goRoot = path.join(tools.root, 'go');
  if (!existsSync(path.join(goRoot, 'bin', 'go.exe'))) {
    const zip = await download(GO);
    say('unpacking Go');
    const unpacked = path.join(tools.root, 'tmp-go');
    unzip(zip, unpacked);
    rmSync(goRoot, { recursive: true, force: true });
    renameSync(path.join(unpacked, 'go'), goRoot);
    rmSync(unpacked, { recursive: true, force: true });
  }
  const source = path.join(tools.root, 'src', 'auth');
  if (!existsSync(path.join(source, '.git'))) {
    say(`cloning Supabase Auth ${AUTH.version}`);
    mkdirSync(path.dirname(source), { recursive: true });
    run('git', [
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--branch',
      AUTH.version,
      AUTH.repository,
      source,
    ]);
  }
  const head = run('git', ['-C', source, 'rev-parse', 'HEAD']).trim();
  if (head !== AUTH.commit) {
    throw new Error(`Auth ${AUTH.version} is commit ${head}, not the pinned ${AUTH.commit}.`);
  }
  const patch = path.join(REPO, 'apps', 'server', 'auth', 'auth-windows.patch');
  const applied =
    spawnSync('git', ['-C', source, 'apply', '--reverse', '--check', patch], { stdio: 'ignore' })
      .status === 0;
  if (!applied) run('git', ['-C', source, 'apply', patch]);

  // Go and everything it writes (modules, build cache, settings, telemetry) stay in the tools folder.
  const goEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${path.join(goRoot, 'bin')};${process.env.PATH ?? ''}`,
    GOROOT: goRoot,
    GOPATH: path.join(tools.root, 'gopath'),
    GOMODCACHE: path.join(tools.root, 'gopath', 'pkg', 'mod'),
    GOCACHE: path.join(tools.root, 'gocache'),
    GOENV: path.join(tools.root, 'goenv'),
    GOTELEMETRY: 'off',
    GOTOOLCHAIN: 'local',
    // Upstream builds with CGO off too (its Makefile).
    CGO_ENABLED: '0',
    APPDATA: path.join(tools.root, 'appdata'),
    LOCALAPPDATA: path.join(tools.root, 'localappdata'),
  };
  mkdirSync(path.dirname(tools.authExe), { recursive: true });
  say('building Supabase Auth (a few minutes the first time)');
  run(
    path.join(goRoot, 'bin', 'go.exe'),
    [
      'build',
      '-trimpath',
      '-ldflags',
      `-X github.com/supabase/auth/internal/utilities.Version=${AUTH.version}`,
      '-o',
      tools.authExe,
      '.',
    ],
    { cwd: source, env: goEnv },
  );
  rmSync(tools.authMigrations, { recursive: true, force: true });
  cpSync(path.join(source, 'migrations'), tools.authMigrations, { recursive: true });
  const version = run(tools.authExe, ['version']).trim();
  if (!version.includes(AUTH.version)) throw new Error(`auth.exe says "${version}".`);
  writeFileSync(versionFile, `${AUTH.commit}\n`);
}

/** pgTAP from the local Supabase's database image, the same files `pnpm db:test` uses. */
async function pgtap(): Promise<void> {
  const extension = path.join(tools.pgShare, 'extension');
  const container = 'supabase_db_gym-spa';
  const imagePath = '/nix/var/nix/profiles/default/share/postgresql/extension';
  for (const [name, sha256] of Object.entries(PGTAP.files)) {
    const target = path.join(extension, name);
    if (existsSync(target) && (await sha256Of(target)) === sha256) continue;
    // `docker cp` would copy the image's Nix symlink, which Windows refuses: read the file instead.
    const copied = spawnSync('docker', ['exec', container, 'cat', `${imagePath}/${name}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    if (copied.status !== 0) {
      say(`pgTAP skipped: start the local Supabase (pnpm db:start) to get it; only tests need it.`);
      return;
    }
    writeFileSync(target, copied.stdout);
    if ((await sha256Of(target)) !== sha256) {
      rmSync(target, { force: true });
      throw new Error(`${name} from the Supabase image is not the pinned pgTAP ${PGTAP.version}.`);
    }
  }
}

async function main(): Promise<void> {
  say(`tools folder: ${tools.root}`);
  mkdirSync(tools.root, { recursive: true });
  await postgres();
  await postgrest();
  await auth();
  await pgtap();
  writeFileSync(
    path.join(tools.root, 'tools.json'),
    JSON.stringify(
      { postgres: POSTGRES.version, postgrest: POSTGREST.version, auth: AUTH.version },
      null,
      2,
    ),
  );
  say(`ready: Postgres ${POSTGRES.version}, PostgREST ${POSTGREST.version}, Auth ${AUTH.version}`);
}

try {
  await main();
} catch (error) {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
