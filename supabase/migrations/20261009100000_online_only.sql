-- Two editions, both always connected (CLAUDE.md → Two editions): devices no longer keep a local
-- copy of the data, so PowerSync goes, and the server now checks PINs and their lockout.

-- PowerSync -------------------------------------------------------------------------------------

drop publication if exists powersync;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'powersync_role') then
    revoke all on all tables in schema public from powersync_role;
    revoke usage on schema public from powersync_role;
    drop role powersync_role;
  end if;
end
$$;

-- Nothing waits to upload any more: devices only report that they are alive, and their version.
drop function public.device_heartbeat(uuid, text, integer, timestamptz);
alter table public.device_status drop column pending_changes, drop column pending_since;

create function public.device_heartbeat(p_device_id uuid, p_app_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.devices d
     where d.id = p_device_id and d.deleted_at is null and app.has_branch_access(d.branch_id)
  ) then
    raise exception using errcode = '42501', message = 'device_not_accessible',
      detail = 'The device does not exist or is in a branch you cannot access';
  end if;

  insert into public.device_status (device_id, last_seen_at, last_seen_by, app_version)
  values (p_device_id, now(), auth.uid(), p_app_version)
  on conflict (device_id) do update set
    last_seen_at = excluded.last_seen_at,
    last_seen_by = excluded.last_seen_by,
    app_version = excluded.app_version;
end
$$;

revoke execute on function public.device_heartbeat(uuid, text) from public, anon;
grant execute on function public.device_heartbeat(uuid, text) to authenticated, service_role;

-- Sync conflicts and unsynced-data alerts no longer exist.
delete from public.role_permissions where permission_key = 'sync.conflicts.resolve';
delete from public.permissions where key = 'sync.conflicts.resolve';
delete from public.settings where key = 'sync.unsynced_alert_hours';

create or replace function app.is_valid_setting(setting_key text, value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case setting_key
    -- Wrong PIN tries before the staff member must log in with their password again.
    when 'security.pin_max_attempts' then app.is_json_integer(value, 3, 10)
    -- Minutes without activity before the app locks.
    when 'security.idle_lock_minutes' then app.is_json_integer(value, 1, 240)
    else false
  end
$$;

-- PINs, checked by the server ------------------------------------------------------------------
-- The PIN switches staff on a shared device. It used to be hashed and checked on the device; now
-- only the server sees the hash (bcrypt) and counts wrong tries, for every device at once. Old
-- PBKDF2 hashes can't be converted: their owners set a new PIN at their next password login.

delete from public.staff_pins;
drop trigger audit on public.staff_pins;
alter table public.staff_pins
  drop column algorithm,
  drop column iterations,
  drop column salt,
  drop column hash,
  add column pin_hash text not null check (pin_hash ~ '^\$2[abxy]\$'),
  add column failed_attempts integer not null default 0 check (failed_attempts >= 0),
  -- Set after too many wrong PINs; only a password login after this time clears it.
  add column locked_at timestamptz;
create trigger audit after insert or update or delete on public.staff_pins
  for each row execute function app.audit_row('{pin_hash}');

-- Clients never touch the table: the functions below do. Staff may see their own row without the
-- hash (whether they have a PIN, and whether it is locked).
drop policy "staff set their own pin" on public.staff_pins;
drop policy "staff change their own pin" on public.staff_pins;
drop policy "staff remove their own pin" on public.staff_pins;
revoke all on table public.staff_pins from authenticated;
grant select (staff_id, failed_attempts, locked_at, created_at, updated_at)
  on table public.staff_pins to authenticated;

-- When the current session's password login happened (the JWT's amr claim, which a token refresh
-- keeps), or null for other kinds of login.
create function app.password_login_at()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select to_timestamp(max((entry ->> 'timestamp')::bigint))
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
   where entry ->> 'method' = 'password'
$$;

-- PINs anyone would guess first (keep in step with isWeakPin in packages/core/src/pin.ts): one
-- digit repeated, a run up or down, or a repeated pair or triple.
create function app.is_weak_pin(pin text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select pin ~ '^(\d\d)\1\1$'
      or pin ~ '^(\d\d\d)\1$'
      or (
        select count(distinct step) = 1 and min(step) between -1 and 1
          from (
            select substr(pin, i + 1, 1)::integer - substr(pin, i, 1)::integer as step
              from generate_series(1, length(pin) - 1) as i
          ) steps
      )
$$;

-- Wrong PIN tries allowed in a branch: its own setting, else the global one, else 5.
create function app.pin_max_attempts(p_branch_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::integer from public.settings s
      where s.key = 'security.pin_max_attempts' and s.branch_id = p_branch_id),
    (select (s.value #>> '{}')::integer from public.settings s
      where s.key = 'security.pin_max_attempts' and s.branch_id is null),
    5
  )
$$;

-- Sets the signed-in staff member's PIN. Only right after a password login (15 minutes), so a
-- session left on a device can't be used to replace someone's PIN.
create function public.set_my_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_active_staff() then
    raise exception using errcode = '42501', message = 'not_allowed',
      detail = 'Only active staff can set a PIN';
  end if;
  if coalesce(app.password_login_at(), '-infinity') < now() - interval '15 minutes' then
    raise exception using errcode = '42501', message = 'password_login_required',
      detail = 'Setting a PIN needs a password login in the last 15 minutes';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception using errcode = '22023', message = 'pin_length', detail = 'A PIN is 6 digits';
  end if;
  if app.is_weak_pin(p_pin) then
    raise exception using errcode = '22023', message = 'pin_weak', detail = 'The PIN is too easy to guess';
  end if;

  insert into public.staff_pins (staff_id, pin_hash)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (staff_id) do update set
    pin_hash = excluded.pin_hash,
    failed_attempts = 0,
    locked_at = null;
end
$$;

-- Checks the signed-in staff member's PIN on a device working in p_branch_id. The result is one of
-- ok, wrong_pin (with tries_left), locked_out, no_pin, no_branch_access, inactive.
create function public.unlock_with_pin(p_pin text, p_branch_id uuid)
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

-- Called after a password login: clears a PIN lockout, but only when that password login happened
-- after the lockout (a session from before it can't undo it). The JWT keeps whole seconds.
create function public.clear_my_pin_lockout()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.staff_pins
     set failed_attempts = 0, locked_at = null
   where staff_id = auth.uid()
     and (failed_attempts > 0 or locked_at is not null)
     and app.is_active_staff()
     and coalesce(app.password_login_at(), '-infinity') >= date_trunc('second', coalesce(locked_at, '-infinity'));
end
$$;

revoke execute on function
  public.set_my_pin(text),
  public.unlock_with_pin(text, uuid),
  public.clear_my_pin_lockout()
from public, anon;
grant execute on function
  public.set_my_pin(text),
  public.unlock_with_pin(text, uuid),
  public.clear_my_pin_lockout()
to authenticated, service_role;
