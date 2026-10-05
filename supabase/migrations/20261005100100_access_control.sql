-- Access control: branches, roles and permissions (RBAC), staff accounts and their branches, PINs.
--
-- Rules (spec §3, CLAUDE.md → Security & RBAC):
--   * Permission strings, never role names. Super Admin implicitly has every permission.
--   * One role per staff member. Branch access: all_branches, otherwise the staff_branches rows.
--   * app.accessible_branch_ids() is the one place the branch rule is written (has_branch_access()
--     wraps it); the PowerSync sync rules apply the same rule.
--   * Nobody can give a permission (or a role with a permission) they don't have, change their own
--     account's access, or manage someone with more access than them. Only Super Admin can give the
--     Super Admin role or edit the built-in roles.

-- Tables ---------------------------------------------------------------------------------------

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  -- Printed in receipt numbers (the B1 in B1-D03-000457), so it never changes and is never reused.
  code text not null unique check (code ~ '^B[1-9][0-9]{0,2}$'),
  name_ckb text not null check (app.is_clean_text(name_ckb, 100)),
  name_en text check (app.is_clean_text(name_en, 100)),
  name_ar text check (app.is_clean_text(name_ar, 100)),
  phone text check (phone ~ '^\+?[0-9][0-9 ]{3,18}[0-9]$'),
  address text check (app.is_clean_text(address, 300)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  -- Only the built-in roles have a key (super_admin, admin, ...); custom roles don't.
  key text unique check (key ~ '^[a-z][a-z_]{1,39}$'),
  name_ckb text not null check (app.is_clean_text(name_ckb, 60)),
  name_en text check (app.is_clean_text(name_en, 60)),
  name_ar text check (app.is_clean_text(name_ar, 60)),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  check (is_system = (key is not null))
);

-- The permission catalog. Filled by migrations only; labels are translated in the app.
create table public.permissions (
  key text primary key check (key ~ '^[a-z][a-z_]*(\.[a-z0-9_]+)+$'),
  -- Group in the permission matrix.
  module text not null check (module ~ '^[a-z][a-z_]*$'),
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id),
  permission_key text not null references public.permissions (key),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (role_id, permission_key)
);
create index role_permissions_permission_key_idx on public.role_permissions (permission_key);

-- Staff accounts: people who can log in. The id is their Supabase Auth user id. Accounts are
-- deactivated (is_active = false), never deleted.
create table public.staff_users (
  id uuid primary key references auth.users (id),
  -- Staff log in with a username; packages/core maps it to their internal Auth email.
  -- Keep this pattern in sync with USERNAME_PATTERN in packages/core/src/staff.ts.
  username text not null unique check (username ~ '^[a-z][a-z0-9._-]{2,31}$'),
  full_name text not null check (app.is_clean_text(full_name, 100)),
  phone text check (phone ~ '^\+?[0-9][0-9 ]{3,18}[0-9]$'),
  role_id uuid not null references public.roles (id),
  all_branches boolean not null default false,
  -- Empty: the device's default language is used.
  preferred_language public.language_code,
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);
create index staff_users_role_id_idx on public.staff_users (role_id);

create table public.staff_branches (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_users (id),
  branch_id uuid not null references public.branches (id),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (staff_id, branch_id)
);
create index staff_branches_branch_id_idx on public.staff_branches (branch_id);

-- The PIN that unlocks the app on a device, hashed on the device (PBKDF2-SHA256). Only its owner
-- can read it: after their password login, a device downloads it to allow offline PIN unlock.
-- Never synced to other devices.
create table public.staff_pins (
  staff_id uuid primary key references public.staff_users (id),
  algorithm text not null check (algorithm = 'pbkdf2-sha256'),
  iterations integer not null check (iterations between 100000 and 10000000),
  -- Base64: a salt of at least 16 bytes, and a 32-byte hash.
  salt text not null check (salt ~ '^[A-Za-z0-9+/]{22,}={0,2}$'),
  hash text not null check (hash ~ '^[A-Za-z0-9+/]{43}=$'),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Who is signed in, and what they can do ------------------------------------------------------
-- SECURITY DEFINER so they can read the access tables whatever the caller's own RLS allows.

-- True when the signed-in user has an active staff account.
create function app.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_users s
     where s.id = auth.uid() and s.is_active and s.deleted_at is null
  )
$$;

create function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.staff_users s
      join public.roles r on r.id = s.role_id
     where s.id = auth.uid() and s.is_active and s.deleted_at is null
       and r.key = 'super_admin' and r.deleted_at is null
  )
$$;

-- The permissions a role gives. Super Admin: every permission, including ones added later.
create function app.role_permission_keys(role_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.key = 'super_admin' then
      coalesce((select array_agg(p.key) from public.permissions p), '{}')
    else
      coalesce((select array_agg(rp.permission_key) from public.role_permissions rp where rp.role_id = r.id), '{}')
  end
  from public.roles r
  where r.id = role_permission_keys.role_id
$$;

-- The signed-in staff member's permissions (none when signed out, deactivated or role deleted).
create function app.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app.role_permission_keys(s.role_id)
       from public.staff_users s
       join public.roles r on r.id = s.role_id
      where s.id = auth.uid() and s.is_active and s.deleted_at is null and r.deleted_at is null),
    '{}'
  )
$$;

-- In RLS policies write (select app.has_permission('...')) so Postgres runs it once per query, not
-- once per row.
create function app.has_permission(permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select has_permission.permission = any (app.my_permissions())
$$;

create function app.has_all_branches()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.all_branches from public.staff_users s
      where s.id = auth.uid() and s.is_active and s.deleted_at is null),
    false
  )
$$;

-- THE branch-access rule: every branch with all_branches, otherwise the staff member's
-- staff_branches rows. In RLS policies write branch_id in (select app.accessible_branch_ids()):
-- Postgres runs it once per query, not once per row.
create function app.accessible_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
    from public.branches b
    join public.staff_users s on s.id = auth.uid() and s.is_active and s.deleted_at is null
   where s.all_branches
      or exists (select 1 from public.staff_branches sb where sb.staff_id = s.id and sb.branch_id = b.id)
$$;

create function app.has_branch_access(branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select has_branch_access.branch_id in (select app.accessible_branch_ids())
$$;

-- True when the signed-in user has every permission the role gives. Super Admin is covered only
-- by Super Admin.
create function app.covers_role(role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_super_admin() or coalesce(
    (select r.key is distinct from 'super_admin'
            and app.role_permission_keys(r.id) <@ app.my_permissions()
       from public.roles r
      where r.id = covers_role.role_id),
    false
  )
$$;

-- Whether the signed-in user may give this role to someone.
create function app.can_grant_role(role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.deleted_at is null from public.roles r where r.id = can_grant_role.role_id),
    false
  ) and app.covers_role(can_grant_role.role_id)
$$;

-- Whether the signed-in user may see a staff member: themselves; otherwise with staff.view, staff
-- who share a branch with them or who work in all branches (all of them with all_branches).
create function app.can_view_staff(staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (can_view_staff.staff_id = auth.uid() and app.is_active_staff())
    or (
      app.has_permission('staff.view')
      and (
        app.has_all_branches()
        or exists (select 1 from public.staff_users t where t.id = can_view_staff.staff_id and t.all_branches)
        or exists (
          select 1 from public.staff_branches sb
           where sb.staff_id = can_view_staff.staff_id
             and sb.branch_id in (select app.accessible_branch_ids())
        )
      )
    )
$$;

-- Whether the signed-in user may manage another staff member's account: needs staff.manage, never
-- themselves, the target's role must be covered by the user's permissions, and the target can't
-- reach branches the user can't.
create function app.can_manage_staff(staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('staff.manage')
    and can_manage_staff.staff_id is distinct from auth.uid()
    and exists (
      select 1 from public.staff_users t
       where t.id = can_manage_staff.staff_id
         and app.covers_role(t.role_id)
         and (
           app.has_all_branches()
           or (
             not t.all_branches
             and not exists (
               select 1 from public.staff_branches sb
                where sb.staff_id = t.id
                  and sb.branch_id not in (select app.accessible_branch_ids())
             )
           )
         )
    )
$$;

-- Guards (BEFORE triggers). Coarse checks are in the RLS policies; these add the rules that
-- compare old and new values or other rows. Skipped in system context.

create function app.guard_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_system then
      raise exception using errcode = '42501', message = 'system_role_read_only',
        detail = 'Built-in roles are created by migrations only';
    end if;
    return new;
  end if;

  if old.is_system and not app.is_super_admin() then
    raise exception using errcode = '42501', message = 'system_role_read_only',
      detail = 'Only Super Admin can edit built-in roles';
  end if;
  if not app.covers_role(old.id) then
    raise exception using errcode = '42501', message = 'cannot_edit_role',
      detail = 'You can only edit roles whose permissions you have yourself';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    if old.is_system then
      raise exception using errcode = '42501', message = 'system_role_read_only',
        detail = 'Built-in roles cannot be deleted';
    end if;
    if exists (select 1 from public.staff_users s where s.role_id = old.id and s.deleted_at is null) then
      raise exception using errcode = '23514', message = 'role_in_use',
        detail = 'Give the staff members who have this role another role first';
    end if;
  end if;
  return new;
end
$$;

create function app.guard_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role public.roles;
begin
  select * into target_role from public.roles r where r.id = coalesce(new.role_id, old.role_id);

  if target_role.key = 'super_admin' then
    raise exception using errcode = '23514', message = 'super_admin_has_all_permissions',
      detail = 'Super Admin has every permission; its permissions are not stored';
  end if;

  if app.is_system_context() then
    return coalesce(new, old);
  end if;

  if target_role.deleted_at is not null then
    raise exception using errcode = '23514', message = 'role_deleted', detail = 'This role has been deleted';
  end if;
  if target_role.is_system and not app.is_super_admin() then
    raise exception using errcode = '42501', message = 'system_role_read_only',
      detail = 'Only Super Admin can edit built-in roles';
  end if;
  if target_role.id = (select s.role_id from public.staff_users s where s.id = auth.uid()) then
    raise exception using errcode = '42501', message = 'cannot_edit_own_role',
      detail = 'You cannot change the permissions of your own role';
  end if;
  if not app.covers_role(target_role.id) then
    raise exception using errcode = '42501', message = 'cannot_edit_role',
      detail = 'You can only edit roles whose permissions you have yourself';
  end if;
  if tg_op = 'INSERT' and not app.has_permission(new.permission_key) then
    raise exception using errcode = '42501', message = 'cannot_grant_permission',
      detail = 'You can only give permissions you have yourself';
  end if;
  return coalesce(new, old);
end
$$;

create function app.guard_staff_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not app.can_grant_role(new.role_id) then
      raise exception using errcode = '42501', message = 'cannot_grant_role',
        detail = 'You can only give roles whose permissions you have yourself';
    end if;
    if new.all_branches and not app.has_all_branches() then
      raise exception using errcode = '42501', message = 'cannot_grant_all_branches',
        detail = 'Only staff with access to all branches can give it';
    end if;
    -- Someone else chose the first password, so the new staff member has to change it.
    new.must_change_password := true;
    return new;
  end if;

  if new.username is distinct from old.username then
    raise exception using errcode = '42501', message = 'read_only_column',
      detail = 'Usernames change through the staff service, which also changes the login';
  end if;

  if old.id = auth.uid() then
    if (new.full_name, new.phone, new.role_id, new.all_branches, new.is_active, new.must_change_password, new.deleted_at)
       is distinct from
       (old.full_name, old.phone, old.role_id, old.all_branches, old.is_active, old.must_change_password, old.deleted_at)
    then
      raise exception using errcode = '42501', message = 'cannot_edit_own_account',
        detail = 'Staff can change only their own language; a manager changes the rest';
    end if;
    return new;
  end if;

  if not app.can_manage_staff(old.id) then
    raise exception using errcode = '42501', message = 'cannot_manage_staff',
      detail = 'This staff member has access you do not have';
  end if;
  if new.role_id is distinct from old.role_id and not app.can_grant_role(new.role_id) then
    raise exception using errcode = '42501', message = 'cannot_grant_role',
      detail = 'You can only give roles whose permissions you have yourself';
  end if;
  if new.all_branches and not old.all_branches and not app.has_all_branches() then
    raise exception using errcode = '42501', message = 'cannot_grant_all_branches',
      detail = 'Only staff with access to all branches can give it';
  end if;
  return new;
end
$$;

create function app.guard_staff_branches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return coalesce(new, old);
  end if;

  if not app.can_manage_staff(coalesce(new.staff_id, old.staff_id)) then
    raise exception using errcode = '42501', message = 'cannot_manage_staff',
      detail = 'This staff member has access you do not have';
  end if;
  if not app.has_branch_access(coalesce(new.branch_id, old.branch_id)) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'You can only give access to your own branches';
  end if;
  return coalesce(new, old);
end
$$;

-- Triggers -------------------------------------------------------------------------------------
-- BEFORE triggers run in name order: guard, read_only, stamp.

create trigger read_only before update on public.branches
  for each row execute function app.read_only_columns('id', 'code');
create trigger stamp before insert or update on public.branches
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.branches
  for each row execute function app.audit_row();

create trigger guard before insert or update on public.roles
  for each row execute function app.guard_roles();
create trigger read_only before update on public.roles
  for each row execute function app.read_only_columns('id', 'key', 'is_system');
create trigger stamp before insert or update on public.roles
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.roles
  for each row execute function app.audit_row();

create trigger guard before insert or delete on public.role_permissions
  for each row execute function app.guard_role_permissions();
create trigger stamp before insert on public.role_permissions
  for each row execute function app.stamp_created();
create trigger audit after insert or update or delete on public.role_permissions
  for each row execute function app.audit_row();

create trigger guard before insert or update on public.staff_users
  for each row execute function app.guard_staff_users();
create trigger read_only before update on public.staff_users
  for each row execute function app.read_only_columns('id');
create trigger stamp before insert or update on public.staff_users
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.staff_users
  for each row execute function app.audit_row();

create trigger guard before insert or delete on public.staff_branches
  for each row execute function app.guard_staff_branches();
create trigger stamp before insert on public.staff_branches
  for each row execute function app.stamp_created();
create trigger audit after insert or update or delete on public.staff_branches
  for each row execute function app.audit_row();

create trigger read_only before update on public.staff_pins
  for each row execute function app.read_only_columns('staff_id');
create trigger stamp before insert or update on public.staff_pins
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.staff_pins
  for each row execute function app.audit_row('{salt,hash}');

-- A staff member who changes their own password no longer has to. (When an admin resets someone's
-- password, the staff service sets must_change_password again right after.)
create function app.clear_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.staff_users set must_change_password = false
   where id = new.id and must_change_password;
  return null;
end
$$;

create trigger staff_password_changed
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function app.clear_must_change_password();

-- Row level security ---------------------------------------------------------------------------

alter table public.branches enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff_users enable row level security;
alter table public.staff_branches enable row level security;
alter table public.staff_pins enable row level security;

revoke all on table
  public.branches, public.roles, public.permissions, public.role_permissions,
  public.staff_users, public.staff_branches, public.staff_pins
from anon, authenticated;

grant all on table
  public.branches, public.roles, public.permissions, public.role_permissions,
  public.staff_users, public.staff_branches, public.staff_pins
to service_role;

-- branches: staff see their branches. Adding and editing branches needs branches.manage and access
-- to all branches. Branches are never deleted (deleted_at instead).
grant select, insert, update on table public.branches to authenticated;

create policy "staff read their branches" on public.branches
  for select to authenticated
  -- all_branches is checked directly as well: a branch being inserted is not yet in
  -- accessible_branch_ids() when INSERT ... RETURNING reads it back.
  using ((select app.has_all_branches()) or id in (select app.accessible_branch_ids()));

create policy "branch managers add branches" on public.branches
  for insert to authenticated
  with check ((select app.has_permission('branches.manage')) and (select app.has_all_branches()));

create policy "branch managers edit branches" on public.branches
  for update to authenticated
  using ((select app.has_permission('branches.manage')) and (select app.has_all_branches()))
  with check ((select app.has_permission('branches.manage')) and (select app.has_all_branches()));

-- roles, permissions, role_permissions: every active staff member reads them (devices cache every
-- role's permissions for PIN switching). Changes need roles.manage, plus the guards.
grant select, insert, update on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select, insert, delete on table public.role_permissions to authenticated;

create policy "staff read roles" on public.roles
  for select to authenticated
  using ((select app.is_active_staff()));

create policy "role managers add roles" on public.roles
  for insert to authenticated
  with check ((select app.has_permission('roles.manage')));

create policy "role managers edit roles" on public.roles
  for update to authenticated
  using ((select app.has_permission('roles.manage')))
  with check ((select app.has_permission('roles.manage')));

create policy "staff read permissions" on public.permissions
  for select to authenticated
  using ((select app.is_active_staff()));

create policy "staff read role permissions" on public.role_permissions
  for select to authenticated
  using ((select app.is_active_staff()));

create policy "role managers add role permissions" on public.role_permissions
  for insert to authenticated
  with check ((select app.has_permission('roles.manage')));

create policy "role managers remove role permissions" on public.role_permissions
  for delete to authenticated
  using ((select app.has_permission('roles.manage')));

-- staff_users, staff_branches: see app.can_view_staff(). Staff accounts are created by the staff
-- service (it creates the Auth user with the secret key, then inserts this row with the caller's
-- session so these rules apply). Never deleted.
grant select, insert, update on table public.staff_users to authenticated;
grant select, insert, delete on table public.staff_branches to authenticated;

create policy "staff read staff they can see" on public.staff_users
  for select to authenticated
  using (app.can_view_staff(id));

create policy "staff managers add staff" on public.staff_users
  for insert to authenticated
  with check ((select app.has_permission('staff.manage')));

create policy "staff edit themselves, staff managers edit staff" on public.staff_users
  for update to authenticated
  using ((id = auth.uid() and (select app.is_active_staff())) or (select app.has_permission('staff.manage')))
  with check ((id = auth.uid() and (select app.is_active_staff())) or (select app.has_permission('staff.manage')));

create policy "staff read branches of staff they can see" on public.staff_branches
  for select to authenticated
  using (app.can_view_staff(staff_id));

create policy "staff managers add staff branches" on public.staff_branches
  for insert to authenticated
  with check ((select app.has_permission('staff.manage')));

create policy "staff managers remove staff branches" on public.staff_branches
  for delete to authenticated
  using ((select app.has_permission('staff.manage')));

-- staff_pins: only the owner. Managers reset someone's PIN with reset_staff_pin().
grant select, insert, update, delete on table public.staff_pins to authenticated;

create policy "staff read their own pin" on public.staff_pins
  for select to authenticated
  using (staff_id = auth.uid() and (select app.is_active_staff()));

create policy "staff set their own pin" on public.staff_pins
  for insert to authenticated
  with check (staff_id = auth.uid() and (select app.is_active_staff()));

create policy "staff change their own pin" on public.staff_pins
  for update to authenticated
  using (staff_id = auth.uid() and (select app.is_active_staff()))
  with check (staff_id = auth.uid() and (select app.is_active_staff()));

create policy "staff remove their own pin" on public.staff_pins
  for delete to authenticated
  using (staff_id = auth.uid() and (select app.is_active_staff()));

-- audit_logs (created in the foundation migration): audit.view, limited to the user's branches.
-- Rows that belong to no single branch (roles, staff accounts, ...) need access to all branches.
create policy "auditors read the audit log" on public.audit_logs
  for select to authenticated
  using (
    (select app.has_permission('audit.view'))
    and ((select app.has_all_branches()) or branch_id in (select app.accessible_branch_ids()))
  );

-- RPCs -----------------------------------------------------------------------------------------

-- Removes a staff member's PIN, so they set a new one at their next password login. Devices that
-- cached the old PIN drop it when they next check online (step 1d).
create function public.reset_staff_pin(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can_manage_staff(p_staff_id) then
    raise exception using errcode = '42501', message = 'cannot_manage_staff',
      detail = 'This staff member has access you do not have';
  end if;
  delete from public.staff_pins where staff_id = p_staff_id;
end
$$;

revoke execute on function public.reset_staff_pin(uuid) from public, anon;
grant execute on function public.reset_staff_pin(uuid) to authenticated, service_role;
