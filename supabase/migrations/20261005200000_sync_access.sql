-- What PowerSync needs: the branch-access rule as rows, and a role to replicate with.
--
-- Sync Streams can't call SQL functions, and their SQL can't express "every branch when
-- all_branches is set". So the rule from app.accessible_branch_ids() is now kept as rows in
-- staff_branch_access, maintained by triggers. RLS (through app.accessible_branch_ids()) and the
-- sync streams (supabase/powersync/sync-config.yaml) both read this table, so the rule is still
-- written once: in app.refresh_branch_access().

-- Derived data: one row per active staff member and branch they can access. Written only by
-- app.refresh_branch_access(), never by clients. Not audited (staff_users and staff_branches are).
create table public.staff_branch_access (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_users (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  unique (staff_id, branch_id)
);
create index staff_branch_access_branch_id_idx on public.staff_branch_access (branch_id);

-- THE branch-access rule: every branch for an active staff member with all_branches, otherwise
-- their staff_branches rows; nothing for deactivated or deleted staff. Changes only the rows that
-- differ, so PowerSync doesn't re-send unchanged data.
create function app.refresh_branch_access(p_staff_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with wanted as (
    select s.id as staff_id, b.id as branch_id
      from public.staff_users s
      cross join public.branches b
     where s.id = p_staff_id
       and s.is_active
       and s.deleted_at is null
       and (
         s.all_branches
         or exists (select 1 from public.staff_branches sb where sb.staff_id = s.id and sb.branch_id = b.id)
       )
  ),
  removed as (
    delete from public.staff_branch_access a
     where a.staff_id = p_staff_id
       and not exists (select 1 from wanted w where w.branch_id = a.branch_id)
  )
  insert into public.staff_branch_access (staff_id, branch_id)
  select w.staff_id, w.branch_id from wanted w
  on conflict (staff_id, branch_id) do nothing
$$;

create function app.refresh_branch_access_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff record;
begin
  if tg_table_name = 'branches' then
    -- A new branch: staff with all_branches get it.
    for staff in select s.id from public.staff_users s where s.all_branches loop
      perform app.refresh_branch_access(staff.id);
    end loop;
  elsif tg_table_name = 'staff_users' then
    perform app.refresh_branch_access(new.id);
  else
    perform app.refresh_branch_access(coalesce(new.staff_id, old.staff_id));
  end if;
  return null;
end
$$;

create trigger refresh_branch_access after insert on public.branches
  for each row execute function app.refresh_branch_access_trigger();
create trigger refresh_branch_access after insert or update of all_branches, is_active, deleted_at on public.staff_users
  for each row execute function app.refresh_branch_access_trigger();
create trigger refresh_branch_access after insert or delete on public.staff_branches
  for each row execute function app.refresh_branch_access_trigger();

select app.refresh_branch_access(s.id) from public.staff_users s;

-- RLS now reads the rows. Same rule, same callers: policies keep writing
-- branch_id in (select app.accessible_branch_ids()).
create or replace function app.accessible_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.branch_id from public.staff_branch_access a where a.staff_id = auth.uid()
$$;

alter table public.staff_branch_access enable row level security;
revoke all on table public.staff_branch_access from anon, authenticated;
grant all on table public.staff_branch_access to service_role;
grant select on table public.staff_branch_access to authenticated;

create policy "staff read their own branch access" on public.staff_branch_access
  for select to authenticated
  using (staff_id = auth.uid());

-- PowerSync --------------------------------------------------------------------------------------

alter publication powersync add table public.staff_branch_access;

-- The role PowerSync replicates with. It can't log in until an environment gives it a password:
-- locally seed.sql, in the cloud a one-time step (README → PowerSync). It reads only the tables in
-- the powersync publication; every migration that adds a table there grants it select.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'powersync_role') then
    create role powersync_role with replication bypassrls nologin;
  end if;
end
$$;

grant usage on schema public to powersync_role;
grant select on table
  public.branches,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.staff_users,
  public.staff_branches,
  public.staff_branch_access,
  public.devices,
  public.device_status,
  public.settings
to powersync_role;
