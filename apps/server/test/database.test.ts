import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsIn, pendingMigrations } from '../src/database.ts';
import { REPO } from '../src/paths.ts';
import { readTap, tapPassed } from '../src/pgtap.ts';
import { AUTH, CLOUD_VERSION_FILES, POSTGRES, POSTGREST } from '../src/versions.ts';

describe('migrations', () => {
  const folder = path.join('x', 'migrations');
  const all = migrationsIn(folder, [
    '20261029900000_licenses.sql',
    '20261009000000_first.sql',
    'README.md',
    '20261010100000_gyms.sql',
  ]);

  it('reads them oldest first, by the CLI version prefix', () => {
    expect(all.map((m) => m.version)).toEqual([
      '20261009000000',
      '20261010100000',
      '20261029900000',
    ]);
    expect(all[2]).toEqual({
      version: '20261029900000',
      name: 'licenses',
      file: path.join(folder, '20261029900000_licenses.sql'),
    });
  });

  it('refuses a .sql file that is not a migration', () => {
    expect(() => migrationsIn(folder, ['seed.sql'])).toThrow('Not a migration file name');
  });

  it('applies only what is new, in order', () => {
    expect(pendingMigrations(all, []).map((m) => m.version)).toHaveLength(3);
    expect(pendingMigrations(all, ['20261009000000', '20261010100000']).map((m) => m.name)).toEqual(
      ['licenses'],
    );
    expect(
      pendingMigrations(
        all,
        all.map((m) => m.version),
      ),
    ).toEqual([]);
  });

  it('stops on a database from another version', () => {
    expect(() => pendingMigrations(all, ['20261009000000', '20270101000000'])).toThrow(
      "doesn't know: 20270101000000",
    );
    expect(() => pendingMigrations(all, ['20261029900000'])).toThrow('older than the last applied');
  });

  it('reads every file of supabase/migrations', () => {
    const real = path.join(REPO, 'supabase', 'migrations');
    expect(migrationsIn(real, readdirSync(real)).length).toBeGreaterThan(40);
  });
});

describe('TAP output', () => {
  it('passes a file whose planned tests all ran and passed', () => {
    const result = readTap('1..3\nok 1 - a\nok 2 - b\nok 3 - c\n');
    expect(result).toEqual({ planned: 3, passed: 3, failures: [] });
    expect(tapPassed(result, 0)).toBe(true);
  });

  it('fails on a failed test, a missing test or a psql error', () => {
    const failed = readTap('1..2\nok 1 - a\nnot ok 2 - b\n# Failed test 2\n');
    expect(failed.failures).toEqual(['not ok 2 - b']);
    expect(tapPassed(failed, 0)).toBe(false);
    expect(tapPassed(readTap('1..3\nok 1\nok 2\n'), 0)).toBe(false);
    expect(tapPassed(readTap('1..1\nok 1\n'), 3)).toBe(false);
    expect(tapPassed(readTap('ok 1\n'), 0)).toBe(false);
  });
});

describe('versions', () => {
  // supabase/.temp is written by `supabase link` and isn't in git: checked where it exists.
  const temp = path.join(REPO, 'supabase', '.temp');
  const cloud = (name: string) => readFileSync(path.join(temp, name), 'utf8').trim();

  it.skipIf(!existsSync(path.join(temp, CLOUD_VERSION_FILES.postgrest)))(
    'match what the cloud project runs',
    () => {
      expect(POSTGREST.version).toBe(cloud(CLOUD_VERSION_FILES.postgrest));
      expect(AUTH.version).toBe(cloud(CLOUD_VERSION_FILES.auth));
      // The cloud says 17.11.0.003 (Supabase's build of 17.11); EDB's is 17.11-2.
      const major = cloud(CLOUD_VERSION_FILES.postgres).split('.').slice(0, 2).join('.');
      expect(POSTGRES.version.split('-')[0]).toBe(major);
    },
  );
});
