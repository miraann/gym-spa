-- The seller panel's gyms (spec §2.6, step MT-3): create a gym with its first Owner, set an online
-- gym's subscription end, its limits and its name, suspend, lock and reactivate it, and read usage
-- counts. Every function checks for a platform admin with two-step login first
-- (app.require_platform_admin, previous migration) and logs what it changed in platform.audit_logs.
-- The seller never reads a gym's business data: the gym functions return the gym's own record and
-- counts, nothing else.
--
-- Also here: the billing.view permission (who in a gym sees the 30/7/1-day warnings) and my_gym()
-- telling a suspended gym apart from one whose subscription ran out.

-- billing.view --------------------------------------------------------------------------------
-- Who sees the gym's own subscription with Click Group and its warnings. The Owner has it like
-- every permission; the Admin role gets it in every gym.

insert into public.permissions (key, module, sort_order) values ('billing.view', 'settings', 105);
insert into app.role_template_permissions (role_key, permission_key) values ('admin', 'billing.view');
insert into public.role_permissions (gym_id, role_id, permission_key)
select r.gym_id, r.id, 'billing.view'
  from public.roles r
 where r.key = 'admin' and r.is_system;

-- my_gym() ------------------------------------------------------------------------------------
-- As before, plus suspended: a read-only gym says whether Click Group paused it or its
-- subscription (or license) ran out.

drop function public.my_gym();

create function public.my_gym()
returns table (
  id uuid,
  code text,
  name_ckb text,
  name_en text,
  name_ar text,
  edition text,
  access text,
  paid_until timestamptz,
  suspended boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.code, g.name_ckb, g.name_en, g.name_ar, g.edition, app.gym_access(g), g.paid_until,
         g.suspended_at is not null
    from app.caller_gym() g
   where g.id is not null
$$;

revoke execute on function public.my_gym() from public, anon;
grant execute on function public.my_gym() to authenticated, service_role;

-- Gym codes ----------------------------------------------------------------------------------

-- Whether a new gym may have this code: the format, the reserved list, and not taken. Codes are
-- never reused, so a closed gym keeps its code.
create function app.check_new_gym_code(p_code text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
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
end
$$;

-- As in migration 20261010100000, with its code checks in app.check_new_gym_code.
create or replace function public.create_gym(
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
  perform app.check_new_gym_code(p_code);

  insert into public.gyms (id, code, name_ckb, name_en, name_ar, edition)
  values (coalesce(p_id, gen_random_uuid()), p_code, p_name_ckb, p_name_en, p_name_ar, p_edition)
  returning * into gym;

  perform app.create_gym_roles(gym.id);
  insert into public.branches (gym_id, code, name_ckb) values (gym.id, 'B1', p_first_branch_name);
  return gym;
end
$$;

-- Reading gyms --------------------------------------------------------------------------------

-- Every gym (or one), newest first: its record, its access state and the reason for a lock or
-- suspension, and counts of what it uses. Never names, members or any other business data.
create function public.seller_gyms(p_gym_id uuid default null)
returns table (
  id uuid,
  code text,
  name_ckb text,
  name_en text,
  name_ar text,
  edition text,
  access text,
  paid_until timestamptz,
  suspended_at timestamptz,
  locked_at timestamptz,
  state_reason text,
  max_branches integer,
  max_devices integer,
  created_at timestamptz,
  active_branches integer,
  active_staff integer,
  active_devices integer,
  last_login_at timestamptz,
  last_device_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select g.id, g.code, g.name_ckb, g.name_en, g.name_ar, g.edition, app.gym_access(g),
           g.paid_until, g.suspended_at, g.locked_at,
           (select l.reason from platform.audit_logs l
             where l.gym_id = g.id
               and l.action = case when g.locked_at is not null then 'gym_locked' else 'gym_suspended' end
               and (g.locked_at is not null or g.suspended_at is not null)
             order by l.occurred_at desc
             limit 1),
           g.max_branches, g.max_devices, g.created_at,
           (select count(*)::integer from public.branches b
             where b.gym_id = g.id and b.is_active and b.deleted_at is null),
           (select count(*)::integer from public.staff_users s
             where s.gym_id = g.id and s.is_active and s.deleted_at is null),
           (select count(*)::integer from public.devices d
             where d.gym_id = g.id and d.is_active and d.deleted_at is null),
           (select max(u.last_sign_in_at) from public.staff_users s
              join auth.users u on u.id = s.id
             where s.gym_id = g.id),
           (select max(ds.last_seen_at) from public.device_status ds where ds.gym_id = g.id)
      from public.gyms g
     where p_gym_id is null or g.id = p_gym_id
     order by g.created_at desc, g.code;
end
$$;

-- Creating a gym ------------------------------------------------------------------------------
-- 1. seller_prepare_create_gym checks the code and the Owner's username under the platform
--    admin's session; 2. the seller-admin function makes the Owner's login
--    (<username>@<code>.staff.gym-spa.invalid); 3. seller_create_gym makes the gym, its roles, its
--    first branch and the Owner, all or nothing. If step 3 fails, the login is deleted again, so a
--    gym never exists without its Owner.

create function public.seller_prepare_create_gym(p_code text, p_owner_username text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  perform app.check_new_gym_code(p_code);
  if p_owner_username is null or not app.is_valid_username(p_owner_username) then
    raise exception using errcode = '22023', message = 'invalid_username',
      detail = 'A username has 3 to 32 characters: a-z first, then a-z, 0-9, ".", "_" or "-"';
  end if;
end
$$;

-- p_paid_until: the end of the subscription; empty for none (only when chosen on purpose).
create function public.seller_create_gym(
  p_gym_id uuid,
  p_code text,
  p_name_ckb text,
  p_first_branch_name text,
  p_owner_id uuid,
  p_owner_username text,
  p_owner_full_name text,
  p_paid_until timestamptz default null,
  p_name_en text default null,
  p_name_ar text default null,
  p_owner_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  if p_gym_id is null or p_owner_id is null
     or p_name_ckb is null or not app.is_clean_text(p_name_ckb, 100)
     or not app.is_clean_text(p_name_en, 100) or not app.is_clean_text(p_name_ar, 100)
     or p_first_branch_name is null or not app.is_clean_text(p_first_branch_name, 100)
     or p_owner_full_name is null or not app.is_clean_text(p_owner_full_name, 100)
     or p_owner_phone !~ '^\+?[0-9][0-9 ]{3,18}[0-9]$'
  then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A gym needs an id, a Kurdish name and a first branch name; its Owner a login, a full name and maybe a phone';
  end if;
  if p_owner_username is null or not app.is_valid_username(p_owner_username) then
    raise exception using errcode = '22023', message = 'invalid_username',
      detail = 'A username has 3 to 32 characters: a-z first, then a-z, 0-9, ".", "_" or "-"';
  end if;

  -- The gym's guards are for its staff (see app.is_system_context); turned off again below.
  perform set_config('app.platform_write', 'on', true);

  perform public.create_gym(p_code, p_name_ckb, p_first_branch_name, p_name_en, p_name_ar, 'online', p_gym_id);
  if p_paid_until is not null then
    update public.gyms set paid_until = p_paid_until where id = p_gym_id;
  end if;

  -- login_matches checks that the login has this gym's address; not_platform_admin that it isn't
  -- a platform admin's.
  insert into public.staff_users (id, gym_id, username, full_name, phone, role_id, all_branches, must_change_password)
  select p_owner_id, p_gym_id, p_owner_username, p_owner_full_name, p_owner_phone, r.id, true, true
    from public.roles r
   where r.gym_id = p_gym_id and r.key = 'owner';

  perform set_config('app.platform_write', 'off', true);

  perform app.platform_log('gym_created', p_gym_id, null, null, jsonb_build_object(
    'code', p_code,
    'name_ckb', p_name_ckb,
    'paid_until', p_paid_until,
    'owner_id', p_owner_id,
    'owner_username', p_owner_username
  ));
end
$$;

-- Changing a gym ------------------------------------------------------------------------------

-- The gym a seller change is about, locked until the change is done. Only online gyms: an offline
-- gym follows its license (step MT-5), on its own server.
create function app.seller_gym_for_change(p_gym_id uuid)
returns public.gyms
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
begin
  select * into gym from public.gyms g where g.id = p_gym_id and g.deleted_at is null for update;
  if not found then
    raise exception using errcode = '22023', message = 'gym_not_found',
      detail = 'There is no open gym with this id';
  end if;
  if gym.edition <> 'online' then
    raise exception using errcode = '22023', message = 'offline_gym',
      detail = 'An offline gym follows its license';
  end if;
  return gym;
end
$$;

-- A reason: optional for suspend and reactivate, required for lock.
create function app.check_reason(p_reason text, p_required boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if (p_required and p_reason is null) or not app.is_clean_text(p_reason, 500) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'A reason has 1 to 500 characters with no spaces at either end; locking needs one';
  end if;
end
$$;

-- The subscription's end (empty: no end). After it, 30 days of grace, then read-only.
create function public.seller_set_paid_until(p_gym_id uuid, p_paid_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
begin
  perform app.require_platform_admin();
  gym := app.seller_gym_for_change(p_gym_id);
  if gym.paid_until is not distinct from p_paid_until then
    return;
  end if;
  update public.gyms set paid_until = p_paid_until where id = p_gym_id;
  perform app.platform_log('gym_paid_until_set', p_gym_id, null, null,
    jsonb_build_object('old', gym.paid_until, 'new', p_paid_until));
end
$$;

-- The most active branches and devices (empty: no limit). Lowering a limit below what the gym
-- already uses keeps what it has; it only stops new ones.
create function public.seller_set_limits(p_gym_id uuid, p_max_branches integer, p_max_devices integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
begin
  perform app.require_platform_admin();
  if p_max_branches < 1 or p_max_devices < 1 then
    raise exception using errcode = '22023', message = 'invalid_limit',
      detail = 'A limit is at least 1, or empty for none';
  end if;
  gym := app.seller_gym_for_change(p_gym_id);
  if (gym.max_branches, gym.max_devices) is not distinct from (p_max_branches, p_max_devices) then
    return;
  end if;
  update public.gyms set max_branches = p_max_branches, max_devices = p_max_devices where id = p_gym_id;
  perform app.platform_log('gym_limits_set', p_gym_id, null, null, jsonb_build_object(
    'old', jsonb_build_object('max_branches', gym.max_branches, 'max_devices', gym.max_devices),
    'new', jsonb_build_object('max_branches', p_max_branches, 'max_devices', p_max_devices)));
end
$$;

-- Fixes the gym's name. Never its code: that is part of every login.
create function public.seller_rename_gym(p_gym_id uuid, p_name_ckb text, p_name_en text, p_name_ar text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
begin
  perform app.require_platform_admin();
  if p_name_ckb is null or not app.is_clean_text(p_name_ckb, 100)
     or not app.is_clean_text(p_name_en, 100) or not app.is_clean_text(p_name_ar, 100)
  then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A gym has a Kurdish name and maybe English and Arabic ones, each 1 to 100 characters';
  end if;
  gym := app.seller_gym_for_change(p_gym_id);
  if (gym.name_ckb, gym.name_en, gym.name_ar) is not distinct from (p_name_ckb, p_name_en, p_name_ar) then
    return;
  end if;
  update public.gyms set name_ckb = p_name_ckb, name_en = p_name_en, name_ar = p_name_ar where id = p_gym_id;
  perform app.platform_log('gym_renamed', p_gym_id, null, null, jsonb_build_object(
    'old', jsonb_build_object('name_ckb', gym.name_ckb, 'name_en', gym.name_en, 'name_ar', gym.name_ar),
    'new', jsonb_build_object('name_ckb', p_name_ckb, 'name_en', p_name_en, 'name_ar', p_name_ar)));
end
$$;

-- Suspend: read-only at once (the usual action, e.g. unpaid). Its staff still log in and look.
create function public.seller_suspend_gym(p_gym_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
begin
  perform app.require_platform_admin();
  perform app.check_reason(p_reason, false);
  gym := app.seller_gym_for_change(p_gym_id);
  if gym.suspended_at is not null then
    return;
  end if;
  update public.gyms set suspended_at = now() where id = p_gym_id;
  perform app.platform_log('gym_suspended', p_gym_id, null, p_reason);
end
$$;

-- Lock (fraud, a stolen account): no access at all. Data access stops at once
-- (app.current_gym_id), and the Auth hook refuses every new token to the gym's staff.
create function public.seller_lock_gym(p_gym_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
begin
  perform app.require_platform_admin();
  perform app.check_reason(p_reason, true);
  gym := app.seller_gym_for_change(p_gym_id);
  if gym.locked_at is not null then
    return;
  end if;
  update public.gyms set locked_at = now() where id = p_gym_id;
  perform app.platform_log('gym_locked', p_gym_id, null, p_reason);
end
$$;

-- Ends a suspension and a lock.
create function public.seller_reactivate_gym(p_gym_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
begin
  perform app.require_platform_admin();
  perform app.check_reason(p_reason, false);
  gym := app.seller_gym_for_change(p_gym_id);
  if gym.suspended_at is null and gym.locked_at is null then
    return;
  end if;
  update public.gyms set suspended_at = null, locked_at = null where id = p_gym_id;
  perform app.platform_log('gym_reactivated', p_gym_id, null, p_reason, jsonb_build_object(
    'was_suspended', gym.suspended_at is not null, 'was_locked', gym.locked_at is not null));
end
$$;

-- Grants ----------------------------------------------------------------------------------------

revoke execute on function public.seller_gyms(uuid) from public, anon;
grant execute on function public.seller_gyms(uuid) to authenticated;
revoke execute on function public.seller_prepare_create_gym(text, text) from public, anon;
grant execute on function public.seller_prepare_create_gym(text, text) to authenticated;
revoke execute on function public.seller_create_gym(uuid, text, text, text, uuid, text, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.seller_create_gym(uuid, text, text, text, uuid, text, text, timestamptz, text, text, text) to authenticated;
revoke execute on function public.seller_set_paid_until(uuid, timestamptz) from public, anon;
grant execute on function public.seller_set_paid_until(uuid, timestamptz) to authenticated;
revoke execute on function public.seller_set_limits(uuid, integer, integer) from public, anon;
grant execute on function public.seller_set_limits(uuid, integer, integer) to authenticated;
revoke execute on function public.seller_rename_gym(uuid, text, text, text) from public, anon;
grant execute on function public.seller_rename_gym(uuid, text, text, text) to authenticated;
revoke execute on function public.seller_suspend_gym(uuid, text) from public, anon;
grant execute on function public.seller_suspend_gym(uuid, text) to authenticated;
revoke execute on function public.seller_lock_gym(uuid, text) from public, anon;
grant execute on function public.seller_lock_gym(uuid, text) to authenticated;
revoke execute on function public.seller_reactivate_gym(uuid, text) from public, anon;
grant execute on function public.seller_reactivate_gym(uuid, text) to authenticated;
