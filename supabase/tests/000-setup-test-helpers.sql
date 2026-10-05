-- Helpers for every test file in this folder. `supabase test db` runs the files in name order; this
-- one runs first and commits, so the `tests` schema stays for the other files. They roll back their
-- own changes. Local database only: never part of a migration.
create extension if not exists pgtap with schema extensions;

select plan(1);

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.create_branch(code text)
returns uuid
language sql
set search_path = ''
as $$
  insert into public.branches (code, name_ckb) values (create_branch.code, 'لقی ' || create_branch.code)
  returning id
$$;

-- A custom (not built-in) role with the given permissions.
create or replace function tests.create_role(name text, permission_keys text[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_role_id uuid;
begin
  insert into public.roles (name_ckb) values (create_role.name) returning id into new_role_id;
  insert into public.role_permissions (role_id, permission_key)
  select new_role_id, unnest(permission_keys);
  return new_role_id;
end
$$;

create or replace function tests.create_auth_user(username text)
returns uuid
language sql
set search_path = ''
as $$
  insert into auth.users (id, email, aud, role)
  values (gen_random_uuid(), create_auth_user.username || '@staff.gym-spa.invalid', 'authenticated', 'authenticated')
  returning id
$$;

-- An Auth user plus an active staff account. role: a built-in role key or a role id.
create or replace function tests.create_staff(
  username text,
  role text,
  branch_codes text[] default '{}',
  all_branches boolean default false
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  staff_id uuid := tests.create_auth_user(create_staff.username);
begin
  insert into public.staff_users (id, username, full_name, role_id, all_branches, must_change_password)
  select staff_id, create_staff.username, initcap(create_staff.username), r.id, create_staff.all_branches, false
    from public.roles r
   where r.key = create_staff.role or r.id::text = create_staff.role;
  if not found then
    raise exception 'unknown role %', create_staff.role;
  end if;

  insert into public.staff_branches (staff_id, branch_id)
  select staff_id, b.id from public.branches b where b.code = any (create_staff.branch_codes);
  return staff_id;
end
$$;

-- The standard cast used by most test files: branches B901 (A) and B902 (B), and these staff:
--   owner        super_admin     all branches
--   admin        admin           all branches
--   manager_a    branch_manager  A
--   reception_a  receptionist    A
--   reception_b  receptionist    B
--   trainer_ab   trainer         A and B
--   former_a     receptionist    A, deactivated
create or replace function tests.create_fixture()
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Start from no staff and no settings, whatever the local database holds (e.g. the admin from
  -- `pnpm bootstrap:admin`). Every test file runs in a transaction that rolls back, so this
  -- never removes anything for real.
  delete from public.settings;
  delete from public.staff_pins;
  delete from public.staff_branches;
  delete from public.staff_users;
  delete from auth.users;

  perform tests.create_branch('B901');
  perform tests.create_branch('B902');
  perform tests.create_staff('owner', 'super_admin', all_branches => true);
  perform tests.create_staff('admin', 'admin', all_branches => true);
  perform tests.create_staff('manager_a', 'branch_manager', array['B901']);
  perform tests.create_staff('reception_a', 'receptionist', array['B901']);
  perform tests.create_staff('reception_b', 'receptionist', array['B902']);
  perform tests.create_staff('trainer_ab', 'trainer', array['B901', 'B902']);
  perform tests.create_staff('former_a', 'receptionist', array['B901']);
  update public.staff_users set is_active = false where username = 'former_a';
end
$$;

-- Lookups that ignore RLS, so they also work while signed in as someone.
create or replace function tests.staff(username text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.staff_users s where s.username = staff.username
$$;

create or replace function tests.branch(code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.branches b where b.code = branch.code
$$;

create or replace function tests.auth_user_id(username text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where u.email = auth_user_id.username || '@staff.gym-spa.invalid'
$$;

create or replace function tests.role(key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.roles r where r.key = role.key
$$;

-- Every row of a table, ignoring RLS: what "sees everything" is compared against.
create or replace function tests.all_ids(table_name regclass)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query execute format('select id from %s', table_name);
end
$$;

create or replace function tests.total_rows(table_name regclass)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  execute format('select count(*)::integer from %s', table_name) into total;
  return total;
end
$$;

-- Act as a signed-in staff member (like a request from the app), as the service role, as an
-- anonymous visitor, or as the system again (no session).
create or replace function tests.authenticate_as(staff_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

create or replace function tests.authenticate_as_service_role()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end
$$;

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end
$$;

create or replace function tests.clear_authentication()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end
$$;

-- Runs a statement as the current user and returns how many rows it changed. RLS hides rows
-- silently, so "0 rows" is how a blocked update or delete shows up.
create or replace function tests.row_count(statement text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  changed integer;
begin
  execute statement;
  get diagnostics changed = row_count;
  return changed;
end
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

select ok(true, 'test helpers are installed');
select * from finish();
