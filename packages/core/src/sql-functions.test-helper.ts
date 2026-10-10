import { readdirSync, readFileSync } from 'node:fs';

/** Test helper: reads SQL from supabase/migrations, so tests can compare rules with the database. */

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

/** The SQL of every migration, oldest first. */
export function migrationsSql(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(new URL(file, MIGRATIONS), 'utf8'));
}

/** The body (between the $$ quotes) of the newest definition of an SQL function. */
export function latestFunctionBody(name: string): string {
  const escaped = name.replaceAll('.', '\\.');
  const definition = new RegExp(
    `create (?:or replace )?function ${escaped}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'g',
  );
  const bodies = migrationsSql().flatMap((sql) =>
    [...sql.matchAll(definition)].map((match) => match[1] ?? ''),
  );
  const latest = bodies.at(-1);
  if (latest === undefined) throw new Error(`No migration defines ${name}`);
  return latest;
}
