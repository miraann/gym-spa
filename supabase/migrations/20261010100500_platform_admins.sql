-- Platform admins (spec §2.6, step MT-3): Click Group's own accounts for the seller panel.
--
--   * They live in the private schema `platform`, which the Data API never exposes and no client
--     role can use. The seller panel reaches it only through public.seller_* functions.
--   * Every seller_* function starts with app.require_platform_admin(): an active platform admin
--     whose session passed two-step login (aal2). Only seller_me() and seller_use_recovery_code()
--     accept a session before the second step (aal1): the login flow needs them.
--   * One login is never both a staff member and a platform admin (triggers on both tables), and a
--     platform admin logs in with a real email address, never a staff login address.
--   * Every seller action writes a row to platform.audit_logs in the same transaction.
--   * Changes to a platform admin's login (create, ban, two-step reset, password) go through the
--     Auth admin API in the seller-admin Edge Function (packages/seller-admin). Its database half is
--     here: a check under the admin's session first, the change in Auth, then the rows here.
--   * Scripts with the secret key (`pnpm bootstrap:platform-admin`, the last-resort
--     `pnpm platform-admin:reset-2fa`) use the platform_script_* functions.
--
-- The gym functions of the seller panel are in the next migration.

create schema platform;
revoke all on schema platform from public;

-- Tables ------------------------------------------------------------------------------------------

-- A platform admin is an Auth user (a real email address) with a row here. Accounts are deactivated,
-- never deleted.
create table platform.admins (
  user_id uuid primary key references auth.users (id),
  full_name text not null check (app.is_clean_text(full_name, 100)),
  is_active boolean not null default true,
  -- Someone else chose the password (another admin or the bootstrap script).
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- One-time recovery codes for a lost two-step device. Only their SHA-256 is stored: the codes are
-- 16 random characters (about 80 bits), so a slow hash would add nothing.
create table platform.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references platform.admins (user_id),
  code_hash bytea not null unique check (length(code_hash) = 32),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index recovery_codes_admin_id_idx on platform.recovery_codes (admin_id);

-- Every seller action: who, when, which gym or admin, what, and the reason where one is needed.
-- Append-only, like public.audit_logs.
create table platform.audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- The platform admin; empty for a script run with the secret key.
  actor_id uuid,
  -- Their email at the time, so the entry stays readable.
  actor_email text,
  action text not null check (action in (
    'gym_created', 'gym_renamed', 'gym_paid_until_set', 'gym_limits_set',
    'gym_suspended', 'gym_locked', 'gym_reactivated',
    'admin_created', 'admin_deactivated', 'admin_reactivated',
    'admin_two_step_reset', 'admin_password_reset',
    'recovery_codes_created', 'recovery_code_used', 'recovery_code_rejected'
  )),
  -- No foreign keys, like public.audit_logs: the log keeps its entries whatever happens to the
  -- rows they describe.
  gym_id uuid,
  target_admin_id uuid,
  reason text check (app.is_clean_text(reason, 500)),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  -- From the request headers. Informational only: the client can set it.
  ip inet
);
create index audit_logs_occurred_at_idx on platform.audit_logs (occurred_at desc);
create index audit_logs_gym_id_idx on platform.audit_logs (gym_id, occurred_at desc);
create index audit_logs_actor_idx on platform.audit_logs (actor_id, action, occurred_at desc);
create index audit_logs_target_idx on platform.audit_logs (target_admin_id, occurred_at desc);

create trigger append_only
  before update or delete on platform.audit_logs
  for each row execute function app.reject_audit_change();
create trigger append_only_truncate
  before truncate on platform.audit_logs
  for each statement execute function app.reject_audit_change();

-- Nothing for clients: no grants at all, and RLS without policies in case one is ever added by
-- mistake. The security definer functions below own the access.
alter table platform.admins enable row level security;
alter table platform.recovery_codes enable row level security;
alter table platform.audit_logs enable row level security;
revoke all on all tables in schema platform from public, anon, authenticated, service_role;

-- Who is calling --------------------------------------------------------------------------------

-- Whether this login has a working two-step device (a verified TOTP factor).
create function app.has_two_step(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
     where f.user_id = p_user_id and f.factor_type = 'totp' and f.status = 'verified'
  )
$$;

-- Whether the caller is an active platform admin whose session passed two-step login.
create function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from platform.admins a where a.user_id = auth.uid() and a.is_active)
$$;

-- The first line of every seller function: returns the caller's id, or refuses with
--   not_platform_admin        not an active platform admin (gym staff, anyone else);
--   mfa_required              the session hasn't passed two-step login (aal1);
--   password_change_required  the admin still has a password someone else chose.
-- p_aal2 = false (seller_me, seller_use_recovery_code) skips the last two checks.
create function app.require_platform_admin(p_aal2 boolean default true)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  admin platform.admins;
begin
  select * into admin from platform.admins a where a.user_id = auth.uid() and a.is_active;
  if not found then
    raise exception using errcode = '42501', message = 'not_platform_admin',
      detail = 'Only active platform admins can use the seller panel';
  end if;
  if coalesce(p_aal2, true) then
    if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
      raise exception using errcode = '42501', message = 'mfa_required',
        detail = 'The seller panel needs a session that passed two-step login (aal2)';
    end if;
    if admin.must_change_password then
      raise exception using errcode = '42501', message = 'password_change_required',
        detail = 'Choose your own password first';
    end if;
  end if;
  return admin.user_id;
end
$$;

-- Writes one seller log entry for the caller (empty actor: a script with the secret key).
create function app.platform_log(
  p_action text,
  p_gym_id uuid default null,
  p_target_admin_id uuid default null,
  p_reason text default null,
  p_details jsonb default '{}'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into platform.audit_logs (actor_id, actor_email, action, gym_id, target_admin_id, reason, details, ip)
  values (
    auth.uid(),
    (select u.email::text from auth.users u where u.id = auth.uid()),
    p_action,
    p_gym_id,
    p_target_admin_id,
    p_reason,
    coalesce(p_details, '{}'),
    app.request_ip(nullif(current_setting('request.headers', true), '')::jsonb)
  )
$$;

-- Seller writes to a gym's tables --------------------------------------------------------------
-- The guards on a gym's tables are for its staff. A seller function that writes there (creating a
-- gym with its Owner) turns on a transaction-local flag first; with it, and only for an active
-- platform admin with an aal2 session, the guards treat the write like server code. Stamps and the
-- gym's audit log still record the platform admin. Clients can't set the flag: the Data API sets
-- no settings of its own, and the flag means nothing without the platform-admin check.

create or replace function app.is_system_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', 'none') in ('none', 'service_role')
      or case
           when current_setting('app.platform_write', true) = 'on' then app.is_platform_admin()
           else false
         end
$$;

-- One login is never both ----------------------------------------------------------------------

-- A platform admin logs in with a real email address and has no staff account.
create function app.check_platform_admin_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  login_email text;
begin
  select u.email into login_email from auth.users u where u.id = new.user_id;
  if login_email is null
     or login_email ~ '\.staff\.gym-spa\.invalid$'
     or exists (select 1 from public.staff_users s where s.id = new.user_id)
  then
    raise exception using errcode = '23514', message = 'staff_cannot_be_platform_admin',
      detail = 'A staff login can never be a platform admin; platform admins log in with a real email address';
  end if;
  return new;
end
$$;

-- A staff member's login is never a platform admin's. Applies to server code too.
create function app.check_not_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from platform.admins a where a.user_id = new.id) then
    raise exception using errcode = '23514', message = 'platform_admin_cannot_be_staff',
      detail = 'A platform admin''s login can never be a staff member';
  end if;
  return new;
end
$$;

-- Click Group always keeps an active platform admin, whoever makes the change.
create function app.keep_one_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active
     and not exists (select 1 from platform.admins a where a.is_active and a.user_id <> old.user_id)
  then
    raise exception using errcode = '42501', message = 'last_platform_admin',
      detail = 'Click Group always keeps at least one active platform admin';
  end if;
  return new;
end
$$;

create trigger guard before insert on platform.admins
  for each row execute function app.check_platform_admin_login();
create trigger keep_one before update of is_active on platform.admins
  for each row execute function app.keep_one_platform_admin();
create trigger read_only before update on platform.admins
  for each row execute function app.read_only_columns('user_id');
create trigger stamp before insert or update on platform.admins
  for each row execute function app.stamp_row();

create trigger not_platform_admin before insert on public.staff_users
  for each row execute function app.check_not_platform_admin();

-- A platform admin who changes their own password no longer has to (like staff). When another
-- admin resets it, seller_record_admin_change sets the flag again right after.
create or replace function app.clear_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.staff_users set must_change_password = false
   where id = new.id and must_change_password;
  update platform.admins set must_change_password = false
   where user_id = new.id and must_change_password;
  return null;
end
$$;

-- Platform admin accounts -------------------------------------------------------------------------

-- A platform admin's login address: a real, lowercase email address (Auth stores them lowercase),
-- never a staff login or another address that can't receive mail.
create function app.is_valid_admin_email(email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select length(email) <= 254
     and email = lower(email)
     and email ~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
     and email !~ '\.invalid$'
$$;

-- The signed-in platform admin, also before the second step: the seller panel's login flow reads it
-- to decide what comes next (new password, two-step setup or check, recovery codes).
create function public.seller_me()
returns table (
  user_id uuid,
  email text,
  full_name text,
  must_change_password boolean,
  aal2 boolean,
  has_two_step boolean,
  recovery_codes_left integer,
  active_admins integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin(false);
begin
  return query
    select a.user_id, u.email::text, a.full_name, a.must_change_password,
           coalesce(auth.jwt() ->> 'aal', '') = 'aal2',
           app.has_two_step(a.user_id),
           (select count(*)::integer from platform.recovery_codes c where c.admin_id = a.user_id and c.used_at is null),
           (select count(*)::integer from platform.admins x where x.is_active)
      from platform.admins a
      join auth.users u on u.id = a.user_id
     where a.user_id = me;
end
$$;

create function public.seller_admins()
returns table (
  user_id uuid,
  email text,
  full_name text,
  is_active boolean,
  must_change_password boolean,
  has_two_step boolean,
  recovery_codes_left integer,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select a.user_id, u.email::text, a.full_name, a.is_active, a.must_change_password,
           app.has_two_step(a.user_id),
           (select count(*)::integer from platform.recovery_codes c where c.admin_id = a.user_id and c.used_at is null),
           u.last_sign_in_at, a.created_at
      from platform.admins a
      join auth.users u on u.id = a.user_id
     order by a.is_active desc, a.full_name;
end
$$;

-- Adding a platform admin: 1. this check; 2. the Auth login (seller-admin); 3. seller_add_admin.
create function public.seller_prepare_add_admin(p_email text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  if p_email is null or not app.is_valid_admin_email(p_email) then
    raise exception using errcode = '22023', message = 'invalid_email',
      detail = 'A platform admin logs in with a real, lowercase email address';
  end if;
  if exists (
    select 1 from auth.users u
     where u.email = p_email
       and (exists (select 1 from platform.admins a where a.user_id = u.id)
         or exists (select 1 from public.staff_users s where s.id = u.id))
  ) then
    raise exception using errcode = '23505', message = 'email_taken',
      detail = 'This email address already has an account';
  end if;
end
$$;

create function public.seller_add_admin(p_user_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  if p_user_id is null or p_full_name is null or not app.is_clean_text(p_full_name, 100) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A platform admin needs a login and a full name of 1 to 100 characters';
  end if;
  insert into platform.admins (user_id, full_name) values (p_user_id, p_full_name);
  perform app.platform_log('admin_created', null, p_user_id, null,
    jsonb_build_object('email', (select u.email::text from auth.users u where u.id = p_user_id)));
end
$$;

-- Checks a change to another platform admin before the Auth admin API runs. p_action: deactivate,
-- reactivate, reset_two_step or reset_password. Nobody changes their own account here: a platform
-- admin changes their own password in the panel and uses a recovery code for a lost device.
create function public.seller_prepare_admin_change(p_user_id uuid, p_action text)
returns table (email text, is_active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin();
begin
  if p_action is null or p_action not in ('deactivate', 'reactivate', 'reset_two_step', 'reset_password') then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'The action is deactivate, reactivate, reset_two_step or reset_password';
  end if;
  if p_user_id = me then
    raise exception using errcode = '42501', message = 'cannot_change_own_admin',
      detail = 'Another platform admin makes this change';
  end if;
  if not exists (select 1 from platform.admins a where a.user_id = p_user_id) then
    raise exception using errcode = '22023', message = 'admin_not_found',
      detail = 'There is no platform admin with this id';
  end if;

  return query
    select u.email::text, a.is_active
      from platform.admins a
      join auth.users u on u.id = a.user_id
     where a.user_id = p_user_id;
end
$$;

-- Deactivates (the Auth ban comes after) or reactivates (after the Auth unban) another platform
-- admin. Deactivating ends their access to every seller function at once.
create function public.seller_set_admin_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin();
  target platform.admins;
begin
  if p_user_id is null or p_active is null then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'Name the platform admin and whether they are active';
  end if;
  if p_user_id = me then
    raise exception using errcode = '42501', message = 'cannot_change_own_admin',
      detail = 'Another platform admin makes this change';
  end if;

  -- Two admins deactivating each other at the same moment: the second waits here, then finds that
  -- it is no longer active itself.
  perform 1 from platform.admins a where a.is_active order by a.user_id for update;
  if not exists (select 1 from platform.admins a where a.user_id = me and a.is_active) then
    raise exception using errcode = '42501', message = 'not_platform_admin',
      detail = 'Only active platform admins can use the seller panel';
  end if;

  select * into target from platform.admins a where a.user_id = p_user_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'admin_not_found',
      detail = 'There is no platform admin with this id';
  end if;
  if target.is_active = p_active then
    return;
  end if;

  update platform.admins set is_active = p_active where user_id = p_user_id;
  perform app.platform_log(case when p_active then 'admin_reactivated' else 'admin_deactivated' end,
    null, p_user_id);
end
$$;

-- Records a two-step reset or a password reset of another platform admin, after the Auth change.
-- A two-step reset also voids their recovery codes (they belonged to the lost device's setup); a
-- password reset makes them choose their own password at the next login.
create function public.seller_record_admin_change(p_user_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin();
begin
  if p_action is null or p_action not in ('reset_two_step', 'reset_password') then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'The action is reset_two_step or reset_password';
  end if;
  if p_user_id = me then
    raise exception using errcode = '42501', message = 'cannot_change_own_admin',
      detail = 'Another platform admin makes this change';
  end if;
  perform app.record_admin_change(p_user_id, p_action);
end
$$;

-- Shared by seller_record_admin_change and platform_script_record (empty actor in the log).
create function app.record_admin_change(p_user_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from platform.admins a where a.user_id = p_user_id) then
    raise exception using errcode = '22023', message = 'admin_not_found',
      detail = 'There is no platform admin with this id';
  end if;
  if p_action = 'reset_two_step' then
    delete from platform.recovery_codes where admin_id = p_user_id;
    perform app.platform_log('admin_two_step_reset', null, p_user_id);
  elsif p_action = 'reset_password' then
    update platform.admins set must_change_password = true where user_id = p_user_id;
    perform app.platform_log('admin_password_reset', null, p_user_id);
  else
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'The action is reset_two_step or reset_password';
  end if;
end
$$;

-- Recovery codes --------------------------------------------------------------------------------

-- 16 characters from an alphabet without look-alikes (no 0/o, 1/l/i), written xxxx-xxxx-xxxx-xxxx.
create function app.new_recovery_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text := '';
  random_bytes bytea;
  value integer;
begin
  while length(code) < 16 loop
    random_bytes := extensions.gen_random_bytes(32);
    for i in 0 .. length(random_bytes) - 1 loop
      value := get_byte(random_bytes, i);
      -- 248 = 8 × 31: dropping the bytes above it keeps every character equally likely.
      if value < 248 and length(code) < 16 then
        code := code || substr(alphabet, value % 31 + 1, 1);
      end if;
    end loop;
  end loop;
  return substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4) || '-' || substr(code, 13, 4);
end
$$;

-- What is stored for a code: the SHA-256 of its letters and digits, lowercase. Spaces, hyphens and
-- capitals typed with it don't matter.
create function app.recovery_code_hash(p_code text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(lower(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256')
$$;

-- A new set of 10 recovery codes for the signed-in admin, replacing the old set. Shown once: only
-- their hashes are kept.
create function public.seller_new_recovery_codes()
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin();
  code text;
begin
  delete from platform.recovery_codes where admin_id = me;
  for i in 1 .. 10 loop
    code := app.new_recovery_code();
    insert into platform.recovery_codes (admin_id, code_hash) values (me, app.recovery_code_hash(code));
    return next code;
  end loop;
  perform app.platform_log('recovery_codes_created', null, me, null, jsonb_build_object('count', 10));
end
$$;

-- Uses one of the signed-in admin's recovery codes (after the password, before the second step).
-- Result: ok (the code is used up; the seller-admin function then removes the admin's two-step
-- device, and the panel sets up a new one), wrong_code, or too_many_attempts (5 wrong codes in 15
-- minutes). Every try is logged.
create function public.seller_use_recovery_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin(false);
  used_id uuid;
begin
  if (
    select count(*) from platform.audit_logs l
     where l.actor_id = me and l.action = 'recovery_code_rejected'
       and l.occurred_at > now() - interval '15 minutes'
       and not coalesce((l.details ->> 'blocked')::boolean, false)
  ) >= 5 then
    perform app.platform_log('recovery_code_rejected', null, me, null, jsonb_build_object('blocked', true));
    return jsonb_build_object('result', 'too_many_attempts');
  end if;

  update platform.recovery_codes c
     set used_at = now()
   where c.admin_id = me and c.used_at is null and c.code_hash = app.recovery_code_hash(p_code)
  returning c.id into used_id;

  if used_id is null then
    perform app.platform_log('recovery_code_rejected', null, me);
    return jsonb_build_object('result', 'wrong_code');
  end if;
  perform app.platform_log('recovery_code_used', null, me, null, jsonb_build_object('code_id', used_id));
  return jsonb_build_object('result', 'ok');
end
$$;

-- The seller log ----------------------------------------------------------------------------------

-- Newest first; p_gym_id narrows it to one gym, p_before pages back.
create function public.seller_audit_log(
  p_gym_id uuid default null,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  occurred_at timestamptz,
  actor_id uuid,
  actor_email text,
  action text,
  gym_id uuid,
  gym_code text,
  target_admin_id uuid,
  target_email text,
  reason text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select l.id, l.occurred_at, l.actor_id, l.actor_email, l.action, l.gym_id, g.code,
           l.target_admin_id, u.email::text, l.reason, l.details
      from platform.audit_logs l
      left join public.gyms g on g.id = l.gym_id
      left join auth.users u on u.id = l.target_admin_id
     where (p_gym_id is null or l.gym_id = p_gym_id)
       and (p_before is null or l.occurred_at < p_before)
     order by l.occurred_at desc, l.id
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end
$$;

-- Scripts with the secret key -------------------------------------------------------------------

-- `pnpm bootstrap:platform-admin`: the platform admin row for a login the script has just made.
create function public.platform_script_add_admin(p_user_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_full_name is null or not app.is_clean_text(p_full_name, 100) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A platform admin needs a login and a full name of 1 to 100 characters';
  end if;
  insert into platform.admins (user_id, full_name) values (p_user_id, p_full_name);
  perform app.platform_log('admin_created', null, p_user_id, null, jsonb_build_object(
    'email', (select u.email::text from auth.users u where u.id = p_user_id), 'by', 'script'));
end
$$;

-- `pnpm platform-admin:reset-2fa`, the last resort: records a two-step or password reset the script
-- has just made in Auth.
create function public.platform_script_record(p_user_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.record_admin_change(p_user_id, p_action);
end
$$;

-- The platform admin's login with this email (scripts look admins up by address).
create function public.platform_script_find_admin(p_email text)
returns table (user_id uuid, full_name text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, a.full_name, a.is_active
    from platform.admins a
    join auth.users u on u.id = a.user_id
   where u.email = p_email
$$;

-- A platform admin login left behind by an add that failed and could not be undone, so its address
-- can be used again: made by the seller-admin function (app_metadata.platform_admin), never
-- finished (no platform admin row), no staff account, older than 2 minutes. Otherwise null.
create function public.platform_admin_orphan(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
   where u.email = p_email
     and not u.is_sso_user
     and coalesce(u.raw_app_meta_data ->> 'platform_admin', '') = 'true'
     and not exists (select 1 from platform.admins a where a.user_id = u.id)
     and not exists (select 1 from public.staff_users s where s.id = u.id)
     and u.created_at < now() - interval '2 minutes'
$$;

-- Staff logins left behind ------------------------------------------------------------------------

-- As in migration 20261010100400, with two changes:
--   * platform admins are looked up directly (the table exists now);
--   * a login the seller panel made for a new gym's Owner when the gym was never made (the create
--     failed and its undo failed too) can be picked as well. Its gym code belongs to no gym, and
--     its app_metadata.gym_id names no gym. Gyms are never deleted, so no real login looks like it.
create or replace function public.staff_admin_orphan(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  login auth.users;
  gym_code text;
  meta_gym_id text;
begin
  select * into login from auth.users u where u.email = p_email and not u.is_sso_user;
  if not found then
    return null;
  end if;

  if login.email !~ '^[a-z][a-z0-9._-]{2,31}@[a-z](-?[a-z0-9])+\.staff\.gym-spa\.invalid$' then
    return null;
  end if;
  gym_code := substring(login.email from '@([a-z0-9-]+)\.staff\.gym-spa\.invalid$');
  meta_gym_id := login.raw_app_meta_data ->> 'gym_id';

  -- coalesce: a login without app_metadata.gym_id makes these checks null, and null must refuse.
  if not coalesce(
    -- Made by the staff module for this existing gym.
    exists (select 1 from public.gyms g where g.code = gym_code and g.id::text = meta_gym_id)
    -- Made by the seller panel for a gym that was never made.
    or (
      meta_gym_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (select 1 from public.gyms g where g.code = gym_code)
      and not exists (select 1 from public.gyms g where g.id::text = meta_gym_id)
    ),
    false
  ) then
    return null;
  end if;

  if exists (select 1 from platform.admins a where a.user_id = login.id)
     or exists (select 1 from public.staff_users s where s.id = login.id)
     or login.created_at > now() - interval '2 minutes'
  then
    return null;
  end if;
  return login.id;
end
$$;

-- Grants ----------------------------------------------------------------------------------------

-- The seller panel: signed-in users may call them; each one checks for a platform admin itself.
revoke execute on function public.seller_me() from public, anon;
grant execute on function public.seller_me() to authenticated;
revoke execute on function public.seller_admins() from public, anon;
grant execute on function public.seller_admins() to authenticated;
revoke execute on function public.seller_prepare_add_admin(text) from public, anon;
grant execute on function public.seller_prepare_add_admin(text) to authenticated;
revoke execute on function public.seller_add_admin(uuid, text) from public, anon;
grant execute on function public.seller_add_admin(uuid, text) to authenticated;
revoke execute on function public.seller_prepare_admin_change(uuid, text) from public, anon;
grant execute on function public.seller_prepare_admin_change(uuid, text) to authenticated;
revoke execute on function public.seller_set_admin_active(uuid, boolean) from public, anon;
grant execute on function public.seller_set_admin_active(uuid, boolean) to authenticated;
revoke execute on function public.seller_record_admin_change(uuid, text) from public, anon;
grant execute on function public.seller_record_admin_change(uuid, text) to authenticated;
revoke execute on function public.seller_new_recovery_codes() from public, anon;
grant execute on function public.seller_new_recovery_codes() to authenticated;
revoke execute on function public.seller_use_recovery_code(text) from public, anon;
grant execute on function public.seller_use_recovery_code(text) to authenticated;
revoke execute on function public.seller_audit_log(uuid, timestamptz, integer) from public, anon;
grant execute on function public.seller_audit_log(uuid, timestamptz, integer) to authenticated;

-- Scripts and the seller-admin function only (the secret key).
revoke execute on function public.platform_script_add_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.platform_script_add_admin(uuid, text) to service_role;
revoke execute on function public.platform_script_record(uuid, text) from public, anon, authenticated;
grant execute on function public.platform_script_record(uuid, text) to service_role;
revoke execute on function public.platform_script_find_admin(text) from public, anon, authenticated;
grant execute on function public.platform_script_find_admin(text) to service_role;
revoke execute on function public.platform_admin_orphan(text) from public, anon, authenticated;
grant execute on function public.platform_admin_orphan(text) to service_role;
