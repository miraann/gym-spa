-- Many gyms (spec §2.6, step MT-1): every rule checks the gym.
--
--   * app.current_gym_id() (previous migration) is the gate: the helpers below and every policy go
--     through it, so staff only ever reach their own gym's rows.
--   * The gym's top role is the Owner (key owner); it was Super Admin.
--   * The gym's access state: active, then 30 days of grace after paid_until, then read-only.
--     Suspended gyms are read-only at once; locked gyms lose all access.
--   * Limits on active branches and devices.
--   * A staff member's Auth email must match their username and gym.

-- Who is signed in, and what they can do ------------------------------------------------------

-- Active staff of a gym that isn't locked.
create or replace function app.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.current_gym_id() is not null
$$;

create function app.is_owner()
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
     where s.id = auth.uid() and s.gym_id = app.current_gym_id()
       and r.key = 'owner' and r.deleted_at is null
  )
$$;

-- The permissions a role gives. The Owner: every permission, including ones added later.
create or replace function app.role_permission_keys(role_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.key = 'owner' then
      coalesce((select array_agg(p.key) from public.permissions p), '{}')
    else
      coalesce((select array_agg(rp.permission_key) from public.role_permissions rp where rp.role_id = r.id), '{}')
  end
  from public.roles r
  where r.id = role_permission_keys.role_id
$$;

create or replace function app.my_permissions()
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
      where s.id = auth.uid() and s.gym_id = app.current_gym_id() and r.deleted_at is null),
    '{}'
  )
$$;

-- All branches means all branches of the staff member's own gym.
create or replace function app.has_all_branches()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.all_branches from public.staff_users s
      where s.id = auth.uid() and s.gym_id = app.current_gym_id()),
    false
  )
$$;

create or replace function app.accessible_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.branch_id
    from public.staff_branch_access a
   where a.staff_id = auth.uid() and a.gym_id = app.current_gym_id()
$$;

-- True when the role is in the signed-in user's gym and they have every permission it gives. The
-- Owner role is covered only by the Owner.
create or replace function app.covers_role(role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.gym_id = app.current_gym_id()
            and (
              app.is_owner()
              or (r.key is distinct from 'owner' and app.role_permission_keys(r.id) <@ app.my_permissions())
            )
       from public.roles r
      where r.id = covers_role.role_id),
    false
  )
$$;

-- Whether the signed-in user may see a staff member of their gym: themselves; otherwise with
-- staff.view, staff who share a branch with them or who work in all branches (all of them with
-- all_branches).
create or replace function app.can_view_staff(staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_users t
     where t.id = can_view_staff.staff_id
       and t.gym_id = app.current_gym_id()
       and (
         t.id = auth.uid()
         or (
           app.has_permission('staff.view')
           and (
             app.has_all_branches()
             or t.all_branches
             or exists (
               select 1 from public.staff_branches sb
                where sb.staff_id = t.id
                  and sb.branch_id in (select app.accessible_branch_ids())
             )
           )
         )
       )
  )
$$;

-- Whether the signed-in user may manage another staff member of their gym: needs staff.manage,
-- never themselves, the target's role must be covered by the user's permissions, and the target
-- can't reach branches the user can't.
create or replace function app.can_manage_staff(staff_id uuid)
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
         and t.gym_id = app.current_gym_id()
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

-- Guards: the Owner instead of Super Admin ----------------------------------------------------

create or replace function app.guard_roles()
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
        detail = 'Built-in roles are created only with a new gym';
    end if;
    return new;
  end if;

  if old.is_system and not app.is_owner() then
    raise exception using errcode = '42501', message = 'system_role_read_only',
      detail = 'Only the Owner can edit built-in roles';
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

create or replace function app.guard_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role public.roles;
begin
  select * into target_role from public.roles r where r.id = coalesce(new.role_id, old.role_id);

  if target_role.key = 'owner' then
    raise exception using errcode = '23514', message = 'owner_has_all_permissions',
      detail = 'The Owner has every permission; its permissions are not stored';
  end if;

  if app.is_system_context() then
    return coalesce(new, old);
  end if;

  if target_role.deleted_at is not null then
    raise exception using errcode = '23514', message = 'role_deleted', detail = 'This role has been deleted';
  end if;
  if target_role.is_system and not app.is_owner() then
    raise exception using errcode = '42501', message = 'system_role_read_only',
      detail = 'Only the Owner can edit built-in roles';
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

drop function app.is_super_admin();

-- Branch access as rows: only the branches of the staff member's own gym -------------------------

create or replace function app.refresh_branch_access(p_staff_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with wanted as (
    select s.id as staff_id, b.id as branch_id, s.gym_id
      from public.staff_users s
      join public.branches b on b.gym_id = s.gym_id
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
  insert into public.staff_branch_access (staff_id, branch_id, gym_id)
  select w.staff_id, w.branch_id, w.gym_id from wanted w
  on conflict (staff_id, branch_id) do nothing
$$;

create or replace function app.refresh_branch_access_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff record;
begin
  if tg_table_name = 'branches' then
    -- A new branch: staff of its gym with all_branches get it.
    for staff in select s.id from public.staff_users s where s.all_branches and s.gym_id = new.gym_id loop
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

-- The audit log records the gym ---------------------------------------------------------------

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  redacted text[] := coalesce(tg_argv[0]::text[], '{}');
  old_values jsonb;
  new_values jsonb;
  row_values jsonb;
  changed text[];
  headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_values := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_values := to_jsonb(new);
  end if;
  row_values := coalesce(new_values, old_values);

  if tg_op = 'UPDATE' then
    -- Keep only what changed. A new updated_at/updated_by alone is not a change: the log records
    -- who and when anyway.
    select coalesce(array_agg(n.key order by n.key), '{}')
      into changed
      from jsonb_each(new_values) as n
     where n.key not in ('updated_at', 'updated_by')
       and n.value is distinct from old_values -> n.key;

    if cardinality(changed) = 0 then
      return null;
    end if;

    select jsonb_object_agg(o.key, o.value) into old_values
      from jsonb_each(old_values) as o where o.key = any (changed);
    select jsonb_object_agg(n.key, n.value) into new_values
      from jsonb_each(new_values) as n where n.key = any (changed);
  end if;

  if cardinality(redacted) > 0 then
    select jsonb_object_agg(o.key, case when o.key = any (redacted) then to_jsonb('redacted'::text) else o.value end)
      into old_values
      from jsonb_each(old_values) as o;
    select jsonb_object_agg(n.key, case when n.key = any (redacted) then to_jsonb('redacted'::text) else n.value end)
      into new_values
      from jsonb_each(new_values) as n;
  end if;

  insert into public.audit_logs
    (actor_id, gym_id, table_name, row_id, branch_id, action, changed_columns, old_values, new_values, ip, device_id)
  values (
    auth.uid(),
    case
      when tg_table_name = 'gyms' then (row_values ->> 'id')::uuid
      else (row_values ->> 'gym_id')::uuid
    end,
    tg_table_name,
    coalesce(row_values ->> 'id', row_values ->> 'staff_id'),
    case
      when tg_table_name = 'branches' then (row_values ->> 'id')::uuid
      else (row_values ->> 'branch_id')::uuid
    end,
    lower(tg_op),
    changed,
    old_values,
    new_values,
    app.request_ip(headers),
    app.request_device_id(headers)
  );
  return null;
end
$$;

-- The gym's access state -----------------------------------------------------------------------

-- locked, read_only, grace or active (spec §2.6). Empty for no gym.
--   locked: Click Group locked it (or it was closed); its staff lose all access.
--   read_only: suspended, or paid_until is more than 30 days ago. Staff can log in and look.
--   grace: paid_until has passed, less than 30 days ago. Everything still works.
create function app.gym_access(gym public.gyms)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when gym.id is null then null
    when gym.locked_at is not null or gym.deleted_at is not null then 'locked'
    when gym.suspended_at is not null then 'read_only'
    when gym.paid_until is null or gym.paid_until > now() then 'active'
    when gym.paid_until + interval '30 days' > now() then 'grace'
    else 'read_only'
  end
$$;

-- The signed-in staff member's gym whatever its state, so a locked gym's staff can be told why.
create function app.caller_gym()
returns public.gyms
language sql
stable
security definer
set search_path = ''
as $$
  select g.*
    from public.staff_users s
    join public.gyms g on g.id = s.gym_id
   where s.id = auth.uid() and s.is_active and s.deleted_at is null
$$;

-- Whether the signed-in staff member's gym accepts changes (active or grace).
create function app.gym_writable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app.gym_access(g) in ('active', 'grace') from public.gyms g where g.id = app.current_gym_id()),
    false
  )
$$;

-- BEFORE trigger on the gym's tables: nothing new or changed while the gym is read-only. Still
-- allowed: server code (the secret key), and a staff member's own row (only their language, see
-- guard_staff_users). PINs and device reports have no such trigger, so they keep working.
create function app.check_gym_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'staff_users' and tg_op = 'UPDATE' and old.id = auth.uid() then
    return new;
  end if;
  if not app.gym_writable() then
    raise exception using errcode = '42501', message = 'gym_read_only',
      detail = 'This gym is read-only: it is suspended, or its subscription or license has ended';
  end if;
  return coalesce(new, old);
end
$$;

-- BEFORE triggers run in name order: check_writable, guard, limit_size, login_matches, read_only,
-- stamp. So a read-only gym gets gym_read_only before any other reason.
create trigger check_writable before insert or update or delete on public.branches
  for each row execute function app.check_gym_writable();
create trigger check_writable before insert or update or delete on public.roles
  for each row execute function app.check_gym_writable();
create trigger check_writable before insert or update or delete on public.role_permissions
  for each row execute function app.check_gym_writable();
create trigger check_writable before insert or update or delete on public.staff_users
  for each row execute function app.check_gym_writable();
create trigger check_writable before insert or update or delete on public.staff_branches
  for each row execute function app.check_gym_writable();
create trigger check_writable before insert or update or delete on public.devices
  for each row execute function app.check_gym_writable();
create trigger check_writable before insert or update or delete on public.settings
  for each row execute function app.check_gym_writable();

-- Limits ----------------------------------------------------------------------------------------

-- BEFORE trigger on branches and devices: refuses a row that would go over the gym's maximum of
-- active ones, when it is added, activated or brought back. Applies to server code too: the seller
-- raises the limit instead.
create function app.limit_gym_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
  in_use integer;
begin
  if not new.is_active or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.is_active and old.deleted_at is null then
    return new;
  end if;

  -- Locks the gym's row, so two rows added at the same time can't both fit under the limit.
  select * into gym from public.gyms g where g.id = new.gym_id for update;

  if tg_table_name = 'branches' then
    if gym.max_branches is not null then
      select count(*)::integer into in_use
        from public.branches b
       where b.gym_id = new.gym_id and b.is_active and b.deleted_at is null and b.id <> new.id;
      if in_use >= gym.max_branches then
        raise exception using errcode = '23514', message = 'gym_branch_limit',
          detail = format('This gym can have at most %s active branches', gym.max_branches);
      end if;
    end if;
  elsif gym.max_devices is not null then
    select count(*)::integer into in_use
      from public.devices d
     where d.gym_id = new.gym_id and d.is_active and d.deleted_at is null and d.id <> new.id;
    if in_use >= gym.max_devices then
      raise exception using errcode = '23514', message = 'gym_device_limit',
        detail = format('This gym can have at most %s active devices', gym.max_devices);
    end if;
  end if;
  return new;
end
$$;

create trigger limit_size before insert or update of is_active, deleted_at on public.branches
  for each row execute function app.limit_gym_size();
create trigger limit_size before insert or update of is_active, deleted_at on public.devices
  for each row execute function app.limit_gym_size();

-- Staff logins ----------------------------------------------------------------------------------

-- A staff member logs in as <username>@<gym code>.staff.gym-spa.invalid (staffEmail() in
-- packages/core). Their Auth user is made first, so it must already have that email.
create function app.check_staff_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_email text;
begin
  select new.username || '@' || g.code || '.staff.gym-spa.invalid'
    into expected_email
    from public.gyms g
   where g.id = new.gym_id;
  if not exists (select 1 from auth.users u where u.id = new.id and u.email = expected_email) then
    raise exception using errcode = '23514', message = 'staff_login_mismatch',
      detail = format('This staff member''s Auth email must be %s', expected_email);
  end if;
  return new;
end
$$;

create trigger login_matches before insert or update of username on public.staff_users
  for each row execute function app.check_staff_login();

-- Row level security: every policy checks the gym ----------------------------------------------

alter policy "staff read their branches" on public.branches
  using (
    gym_id = (select app.current_gym_id())
    and ((select app.has_all_branches()) or id in (select app.accessible_branch_ids()))
  );
alter policy "branch managers add branches" on public.branches
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('branches.manage')) and (select app.has_all_branches())
  );
alter policy "branch managers edit branches" on public.branches
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('branches.manage')) and (select app.has_all_branches())
  )
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('branches.manage')) and (select app.has_all_branches())
  );

alter policy "staff read roles" on public.roles
  using (gym_id = (select app.current_gym_id()));
alter policy "role managers add roles" on public.roles
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('roles.manage')));
alter policy "role managers edit roles" on public.roles
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('roles.manage')))
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('roles.manage')));

alter policy "staff read role permissions" on public.role_permissions
  using (gym_id = (select app.current_gym_id()));
alter policy "role managers add role permissions" on public.role_permissions
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('roles.manage')));
alter policy "role managers remove role permissions" on public.role_permissions
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('roles.manage')));

alter policy "staff read staff they can see" on public.staff_users
  using (gym_id = (select app.current_gym_id()) and app.can_view_staff(id));
alter policy "staff managers add staff" on public.staff_users
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('staff.manage')));
alter policy "staff edit themselves, staff managers edit staff" on public.staff_users
  using (
    gym_id = (select app.current_gym_id())
    and (id = auth.uid() or (select app.has_permission('staff.manage')))
  )
  with check (
    gym_id = (select app.current_gym_id())
    and (id = auth.uid() or (select app.has_permission('staff.manage')))
  );

alter policy "staff read branches of staff they can see" on public.staff_branches
  using (gym_id = (select app.current_gym_id()) and app.can_view_staff(staff_id));
alter policy "staff managers add staff branches" on public.staff_branches
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('staff.manage')));
alter policy "staff managers remove staff branches" on public.staff_branches
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('staff.manage')));

alter policy "staff read their own branch access" on public.staff_branch_access
  using (gym_id = (select app.current_gym_id()) and staff_id = auth.uid());

alter policy "staff read their own pin" on public.staff_pins
  using (gym_id = (select app.current_gym_id()) and staff_id = auth.uid());
grant select (gym_id) on table public.staff_pins to authenticated;

alter policy "staff read devices of their branches" on public.devices
  using (gym_id = (select app.current_gym_id()) and branch_id in (select app.accessible_branch_ids()));
alter policy "device managers edit devices" on public.devices
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('devices.manage')) and branch_id in (select app.accessible_branch_ids())
  )
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('devices.manage')) and branch_id in (select app.accessible_branch_ids())
  );

alter policy "device managers read device status" on public.device_status
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('devices.manage'))
    and exists (
      select 1 from public.devices d
       where d.id = device_status.device_id
         and d.branch_id in (select app.accessible_branch_ids())
    )
  );

alter policy "staff read their settings" on public.settings
  using (
    gym_id = (select app.current_gym_id())
    and (branch_id is null or branch_id in (select app.accessible_branch_ids()))
  );
alter policy "setting editors add settings" on public.settings
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('settings.edit'))
    and (case when branch_id is null then (select app.has_all_branches())
              else branch_id in (select app.accessible_branch_ids()) end)
  );
alter policy "setting editors change settings" on public.settings
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('settings.edit'))
    and (case when branch_id is null then (select app.has_all_branches())
              else branch_id in (select app.accessible_branch_ids()) end)
  )
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('settings.edit'))
    and (case when branch_id is null then (select app.has_all_branches())
              else branch_id in (select app.accessible_branch_ids()) end)
  );
alter policy "setting editors remove settings" on public.settings
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('settings.edit'))
    and (case when branch_id is null then (select app.has_all_branches())
              else branch_id in (select app.accessible_branch_ids()) end)
  );

alter policy "auditors read the audit log" on public.audit_logs
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('audit.view'))
    and ((select app.has_all_branches()) or branch_id in (select app.accessible_branch_ids()))
  );

-- RPCs ------------------------------------------------------------------------------------------

-- Wrong PIN tries allowed in a branch: its own setting, else its gym's setting, else 5.
create or replace function app.pin_max_attempts(p_branch_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::integer from public.settings s
      where s.key = 'security.pin_max_attempts' and s.branch_id = p_branch_id
        and s.gym_id = app.current_gym_id()),
    (select (s.value #>> '{}')::integer from public.settings s
      where s.key = 'security.pin_max_attempts' and s.branch_id is null
        and s.gym_id = app.current_gym_id()),
    5
  )
$$;

-- Checks the signed-in staff member's PIN on a device working in p_branch_id. The result is one of
-- ok, wrong_pin (with tries_left), locked_out, no_pin, no_branch_access, inactive, gym_locked.
create or replace function public.unlock_with_pin(p_pin text, p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pin public.staff_pins;
  max_attempts integer;
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

-- The signed-in staff member's gym and its access state. Also answers for a locked gym (access
-- 'locked'), so the app can say why nothing works. Nothing for anyone else.
create function public.my_gym()
returns table (
  id uuid,
  code text,
  name_ckb text,
  name_en text,
  name_ar text,
  edition text,
  access text,
  paid_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.code, g.name_ckb, g.name_en, g.name_ar, g.edition, app.gym_access(g), g.paid_until
    from app.caller_gym() g
   where g.id is not null
$$;

revoke execute on function public.my_gym() from public, anon;
grant execute on function public.my_gym() to authenticated, service_role;
