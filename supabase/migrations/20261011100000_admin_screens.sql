-- The admin screens (step 1e): staff, roles, branches and devices.
--
--   * Changes that touch several rows are one function each, all or nothing: save_staff_access
--     (a staff member and their branches), save_role (a role and its permissions). They run as the
--     caller (security invoker), so RLS, the guards and the audit log apply as for any other write.
--   * create_branch gives a new branch the gym's next code; codes are never reused.
--   * staff_directory and role_overview answer the screens in one call each, including what the
--     caller may do with each row, worked out by the same rules the guards use.
--   * Devices must be registered (decided by the user on 2026-10-11): a staff member with
--     devices.manage registers a device once, and unlock_on_device refuses a device that isn't
--     registered, is deactivated, or works in a deactivated branch. move_device moves a device to
--     another branch. Every device counts toward the gym's max_devices, a manager's own phone too.
--   * A gym keeps at least one active branch.

-- Staff --------------------------------------------------------------------------------------------

-- The staff the signed-in user may see (app.can_view_staff), with what the staff list shows.
-- branch_ids holds only branches the caller can access; hidden_branch_count counts the others.
-- can_manage: whether the caller may change this staff member (app.can_manage_staff).
create function public.staff_directory()
returns table (
  id uuid,
  username text,
  full_name text,
  phone text,
  role_id uuid,
  all_branches boolean,
  branch_ids uuid[],
  hidden_branch_count integer,
  is_active boolean,
  must_change_password boolean,
  has_pin boolean,
  pin_locked boolean,
  last_login_at timestamptz,
  created_at timestamptz,
  can_manage boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.username, s.full_name, s.phone, s.role_id, s.all_branches,
         coalesce(
           array(select sb.branch_id from public.staff_branches sb
                  where sb.staff_id = s.id and sb.branch_id in (select app.accessible_branch_ids())
                  order by sb.branch_id),
           '{}'),
         (select count(*)::integer from public.staff_branches sb
           where sb.staff_id = s.id and sb.branch_id not in (select app.accessible_branch_ids())),
         s.is_active,
         s.must_change_password,
         p.staff_id is not null,
         p.locked_at is not null,
         u.last_sign_in_at,
         s.created_at,
         app.can_manage_staff(s.id)
    from public.staff_users s
    left join public.staff_pins p on p.staff_id = s.id
    left join auth.users u on u.id = s.id
   where s.gym_id = app.current_gym_id()
     and s.deleted_at is null
     and app.can_view_staff(s.id)
   order by s.full_name, s.username
$$;

revoke execute on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated;

-- A staff member's name, phone, role and branches in one change. Their login (username, password,
-- active or not) changes through the staff module instead. Security invoker: the guards decide.
-- With all branches the staff_branches rows go: access follows the flag.
create function public.save_staff_access(
  p_staff_id uuid,
  p_full_name text,
  p_role_id uuid,
  p_all_branches boolean,
  p_branch_ids uuid[],
  p_phone text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wanted uuid[] := case when coalesce(p_all_branches, false) then '{}'
                        else coalesce(p_branch_ids, '{}') end;
begin
  if not app.has_permission('staff.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Managing staff needs the staff.manage permission';
  end if;
  if p_staff_id = auth.uid() then
    raise exception using errcode = '42501', message = 'cannot_edit_own_account',
      detail = 'Nobody manages their own account; another manager does';
  end if;
  if not coalesce(p_all_branches, false) and cardinality(wanted) = 0 then
    raise exception using errcode = '23514', message = 'branches_required',
      detail = 'A staff member works in at least one branch, or in all of them';
  end if;
  if array_position(wanted, null) is not null then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'You can only give access to your own branches';
  end if;

  update public.staff_users
     set full_name = p_full_name,
         phone = p_phone,
         role_id = p_role_id,
         all_branches = coalesce(p_all_branches, false)
   where id = p_staff_id and deleted_at is null;
  -- Not visible (another gym, no staff.view for them) or not there: the same answer.
  if not found then
    raise exception using errcode = '42501', message = 'cannot_manage_staff',
      detail = 'This staff member has access you do not have';
  end if;

  delete from public.staff_branches sb
   where sb.staff_id = p_staff_id and not (sb.branch_id = any (wanted));
  insert into public.staff_branches (staff_id, branch_id)
  select distinct p_staff_id, b.id
    from unnest(wanted) as b (id)
   where not exists (
     select 1 from public.staff_branches sb where sb.staff_id = p_staff_id and sb.branch_id = b.id
   );
end
$$;

revoke execute on function public.save_staff_access(uuid, text, uuid, boolean, uuid[], text) from public, anon;
grant execute on function public.save_staff_access(uuid, text, uuid, boolean, uuid[], text) to authenticated;

-- Roles --------------------------------------------------------------------------------------------

-- The gym's roles with their permissions (the Owner: all of them) and what the caller may do:
--   can_edit: rename it (roles.manage, its permissions are all the caller's, built-in: Owner only);
--   can_edit_permissions: also change its permissions (never the Owner role or the caller's own);
--   can_grant: give it to a staff member (staff.manage and app.can_grant_role);
--   staff_count: staff who have it, active or not. A role with staff can't be deleted.
create function public.role_overview()
returns table (
  id uuid,
  key text,
  name_ckb text,
  name_en text,
  name_ar text,
  is_system boolean,
  permission_keys text[],
  staff_count integer,
  is_own_role boolean,
  can_edit boolean,
  can_edit_permissions boolean,
  can_grant boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select s.role_id,
           app.has_permission('roles.manage') as manages_roles,
           app.has_permission('staff.manage') as manages_staff,
           app.is_owner() as is_owner
      from public.staff_users s
     where s.id = auth.uid() and s.gym_id = app.current_gym_id()
  ),
  visible as (
    select r.*,
           me.role_id = r.id as own,
           me.manages_roles and (not r.is_system or me.is_owner) and app.covers_role(r.id) as editable,
           me.manages_staff and app.can_grant_role(r.id) as grantable
      from public.roles r
     cross join me
     where r.gym_id = app.current_gym_id() and r.deleted_at is null
  )
  select r.id, r.key, r.name_ckb, r.name_en, r.name_ar, r.is_system,
         coalesce(array(select unnest(app.role_permission_keys(r.id)) as k order by k), '{}'),
         (select count(*)::integer from public.staff_users s where s.role_id = r.id and s.deleted_at is null),
         r.own,
         r.editable,
         r.editable and r.key is distinct from 'owner' and not r.own,
         r.grantable
    from visible r
   order by r.is_system desc, r.name_ckb
$$;

revoke execute on function public.role_overview() from public, anon;
grant execute on function public.role_overview() to authenticated;

-- Creates a custom role (p_role_id made by the app) or changes one: its names, and its permissions
-- when p_permission_keys isn't null (null keeps them, as for the Owner role, which has all). One
-- change, all or nothing. Security invoker: the guards decide (built-in roles: Owner only; never
-- your own role's permissions; only permissions you have yourself).
create function public.save_role(
  p_role_id uuid,
  p_name_ckb text,
  p_permission_keys text[] default null,
  p_name_en text default null,
  p_name_ar text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.roles;
  wanted text[];
begin
  if not app.has_permission('roles.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Managing roles needs the roles.manage permission';
  end if;
  if p_role_id is null then
    raise exception using errcode = '22023', message = 'invalid_request', detail = 'A role needs an id';
  end if;
  if p_permission_keys is not null then
    if exists (
      select 1 from unnest(p_permission_keys) as k (key)
       where k.key is null or not exists (select 1 from public.permissions p where p.key = k.key)
    ) then
      raise exception using errcode = '22023', message = 'unknown_permission',
        detail = 'Every permission must be in the permission catalog';
    end if;
    wanted := array(select distinct unnest(p_permission_keys));
  end if;

  select * into existing from public.roles r where r.id = p_role_id;
  if not found then
    insert into public.roles (id, name_ckb, name_en, name_ar)
    values (p_role_id, p_name_ckb, p_name_en, p_name_ar);
  else
    if existing.deleted_at is not null then
      raise exception using errcode = '23514', message = 'role_deleted', detail = 'This role has been deleted';
    end if;
    update public.roles
       set name_ckb = p_name_ckb, name_en = p_name_en, name_ar = p_name_ar
     where id = p_role_id;
    if not found then
      raise exception using errcode = '42501', message = 'cannot_edit_role',
        detail = 'You can only edit roles whose permissions you have yourself';
    end if;
  end if;

  if wanted is not null then
    delete from public.role_permissions rp
     where rp.role_id = p_role_id and not (rp.permission_key = any (wanted));
    insert into public.role_permissions (role_id, permission_key)
    select p_role_id, k.key
      from unnest(wanted) as k (key)
     where not exists (
       select 1 from public.role_permissions rp where rp.role_id = p_role_id and rp.permission_key = k.key
     );
  end if;
end
$$;

revoke execute on function public.save_role(uuid, text, text[], text, text) from public, anon;
grant execute on function public.save_role(uuid, text, text[], text, text) to authenticated;

-- Branches ---------------------------------------------------------------------------------------

-- The gym's next branch code: one more than the highest it ever had, so codes are never reused
-- (receipt numbers carry them: B1-000457). Branches are only deactivated, never removed, so the
-- highest code stays in the table.
create function app.next_branch_code(p_gym_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number integer;
begin
  -- One new branch at a time per gym, so two never get the same code.
  perform pg_advisory_xact_lock(hashtextextended('create_branch:' || p_gym_id::text, 0));
  select coalesce(max(substring(b.code from 2)::integer), 0) + 1
    into next_number
    from public.branches b
   where b.gym_id = p_gym_id;
  if next_number > 999 then
    raise exception using errcode = '23514', message = 'branch_code_exhausted',
      detail = 'This gym has used every branch code (B1 to B999)';
  end if;
  return 'B' || next_number;
end
$$;

-- create_branch() runs as the caller, so the caller may run this too (the app schema isn't exposed
-- to the Data API).
revoke execute on function app.next_branch_code(uuid) from public, anon;
grant execute on function app.next_branch_code(uuid) to authenticated;

-- Adds a branch (p_id made by the app) with the gym's next code. Security invoker: RLS decides
-- (branches.manage and access to all branches), the gym's branch limit applies.
create function public.create_branch(
  p_id uuid,
  p_name_ckb text,
  p_name_en text default null,
  p_name_ar text default null,
  p_phone text default null,
  p_address text default null
)
returns public.branches
language plpgsql
security invoker
set search_path = ''
as $$
declare
  branch public.branches;
begin
  if not (app.has_permission('branches.manage') and app.has_all_branches()) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Adding a branch needs branches.manage and access to all branches';
  end if;
  insert into public.branches (id, code, name_ckb, name_en, name_ar, phone, address)
  values (p_id, app.next_branch_code(app.current_gym_id()), p_name_ckb, p_name_en, p_name_ar, p_phone, p_address)
  returning * into branch;
  return branch;
end
$$;

revoke execute on function public.create_branch(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_branch(uuid, text, text, text, text, text) to authenticated;

-- BEFORE UPDATE trigger on branches: the gym keeps at least one active branch. Applies to server
-- code too.
create function app.keep_an_active_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.is_active and old.deleted_at is null)
     and not (new.is_active and new.deleted_at is null)
     and not exists (
       select 1 from public.branches b
        where b.gym_id = new.gym_id and b.id <> new.id and b.is_active and b.deleted_at is null
     )
  then
    raise exception using errcode = '23514', message = 'last_active_branch',
      detail = 'A gym keeps at least one active branch';
  end if;
  return new;
end
$$;

create trigger keep_active before update of is_active, deleted_at on public.branches
  for each row execute function app.keep_an_active_branch();

-- Devices ----------------------------------------------------------------------------------------

-- Device codes (D01, D02, ...) only name a device on the screens: receipt numbers no longer carry
-- them (B1-000457). Within a branch they are still unique.
comment on column public.devices.code is 'Short name of the device within its branch (D01). Not part of receipt numbers.';

-- A device's branch and code change only through move_device(), which sets this flag for that one
-- device in its own transaction. Clients can't set it: the Data API exposes no way to set settings.
drop trigger read_only on public.devices;
create trigger read_only before update on public.devices
  for each row execute function app.read_only_columns('id', 'gym_id');

create function app.guard_devices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.branch_id, new.code) is distinct from (old.branch_id, old.code)
     and current_setting('app.moving_device', true) is distinct from new.id::text
  then
    raise exception using errcode = '42501', message = 'read_only_column',
      detail = 'devices.branch_id and devices.code change only through move_device()';
  end if;
  return new;
end
$$;

create trigger guard before update on public.devices
  for each row execute function app.guard_devices();

-- The device's next code in a branch. One at a time per branch.
create function app.next_device_code(p_branch_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('register_device:' || p_branch_id::text, 0));
  select coalesce(max(substring(d.code from 2)::integer), 0) + 1
    into next_number
    from public.devices d
   where d.branch_id = p_branch_id;
  if next_number > 999 then
    raise exception using errcode = '23514', message = 'device_code_exhausted',
      detail = 'This branch has used every device code (D01 to D999)';
  end if;
  return 'D' || lpad(next_number::text, 2, '0');
end
$$;

revoke execute on function app.next_device_code(uuid) from public, anon, authenticated;

-- Whether a branch of the caller's gym is active (and not removed).
create function app.is_active_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.gym_id = app.current_gym_id() and b.is_active and b.deleted_at is null
  )
$$;

-- As before, plus: only in an active branch, and a device id already used by another gym is
-- refused (the app makes a new id when a device changes gym).
create or replace function public.register_device(
  p_device_id uuid,
  p_branch_id uuid,
  p_name text,
  p_platform text,
  p_default_language public.language_code default null
)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.devices;
begin
  if not (app.has_permission('devices.manage') and app.has_branch_access(p_branch_id)) then
    raise exception using errcode = '42501', message = 'not_allowed',
      detail = 'Registering a device needs devices.manage and access to its branch';
  end if;

  select * into device from public.devices d where d.id = p_device_id;
  if found then
    if device.gym_id <> app.current_gym_id() then
      raise exception using errcode = '23514', message = 'device_in_other_gym',
        detail = 'This device id belongs to another gym';
    end if;
    if device.branch_id <> p_branch_id then
      raise exception using errcode = '23514', message = 'device_in_other_branch',
        detail = 'This device is already registered in another branch';
    end if;
    return device;
  end if;

  if not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '23514', message = 'branch_inactive',
      detail = 'Devices are registered in active branches only';
  end if;

  insert into public.devices (id, branch_id, code, name, platform, default_language)
  values (p_device_id, p_branch_id, app.next_device_code(p_branch_id), p_name, p_platform, p_default_language)
  returning * into device;
  return device;
end
$$;

-- Moves a device to another branch; it gets the next code there. Needs devices.manage and access
-- to both branches; the new branch must be active.
create function public.move_device(p_device_id uuid, p_branch_id uuid)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.devices;
begin
  if not app.has_permission('devices.manage') then
    raise exception using errcode = '42501', message = 'not_allowed',
      detail = 'Moving a device needs devices.manage';
  end if;
  select * into device from public.devices d
   where d.id = p_device_id and d.gym_id = app.current_gym_id() and d.deleted_at is null;
  if not found or not app.has_branch_access(device.branch_id) then
    raise exception using errcode = '42501', message = 'device_not_accessible',
      detail = 'The device does not exist or is in a branch you cannot access';
  end if;
  if p_branch_id is null or not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'You can only move a device to your own branches';
  end if;
  if device.branch_id = p_branch_id then
    return device;
  end if;
  if not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '23514', message = 'branch_inactive',
      detail = 'Devices move to active branches only';
  end if;

  perform set_config('app.moving_device', p_device_id::text, true);
  update public.devices
     set branch_id = p_branch_id, code = app.next_device_code(p_branch_id)
   where id = p_device_id
  returning * into device;
  perform set_config('app.moving_device', '', true);
  return device;
end
$$;

revoke execute on function public.move_device(uuid, uuid) from public, anon;
grant execute on function public.move_device(uuid, uuid) to authenticated;

-- This device as the app needs it at start and at every server check: nothing when it isn't
-- registered in the caller's gym. can_use: the caller may work on it (access to its branch).
-- Answers whatever the caller's permissions, so every staff member's device learns its branch.
create function public.my_device(p_device_id uuid)
returns table (
  id uuid,
  code text,
  name text,
  platform text,
  default_language public.language_code,
  is_active boolean,
  branch_id uuid,
  branch_code text,
  branch_name_ckb text,
  branch_name_en text,
  branch_name_ar text,
  branch_is_active boolean,
  can_use boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.code, d.name, d.platform, d.default_language, d.is_active,
         b.id, b.code, b.name_ckb, b.name_en, b.name_ar, b.is_active and b.deleted_at is null,
         app.has_branch_access(b.id)
    from public.devices d
    join public.branches b on b.id = d.branch_id
   where d.id = p_device_id
     and d.gym_id = app.current_gym_id()
     and d.deleted_at is null
$$;

revoke execute on function public.my_device(uuid) from public, anon;
grant execute on function public.my_device(uuid) to authenticated;

-- PINs on a registered device ---------------------------------------------------------------------

-- Checks the signed-in staff member's PIN for work in p_branch_id and counts wrong tries. Both
-- unlock functions end here. Returns ok, wrong_pin (with tries_left), locked_out or no_pin.
create function app.check_staff_pin(p_pin text, p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pin public.staff_pins;
  max_attempts integer;
begin
  select * into pin from public.staff_pins where staff_id = auth.uid() for update;
  if not found then
    return jsonb_build_object('result', 'no_pin');
  end if;
  if pin.locked_at is not null then
    return jsonb_build_object('result', 'locked_out');
  end if;

  if pin.pin_hash = extensions.crypt(coalesce(p_pin, ''), pin.pin_hash) then
    if pin.failed_attempts > 0 then
      update public.staff_pins set failed_attempts = 0 where staff_id = pin.staff_id;
    end if;
    return jsonb_build_object('result', 'ok');
  end if;

  max_attempts := app.pin_max_attempts(p_branch_id);
  update public.staff_pins
     set failed_attempts = pin.failed_attempts + 1,
         locked_at = case when pin.failed_attempts + 1 >= max_attempts then now() end
   where staff_id = pin.staff_id;
  if pin.failed_attempts + 1 >= max_attempts then
    return jsonb_build_object('result', 'locked_out');
  end if;
  return jsonb_build_object('result', 'wrong_pin', 'tries_left', max_attempts - pin.failed_attempts - 1);
end
$$;

revoke execute on function app.check_staff_pin(text, uuid) from public, anon, authenticated;

-- Unchanged answers; the PIN check moved to app.check_staff_pin(). The app moves to
-- unlock_on_device() in step 1e-3, which then removes this one.
create or replace function public.unlock_with_pin(p_pin text, p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_active_staff() then
    if app.gym_access(app.caller_gym()) = 'locked' then
      return jsonb_build_object('result', 'gym_locked');
    end if;
    return jsonb_build_object('result', 'inactive');
  end if;
  -- Checked first, so it never uses up a try.
  if p_branch_id is null or not app.has_branch_access(p_branch_id) then
    return jsonb_build_object('result', 'no_branch_access');
  end if;
  return app.check_staff_pin(p_pin, p_branch_id);
end
$$;

-- Checks the signed-in staff member's PIN on this device, which works in its own branch. The
-- result is one of ok, wrong_pin (with tries_left), locked_out, no_pin, inactive, gym_locked,
-- device_not_registered, device_inactive, branch_inactive, no_branch_access. Everything about the
-- device is checked first, so it never uses up a try.
create function public.unlock_on_device(p_pin text, p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.devices;
begin
  if not app.is_active_staff() then
    if app.gym_access(app.caller_gym()) = 'locked' then
      return jsonb_build_object('result', 'gym_locked');
    end if;
    return jsonb_build_object('result', 'inactive');
  end if;

  select * into device from public.devices d
   where d.id = p_device_id and d.gym_id = app.current_gym_id() and d.deleted_at is null;
  if not found then
    return jsonb_build_object('result', 'device_not_registered');
  end if;
  if not device.is_active then
    return jsonb_build_object('result', 'device_inactive');
  end if;
  if not app.is_active_branch(device.branch_id) then
    return jsonb_build_object('result', 'branch_inactive');
  end if;
  if not app.has_branch_access(device.branch_id) then
    return jsonb_build_object('result', 'no_branch_access');
  end if;
  return app.check_staff_pin(p_pin, device.branch_id);
end
$$;

revoke execute on function public.unlock_on_device(text, uuid) from public, anon;
grant execute on function public.unlock_on_device(text, uuid) to authenticated;

-- Read-only gyms ---------------------------------------------------------------------------------

-- As before, plus: while the gym is read-only, a device can still be deactivated (it only takes
-- access away), like a staff member.
create or replace function app.check_gym_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'staff_users' and tg_op = 'UPDATE' then
    if old.id = auth.uid() then
      return new;
    end if;
    if (to_jsonb(new) - array['is_active', 'must_change_password', 'updated_at', 'updated_by'])
         = (to_jsonb(old) - array['is_active', 'must_change_password', 'updated_at', 'updated_by'])
       and (new.is_active = old.is_active or not new.is_active)
       and (new.must_change_password = old.must_change_password or new.must_change_password)
    then
      return new;
    end if;
  end if;
  -- Nested: PL/pgSQL may evaluate every part of an AND, and other tables have no is_active.
  if tg_table_name = 'devices' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['is_active', 'updated_at', 'updated_by'])
         = (to_jsonb(old) - array['is_active', 'updated_at', 'updated_by'])
       and not (to_jsonb(new) -> 'is_active')::boolean
    then
      return new;
    end if;
  end if;
  if not app.gym_writable() then
    raise exception using errcode = '42501', message = 'gym_read_only',
      detail = 'This gym is read-only: it is suspended, or its subscription or license has ended';
  end if;
  return coalesce(new, old);
end
$$;
