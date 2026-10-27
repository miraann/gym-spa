import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { notAdditive } from './migration-safety';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));

describe('notAdditive', () => {
  it('lets through what only adds', () => {
    expect(
      notAdditive(`
        create table public.plans (id uuid primary key);
        revoke all on table public.plans from anon;
        create function public.f() returns void language plpgsql as $$
        begin
          delete from public.plans;  -- runs later, not now
        end
        $$;
        revoke execute on function public.f() from public, anon;
        alter table public.members add column note text;
        create or replace function app.g() returns int language sql as $$ select 1 $$;
        create schema reports;
        revoke all on schema reports from public;
        comment on table public.plans is 'Drop this? No: a comment';
      `),
    ).toEqual([]);
  });

  it('stops at whatever drops, renames, changes types or rows, or takes rights away', () => {
    const found = notAdditive(`
      drop policy "x" on public.members;
      alter table public.members drop column notes;
      alter table public.members rename column notes to remarks;
      alter table public.members alter column phone type integer using 0;
      update public.members set notes = null;
      delete from public.settings where key = 'x';
      truncate public.audit_logs;
      revoke execute on function public.create_member() from authenticated;
    `).map((each) => each.why);
    expect(found).toEqual([
      'drops something',
      'drops a column or constraint',
      'renames something',
      'changes a column type',
      'changes or deletes rows',
      'changes or deletes rows',
      'changes or deletes rows',
      'takes rights away from something that already exists',
    ]);
  });

  it('flags exactly the migrations in this repository that dropped or deleted something', () => {
    const flagged = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .filter((file) => notAdditive(readFileSync(`${MIGRATIONS}${file}`, 'utf8')).length > 0);
    expect(flagged).toEqual([
      '20261009100000_online_only.sql',
      '20261010100000_gyms.sql',
      '20261010100100_gym_rules.sql',
      '20261010100600_seller_gyms.sql',
      '20261011100000_admin_screens.sql',
      '20261019100100_member_screens.sql',
    ]);
  });
});
