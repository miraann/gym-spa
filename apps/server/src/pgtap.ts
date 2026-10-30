import { readdirSync } from 'node:fs';
import path from 'node:path';
import { psql, type Database } from './database.ts';
import { REPO } from './paths.ts';

// supabase/tests on an offline server: every file in name order, one psql session each, as
// `supabase test db` (pg_prove) runs them. 000-setup-test-helpers.sql commits its helpers first.

export interface TapResult {
  readonly planned: number | null;
  readonly passed: number;
  readonly failures: readonly string[];
}

/** Reads a file's TAP output: its plan, its ok lines and its not-ok lines. */
export function readTap(output: string): TapResult {
  const lines = output.split(/\r?\n/);
  const plan = lines.find((line) => /^1\.\.\d+$/.test(line));
  return {
    planned: plan ? Number(plan.slice(3)) : null,
    passed: lines.filter((line) => /^ok \d+/.test(line)).length,
    failures: lines.filter((line) => /^not ok \d+/.test(line)),
  };
}

/** Whether a file passed: psql succeeded, nothing failed, and every planned test ran. */
export function tapPassed(result: TapResult, exitCode: number | null): boolean {
  return exitCode === 0 && result.failures.length === 0 && result.passed === result.planned;
}

/** Runs every file; returns the number of files that failed. */
export function runPgTap(db: Database, log: (line: string) => void): number {
  const folder = path.join(REPO, 'supabase', 'tests');
  const files = readdirSync(folder)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  let failed = 0;
  let tests = 0;
  for (const file of files) {
    const run = psql(db, 'postgres', ['-q', '-t', '-A', '-f', path.join(folder, file)]);
    const result = readTap(run.stdout);
    const ok = tapPassed(result, run.status);
    tests += result.passed + result.failures.length;
    if (!ok) failed += 1;
    log(
      `${ok ? 'ok    ' : 'FAILED'} ${file} (${String(result.passed)}/${String(result.planned ?? '?')})`,
    );
    if (!ok) {
      for (const line of result.failures) log(`   ${line}`);
      const diagnostics = run.stdout.split(/\r?\n/).filter((line) => line.startsWith('#'));
      for (const line of diagnostics.slice(0, 20)) log(`   ${line}`);
      const errors = run.stderr.trim().split(/\r?\n/).slice(0, 10);
      for (const line of errors) if (line) log(`   ${line}`);
    }
  }
  log(
    `${String(files.length - failed)}/${String(files.length)} files passed, ${String(tests)} tests`,
  );
  return failed;
}
