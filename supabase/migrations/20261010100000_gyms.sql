-- Many gyms (spec §2.6, step MT-1): every row belongs to one gym.
--
-- Click Group sells the system to many gyms, and the online edition keeps all of them in one
-- database (the offline edition has exactly one gym). Every table except the permission catalog
-- gets gym_id:
--   * It fills itself in from the signed-in staff member's gym (default app.current_gym_id()), so
--     the app never sends it. Server code using the secret key must give it.
--   * It never changes (read_only triggers).
--   * Links between rows include it (composite foreign keys), so a row of one gym can never point
--     at a row of another, whoever writes it.
-- The rules that check it (RLS, guards, the read-only state, limits) are in the next migration.
--
-- A database set up before this step (like the cloud project) moves its data into one gym, code
-- 'demo'. A new database has no gym: the seed, the bootstrap script or (later) the seller panel
-- makes one with public.create_gym().

-- Gym codes ------------------------------------------------------------------------------------

-- The gym code is part of every staff login (<username>@<gym code>.staff.gym-spa.invalid), so it
-- never changes. 3 to 20 characters: lowercase Latin letters and digits with single hyphens
-- between them, starting with a letter. Keep in step with packages/core.
create function app.is_valid_gym_code(code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select length(code) between 3 and 20 and code ~ '^[a-z](-?[a-z0-9])+$'
$$;

-- Codes no gym can have. The same list is RESERVED_GYM_CODES in packages/core; a test compares
-- the two, so keep this array on one line.
create function app.is_reserved_gym_code(code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select code = any (array['admin', 'seller', 'support', 'api', 'www', 'app', 'login', 'clickgroup', 'gym-spa', 'test', 'root', 'system'])
$$;

-- Gyms -----------------------------------------------------------------------------------------

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ckb text not null check (app.is_clean_text(name_ckb, 100)),
  name_en text check (app.is_clean_text(name_en, 100)),
  name_ar text check (app.is_clean_text(name_ar, 100)),
  -- online: in the cloud project. offline: on the gym's own server PC, the only gym there.
  edition text not null default 'online' check (edition in ('online', 'offline')),
  -- Until when the gym has paid: its subscription online, its yearly license offline (the server
  -- PC writes it from the license). Empty: no end. Then 30 days of grace, then read-only.
  paid_until timestamptz,
  -- Set by Click Group. Suspended: read-only at once. Locked (fraud, a stolen account): the gym's
  -- staff lose all access.
  suspended_at timestamptz,
  locked_at timestamptz,
  -- The most active branches and devices the gym may have. Empty: no limit.
  max_branches integer check (max_branches > 0),
  max_devices integer check (max_devices > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint gyms_code_format check (app.is_valid_gym_code(code)),
  constraint gyms_code_not_reserved check (not app.is_reserved_gym_code(code))
);

create trigger read_only before update on public.gyms
  for each row execute function app.read_only_columns('id', 'code', 'edition');
create trigger stamp before insert or update on public.gyms
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.gyms
  for each row execute function app.audit_row();

-- The gym on every row -------------------------------------------------------------------------
-- Moving existing rows into the default gym is not a business change: no stamps, audit entries or
-- guards for it, so the triggers are off until the rows have their gym.

alter table public.branches disable trigger user;
alter table public.roles disable trigger user;
alter table public.role_permissions disable trigger user;
alter table public.staff_users disable trigger user;
alter table public.staff_branches disable trigger user;
alter table public.staff_branch_access disable trigger user;
alter table public.staff_pins disable trigger user;
alter table public.devices disable trigger user;
alter table public.device_status disable trigger user;
alter table public.settings disable trigger user;
alter table public.audit_logs disable trigger user;

alter table public.branches add column gym_id uuid;
alter table public.roles add column gym_id uuid;
alter table public.role_permissions add column gym_id uuid;
alter table public.staff_users add column gym_id uuid;
alter table public.staff_branches add column gym_id uuid;
alter table public.staff_branch_access add column gym_id uuid;
alter table public.staff_pins add column gym_id uuid;
alter table public.devices add column gym_id uuid;
alter table public.device_status add column gym_id uuid;
alter table public.settings add column gym_id uuid;
-- Empty only for entries written before gyms existed in a new database.
alter table public.audit_logs add column gym_id uuid;

-- The built-in roles, copied into every new gym by app.create_gym_roles(). Kept in the private
-- schema: the app reads each gym's own copy in public.roles.
--
-- Adding a permission later: add it to public.permissions, give it to the admin role here
-- (insert into app.role_template_permissions) and in every gym (insert into public.role_permissions
-- for each role with key 'admin'), and add its label to packages/i18n. The Owner gets it
-- automatically.
create table app.role_templates (
  key text primary key check (key ~ '^[a-z][a-z_]{1,39}$'),
  name_ckb text not null,
  name_en text not null,
  name_ar text not null
);

create table app.role_template_permissions (
  role_key text not null references app.role_templates (key),
  permission_key text not null references public.permissions (key),
  primary key (role_key, permission_key)
);
create index role_template_permissions_permission_key_idx on app.role_template_permissions (permission_key);

-- The gym's top role is the Owner (it was Super Admin until this step); it has every permission
-- without rows.
insert into app.role_templates (key, name_ckb, name_en, name_ar) values
  ('owner', 'خاوەن', 'Owner', 'المالك'),
  ('admin', 'بەڕێوەبەر', 'Admin', 'مدير النظام'),
  ('branch_manager', 'بەڕێوەبەری لق', 'Branch Manager', 'مدير الفرع'),
  ('receptionist', 'کارمەندی پێشوازی', 'Receptionist', 'موظف الاستقبال'),
  ('trainer', 'ڕاهێنەر', 'Trainer', 'مدرب'),
  ('spa_therapist', 'کارمەندی سپا', 'Spa Therapist', 'معالج السبا'),
  ('accountant', 'ژمێریار', 'Accountant', 'محاسب'),
  ('cashier', 'قاسەدار', 'Cashier', 'أمين الصندوق');

-- Their permissions are the ones migration 20261005100300 gave the built-in roles.
insert into app.role_template_permissions (role_key, permission_key)
select distinct r.key, rp.permission_key
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
 where r.is_system and r.key in (select t.key from app.role_templates t);

do $$
declare
  default_gym_id uuid;
begin
  if exists (select 1 from public.branches) or exists (select 1 from public.staff_users) then
    -- A database in use: its data becomes the gym 'demo' (Click Group's sales demo later).
    insert into public.gyms (code, name_ckb, name_en, name_ar)
    values ('demo', 'جیمی نموونە', 'Demo Gym', 'النادي التجريبي')
    returning id into default_gym_id;

    update public.branches set gym_id = default_gym_id;
    update public.roles set gym_id = default_gym_id;
    update public.role_permissions set gym_id = default_gym_id;
    update public.staff_users set gym_id = default_gym_id;
    update public.staff_branches set gym_id = default_gym_id;
    update public.staff_branch_access set gym_id = default_gym_id;
    update public.staff_pins set gym_id = default_gym_id;
    update public.devices set gym_id = default_gym_id;
    update public.device_status set gym_id = default_gym_id;
    update public.settings set gym_id = default_gym_id;
    update public.audit_logs set gym_id = default_gym_id;

    update public.roles
       set key = 'owner', name_ckb = 'خاوەن', name_en = 'Owner', name_ar = 'المالك'
     where key = 'super_admin';
  else
    -- A new database: the built-in roles live on as templates, and each gym gets its own copy.
    delete from public.role_permissions;
    delete from public.roles;
  end if;
end
$$;

alter table public.branches enable trigger user;
alter table public.roles enable trigger user;
alter table public.role_permissions enable trigger user;
alter table public.staff_users enable trigger user;
alter table public.staff_branches enable trigger user;
alter table public.staff_branch_access enable trigger user;
alter table public.staff_pins enable trigger user;
alter table public.devices enable trigger user;
alter table public.device_status enable trigger user;
alter table public.settings enable trigger user;
alter table public.audit_logs enable trigger user;

-- The signed-in staff member's gym: only for active staff of a gym that isn't locked or closed.
-- Every rule goes through it, so a locked gym's staff lose all access at once, even with a token
-- they already have. In RLS policies write gym_id = (select app.current_gym_id()).
create function app.current_gym_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.gym_id
    from public.staff_users s
    join public.gyms g on g.id = s.gym_id
   where s.id = auth.uid()
     and s.is_active
     and s.deleted_at is null
     and g.locked_at is null
     and g.deleted_at is null
$$;

alter table public.branches alter column gym_id set not null, alter column gym_id set default app.current_gym_id();
alter table public.roles alter column gym_id set not null, alter column gym_id set default app.current_gym_id();
alter table public.role_permissions alter column gym_id set not null, alter column gym_id set default app.current_gym_id();
alter table public.staff_users alter column gym_id set not null, alter column gym_id set default app.current_gym_id();
alter table public.staff_branches alter column gym_id set not null, alter column gym_id set default app.current_gym_id();
alter table public.staff_branch_access alter column gym_id set not null;
alter table public.staff_pins alter column gym_id set not null, alter column gym_id set default app.current_gym_id();
alter table public.devices alter column gym_id set not null, alter column gym_id set default app.current_gym_id();
alter table public.device_status alter column gym_id set not null, alter column gym_id set default app.current_gym_id();
alter table public.settings alter column gym_id set not null, alter column gym_id set default app.current_gym_id();

-- Unique per gym, and links that can't cross gyms -------------------------------------------------
-- Tables that others point at get unique (id, gym_id); every link names both columns.

alter table public.branches
  drop constraint branches_code_key,
  add constraint branches_gym_id_code_key unique (gym_id, code),
  add constraint branches_id_gym_id_key unique (id, gym_id),
  add constraint branches_gym_id_fkey foreign key (gym_id) references public.gyms (id);

alter table public.roles
  drop constraint roles_key_key,
  add constraint roles_gym_id_key_key unique (gym_id, key),
  add constraint roles_id_gym_id_key unique (id, gym_id),
  add constraint roles_gym_id_fkey foreign key (gym_id) references public.gyms (id);

alter table public.role_permissions
  drop constraint role_permissions_role_id_fkey,
  add constraint role_permissions_role_id_gym_id_fkey
    foreign key (role_id, gym_id) references public.roles (id, gym_id);
create index role_permissions_role_id_gym_id_idx on public.role_permissions (role_id, gym_id);

drop index public.staff_users_role_id_idx;
alter table public.staff_users
  drop constraint staff_users_username_key,
  drop constraint staff_users_role_id_fkey,
  add constraint staff_users_gym_id_username_key unique (gym_id, username),
  add constraint staff_users_id_gym_id_key unique (id, gym_id),
  add constraint staff_users_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  add constraint staff_users_role_id_gym_id_fkey
    foreign key (role_id, gym_id) references public.roles (id, gym_id);
create index staff_users_role_id_gym_id_idx on public.staff_users (role_id, gym_id);

drop index public.staff_branches_branch_id_idx;
alter table public.staff_branches
  drop constraint staff_branches_staff_id_fkey,
  drop constraint staff_branches_branch_id_fkey,
  add constraint staff_branches_staff_id_gym_id_fkey
    foreign key (staff_id, gym_id) references public.staff_users (id, gym_id),
  add constraint staff_branches_branch_id_gym_id_fkey
    foreign key (branch_id, gym_id) references public.branches (id, gym_id);
create index staff_branches_staff_id_gym_id_idx on public.staff_branches (staff_id, gym_id);
create index staff_branches_branch_id_gym_id_idx on public.staff_branches (branch_id, gym_id);

drop index public.staff_branch_access_branch_id_idx;
alter table public.staff_branch_access
  drop constraint staff_branch_access_staff_id_fkey,
  drop constraint staff_branch_access_branch_id_fkey,
  add constraint staff_branch_access_staff_id_gym_id_fkey
    foreign key (staff_id, gym_id) references public.staff_users (id, gym_id) on delete cascade,
  add constraint staff_branch_access_branch_id_gym_id_fkey
    foreign key (branch_id, gym_id) references public.branches (id, gym_id) on delete cascade;
create index staff_branch_access_staff_id_gym_id_idx on public.staff_branch_access (staff_id, gym_id);
create index staff_branch_access_branch_id_gym_id_idx on public.staff_branch_access (branch_id, gym_id);

alter table public.staff_pins
  drop constraint staff_pins_staff_id_fkey,
  add constraint staff_pins_staff_id_gym_id_fkey
    foreign key (staff_id, gym_id) references public.staff_users (id, gym_id);
create index staff_pins_staff_id_gym_id_idx on public.staff_pins (staff_id, gym_id);

alter table public.devices
  drop constraint devices_branch_id_fkey,
  add constraint devices_id_gym_id_key unique (id, gym_id),
  add constraint devices_branch_id_gym_id_fkey
    foreign key (branch_id, gym_id) references public.branches (id, gym_id);
create index devices_branch_id_gym_id_idx on public.devices (branch_id, gym_id);

alter table public.device_status
  drop constraint device_status_device_id_fkey,
  add constraint device_status_device_id_gym_id_fkey
    foreign key (device_id, gym_id) references public.devices (id, gym_id);
create index device_status_device_id_gym_id_idx on public.device_status (device_id, gym_id);

alter table public.settings
  drop constraint settings_branch_id_key_key,
  drop constraint settings_branch_id_fkey,
  add constraint settings_gym_id_branch_id_key_key unique nulls not distinct (gym_id, branch_id, key),
  add constraint settings_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  add constraint settings_branch_id_gym_id_fkey
    foreign key (branch_id, gym_id) references public.branches (id, gym_id);
create index settings_branch_id_gym_id_idx on public.settings (branch_id, gym_id);

-- The audit log keeps entries whatever happens to the rows they describe, so no foreign key.
create index audit_logs_gym_idx on public.audit_logs (gym_id, occurred_at desc);

-- A row's gym never changes --------------------------------------------------------------------

drop trigger read_only on public.branches;
create trigger read_only before update on public.branches
  for each row execute function app.read_only_columns('id', 'code', 'gym_id');
drop trigger read_only on public.roles;
create trigger read_only before update on public.roles
  for each row execute function app.read_only_columns('id', 'key', 'is_system', 'gym_id');
drop trigger read_only on public.staff_users;
create trigger read_only before update on public.staff_users
  for each row execute function app.read_only_columns('id', 'gym_id');
drop trigger read_only on public.staff_pins;
create trigger read_only before update on public.staff_pins
  for each row execute function app.read_only_columns('staff_id', 'gym_id');
drop trigger read_only on public.devices;
create trigger read_only before update on public.devices
  for each row execute function app.read_only_columns('id', 'branch_id', 'code', 'gym_id');
drop trigger read_only on public.settings;
create trigger read_only before update on public.settings
  for each row execute function app.read_only_columns('id', 'branch_id', 'key', 'gym_id');
create trigger read_only before update on public.role_permissions
  for each row execute function app.read_only_columns('id', 'gym_id');
create trigger read_only before update on public.staff_branches
  for each row execute function app.read_only_columns('id', 'gym_id');
create trigger read_only before update on public.staff_branch_access
  for each row execute function app.read_only_columns('id', 'gym_id');
create trigger read_only before update on public.device_status
  for each row execute function app.read_only_columns('device_id', 'gym_id');

-- Access to the gyms table ---------------------------------------------------------------------
-- Staff read their own gym. Changes come from server code (the seller panel, step MT-3).

alter table public.gyms enable row level security;
revoke all on table public.gyms from anon, authenticated;
grant all on table public.gyms to service_role;
grant select on table public.gyms to authenticated;

create policy "staff read their gym" on public.gyms
  for select to authenticated
  using (id = (select app.current_gym_id()));

-- New gyms -------------------------------------------------------------------------------------

-- Gives a new gym its own copy of the built-in roles and their permissions.
create function app.create_gym_roles(p_gym_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with new_roles as (
    insert into public.roles (gym_id, key, name_ckb, name_en, name_ar, is_system)
    select p_gym_id, t.key, t.name_ckb, t.name_en, t.name_ar, true
      from app.role_templates t
    returning id, key
  )
  insert into public.role_permissions (gym_id, role_id, permission_key)
  select p_gym_id, r.id, tp.permission_key
    from new_roles r
    join app.role_template_permissions tp on tp.role_key = r.key
$$;

-- Creates a gym with its roles and its first branch (B1), all or nothing. Its first Owner account
-- comes next, from the staff module (step MT-2) or `pnpm bootstrap:admin`. The code can never
-- change: it is part of every staff login. Server code only for now; the seller panel (MT-3)
-- calls it for platform admins.
create function public.create_gym(
  p_code text,
  p_name_ckb text,
  p_first_branch_name text,
  p_name_en text default null,
  p_name_ar text default null,
  p_edition text default 'online',
  p_id uuid default null
)
returns public.gyms
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
begin
  if p_code is null or not app.is_valid_gym_code(p_code) then
    raise exception using errcode = '23514', message = 'invalid_gym_code',
      detail = 'A gym code has 3 to 20 lowercase Latin letters, digits and single hyphens, and starts with a letter';
  end if;
  if app.is_reserved_gym_code(p_code) then
    raise exception using errcode = '23514', message = 'reserved_gym_code',
      detail = 'This gym code is reserved';
  end if;
  if exists (select 1 from public.gyms g where g.code = p_code) then
    raise exception using errcode = '23505', message = 'gym_code_taken',
      detail = 'Another gym already has this code; codes are never reused';
  end if;

  insert into public.gyms (id, code, name_ckb, name_en, name_ar, edition)
  values (coalesce(p_id, gen_random_uuid()), p_code, p_name_ckb, p_name_en, p_name_ar, p_edition)
  returning * into gym;

  perform app.create_gym_roles(gym.id);
  insert into public.branches (gym_id, code, name_ckb) values (gym.id, 'B1', p_first_branch_name);
  return gym;
end
$$;

revoke execute on function public.create_gym(text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_gym(text, text, text, text, text, text, uuid) to service_role;
