-- Helpers for every test file in this folder. `supabase test db` runs the files in name order; this
-- one runs first and commits, so the `tests` schema stays for the other files. They roll back their
-- own changes. Local database only: never part of a migration.
create extension if not exists pgtap with schema extensions;

select plan(1);

-- Made fresh on every run, so helpers whose parameters changed leave no old versions behind.
drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Most helpers take a gym code; without one they work in gym A of the fixture ('pgtap-a').

create or replace function tests.gym(code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id from public.gyms g where g.code = gym.code
$$;

-- A new gym with its built-in roles and branch B1, as the seller panel will make it.
create or replace function tests.create_gym(code text)
returns uuid
language sql
set search_path = ''
as $$
  select g.id from public.create_gym(create_gym.code, 'یانەی ' || create_gym.code, 'لقی یەکەم') as g
$$;

create or replace function tests.create_branch(code text, gym_code text default 'pgtap-a')
returns uuid
language sql
set search_path = ''
as $$
  insert into public.branches (gym_id, code, name_ckb)
  values (tests.gym(create_branch.gym_code), create_branch.code, 'لقی ' || create_branch.code)
  returning id
$$;

-- A custom (not built-in) role with the given permissions.
create or replace function tests.create_role(name text, permission_keys text[], gym_code text default 'pgtap-a')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_role_id uuid;
  role_gym_id uuid := tests.gym(gym_code);
begin
  insert into public.roles (gym_id, name_ckb) values (role_gym_id, create_role.name) returning id into new_role_id;
  insert into public.role_permissions (gym_id, role_id, permission_key)
  select role_gym_id, new_role_id, unnest(permission_keys);
  return new_role_id;
end
$$;

-- The Auth user of a staff member: <username>@<gym code>.staff.gym-spa.invalid.
create or replace function tests.create_auth_user(username text, gym_code text default 'pgtap-a')
returns uuid
language sql
set search_path = ''
as $$
  insert into auth.users (id, email, aud, role)
  values (
    gen_random_uuid(),
    create_auth_user.username || '@' || create_auth_user.gym_code || '.staff.gym-spa.invalid',
    'authenticated',
    'authenticated'
  )
  returning id
$$;

-- An Auth user plus an active staff account. role: a built-in role key or a role id.
create or replace function tests.create_staff(
  username text,
  role text,
  branch_codes text[] default '{}',
  all_branches boolean default false,
  gym_code text default 'pgtap-a'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  staff_id uuid := tests.create_auth_user(create_staff.username, create_staff.gym_code);
  staff_gym_id uuid := tests.gym(create_staff.gym_code);
begin
  insert into public.staff_users (id, gym_id, username, full_name, role_id, all_branches, must_change_password)
  select staff_id, staff_gym_id, create_staff.username, initcap(create_staff.username), r.id, create_staff.all_branches, false
    from public.roles r
   where r.gym_id = staff_gym_id and (r.key = create_staff.role or r.id::text = create_staff.role);
  if not found then
    raise exception 'unknown role % in gym %', create_staff.role, create_staff.gym_code;
  end if;

  insert into public.staff_branches (gym_id, staff_id, branch_id)
  select staff_gym_id, staff_id, b.id
    from public.branches b
   where b.gym_id = staff_gym_id and b.code = any (create_staff.branch_codes);
  return staff_id;
end
$$;

-- The standard cast used by most test files. Two gyms, pgtap-a and pgtap-b, each with its own branch
-- B1 (from create_gym), branches B901 (A) and B902 (B), and the same staff usernames:
--   owner        owner           all branches
--   admin        admin           all branches
--   manager_a    branch_manager  A
--   reception_a  receptionist    A
--   reception_b  receptionist    B
--   trainer_ab   trainer         A and B
--   former_a     receptionist    A, deactivated
-- Same usernames and branch codes in both gyms on purpose: they are unique per gym, not globally.
create or replace function tests.create_fixture()
returns void
language plpgsql
set search_path = ''
as $$
declare
  gym_code text;
begin
  -- Start from no staff and no settings, whatever the local database holds (e.g. the admin from
  -- `pnpm bootstrap:admin`). Every test file runs in a transaction that rolls back, so this
  -- never removes anything for real.
  delete from public.settings;
  delete from public.staff_pins;
  delete from public.staff_branches;
  delete from public.staff_users;
  delete from auth.users;

  foreach gym_code in array array['pgtap-a', 'pgtap-b'] loop
    perform tests.create_gym(gym_code);
    perform tests.create_branch('B901', gym_code);
    perform tests.create_branch('B902', gym_code);
    perform tests.create_staff('owner', 'owner', all_branches => true, gym_code => gym_code);
    perform tests.create_staff('admin', 'admin', all_branches => true, gym_code => gym_code);
    perform tests.create_staff('manager_a', 'branch_manager', array['B901'], gym_code => gym_code);
    perform tests.create_staff('reception_a', 'receptionist', array['B901'], gym_code => gym_code);
    perform tests.create_staff('reception_b', 'receptionist', array['B902'], gym_code => gym_code);
    perform tests.create_staff('trainer_ab', 'trainer', array['B901', 'B902'], gym_code => gym_code);
    perform tests.create_staff('former_a', 'receptionist', array['B901'], gym_code => gym_code);
    update public.staff_users set is_active = false
     where username = 'former_a' and gym_id = tests.gym(gym_code);
  end loop;
end
$$;

-- Lookups that ignore RLS, so they also work while signed in as someone.
create or replace function tests.staff(username text, gym_code text default 'pgtap-a')
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.staff_users s
   where s.username = staff.username and s.gym_id = tests.gym(staff.gym_code)
$$;

create or replace function tests.branch(code text, gym_code text default 'pgtap-a')
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.branches b
   where b.code = branch.code and b.gym_id = tests.gym(branch.gym_code)
$$;

create or replace function tests.auth_user_id(username text, gym_code text default 'pgtap-a')
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
   where u.email = auth_user_id.username || '@' || auth_user_id.gym_code || '.staff.gym-spa.invalid'
$$;

create or replace function tests.role(key text, gym_code text default 'pgtap-a')
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.roles r
   where r.key = role.key and r.gym_id = tests.gym(role.gym_code)
$$;

-- The tables whose rows belong to a gym (they have gym_id).
create or replace function tests.gym_tables()
returns setof text
language sql
stable
set search_path = ''
as $$
  select c.relname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'gym_id' and not a.attisdropped
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
$$;

-- Every row of a table in one gym (every row, for tables without gym_id), ignoring RLS: what
-- "sees everything" is compared against.
create or replace function tests.all_ids(table_name regclass, gym_code text default 'pgtap-a')
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = table_name and a.attname = 'gym_id') then
    return query execute format('select id from %s where gym_id = $1', table_name) using tests.gym(gym_code);
  else
    return query execute format('select id from %s', table_name);
  end if;
end
$$;

create or replace function tests.total_rows(table_name regclass, gym_code text default 'pgtap-a')
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = table_name and a.attname = 'gym_id') then
    execute format('select count(*)::integer from %s where gym_id = $1', table_name) into total using tests.gym(gym_code);
  else
    execute format('select count(*)::integer from %s', table_name) into total;
  end if;
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

-- Like authenticate_as(), for a session that began with a password login at the given time (the
-- JWT's amr claim, which Supabase Auth keeps across token refreshes).
create or replace function tests.authenticate_with_password(staff_id uuid, logged_in_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', staff_id,
    'role', 'authenticated',
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from logged_in_at))::bigint))
  )::text, true);
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

-- Like row_count(), but "not allowed" (SQLSTATE 42501: no privilege, a policy or a guard) counts
-- as 0 rows. Any other error still fails the test.
create or replace function tests.rows_changed(statement text)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  return tests.row_count(statement);
exception
  when insufficient_privilege then
    return 0;
end
$$;

-- How many rows of a gym the current user can see in a table (0 without the privilege).
create or replace function tests.visible_rows(table_name text, gym_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  total integer;
begin
  execute format('select count(*)::integer from public.%I where gym_id = $1', table_name) into total using gym_id;
  return total;
exception
  when insufficient_privilege then
    return 0;
end
$$;

-- Runs a statement as the current user and returns the SQLSTATE it failed with, or null when it
-- worked (its changes then stay).
create or replace function tests.error_code(statement text)
returns text
language plpgsql
set search_path = ''
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlstate;
end
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

select ok(true, 'test helpers are installed');
select * from finish();
