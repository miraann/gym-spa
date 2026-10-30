// The release flow's cloud migrations (CLAUDE.md → Working rules, README → Releasing). From the
// repository root:
//   pnpm release:migrations             which migrations the cloud lacks, and whether each one is
//                                        purely additive (exit 1 when not, or when the cloud has a
//                                        migration that isn't in supabase/migrations)
//   pnpm release:migrations --rehearse  also applies them to a local copy of the cloud's schema:
//                                        the local database reset to the cloud's last migration,
//                                        with a gym, its Owner and a device in it; then the local
//                                        database is reset as usual
//   pnpm release:migrations --push      all of that, then the cloud dry run, then the push, only
//                                        when the dry run lists exactly the pending migrations
// The cloud is the project in supabase/.env.local (SUPABASE_DB_URL, the session pooler). Its
// address holds the database password and is never printed. Destructive migrations are never
// pushed from here: they wait for the user (CLAUDE.md → Working rules).
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LocalLockError, acquireLocalLock } from '@gym/local-lock';
import { notAdditive } from './migration-safety';
import { fail, ScriptError } from './script-support';

const MIGRATIONS = path.resolve('migrations');
// The CLI package's own launcher, run with this Node: no shell in between.
const CLI = path.resolve('node_modules', 'supabase', 'dist', 'supabase.js');

const args = new Set(process.argv.slice(2));
const push = args.has('--push');
const rehearse = push || args.has('--rehearse');

function cloudUrl(): string {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Not there: the variable may come from the environment instead.
  }
  const url = process.env.SUPABASE_DB_URL;
  if (!url) fail('Set SUPABASE_DB_URL in supabase/.env.local (see supabase/.env.example).');
  return url;
}

/** Runs the Supabase CLI without a shell (the address has %-escapes a shell could change). */
function supabase(cliArgs: readonly string[], secret?: string): string {
  const result = spawnSync(process.execPath, [CLI, ...cliArgs, '--workdir', '..'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  const shown = secret === undefined ? output : output.replaceAll(secret, '<cloud database>');
  if (result.status !== 0)
    fail(`supabase ${cliArgs[0] ?? ''} ${cliArgs[1] ?? ''} failed:\n${shown}`);
  return shown;
}

/** The last line of CLI output that is a JSON object with the given key. */
function jsonLine(output: string, key: string): unknown {
  const line = output
    .split(/\r?\n/)
    .reverse()
    .find((each) => each.startsWith('{') && each.includes(`"${key}"`));
  if (!line) fail(`The CLI printed no result with "${key}".`);
  return JSON.parse(line);
}

// What is destructive: migration-safety.ts ------------------------------------------------------

function check(files: readonly string[]): boolean {
  let additive = true;
  for (const file of files) {
    const problems = notAdditive(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
    if (problems.length === 0) {
      console.log(`  additive      ${file}`);
      continue;
    }
    additive = false;
    console.log(`  NOT ADDITIVE  ${file}`);
    for (const problem of problems) {
      console.log(`      ${problem.why}: ${problem.statement.slice(0, 140)}`);
    }
  }
  return additive;
}

// Rehearsal -------------------------------------------------------------------------------------------

function runScript(script: string, scriptArgs: readonly string[], env: Record<string, string>) {
  // Right after a reset the API may not have reconnected to the restarted database yet
  // (PGRST002, "schema cache"): wait and try again, for up to a minute.
  for (let attempt = 1; ; attempt += 1) {
    const result = spawnSync(
      process.execPath,
      [path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs'), script, ...scriptArgs],
      { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (result.status === 0) return;
    const output = `${result.stdout}\n${result.stderr}`;
    if (attempt >= 12 || !output.includes('schema cache')) fail(`${script} failed:\n${output}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
}

function rehearseOn(lastCloudVersion: string, pending: readonly string[]): void {
  // It resets the local database twice: never while a test run or another reset uses it.
  let release: () => void;
  try {
    release = acquireLocalLock('release:migrations --rehearse');
  } catch (error) {
    if (error instanceof LocalLockError) fail(error.message);
    throw error;
  }
  try {
    rehearseUnlocked(lastCloudVersion, pending);
  } finally {
    release();
  }
}

function rehearseUnlocked(lastCloudVersion: string, pending: readonly string[]): void {
  console.log(`\nRehearsal on a local copy of the cloud's schema (version ${lastCloudVersion}):`);
  supabase(['db', 'reset', '--version', lastCloudVersion, '--no-seed']);
  // A gym with its Owner and a branch, as the cloud has, so migrations meet existing rows.
  runScript(
    'scripts/bootstrap-admin.ts',
    [
      '--gym',
      'rehearsal',
      '--gym-name',
      'جیمی تاقیکردنەوە',
      '--branch-name',
      'لقی سەرەکی',
      '--username',
      'owner',
      '--full-name',
      'خاوەن',
    ],
    { BOOTSTRAP_ADMIN_PASSWORD: 'Rehearsal-pass-1!' },
  );
  const applied = supabase(['migration', 'up', '--local']);
  for (const file of pending) {
    if (!applied.includes(file)) fail(`The rehearsal did not apply ${file}:\n${applied}`);
  }
  console.log(`  applied all ${String(pending.length)} on top of existing data`);
  supabase(['db', 'reset']);
  console.log('  local database reset again (migrations and seed)');
}

// The release -------------------------------------------------------------------------------------------

function main(): void {
  const url = cloudUrl();
  const { migrations: listed } = jsonLine(
    supabase(['migration', 'list', '--db-url', url], url),
    'migrations',
  ) as { migrations: { local: string; remote: string }[] };
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const remote = new Set(listed.map((each) => each.remote).filter((version) => version !== ''));
  const localVersions = new Set(files.map((file) => file.slice(0, 14)));
  const unknown = [...remote].filter((version) => !localVersions.has(version));
  if (unknown.length > 0) {
    fail(`The cloud has migrations that aren't in supabase/migrations: ${unknown.join(', ')}`);
  }
  const pending = files.filter((file) => !remote.has(file.slice(0, 14)));
  const lastCloudVersion = [...remote].sort().at(-1) ?? '';
  console.log(`Cloud: ${String(remote.size)} migrations, the last ${lastCloudVersion}.`);
  if (pending.length === 0) {
    console.log('Nothing to push: the cloud has every migration.');
    return;
  }
  if (pending.some((file) => file.slice(0, 14) <= lastCloudVersion)) {
    fail("A pending migration is older than the cloud's last one; rename it with a new timestamp.");
  }
  console.log(`Pending (${String(pending.length)}):`);
  if (!check(pending)) {
    throw new ScriptError(
      '\nNot purely additive: these wait for the user (CLAUDE.md → Working rules). Nothing pushed.',
    );
  }
  if (rehearse) rehearseOn(lastCloudVersion, pending);
  if (!push) return;

  console.log('\nCloud dry run:');
  const dry = jsonLine(supabase(['db', 'push', '--db-url', url, '--dry-run'], url), 'upToDate') as {
    dryRun: boolean;
    migrations: string[];
    seeds: string[];
    roles: string[];
  };
  if (!dry.dryRun) fail('That was not a dry run. Stopping.');
  if (dry.seeds.length > 0 || dry.roles.length > 0)
    fail('The dry run lists seeds or roles. Nothing pushed.');
  if (dry.migrations.join(',') !== pending.join(',')) {
    fail(
      `The dry run lists ${dry.migrations.join(', ')}, not the pending migrations. Nothing pushed.`,
    );
  }
  console.log(`  lists exactly the ${String(pending.length)} pending migrations`);
  const pushed = jsonLine(supabase(['db', 'push', '--db-url', url], url), 'upToDate') as {
    migrations: string[];
  };
  console.log(`\nPushed to the cloud: ${pushed.migrations.join(', ')}`);
}

try {
  main();
} catch (error) {
  if (error instanceof ScriptError) {
    console.error(error.message);
    process.exitCode = error.exitCode;
  } else {
    throw error;
  }
}
