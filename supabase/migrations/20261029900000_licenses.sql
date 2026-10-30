-- Offline licenses (spec §2.6, step MT-5): the cloud half. Click Group's seller panel keeps a
-- record of each offline gym, issues its signed license codes and activates its server PC. The
-- codes are signed by the seller-admin Edge Function (packages/seller-admin, the key in its
-- secrets); the database checks every request under the platform admin's session before the key is
-- used (seller_prepare_*), then checks it all again and stores the code (seller_issue_*), with its
-- log entry, in one transaction. Postgres can't check an Ed25519 signature, so it compares the
-- code's payload with the fields it stores instead.
--
--   * An offline gym in the cloud is a bare public.gyms row (edition offline): no roles, branch or
--     staff, because those live on its own server PC.
--   * Licenses and activations are platform tables, reached only through the seller_* functions.
--     Revoking a license and deactivating a PC are records only: an offline PC can't be reached.
--   * platform.license_events logs them; seller_audit_log() shows it with the other seller
--     actions. (A separate table: widening platform.audit_logs' action list needs a drop.)

-- Machine codes ------------------------------------------------------------------------------------
-- What the offline server shows: 16 characters from the PC's ids plus 4 check characters, in
-- Crockford base32. The same as normalizeMachineCode() in packages/core; a shared list of cases
-- (supabase/tests/550-licenses.test.sql) keeps them equal. Null when it can't be a machine code.
create function app.normalize_machine_code(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text;
  check_value bigint := 0;
  check_text text := '';
begin
  if p_value is null then
    return null;
  end if;
  code := upper(translate(p_value, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'));
  code := translate(regexp_replace(code, '[[:space:]-]', '', 'g'), 'OIL', '011');
  if code !~ '^[0-9A-HJKMNP-TV-Z]{20}$' then
    return null;
  end if;
  for i in 1..16 loop
    check_value := (check_value * 33 + strpos(alphabet, substr(code, i, 1))) % 1048573;
  end loop;
  for i in 1..4 loop
    check_text := substr(alphabet, (check_value % 32)::integer + 1, 1) || check_text;
    check_value := check_value / 32;
  end loop;
  return case when right(code, 4) = check_text then code end;
end
$$;

-- The JSON inside a code (<prefix>.<payload>.<signature>), without checking the signature. Null
-- when it isn't a code of this kind.
create function app.license_code_payload(p_code text, p_prefix text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  parts text[];
  payload text;
begin
  if p_code is null or length(p_code) > 2000
     or p_code !~ ('^' || p_prefix || '\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$')
  then
    return null;
  end if;
  parts := string_to_array(p_code, '.');
  payload := translate(parts[2], '-_', '+/');
  payload := payload || repeat('=', (4 - length(payload) % 4) % 4);
  return convert_from(decode(payload, 'base64'), 'UTF8')::jsonb;
exception
  when others then
    return null;
end
$$;

-- Tables -------------------------------------------------------------------------------------------

-- Every license issued, as signed. Never deleted; revoking keeps it, with who, when and why.
create table platform.licenses (
  id uuid primary key,
  gym_id uuid not null references public.gyms (id),
  -- The signing key's id (LICENSE_PUBLIC_KEYS in packages/core).
  kid text not null check (kid ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  type text not null check (type in ('yearly', 'perpetual')),
  -- The gym's code and Kurdish name as the license carries them.
  gym_code text not null,
  gym_name text not null,
  -- Empty: no limit.
  max_branches integer check (max_branches between 1 and 10000),
  max_devices integer check (max_devices between 1 and 10000),
  -- Baghdad calendar days. Yearly: works through expires_on, then 30 days of grace. Perpetual:
  -- installs versions built through updates_until, and never stops.
  issued_on date not null,
  expires_on date,
  updates_until date,
  code text not null unique check (code ~ '^GSL1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$'),
  created_at timestamptz not null default now(),
  -- The platform admin.
  created_by uuid not null,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text check (app.is_clean_text(revoke_reason, 500)),
  constraint licenses_id_gym_unique unique (id, gym_id),
  constraint licenses_dates check (
    (type = 'yearly' and expires_on > issued_on and updates_until is null)
    or (type = 'perpetual' and updates_until > issued_on and expires_on is null)
  ),
  constraint licenses_revoked check (
    (revoked_at is null) = (revoked_by is null) and (revoked_at is null) = (revoke_reason is null)
  )
);
create index licenses_gym_id_idx on platform.licenses (gym_id, created_at desc);

create trigger read_only before update on platform.licenses
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'kid', 'type', 'gym_code', 'gym_name', 'max_branches', 'max_devices',
    'issued_on', 'expires_on', 'updates_until', 'code', 'created_at', 'created_by');

-- A gym's server PC: one active at a time. It binds the gym to the PC, not to one license, so a
-- renewal needs only a new license code. Moving to a new PC deactivates the old one first.
create table platform.activations (
  id uuid primary key,
  gym_id uuid not null references public.gyms (id),
  -- The newest license when it was made (for the record; the code names only the gym).
  license_id uuid not null,
  kid text not null check (kid ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  machine_code text not null check (app.normalize_machine_code(machine_code) is not distinct from machine_code),
  issued_on date not null,
  code text not null unique check (code ~ '^GSA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$'),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  deactivated_at timestamptz,
  deactivated_by uuid,
  deactivate_reason text check (app.is_clean_text(deactivate_reason, 500)),
  constraint activations_license_fkey foreign key (license_id, gym_id)
    references platform.licenses (id, gym_id),
  constraint activations_deactivated check (
    (deactivated_at is null) = (deactivated_by is null)
    and (deactivated_at is null) = (deactivate_reason is null)
  )
);
create index activations_gym_id_idx on platform.activations (gym_id, created_at desc);
create index activations_license_id_idx on platform.activations (license_id, gym_id);
create unique index activations_one_active_per_gym on platform.activations (gym_id)
  where deactivated_at is null;

create trigger read_only before update on platform.activations
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'license_id', 'kid', 'machine_code', 'issued_on', 'code', 'created_at',
    'created_by');

-- The log of license work, append-only like platform.audit_logs (and shown with it).
create table platform.license_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null check (action in (
    'license_issued', 'license_revoked', 'activation_issued', 'activation_deactivated'
  )),
  -- No foreign keys, like the other logs.
  gym_id uuid not null,
  license_id uuid,
  activation_id uuid,
  reason text check (app.is_clean_text(reason, 500)),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  ip inet
);
create index license_events_occurred_at_idx on platform.license_events (occurred_at desc);
create index license_events_gym_id_idx on platform.license_events (gym_id, occurred_at desc);

create trigger append_only
  before update or delete on platform.license_events
  for each row execute function app.reject_audit_change();
create trigger append_only_truncate
  before truncate on platform.license_events
  for each statement execute function app.reject_audit_change();

-- Nothing for clients, as for the other platform tables.
alter table platform.licenses enable row level security;
alter table platform.activations enable row level security;
alter table platform.license_events enable row level security;
revoke all on table platform.licenses from public, anon, authenticated, service_role;
revoke all on table platform.activations from public, anon, authenticated, service_role;
revoke all on table platform.license_events from public, anon, authenticated, service_role;

-- Helpers ------------------------------------------------------------------------------------------

create function app.license_log(
  p_action text,
  p_gym_id uuid,
  p_license_id uuid,
  p_activation_id uuid,
  p_reason text default null,
  p_details jsonb default '{}'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into platform.license_events
    (actor_id, actor_email, action, gym_id, license_id, activation_id, reason, details, ip)
  values (
    auth.uid(),
    (select u.email::text from auth.users u where u.id = auth.uid()),
    p_action,
    p_gym_id,
    p_license_id,
    p_activation_id,
    p_reason,
    coalesce(p_details, '{}'),
    app.request_ip(nullif(current_setting('request.headers', true), '')::jsonb)
  )
$$;

-- The offline gym a license or activation is for, locked until the change is done.
create function app.offline_gym_for_license(p_gym_id uuid)
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
  if gym.edition <> 'offline' then
    raise exception using errcode = '22023', message = 'online_gym',
      detail = 'Only an offline gym has licenses; an online gym follows its subscription';
  end if;
  return gym;
end
$$;

-- A license's own fields: its type, its limits (empty: none, or 1 to 10,000) and its end date.
-- Yearly: after the issue date, at most 2 years later (an early renewal still fits). Perpetual
-- updates: at most 5 years. As licenseDateProblem() in packages/core.
create function app.check_license_fields(
  p_type text,
  p_max_branches integer,
  p_max_devices integer,
  p_issued_on date,
  p_valid_until date
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_type is null or p_type not in ('yearly', 'perpetual')
     or p_max_branches not between 1 and 10000 or p_max_devices not between 1 and 10000
     or p_issued_on is null
  then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A license is yearly or perpetual, with limits of 1 to 10,000 or none';
  end if;
  if p_valid_until is null or p_valid_until <= p_issued_on
     or p_valid_until > (p_issued_on + case when p_type = 'yearly' then interval '24 months' else interval '60 months' end)::date
  then
    raise exception using errcode = '22023', message = 'invalid_license_date',
      detail = 'A yearly license ends within 2 years, a perpetual one''s updates within 5, both after today';
  end if;
end
$$;

-- An offline gym --------------------------------------------------------------------------------

-- A new offline gym's record: its id (the license carries it, and its server PC makes its one gym
-- row from it), its permanent code and its names. Its Owner, roles and branches are made on its own
-- server PC (offline packaging phase).
create function public.seller_create_offline_gym(
  p_gym_id uuid,
  p_code text,
  p_name_ckb text,
  p_name_en text default null,
  p_name_ar text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  if p_gym_id is null or p_name_ckb is null or not app.is_clean_text(p_name_ckb, 100)
     or not app.is_clean_text(p_name_en, 100) or not app.is_clean_text(p_name_ar, 100)
  then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A gym needs an id and a Kurdish name, and maybe English and Arabic ones';
  end if;
  perform app.check_new_gym_code(p_code);
  insert into public.gyms (id, code, name_ckb, name_en, name_ar, edition)
  values (p_gym_id, p_code, p_name_ckb, p_name_en, p_name_ar, 'offline');
  perform app.platform_log('gym_created', p_gym_id, null, null, jsonb_build_object(
    'code', p_code, 'name_ckb', p_name_ckb, 'edition', 'offline'));
end
$$;

-- As in migration 20261010100600, now for offline gyms too: a mistyped name would otherwise go into
-- every license. Never the code: that is part of every login.
create or replace function public.seller_rename_gym(p_gym_id uuid, p_name_ckb text, p_name_en text, p_name_ar text)
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
  select * into gym from public.gyms g where g.id = p_gym_id and g.deleted_at is null for update;
  if not found then
    raise exception using errcode = '22023', message = 'gym_not_found',
      detail = 'There is no open gym with this id';
  end if;
  if (gym.name_ckb, gym.name_en, gym.name_ar) is not distinct from (p_name_ckb, p_name_en, p_name_ar) then
    return;
  end if;
  update public.gyms set name_ckb = p_name_ckb, name_en = p_name_en, name_ar = p_name_ar where id = p_gym_id;
  perform app.platform_log('gym_renamed', p_gym_id, null, null, jsonb_build_object(
    'old', jsonb_build_object('name_ckb', gym.name_ckb, 'name_en', gym.name_en, 'name_ar', gym.name_ar),
    'new', jsonb_build_object('name_ckb', p_name_ckb, 'name_en', p_name_en, 'name_ar', p_name_ar)));
end
$$;

-- Licenses ------------------------------------------------------------------------------------------
-- 1. seller_prepare_license checks the request and answers what the code will carry; 2. the
--    seller-admin function signs it; 3. seller_issue_license checks it all again, compares the
--    code's payload with the fields and stores both with the log entry.

create function public.seller_prepare_license(
  p_gym_id uuid,
  p_type text,
  p_max_branches integer,
  p_max_devices integer,
  p_valid_until date
)
returns table (gym_code text, gym_name text, issued_on date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym public.gyms;
  today date := app.baghdad_today();
begin
  perform app.require_platform_admin();
  perform app.check_license_fields(p_type, p_max_branches, p_max_devices, today, p_valid_until);
  gym := app.offline_gym_for_license(p_gym_id);
  return query select gym.code, gym.name_ckb, today;
end
$$;

-- p_issued_on: the date seller_prepare_license answered (today, or yesterday when midnight passed
-- while the code was signed).
create function public.seller_issue_license(
  p_license_id uuid,
  p_gym_id uuid,
  p_type text,
  p_max_branches integer,
  p_max_devices integer,
  p_issued_on date,
  p_valid_until date,
  p_kid text,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin();
  gym public.gyms;
  expected jsonb;
begin
  if p_license_id is null or p_kid is null or p_kid !~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'
     or p_issued_on is null or p_issued_on not between app.baghdad_today() - 1 and app.baghdad_today()
  then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A license needs an id, a key id and today''s date';
  end if;
  perform app.check_license_fields(p_type, p_max_branches, p_max_devices, p_issued_on, p_valid_until);
  gym := app.offline_gym_for_license(p_gym_id);

  expected := jsonb_build_object(
    'v', 1,
    'lid', p_license_id,
    'kid', p_kid,
    'gid', gym.id,
    'gc', gym.code,
    'gn', gym.name_ckb,
    't', p_type,
    'mb', p_max_branches,
    'md', p_max_devices,
    'f', '[]'::jsonb,
    'iat', to_char(p_issued_on, 'YYYY-MM-DD'),
    case when p_type = 'yearly' then 'exp' else 'upd' end, to_char(p_valid_until, 'YYYY-MM-DD')
  );
  if app.license_code_payload(p_code, 'GSL1') is distinct from expected then
    raise exception using errcode = '22023', message = 'license_code_mismatch',
      detail = 'The code doesn''t carry exactly these fields';
  end if;

  insert into platform.licenses (id, gym_id, kid, type, gym_code, gym_name, max_branches,
    max_devices, issued_on, expires_on, updates_until, code, created_by)
  values (p_license_id, gym.id, p_kid, p_type, gym.code, gym.name_ckb, p_max_branches,
    p_max_devices, p_issued_on,
    case when p_type = 'yearly' then p_valid_until end,
    case when p_type = 'perpetual' then p_valid_until end,
    p_code, me);
  perform app.license_log('license_issued', gym.id, p_license_id, null, null, jsonb_build_object(
    'type', p_type, 'valid_until', p_valid_until, 'max_branches', p_max_branches,
    'max_devices', p_max_devices, 'kid', p_kid));
end
$$;

-- A record only (the server PC can't be reached): the panel shows the license as revoked. A reason
-- is required.
create function public.seller_revoke_license(p_license_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin();
  license platform.licenses;
begin
  perform app.check_reason(p_reason, true);
  select * into license from platform.licenses l where l.id = p_license_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'license_not_found',
      detail = 'There is no license with this id';
  end if;
  if license.revoked_at is not null then
    return;
  end if;
  update platform.licenses set revoked_at = now(), revoked_by = me, revoke_reason = p_reason
   where id = p_license_id;
  perform app.license_log('license_revoked', license.gym_id, license.id, null, p_reason);
end
$$;

-- The server PC ---------------------------------------------------------------------------------

-- The gym's newest license that isn't revoked; no_license when there is none.
create function app.current_license_id(p_gym_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  license_id uuid;
begin
  select l.id into license_id from platform.licenses l
   where l.gym_id = p_gym_id and l.revoked_at is null
   order by l.created_at desc, l.id
   limit 1;
  if license_id is null then
    raise exception using errcode = '22023', message = 'no_license',
      detail = 'Issue a license before activating a PC';
  end if;
  return license_id;
end
$$;

create function app.check_can_activate(p_gym_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.current_license_id(p_gym_id);
  if exists (select 1 from platform.activations a where a.gym_id = p_gym_id and a.deactivated_at is null) then
    raise exception using errcode = '23505', message = 'already_activated',
      detail = 'The gym already has an active server PC; deactivate it first';
  end if;
end
$$;

-- Answers the machine code as it will be signed (normalized) and today's date.
create function public.seller_prepare_activation(p_gym_id uuid, p_machine_code text)
returns table (machine_code text, issued_on date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
begin
  perform app.require_platform_admin();
  normalized := app.normalize_machine_code(p_machine_code);
  if normalized is null then
    raise exception using errcode = '22023', message = 'invalid_machine_code',
      detail = 'A machine code has 20 characters and a check that matches';
  end if;
  perform app.offline_gym_for_license(p_gym_id);
  perform app.check_can_activate(p_gym_id);
  return query select normalized, app.baghdad_today();
end
$$;

create function public.seller_issue_activation(
  p_activation_id uuid,
  p_gym_id uuid,
  p_machine_code text,
  p_issued_on date,
  p_kid text,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin();
  gym public.gyms;
  license_id uuid;
begin
  if p_activation_id is null or p_kid is null or p_kid !~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'
     or p_issued_on is null or p_issued_on not between app.baghdad_today() - 1 and app.baghdad_today()
  then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'An activation needs an id, a key id and today''s date';
  end if;
  if p_machine_code is null or app.normalize_machine_code(p_machine_code) is distinct from p_machine_code then
    raise exception using errcode = '22023', message = 'invalid_machine_code',
      detail = 'A machine code has 20 characters and a check that matches, sent normalized';
  end if;
  gym := app.offline_gym_for_license(p_gym_id);
  perform app.check_can_activate(gym.id);
  license_id := app.current_license_id(gym.id);

  if app.license_code_payload(p_code, 'GSA1') is distinct from jsonb_build_object(
    'v', 1,
    'aid', p_activation_id,
    'kid', p_kid,
    'gid', gym.id,
    'mc', p_machine_code,
    'iat', to_char(p_issued_on, 'YYYY-MM-DD')
  ) then
    raise exception using errcode = '22023', message = 'license_code_mismatch',
      detail = 'The code doesn''t carry exactly these fields';
  end if;

  insert into platform.activations (id, gym_id, license_id, kid, machine_code, issued_on, code, created_by)
  values (p_activation_id, gym.id, license_id, p_kid, p_machine_code, p_issued_on, p_code, me);
  perform app.license_log('activation_issued', gym.id, license_id, p_activation_id, null,
    jsonb_build_object('machine_code', p_machine_code, 'kid', p_kid));
end
$$;

-- A record only: the PC keeps its activation until it is reinstalled. Frees the gym for a new PC.
create function public.seller_deactivate_activation(p_activation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.require_platform_admin();
  activation platform.activations;
begin
  perform app.check_reason(p_reason, true);
  select * into activation from platform.activations a where a.id = p_activation_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'activation_not_found',
      detail = 'There is no activation with this id';
  end if;
  if activation.deactivated_at is not null then
    return;
  end if;
  update platform.activations
     set deactivated_at = now(), deactivated_by = me, deactivate_reason = p_reason
   where id = p_activation_id;
  perform app.license_log('activation_deactivated', activation.gym_id, activation.license_id,
    activation.id, p_reason, jsonb_build_object('machine_code', activation.machine_code));
end
$$;

-- Reading --------------------------------------------------------------------------------------------

-- Every license (or one gym's), newest first, with who issued and revoked it.
create function public.seller_licenses(p_gym_id uuid default null)
returns table (
  id uuid,
  gym_id uuid,
  kid text,
  type text,
  gym_code text,
  gym_name text,
  max_branches integer,
  max_devices integer,
  issued_on date,
  expires_on date,
  updates_until date,
  code text,
  created_at timestamptz,
  created_by_email text,
  revoked_at timestamptz,
  revoked_by_email text,
  revoke_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select l.id, l.gym_id, l.kid, l.type, l.gym_code, l.gym_name, l.max_branches, l.max_devices,
           l.issued_on, l.expires_on, l.updates_until, l.code, l.created_at,
           (select u.email::text from auth.users u where u.id = l.created_by),
           l.revoked_at,
           (select u.email::text from auth.users u where u.id = l.revoked_by),
           l.revoke_reason
      from platform.licenses l
     where p_gym_id is null or l.gym_id = p_gym_id
     order by l.created_at desc, l.id;
end
$$;

-- Every activation (or one gym's), newest first.
create function public.seller_activations(p_gym_id uuid default null)
returns table (
  id uuid,
  gym_id uuid,
  license_id uuid,
  kid text,
  machine_code text,
  issued_on date,
  code text,
  created_at timestamptz,
  created_by_email text,
  deactivated_at timestamptz,
  deactivated_by_email text,
  deactivate_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select a.id, a.gym_id, a.license_id, a.kid, a.machine_code, a.issued_on, a.code, a.created_at,
           (select u.email::text from auth.users u where u.id = a.created_by),
           a.deactivated_at,
           (select u.email::text from auth.users u where u.id = a.deactivated_by),
           a.deactivate_reason
      from platform.activations a
     where p_gym_id is null or a.gym_id = p_gym_id
     order by a.created_at desc, a.id;
end
$$;

-- As in migration 20261010100500, with the license events among the entries (their license and
-- activation ids in details).
create or replace function public.seller_audit_log(
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
    select e.id, e.occurred_at, e.actor_id, e.actor_email, e.action, e.gym_id, g.code,
           e.target_admin_id, u.email::text, e.reason, e.details
      from (
        select l.id, l.occurred_at, l.actor_id, l.actor_email, l.action, l.gym_id,
               l.target_admin_id, l.reason, l.details
          from platform.audit_logs l
         where (p_gym_id is null or l.gym_id = p_gym_id)
           and (p_before is null or l.occurred_at < p_before)
        union all
        select le.id, le.occurred_at, le.actor_id, le.actor_email, le.action, le.gym_id,
               null::uuid, le.reason,
               le.details || jsonb_strip_nulls(jsonb_build_object(
                 'license_id', le.license_id, 'activation_id', le.activation_id))
          from platform.license_events le
         where (p_gym_id is null or le.gym_id = p_gym_id)
           and (p_before is null or le.occurred_at < p_before)
      ) e
      left join public.gyms g on g.id = e.gym_id
      left join auth.users u on u.id = e.target_admin_id
     order by e.occurred_at desc, e.id
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end
$$;

-- Grants ------------------------------------------------------------------------------------------

revoke execute on function public.seller_create_offline_gym(uuid, text, text, text, text) from public, anon;
grant execute on function public.seller_create_offline_gym(uuid, text, text, text, text) to authenticated;
revoke execute on function public.seller_prepare_license(uuid, text, integer, integer, date) from public, anon;
grant execute on function public.seller_prepare_license(uuid, text, integer, integer, date) to authenticated;
revoke execute on function public.seller_issue_license(uuid, uuid, text, integer, integer, date, date, text, text) from public, anon;
grant execute on function public.seller_issue_license(uuid, uuid, text, integer, integer, date, date, text, text) to authenticated;
revoke execute on function public.seller_revoke_license(uuid, text) from public, anon;
grant execute on function public.seller_revoke_license(uuid, text) to authenticated;
revoke execute on function public.seller_prepare_activation(uuid, text) from public, anon;
grant execute on function public.seller_prepare_activation(uuid, text) to authenticated;
revoke execute on function public.seller_issue_activation(uuid, uuid, text, date, text, text) from public, anon;
grant execute on function public.seller_issue_activation(uuid, uuid, text, date, text, text) to authenticated;
revoke execute on function public.seller_deactivate_activation(uuid, text) from public, anon;
grant execute on function public.seller_deactivate_activation(uuid, text) to authenticated;
revoke execute on function public.seller_licenses(uuid) from public, anon;
grant execute on function public.seller_licenses(uuid) to authenticated;
revoke execute on function public.seller_activations(uuid) from public, anon;
grant execute on function public.seller_activations(uuid) to authenticated;

revoke execute on function app.license_log(text, uuid, uuid, uuid, text, jsonb) from public;
revoke execute on function app.offline_gym_for_license(uuid) from public;
revoke execute on function app.current_license_id(uuid) from public;
revoke execute on function app.check_can_activate(uuid) from public;
