-- Phase 2, step 2j (security hardening, decided by the user on 2026-10-22): the two marks a function
-- still set with set_config() for its own transaction, app.creating_member (create_member(): health
-- info written with members.create alone) and app.moving_device (move_device(): a device's branch
-- and code), become rows in a private table, like the import's mark (20261023100000). A session
-- with SQL, which the offline edition's server PC may give someone, could set any setting; nobody
-- but these functions can write the table. Expand first: the functions keep their signatures and
-- results, and the old settings simply no longer count.

-- What a function is doing in this transaction, for the triggers it passes. Private: no API role has
-- any right on it, so only security definer code owned by the migrations' role writes it, and only
-- create_member() and move_device() do; each removes its row before it returns.
create table app.transaction_marks (
  xact xid8 not null,
  action text not null check (action in ('create_member', 'move_device')),
  target uuid not null,
  primary key (xact, action, target)
);

revoke all on table app.transaction_marks from public, anon, authenticated, service_role;

-- Whether this transaction is doing p_action to p_target (marked by the function that does it).
create function app.has_transaction_mark(p_action text, p_target uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.transaction_marks m
     where m.xact = pg_current_xact_id_if_assigned() and m.action = p_action and m.target = p_target
  )
$$;

-- Adding a member ---------------------------------------------------------------------------------

-- As in 20261023100000_member_import.sql, and the member being created is marked in the table.
create or replace function app.guard_member_health()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return new;
  end if;
  -- The members an import just added: in its transaction import_members() is the only writer,
  -- and it checked the importer's permissions.
  if tg_op = 'INSERT' and app.is_importing() then
    return new;
  end if;
  if exists (select 1 from public.members m where m.id = new.id and m.status = 'archived') then
    raise exception using errcode = '42501', message = 'member_archived',
      detail = 'An archived member can''t be changed; restore them first';
  end if;
  if not (app.has_permission('members.medical.view') and app.has_permission('members.edit'))
     and not (tg_op = 'INSERT' and app.has_transaction_mark('create_member', new.id))
  then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Health info needs members.medical.view and members.edit, or is written while creating the member';
  end if;
  return new;
end
$$;

-- As in 20261019100000_members.sql, and security definer, to mark its transaction: the member's
-- gym comes from the caller (the column's default), the guard checks the branch as before, and the
-- phone check looks in the caller's gym only (RLS no longer narrows it). The triggers, the row
-- stamps and the audit log still name the caller (auth.uid()).
create or replace function public.create_member(
  p_id uuid,
  p_branch_id uuid,
  p_full_name text,
  p_gender text,
  p_phone text default null,
  p_emergency_contact_name text default null,
  p_emergency_phone text default null,
  p_birth_date date default null,
  p_preferred_language public.language_code default 'ckb',
  p_address text default null,
  p_referral_source text default null,
  p_goals text default null,
  p_notes text default null,
  p_tags text[] default '{}',
  p_blood_type text default null,
  p_medical_notes text default null,
  p_injuries text default null
)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.members;
  failed_constraint text;
begin
  if not (app.has_permission('members.create') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Adding a member needs members.create and members.view';
  end if;
  if exists (select 1 from public.members m where m.id = p_id) then
    raise exception using errcode = '23505', message = 'member_exists',
      detail = 'A member with this id was already saved';
  end if;
  if p_phone is not null and exists (
    select 1 from public.members m
     where m.phone = p_phone and m.gym_id = app.current_gym_id() and m.deleted_at is null
  ) then
    raise exception using errcode = '23505', message = 'phone_in_use',
      detail = 'Another member of this gym has this phone number';
  end if;

  begin
    insert into public.members (
      id, branch_id, full_name, gender, phone, emergency_contact_name, emergency_phone, birth_date,
      preferred_language, address, referral_source, goals, notes, tags
    ) values (
      p_id, p_branch_id, p_full_name, p_gender, p_phone, p_emergency_contact_name, p_emergency_phone,
      p_birth_date, coalesce(p_preferred_language, 'ckb'), p_address, p_referral_source, p_goals,
      p_notes, coalesce(p_tags, '{}')
    )
    returning * into created;
  exception
    when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint = 'members_gym_id_phone_key' then
        raise exception using errcode = '23505', message = 'phone_in_use',
          detail = 'Another member of this gym has this phone number';
      elsif failed_constraint = 'members_pkey' then
        raise exception using errcode = '23505', message = 'member_exists',
          detail = 'A member with this id was already saved';
      end if;
      raise;
  end;

  if p_blood_type is not null or p_medical_notes is not null or p_injuries is not null then
    insert into app.transaction_marks (xact, action, target)
    values (pg_current_xact_id(), 'create_member', p_id);
    insert into public.member_health (id, blood_type, medical_notes, injuries)
    values (p_id, p_blood_type, p_medical_notes, p_injuries);
    delete from app.transaction_marks m
     where m.xact = pg_current_xact_id() and m.action = 'create_member' and m.target = p_id;
    select * into created from public.members m where m.id = p_id;
  end if;
  return created;
end
$$;

-- Moving a device -------------------------------------------------------------------------------

-- As in 20261011100000_admin_screens.sql, and the device being moved is marked in the table.
create or replace function app.guard_devices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.branch_id, new.code) is distinct from (old.branch_id, old.code)
     and not app.has_transaction_mark('move_device', new.id)
  then
    raise exception using errcode = '42501', message = 'read_only_column',
      detail = 'devices.branch_id and devices.code change only through move_device()';
  end if;
  return new;
end
$$;

-- As in 20261011100000_admin_screens.sql (already security definer), and it marks the move in the
-- table instead of a setting.
create or replace function public.move_device(p_device_id uuid, p_branch_id uuid)
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

  insert into app.transaction_marks (xact, action, target)
  values (pg_current_xact_id(), 'move_device', p_device_id);
  update public.devices
     set branch_id = p_branch_id, code = app.next_device_code(p_branch_id)
   where id = p_device_id
  returning * into device;
  delete from app.transaction_marks m
   where m.xact = pg_current_xact_id() and m.action = 'move_device' and m.target = p_device_id;
  return device;
end
$$;
