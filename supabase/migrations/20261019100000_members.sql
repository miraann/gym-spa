-- Members (spec §4.1, Phase 2 step 2a): the member profile, health info kept apart, and search.
-- Decided by the user on 2026-10-19 with the Phase 2 plan:
--
--   * Members belong to the gym, not to a branch: everyone with members.view sees every member of
--     their gym. The home branch is where the member joined, a filter on the screens.
--   * The member number is a plain number per gym (shown as 000123), given by the server in
--     order, never changed and never reused.
--   * A phone number is required, unless the member has none of their own (a child): then their
--     emergency contact's phone is required. Iraqi mobiles are stored as +9647XXXXXXXXX; other
--     countries' numbers are allowed with + and the country code. Unique per gym, archived members
--     included, so a member who comes back is restored, not added twice.
--   * Health info (member_health) is read only with members.medical.view. Staff with
--     members.create may also write it while they create the member (create_member), without
--     being able to read it afterwards. Later changes need members.medical.view and members.edit.
--     The audit log records that it changed, never the values.
--   * Suspending, banning, archiving and restoring need members.delete. Members are never deleted.
--
-- The app has the same rules in packages/core/src/members.ts and search.ts; tests compare them.

-- fuzzystrmatch (levenshtein) finds names that are spelled a little differently. It counts
-- letters, not bytes, and doesn't depend on the server's locale, so it works the same on the
-- offline edition's Windows server.
create extension if not exists fuzzystrmatch with schema extensions;

-- Rules shared with the app -------------------------------------------------------------------

-- Text as searches compare it (normalizeSearchText() in packages/core): small letters, no Arabic
-- vowel marks, tatweel or invisible joiners, Arabic and Kurdish look-alike letters made one (also
-- the Kurdish letters an Arabic keyboard can't type, so ڕێباز is found by typing ريباز), Eastern
-- Arabic digits as 0-9, single spaces.
create function app.normalize_search_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(
      regexp_replace(lower(value), '[ً-ٰٟـ‌-‏]', '', 'g'),
      'يىكةهۀھأإآؤپچژگڤڕڵێۆ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
      'ییکەەەەاااوبجزکفرلیو01234567890123456789'
    ),
    '\s+', ' ', 'g'
  ))
$$;

-- A member's phone as stored: + and 8 to 15 digits; an Iraqi number must be a mobile,
-- +9647XXXXXXXXX. Empty is allowed here (the row checks that one of the phones is there).
create function app.is_valid_member_phone(value text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select value is null
      or (value ~ '^\+[1-9][0-9]{7,14}$' and (value !~ '^\+964' or value ~ '^\+9647[0-9]{9}$'))
$$;

-- At most 10 tags, each 1 to 30 characters with no space at either end, no tag twice.
create function app.is_valid_member_tags(tags text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select tags is not null
     and coalesce(array_ndims(tags), 1) = 1
     and cardinality(tags) <= 10
     and not exists (
       select 1 from unnest(tags) as t (tag) where t.tag is null or t.tag = '' or not app.is_clean_text(t.tag, 30)
     )
     and cardinality(tags) = (select count(distinct t.tag) from unnest(tags) as t (tag))
$$;

-- The forms of a stored phone that staff type when searching: its digits, and for Iraqi numbers
-- also the local form (07501234567).
create function app.phone_search_forms(phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when phone is null then null
    when phone like '+964%' then substr(phone, 2) || ' 0' || substr(phone, 5)
    else substr(phone, 2)
  end
$$;

-- Everything a member is found by, in one normalized text: name, number (000123) and phones.
create function app.member_search_text(full_name text, member_number integer, phone text, emergency_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select concat_ws(' ',
    app.normalize_search_text(full_name),
    lpad(member_number::text, greatest(6, length(member_number::text)), '0'),
    app.phone_search_forms(phone),
    app.phone_search_forms(emergency_phone)
  )
$$;

-- A search query as compared with members.search_text (memberSearchNeedle() in packages/core):
-- normalized, and a query of only digits, spaces, +, - and brackets (a phone or a member number)
-- keeps its digits only.
create function app.member_search_needle(query text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when n.needle ~ '^[+0-9 ()-]+$' then regexp_replace(n.needle, '[^0-9]', '', 'g') else n.needle end
    from (select app.normalize_search_text(coalesce(query, '')) as needle) as n
$$;

-- Member numbers ------------------------------------------------------------------------------

-- Counters per gym. The next number takes the counter row's lock until the transaction ends, so
-- two members saved at the same moment never get the same number, and a failed save gives its
-- number back (no gaps). Private: only the numbering trigger uses it.
create table app.gym_counters (
  gym_id uuid not null references public.gyms (id),
  counter text not null check (counter in ('member')),
  last_value bigint not null check (last_value > 0),
  primary key (gym_id, counter)
);

revoke all on table app.gym_counters from public, anon, authenticated;

create function app.next_member_number(p_gym_id uuid)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  insert into app.gym_counters as c (gym_id, counter, last_value)
  values (p_gym_id, 'member', 1)
  on conflict (gym_id, counter) do update set last_value = c.last_value + 1
  returning c.last_value::integer
$$;

revoke execute on function app.next_member_number(uuid) from public, anon, authenticated;

-- Members -------------------------------------------------------------------------------------

create table public.members (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  -- Where the member joined. Members belong to the whole gym; this is a filter.
  branch_id uuid not null,
  -- Given by the server (trigger number), shown as 000123.
  member_number integer not null check (member_number > 0),
  full_name text not null check (app.is_clean_text(full_name, 100)),
  gender text not null check (gender in ('male', 'female')),
  -- Empty: the member has no phone of their own (emergency_phone is required then).
  phone text check (app.is_valid_member_phone(phone)),
  emergency_contact_name text check (app.is_clean_text(emergency_contact_name, 100)),
  emergency_phone text check (app.is_valid_member_phone(emergency_phone)),
  birth_date date check (birth_date >= date '1900-01-01'),
  -- The language of the member's messages and receipts.
  preferred_language public.language_code not null default 'ckb',
  address text check (app.is_clean_text(address, 300)),
  referral_source text check (referral_source in ('friend', 'social_media', 'passing_by', 'advertisement', 'other')),
  goals text check (app.is_clean_text(goals, 1000)),
  notes text check (app.is_clean_text(notes, 2000)),
  tags text[] not null default '{}' check (app.is_valid_member_tags(tags)),
  -- Set by staff with members.delete (set_member_status). Expired and frozen come from the
  -- subscriptions (Phase 3), never stored here.
  status text not null default 'active' check (status in ('active', 'suspended', 'banned', 'archived')),
  status_reason text check (app.is_clean_text(status_reason, 300)),
  status_changed_at timestamptz,
  status_changed_by uuid,
  -- Whether member_health has medical notes or injuries, so staff who can't read them know to ask.
  -- Kept by the trigger on member_health.
  has_health_notes boolean not null default false,
  search_text text not null generated always as (app.member_search_text(full_name, member_number, phone, emergency_phone)) stored,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint members_id_gym_id_key unique (id, gym_id),
  constraint members_gym_id_member_number_key unique (gym_id, member_number),
  constraint members_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint members_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint members_contact_phone check (phone is not null or emergency_phone is not null),
  constraint members_status_reason check (status = 'active' or status_reason is not null)
);

-- One member per phone number in a gym, archived members included.
create unique index members_gym_id_phone_key on public.members (gym_id, phone)
  where phone is not null and deleted_at is null;
create index members_branch_id_gym_id_idx on public.members (branch_id, gym_id);
create index members_gym_id_status_idx on public.members (gym_id, status);

comment on column public.members.member_number is 'Plain number per gym, given by the server in order; shown as 000123. Never changes.';
comment on column public.members.search_text is 'Name, number and phones normalized for search (app.member_search_text).';

-- Health info, one row per member (its id is the member's). Apart from members, so RLS can hide it.
create table public.member_health (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  blood_type text check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  medical_notes text check (app.is_clean_text(medical_notes, 2000)),
  injuries text check (app.is_clean_text(injuries, 2000)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint member_health_id_gym_id_key unique (id, gym_id),
  constraint member_health_id_gym_id_fkey foreign key (id, gym_id) references public.members (id, gym_id)
);

-- Guards --------------------------------------------------------------------------------------

-- BEFORE INSERT OR UPDATE on members.
--   Everyone (server code too): a phone of their own or an emergency contact's phone; no birth
--   date in the future (Baghdad); every status but active has a reason; a status change records
--   who and when; has_health_notes starts false and follows member_health.
--   Staff: a new member joins in an active branch they can access, and starts active. Changing the
--   status needs members.delete; changing anything else needs members.edit and isn't possible
--   while the member is archived (restore them first).
create function app.guard_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Columns that aren't part of the profile itself.
  not_profile constant text[] := array[
    'status', 'status_reason', 'status_changed_at', 'status_changed_by', 'has_health_notes',
    'search_text', 'updated_at', 'updated_by'
  ];
  status_changed boolean;
  profile_changed boolean;
begin
  if new.phone is null and new.emergency_phone is null then
    raise exception using errcode = '23514', message = 'contact_phone_required',
      detail = 'A member without a phone of their own needs an emergency contact phone';
  end if;
  if new.birth_date > (now() at time zone 'Asia/Baghdad')::date then
    raise exception using errcode = '23514', message = 'invalid_birth_date',
      detail = 'The birth date is in the future';
  end if;
  if new.status <> 'active' and new.status_reason is null then
    raise exception using errcode = '23514', message = 'reason_required',
      detail = 'Suspending, banning or archiving a member needs a reason';
  end if;
  if tg_op = 'INSERT' then
    new.has_health_notes := false;
  else
    status_changed := (new.status, new.status_reason) is distinct from (old.status, old.status_reason);
    if status_changed then
      new.status_changed_at := now();
      new.status_changed_by := auth.uid();
    else
      new.status_changed_at := old.status_changed_at;
      new.status_changed_by := old.status_changed_by;
    end if;
  end if;

  if app.is_system_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not app.has_branch_access(new.branch_id) then
      raise exception using errcode = '42501', message = 'no_branch_access',
        detail = 'A member joins in one of your own branches';
    end if;
    if not app.is_active_branch(new.branch_id) then
      raise exception using errcode = '23514', message = 'branch_inactive',
        detail = 'Members join in active branches only';
    end if;
    new.status := 'active';
    new.status_reason := null;
    new.status_changed_at := null;
    new.status_changed_by := null;
    return new;
  end if;

  -- Only the trigger on member_health (one trigger level down) changes the flag.
  if new.has_health_notes is distinct from old.has_health_notes and pg_trigger_depth() < 2 then
    raise exception using errcode = '42501', message = 'read_only_column',
      detail = 'members.has_health_notes follows member_health';
  end if;

  profile_changed := (to_jsonb(new) - not_profile) is distinct from (to_jsonb(old) - not_profile);

  if status_changed and not app.has_permission('members.delete') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Suspending, banning, archiving and restoring a member needs members.delete';
  end if;

  if profile_changed then
    if old.status = 'archived' then
      raise exception using errcode = '42501', message = 'member_archived',
        detail = 'An archived member can''t be changed; restore them first';
    end if;
    if not app.has_permission('members.edit') then
      raise exception using errcode = '42501', message = 'permission_denied',
        detail = 'Changing a member needs members.edit';
    end if;
    if new.branch_id is distinct from old.branch_id then
      if not app.has_branch_access(new.branch_id) then
        raise exception using errcode = '42501', message = 'no_branch_access',
          detail = 'A member''s home branch can only be one of your own branches';
      end if;
      if not app.is_active_branch(new.branch_id) then
        raise exception using errcode = '23514', message = 'branch_inactive',
          detail = 'A member''s home branch must be active';
      end if;
    end if;
  end if;
  return new;
end
$$;

-- BEFORE INSERT on members: the gym's next member number, whatever the row says.
create function app.number_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.member_number := app.next_member_number(new.gym_id);
  return new;
end
$$;

-- BEFORE INSERT OR UPDATE on member_health. Writing health info needs members.medical.view and
-- members.edit, except while create_member() makes the member: it marks that one member for its
-- own transaction, and then members.create is enough. Clients can't set the mark: the Data API
-- exposes no way to set settings. Nothing changes while the member is archived.
create function app.guard_member_health()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return new;
  end if;
  if exists (select 1 from public.members m where m.id = new.id and m.status = 'archived') then
    raise exception using errcode = '42501', message = 'member_archived',
      detail = 'An archived member can''t be changed; restore them first';
  end if;
  if not (app.has_permission('members.medical.view') and app.has_permission('members.edit'))
     and not (tg_op = 'INSERT' and current_setting('app.creating_member', true) is not distinct from new.id::text)
  then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Health info needs members.medical.view and members.edit, or is written while creating the member';
  end if;
  return new;
end
$$;

-- AFTER INSERT OR UPDATE on member_health: keeps members.has_health_notes.
create function app.sync_member_health_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members m
     set has_health_notes = (new.medical_notes is not null or new.injuries is not null)
   where m.id = new.id
     and m.gym_id = new.gym_id
     and m.has_health_notes is distinct from (new.medical_notes is not null or new.injuries is not null);
  return null;
end
$$;

-- BEFORE triggers run in name order: check_writable, guard, number, read_only, stamp.
create trigger check_writable before insert or update or delete on public.members
  for each row execute function app.check_gym_writable();
create trigger guard before insert or update on public.members
  for each row execute function app.guard_members();
create trigger number before insert on public.members
  for each row execute function app.number_member();
create trigger read_only before update on public.members
  for each row execute function app.read_only_columns('id', 'gym_id', 'member_number');
create trigger stamp before insert or update on public.members
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.members
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.member_health
  for each row execute function app.check_gym_writable();
create trigger guard before insert or update on public.member_health
  for each row execute function app.guard_member_health();
create trigger read_only before update on public.member_health
  for each row execute function app.read_only_columns('id', 'gym_id');
create trigger stamp before insert or update on public.member_health
  for each row execute function app.stamp_row();
-- The log records who changed the health info and when, never the values.
create trigger audit after insert or update or delete on public.member_health
  for each row execute function app.audit_row('{blood_type,medical_notes,injuries}');
create trigger sync_flag after insert or update on public.member_health
  for each row execute function app.sync_member_health_flag();

-- Row level security --------------------------------------------------------------------------

alter table public.members enable row level security;
alter table public.member_health enable row level security;

revoke all on table public.members, public.member_health from anon, authenticated;
grant all on table public.members, public.member_health to service_role;
-- Never deleted: archived instead.
grant select, insert, update on table public.members, public.member_health to authenticated;

create policy "staff with members.view read members" on public.members
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

create policy "staff with members.create add members" on public.members
  for insert to authenticated
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('members.create'))
    and branch_id in (select app.accessible_branch_ids())
  );

-- The guard decides which columns: the status needs members.delete, the rest members.edit.
create policy "staff with members.edit or members.delete change members" on public.members
  for update to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and ((select app.has_permission('members.edit')) or (select app.has_permission('members.delete')))
  )
  with check (
    gym_id = (select app.current_gym_id())
    and ((select app.has_permission('members.edit')) or (select app.has_permission('members.delete')))
  );

create policy "staff with members.medical.view read health info" on public.member_health
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.medical.view')));

-- members.create alone only while creating the member (the guard checks create_member's mark).
create policy "staff add health info" on public.member_health
  for insert to authenticated
  with check (
    gym_id = (select app.current_gym_id())
    and (
      ((select app.has_permission('members.medical.view')) and (select app.has_permission('members.edit')))
      or (select app.has_permission('members.create'))
    )
  );

create policy "staff with members.medical.view and members.edit change health info" on public.member_health
  for update to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('members.medical.view'))
    and (select app.has_permission('members.edit'))
  )
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('members.medical.view'))
    and (select app.has_permission('members.edit'))
  );

-- RPCs ----------------------------------------------------------------------------------------
-- They run as the caller (security invoker), so RLS, the guards and the audit log apply as for any
-- other write. The screens read the member list straight from the table (server-side paging,
-- filters and sorting through PostgREST); search_text is what its search box filters on.

-- Adds a member (p_id made by the app) with the gym's next number, and their health info when any
-- is given, all or nothing. Needs members.create and members.view (it returns the member). Saving
-- the same id again says member_exists, so a retry after a lost answer can load the member.
create function public.create_member(
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
security invoker
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
    select 1 from public.members m where m.phone = p_phone and m.deleted_at is null
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
    perform set_config('app.creating_member', p_id::text, true);
    insert into public.member_health (id, blood_type, medical_notes, injuries)
    values (p_id, p_blood_type, p_medical_notes, p_injuries);
    perform set_config('app.creating_member', '', true);
    select * into created from public.members m where m.id = p_id;
  end if;
  return created;
end
$$;

revoke execute on function public.create_member(uuid, uuid, text, text, text, text, text, date, public.language_code, text, text, text, text, text[], text, text, text) from public, anon;
grant execute on function public.create_member(uuid, uuid, text, text, text, text, text, date, public.language_code, text, text, text, text, text[], text, text, text) to authenticated;

-- Saves a member's profile as the form shows it (last write wins); the status changes through
-- set_member_status() instead. With p_save_health, also their health info, which needs
-- members.medical.view as well. All or nothing.
create function public.update_member(
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
  p_save_health boolean default false,
  p_blood_type text default null,
  p_medical_notes text default null,
  p_injuries text default null
)
returns public.members
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated public.members;
  failed_constraint text;
begin
  if not app.has_permission('members.edit') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing a member needs members.edit';
  end if;
  if coalesce(p_save_health, false) and not app.has_permission('members.medical.view') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing health info needs members.medical.view and members.edit';
  end if;
  if p_phone is not null and exists (
    select 1 from public.members m where m.phone = p_phone and m.id <> p_id and m.deleted_at is null
  ) then
    raise exception using errcode = '23505', message = 'phone_in_use',
      detail = 'Another member of this gym has this phone number';
  end if;

  begin
    update public.members m
       set branch_id = p_branch_id,
           full_name = p_full_name,
           gender = p_gender,
           phone = p_phone,
           emergency_contact_name = p_emergency_contact_name,
           emergency_phone = p_emergency_phone,
           birth_date = p_birth_date,
           preferred_language = coalesce(p_preferred_language, 'ckb'),
           address = p_address,
           referral_source = p_referral_source,
           goals = p_goals,
           notes = p_notes,
           tags = coalesce(p_tags, '{}')
     where m.id = p_id and m.deleted_at is null
    returning * into updated;
  exception
    when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint = 'members_gym_id_phone_key' then
        raise exception using errcode = '23505', message = 'phone_in_use',
          detail = 'Another member of this gym has this phone number';
      end if;
      raise;
  end;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;

  if coalesce(p_save_health, false) then
    insert into public.member_health as h (id, blood_type, medical_notes, injuries)
    values (p_id, p_blood_type, p_medical_notes, p_injuries)
    on conflict (id) do update
      set blood_type = excluded.blood_type,
          medical_notes = excluded.medical_notes,
          injuries = excluded.injuries;
    select * into updated from public.members m where m.id = p_id;
  end if;
  return updated;
end
$$;

revoke execute on function public.update_member(uuid, uuid, text, text, text, text, text, date, public.language_code, text, text, text, text, text[], boolean, text, text, text) from public, anon;
grant execute on function public.update_member(uuid, uuid, text, text, text, text, text, date, public.language_code, text, text, text, text, text[], boolean, text, text, text) to authenticated;

-- Suspends, bans, archives or restores (active) a member. Needs members.delete; every status but
-- active needs a reason.
create function public.set_member_status(p_id uuid, p_status text, p_reason text default null)
returns public.members
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated public.members;
begin
  if not app.has_permission('members.delete') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Suspending, banning, archiving and restoring a member needs members.delete';
  end if;
  update public.members m
     set status = p_status, status_reason = p_reason
   where m.id = p_id and m.deleted_at is null
  returning * into updated;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  return updated;
end
$$;

revoke execute on function public.set_member_status(uuid, text, text) from public, anon;
grant execute on function public.set_member_status(uuid, text, text) to authenticated;

-- Members a new (or changed) member might be the same person as, for the form's warning, archived
-- ones included so they can be restored instead. match is one of:
--   phone: the same phone number (saving would be refused);
--   same_name: the same name, as search compares it, spaces ignored;
--   similar_name: the same first two words, or a name a letter or two apart.
create function public.find_member_duplicates(
  p_full_name text default null,
  p_phone text default null,
  p_exclude_id uuid default null
)
returns table (
  id uuid,
  member_number integer,
  full_name text,
  phone text,
  status text,
  branch_id uuid,
  match text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with wanted as (
    select left(app.normalize_search_text(coalesce(p_full_name, '')), 100) as name, p_phone as phone
  ),
  candidates as (
    select m.*, w.name as wanted_name, w.phone as wanted_phone,
           app.normalize_search_text(m.full_name) as name
      from public.members m
     cross join wanted w
     where m.deleted_at is null
       and (p_exclude_id is null or m.id <> p_exclude_id)
  ),
  scored as (
    select c.*,
           case
             when c.wanted_phone is not null and c.phone = c.wanted_phone then 'phone'
             when length(c.wanted_name) >= 3
                  and replace(c.name, ' ', '') = replace(c.wanted_name, ' ', '') then 'same_name'
             when array_length(string_to_array(c.wanted_name, ' '), 1) >= 2
                  and (string_to_array(c.name, ' '))[1:2] = (string_to_array(c.wanted_name, ' '))[1:2]
               then 'similar_name'
             when length(c.wanted_name) >= 6
                  and extensions.levenshtein(c.name, c.wanted_name)
                      <= case when length(c.wanted_name) > 10 then 2 else 1 end
               then 'similar_name'
           end as match
      from candidates c
  )
  select s.id, s.member_number, s.full_name, s.phone, s.status, s.branch_id, s.match
    from scored s
   where s.match is not null
   order by case s.match when 'phone' then 0 when 'same_name' then 1 else 2 end, s.full_name, s.member_number
   limit 10
$$;

revoke execute on function public.find_member_duplicates(text, text, uuid) from public, anon;
grant execute on function public.find_member_duplicates(text, text, uuid) to authenticated;

-- Finds members by name, number or phone (Ctrl+K, and later the manual check-in), best matches
-- first: the exact member number, then whole words (a full phone number, a whole name), then
-- names that start with the query. Archived members only when asked for. At most 50.
create function public.search_members(
  p_query text,
  p_limit integer default 20,
  p_include_archived boolean default false
)
returns setof public.members
language sql
stable
security invoker
set search_path = ''
as $$
  with needle as (select app.member_search_needle(p_query) as q)
  select m.*
    from public.members m
   cross join needle n
   where n.q <> ''
     and m.deleted_at is null
     and (coalesce(p_include_archived, false) or m.status <> 'archived')
     and strpos(m.search_text, n.q) > 0
   order by
     coalesce(n.q ~ '^[0-9]+$' and m.member_number::text = ltrim(n.q, '0'), false) desc,
     strpos(' ' || m.search_text || ' ', ' ' || n.q || ' ') > 0 desc,
     strpos(m.search_text, n.q) = 1 desc,
     m.full_name,
     m.member_number
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

revoke execute on function public.search_members(text, integer, boolean) from public, anon;
grant execute on function public.search_members(text, integer, boolean) to authenticated;
