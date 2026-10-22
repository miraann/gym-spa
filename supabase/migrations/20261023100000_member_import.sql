-- Phase 2, step 2j: importing members from a gym's own Excel/CSV list (spec §4.1). The import page
-- reads the file in the browser and shows a preview; the rows staff tick are saved here in one
-- call, all or nothing, with the same rules as one new member. Expand first: new tables, a new
-- column (members.import_id) and new functions, and the member triggers gain the import's own case
-- (nothing older clients use changes).

-- Names compared for duplicates ------------------------------------------------------------------
-- A name's "skeleton" is written the way an Arabic keyboard tends to write it: ئ as ا (ئا as one ا)
-- and without ە, و and ی, which Arabic spelling leaves out (عومەر / عمر, ئەحمەد / احمد). So
-- ڕێباز عومەر and ريباز عمر look alike. memberNamesMatch() in packages/core does the same;
-- supabase/tests/290-member-import.test.sql has the cases both run.

-- The skeleton of a text already normalized with app.normalize_search_text().
create function app.name_skeleton(normalized text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(translate(replace(coalesce(normalized, ''), 'ئا', 'ا'), 'ئ', 'ا'), '[ەوی]', '', 'g')
$$;

-- Whether two normalized names may be the same person:
--   same_name: the same name, spaces ignored (3 letters or more);
--   similar_name: the same first word's skeleton, and then the same second word's skeleton, or
--   the whole names a letter (two from 11 letters on) apart (6 letters or more).
create function app.normalized_names_match(a text, b text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when length(replace(a, ' ', '')) >= 3 and replace(a, ' ', '') = replace(b, ' ', '') then 'same_name'
    when app.name_skeleton(split_part(a, ' ', 1)) <> ''
         and app.name_skeleton(split_part(a, ' ', 1)) = app.name_skeleton(split_part(b, ' ', 1))
         and (
           (split_part(a, ' ', 2) <> '' and split_part(b, ' ', 2) <> ''
            and app.name_skeleton(split_part(a, ' ', 2)) = app.name_skeleton(split_part(b, ' ', 2)))
           or (least(length(a), length(b)) >= 6
               and extensions.levenshtein(a, b) <= case when greatest(length(a), length(b)) > 10 then 2 else 1 end)
         )
      then 'similar_name'
  end
$$;

create function app.member_names_match(a text, b text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select app.normalized_names_match(app.normalize_search_text(coalesce(a, '')), app.normalize_search_text(coalesce(b, '')))
$$;

-- What an import keeps of the columns it can't use yet, per member: the old member number, the
-- subscription (Phase 3), a birth year without a date, and a card the importer couldn't give.
-- An object of member id → {field: short text}.
create function app.is_valid_import_kept(kept jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(kept) = 'object'
     and not exists (
       select 1
         from jsonb_each(kept) m
        where m.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(m.value) <> 'object'
           or exists (
             select 1 from jsonb_each(m.value) e
              where e.key not in ('oldNumber', 'subscriptionType', 'subscriptionEnd', 'birthYear', 'card')
                 or jsonb_typeof(e.value) <> 'string'
                 or not app.is_clean_text(e.value #>> '{}', 100)
           )
     )
$$;

-- Tables -------------------------------------------------------------------------------------

-- One import: who, when, which file, how many members (and cards) it added, and what it kept of
-- the columns not used yet (kept: member id → values). The kept values are left out of the audit
-- log, which records the import itself.
create table public.member_imports (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  file_name text not null check (app.is_clean_text(file_name, 200)),
  member_count integer not null check (member_count between 1 and 5000),
  card_count integer not null default 0 check (card_count >= 0),
  kept jsonb not null default '{}' check (app.is_valid_import_kept(kept)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint member_imports_id_gym_id_key unique (id, gym_id),
  constraint member_imports_gym_id_fkey foreign key (gym_id) references public.gyms (id)
);

create index member_imports_gym_id_idx on public.member_imports (gym_id, created_at desc);

-- The import a member came from: set by import_members() only (app.guard_members()), never changed.
alter table public.members add column import_id uuid;
alter table public.members add constraint members_import_id_gym_id_fkey
  foreign key (import_id, gym_id) references public.member_imports (id, gym_id);
create index members_import_id_gym_id_idx on public.members (import_id, gym_id);
comment on column public.members.import_id is 'The import that added the member (import_members()), else null. Never changes.';

comment on table public.member_imports is 'Members imported from a file (step 2j). Added only by import_members().';
comment on column public.member_imports.kept is 'Per member id: the old member number, subscription, birth year or card the import could not use yet.';

create trigger check_writable before insert or update or delete on public.member_imports
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.member_imports
  for each row execute function app.read_only_columns('id', 'gym_id', 'file_name', 'member_count', 'card_count', 'kept');
create trigger stamp before insert or update on public.member_imports
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.member_imports
  for each row execute function app.audit_row('{kept}');

alter table public.member_imports enable row level security;

revoke all on table public.member_imports from anon, authenticated;
grant all on table public.member_imports to service_role;
-- Written once by import_members(), never changed.
grant select, insert on table public.member_imports to authenticated;

-- The old member number belongs with the member's profile.
create policy "staff with members.view see imports" on public.member_imports
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

create policy "staff with members.import import members" on public.member_imports
  for insert to authenticated
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('members.import'))
    and (select app.has_permission('members.create'))
  );

-- The import's own transaction -------------------------------------------------------------------
-- import_members() checks the whole import once, set-based (permissions, the gym, every row's
-- branch and values), and then marks its transaction: a row in app.member_import_marks with the
-- transaction's id. While that row exists, the triggers below skip the checks the import already
-- made for every row, so 5,000 members fit in one call within the cloud's statement timeout (8 s
-- for staff). Everything else is as for one new member.
--
-- undo_member_import() (20261023110000_member_import_undo.sql) marks its transaction the same way,
-- with the action undo: archiving an import's members, it checked the gym and the caller's
-- members.delete once for all of them.
--
-- Nobody else can mark a transaction. The table is private: no API role has any right on it, so
-- only security definer code owned by the migrations' role writes it, and these two functions are
-- the only such code that does, after their checks; each removes its mark before it returns. No
-- setting plays a part, because a session with SQL could set any setting with set_config().
-- 290-member-import.test.sql tries that and other ways in.
create table app.member_import_marks (
  xact xid8 primary key,
  import_id uuid not null,
  action text not null check (action in ('import', 'undo'))
);

revoke all on table app.member_import_marks from public, anon, authenticated, service_role;

-- The import this transaction is saving (marked by import_members()), or null.
create function app.current_import_id()
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select m.import_id from app.member_import_marks m
   where m.xact = pg_current_xact_id_if_assigned() and m.action = 'import'
$$;

-- What this transaction's mark says it does (import or undo), or null without one.
create function app.member_import_action()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select m.action from app.member_import_marks m where m.xact = pg_current_xact_id_if_assigned()
$$;

-- Whether this transaction is saving an import (and so was checked by import_members()). Its own
-- lookup rather than a call of app.current_import_id(): the triggers ask it for every row.
create function app.is_importing()
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.member_import_marks m
     where m.xact = pg_current_xact_id_if_assigned() and m.action = 'import'
  )
$$;

-- BEFORE INSERT on member_imports: only import_members() adds them (with their members).
create function app.guard_member_imports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_system_context() and new.id is distinct from app.current_import_id() then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Imports are added by import_members()';
  end if;
  return new;
end
$$;

create trigger guard before insert on public.member_imports
  for each row execute function app.guard_member_imports();

-- The gym's next p_count member numbers at once, for an import (its rows get them in the file's
-- order); returns the first. Like app.next_member_number(): the counter row stays locked until the
-- transaction ends, and a failed import gives the numbers back.
create function app.reserve_member_numbers(p_gym_id uuid, p_count integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  last_number bigint;
begin
  if not app.is_importing() or p_count < 1 then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Member numbers are reserved only by an import';
  end if;
  insert into app.gym_counters as c (gym_id, counter, last_value)
  values (p_gym_id, 'member', p_count)
  on conflict (gym_id, counter) do update set last_value = c.last_value + p_count
  returning c.last_value into last_number;
  return (last_number - p_count + 1)::integer;
end
$$;

-- Only import_members() calls it, as the function owner.
revoke execute on function app.reserve_member_numbers(uuid, integer) from public, anon, authenticated;

-- As in 20261011100000_admin_screens.sql, and an import (or taking one back) checked the gym once
-- for all its rows.
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
  if app.member_import_action() is not null then
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

-- As in 20261019100000_members.sql, and an import checked every new member's branch at once and
-- sets has_health_notes itself (it adds their health info right after). import_id comes from the
-- transaction's mark only, so it names the import that really added the member. Taking an import
-- back checked members.delete once for all its members.
create or replace function app.guard_members()
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
    new.import_id := app.current_import_id();
    if new.import_id is null then
      new.has_health_notes := false;
    end if;
  else
    if new.import_id is distinct from old.import_id then
      raise exception using errcode = '42501', message = 'read_only_column',
        detail = 'members.import_id is set by import_members() only';
    end if;
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
    if new.import_id is null then
      if not app.has_branch_access(new.branch_id) then
        raise exception using errcode = '42501', message = 'no_branch_access',
          detail = 'A member joins in one of your own branches';
      end if;
      if not app.is_active_branch(new.branch_id) then
        raise exception using errcode = '23514', message = 'branch_inactive',
          detail = 'Members join in active branches only';
      end if;
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

  -- Nested: PL/pgSQL may evaluate every part of an AND, and has_permission() costs the most.
  if status_changed then
    if app.member_import_action() is distinct from 'undo' then
      if not app.has_permission('members.delete') then
        raise exception using errcode = '42501', message = 'permission_denied',
          detail = 'Suspending, banning, archiving and restoring a member needs members.delete';
      end if;
    end if;
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

-- As in 20261019100000_members.sql, and an import's members keep the numbers it reserved for them.
create or replace function app.number_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_importing() and new.member_number is not null then
    return new;
  end if;
  new.member_number := app.next_member_number(new.gym_id);
  return new;
end
$$;

-- As in 20261019100000_members.sql, and an import writes the health info of the members it adds,
-- like create_member() for one member.
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
     and not (tg_op = 'INSERT' and current_setting('app.creating_member', true) is not distinct from new.id::text)
  then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Health info needs members.medical.view and members.edit, or is written while creating the member';
  end if;
  return new;
end
$$;

-- As in 20261021300000_nfc_cards.sql, and taking an import back ends its members' cards at once.
create or replace function app.guard_nfc_cards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The columns the steps change; created_* and updated_* are the stamp trigger's.
  step_columns constant text[] := array[
    'status', 'end_reason', 'ended_at', 'ended_by', 'block_reason', 'blocked_at', 'blocked_by',
    'unblocked_at', 'unblocked_by', 'created_at', 'created_by', 'updated_at', 'updated_by'
  ];
begin
  if app.is_system_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from public.members m where m.id = new.member_id and m.gym_id = new.gym_id and m.status = 'archived') then
      raise exception using errcode = '42501', message = 'member_archived',
        detail = 'An archived member can''t be given a card; restore them first';
    end if;
    if new.replaces_id is not null and not exists (
      select 1 from public.nfc_cards c
       where c.id = new.replaces_id and c.gym_id = new.gym_id and c.member_id = new.member_id and c.status <> 'active'
    ) then
      raise exception using errcode = '42501', message = 'invalid_card_change',
        detail = 'A new card replaces one of the same member''s cards that no longer works';
    end if;
    new.status := 'active';
    new.end_reason := null;
    new.ended_at := null;
    new.ended_by := null;
    new.block_reason := null;
    new.blocked_at := null;
    new.blocked_by := null;
    new.unblocked_at := null;
    new.unblocked_by := null;
    new.created_at := now();
    return new;
  end if;

  if (to_jsonb(new) - step_columns) is distinct from (to_jsonb(old) - step_columns) then
    raise exception using errcode = '42501', message = 'invalid_card_change',
      detail = 'Only a card''s status changes, through its steps';
  end if;

  if old.status = 'active' and new.status = 'ended' then
    if new.end_reason = 'member_archived' then
      -- From app.end_card_of_archived_member(), or from undo_member_import(), which ends the cards
      -- of the members it archives right after, all at once.
      if pg_trigger_depth() < 2 then
        if app.member_import_action() is distinct from 'undo' then
          raise exception using errcode = '42501', message = 'invalid_card_change',
            detail = 'member_archived is set when the member is archived';
        end if;
      end if;
    elsif new.end_reason in ('returned', 'lost', 'damaged') then
      if not app.has_permission('cards.manage') then
        raise exception using errcode = '42501', message = 'permission_denied',
          detail = 'Ending a card needs cards.manage';
      end if;
    else
      raise exception using errcode = '42501', message = 'invalid_card_change',
        detail = 'A card ends as returned, lost or damaged';
    end if;
    new.ended_at := now();
    new.ended_by := auth.uid();
    new.block_reason := old.block_reason;
    new.blocked_at := old.blocked_at;
    new.blocked_by := old.blocked_by;
    new.unblocked_at := old.unblocked_at;
    new.unblocked_by := old.unblocked_by;
  elsif new.status = 'blocked' and old.status in ('active', 'ended') then
    if not app.has_permission('cards.blacklist') then
      raise exception using errcode = '42501', message = 'permission_denied',
        detail = 'Blocking a card needs cards.blacklist';
    end if;
    if old.status = 'active' then
      if new.end_reason is null or new.end_reason not in ('stolen', 'blocked') then
        raise exception using errcode = '42501', message = 'invalid_card_change',
          detail = 'A working card is blocked as stolen, or blocked with a reason';
      end if;
      if new.end_reason = 'stolen' then
        new.block_reason := null;
      end if;
      new.ended_at := now();
      new.ended_by := auth.uid();
    else
      if exists (
        select 1 from public.nfc_cards c
         where c.gym_id = old.gym_id and c.uid = old.uid and c.id <> old.id and c.created_at >= old.created_at
      ) then
        raise exception using errcode = '23514', message = 'card_reassigned',
          detail = 'The card was given to someone else afterwards; block it from there';
      end if;
      new.end_reason := old.end_reason;
      new.ended_at := old.ended_at;
      new.ended_by := old.ended_by;
    end if;
    if new.block_reason is null and new.end_reason <> 'stolen' then
      raise exception using errcode = '23514', message = 'reason_required',
        detail = 'Blocking a card needs a reason';
    end if;
    new.blocked_at := now();
    new.blocked_by := auth.uid();
    new.unblocked_at := null;
    new.unblocked_by := null;
  elsif old.status = 'blocked' and new.status = 'ended' then
    if not app.has_permission('cards.blacklist') then
      raise exception using errcode = '42501', message = 'permission_denied',
        detail = 'Unblocking a card needs cards.blacklist';
    end if;
    new.end_reason := old.end_reason;
    new.ended_at := old.ended_at;
    new.ended_by := old.ended_by;
    new.block_reason := old.block_reason;
    new.blocked_at := old.blocked_at;
    new.blocked_by := old.blocked_by;
    new.unblocked_at := now();
    new.unblocked_by := auth.uid();
  elsif (to_jsonb(new) - array['created_at', 'created_by', 'updated_at', 'updated_by'])
        is distinct from (to_jsonb(old) - array['created_at', 'created_by', 'updated_at', 'updated_by']) then
    raise exception using errcode = '42501', message = 'invalid_card_change',
      detail = format('A card doesn''t go from %s to %s, nor change otherwise', old.status, new.status);
  end if;
  return new;
end
$$;

-- As in 20261021300000_nfc_cards.sql, and taking an import back ended the cards already.
create or replace function app.end_card_of_archived_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- undo_member_import() ended the cards of all the members it archives, at once.
  if app.member_import_action() = 'undo' then
    return null;
  end if;
  update public.nfc_cards c
     set status = 'ended', end_reason = 'member_archived', ended_at = now(), ended_by = auth.uid()
   where c.member_id = new.id and c.gym_id = new.gym_id and c.status = 'active';
  return null;
end
$$;

-- The rows an import sends ----------------------------------------------------------------------

create type app.member_import_row as (
  "row" integer,
  id uuid,
  branch_id uuid,
  full_name text,
  gender text,
  phone text,
  emergency_contact_name text,
  emergency_phone text,
  birth_date date,
  joined_on date,
  address text,
  notes text,
  blood_type text,
  medical_notes text,
  card_id uuid,
  card_uid text,
  kept jsonb
);

comment on type app.member_import_row is 'One row of import_members(); kept: what was kept of the columns not used yet.';

-- RPCs ------------------------------------------------------------------------------------------

-- For the preview: existing members a file's rows may be (match phone, same_name or similar_name),
-- and cards that are already someone's (card_active) or blocked (card_blocked). p_rows: up to 5,000
-- of {row, full_name, phone (as stored), card (as stored)}. Needs members.import and members.view.
-- At most 5 matches per row, the strongest first.
create function public.check_member_import(p_rows jsonb)
returns table (
  "row" integer,
  match text,
  member_id uuid,
  member_number integer,
  full_name text,
  status text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (app.has_permission('members.import') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Checking an import needs members.import and members.view';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'Up to 5,000 rows';
  end if;

  return query
    with wanted as (
      select r."row", r.phone, r.card, n.name
        from jsonb_to_recordset(p_rows) as r("row" integer, full_name text, phone text, card text)
       cross join lateral (select app.normalize_search_text(coalesce(r.full_name, '')) as name) n
    ),
    existing as materialized (
      select m.id, m.member_number, m.full_name, m.phone, m.status, app.normalize_search_text(m.full_name) as name
        from public.members m
       where m.deleted_at is null
    ),
    -- Each name once, with the keys app.normalized_names_match() compares.
    keyed as materialized (
      select k.name, k.side, replace(k.name, ' ', '') as flat, length(k.name) as len,
             app.name_skeleton(split_part(k.name, ' ', 1)) as first_key,
             case when split_part(k.name, ' ', 2) <> '' then app.name_skeleton(split_part(k.name, ' ', 2)) end as second_key
        from (select distinct w.name, 'wanted' as side from wanted w
              union select distinct e.name, 'existing' from existing e) k
    ),
    wanted_names as (select * from keyed k where k.side = 'wanted'),
    existing_names as (select * from keyed k where k.side = 'existing'),
    name_pairs as (
      select w.name as wanted_name, e.name as existing_name, 'same_name'::text as match
        from wanted_names w join existing_names e on e.flat = w.flat
       where length(w.flat) >= 3
      union all
      select w.name, e.name, 'similar_name'
        from wanted_names w join existing_names e on e.first_key = w.first_key and e.second_key = w.second_key
       where w.first_key <> '' and e.flat <> w.flat
      union all
      select w.name, e.name, 'similar_name'
        from wanted_names w join existing_names e on e.first_key = w.first_key
       where w.first_key <> '' and e.flat <> w.flat
         and least(w.len, e.len) >= 6
         and abs(w.len - e.len) <= case when greatest(w.len, e.len) > 10 then 2 else 1 end
         and extensions.levenshtein_less_equal(w.name, e.name, 2)
             <= case when greatest(w.len, e.len) > 10 then 2 else 1 end
    ),
    found as (
      select w."row", 'phone'::text as match, e.id, e.member_number, e.full_name, e.status
        from wanted w join existing e on e.phone = w.phone
       where w.phone is not null
      union all
      select w."row", case c.status when 'active' then 'card_active' else 'card_blocked' end,
             e.id, e.member_number, e.full_name, e.status
        from wanted w
        join public.nfc_cards c on c.uid = w.card and c.status in ('active', 'blocked') and c.deleted_at is null
        left join existing e on e.id = c.member_id
       where w.card is not null
      union all
      -- A member found by both name rules: only as the same name.
      select w."row", min(p.match), e.id, e.member_number, e.full_name, e.status
        from name_pairs p
        join wanted w on w.name = p.wanted_name
        join existing e on e.name = p.existing_name
       group by w."row", e.id, e.member_number, e.full_name, e.status
    ),
    ranked as (
      select f.*, row_number() over (
               partition by f."row"
               order by case f.match when 'phone' then 0 when 'card_active' then 1 when 'card_blocked' then 2
                                     when 'same_name' then 3 else 4 end, f.member_number
             ) as rank
        from found f
    )
    select k."row", k.match, k.id, k.member_number, k.full_name, k.status
      from ranked k
     where k.rank <= 5
     order by k."row", k.rank;
end
$$;

revoke execute on function public.check_member_import(jsonb) from public, anon;
grant execute on function public.check_member_import(jsonb) to authenticated;

-- Imports the rows staff ticked (p_rows: up to 5,000 app.member_import_row values as JSON), all or
-- nothing. Security definer, so that it can mark its transaction (see "The import's own
-- transaction" above): it makes every check RLS would make itself (the caller's gym, permissions and
-- branches), and the triggers, the row stamps and the audit log still name the caller (auth.uid()).
-- The checks the triggers make for one member are made here once for all rows (5,000 rows, each
-- with a card and health info, take about 3.5 s on a developer PC). If any row is refused,
-- nothing is saved and the error import_refused lists them (detail: [{row, key}]).
-- Members get the gym's next numbers in the file's order; the registration date (joined_on)
-- becomes created_at. Cards need cards.manage. The same p_import_id again returns the import that
-- was saved, for a retry after a lost answer.
create function public.import_members(p_import_id uuid, p_file_name text, p_rows jsonb)
returns public.member_imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.member_imports;
  problems jsonb;
  today date := (now() at time zone 'Asia/Baghdad')::date;
  member_total integer;
  card_total integer;
  first_number integer;
  gym uuid := app.current_gym_id();
  items app.member_import_row[];
  failed_constraint text;
begin
  if not (app.has_permission('members.import') and app.has_permission('members.create')
          and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Importing members needs members.import, members.create and members.view';
  end if;
  if gym is null then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Importing members needs a staff member of a gym';
  end if;
  select * into saved from public.member_imports i where i.id = p_import_id and i.gym_id = gym;
  if found then
    return saved;
  end if;
  if p_import_id is null or not app.is_clean_text(p_file_name, 200)
     or p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'An import has an id, a file name and 1 to 5,000 rows';
  end if;
  if not app.gym_writable() then
    raise exception using errcode = '42501', message = 'gym_read_only',
      detail = 'This gym is read-only: it is suspended, or its subscription or license has ended';
  end if;

  items := array(select r from jsonb_populate_recordset(null::app.member_import_row, p_rows) r);
  select count(*), count(r.card_uid) into member_total, card_total from unnest(items) r;

  if card_total > 0 and not app.has_permission('cards.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Giving cards needs cards.manage';
  end if;

  -- Every row's problems at once, so the preview can mark them all.
  select jsonb_agg(jsonb_build_object('row', p."row", 'key', p.key) order by p."row", p.key)
    into problems
    from (
      select distinct r."row", 'invalid_row' as key
        from unnest(items) r
       where r."row" is null or r."row" < 1 or r.id is null or r.branch_id is null
          or r.full_name is null or not app.is_clean_text(r.full_name, 100)
          or r.gender is null or r.gender not in ('male', 'female')
          or not app.is_valid_member_phone(r.phone) or not app.is_valid_member_phone(r.emergency_phone)
          or (r.phone is null and r.emergency_phone is null)
          or not app.is_clean_text(r.emergency_contact_name, 100)
          or r.birth_date < date '1900-01-01' or r.birth_date > today
          or r.joined_on < date '1900-01-01' or r.joined_on > today
          or not app.is_clean_text(r.address, 300) or not app.is_clean_text(r.notes, 2000)
          or r.blood_type not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
          or not app.is_clean_text(r.medical_notes, 2000)
          or (r.card_uid is null) <> (r.card_id is null)
          or app.normalize_card_uid(r.card_uid) is distinct from r.card_uid
          or not app.is_valid_import_kept(jsonb_build_object(coalesce(r.id::text, ''), coalesce(r.kept, '{}')))
      union all
      -- The same row number, member id, phone or card twice: the later rows.
      select d."row", d.key from (
        select r."row", 'repeated_row' as key,
               count(*) over (partition by r."row") as same_row,
               count(*) over (partition by r.id) as same_id,
               row_number() over (partition by r.card_id order by r."row") as card_id_rank,
               r.card_id
          from unnest(items) r
      ) d
       where d.same_row > 1 or d.same_id > 1 or (d.card_id is not null and d.card_id_rank > 1)
      union all
      select d."row", 'phone_repeated' from (
        select r."row", row_number() over (partition by r.phone order by r."row") as rank
          from unnest(items) r where r.phone is not null
      ) d where d.rank > 1
      union all
      select d."row", 'card_repeated' from (
        select r."row", row_number() over (partition by r.card_uid order by r."row") as rank
          from unnest(items) r where r.card_uid is not null
      ) d where d.rank > 1
      union all
      -- Ids are unique in every gym; phones and cards in the caller's gym (the function sees all).
      select r."row", 'member_exists' from unnest(items) r join public.members m on m.id = r.id
      union all
      select r."row", 'phone_in_use' from unnest(items) r
        join public.members m on m.phone = r.phone and m.gym_id = gym and m.deleted_at is null
      union all
      select r."row", case c.status when 'active' then 'card_in_use' else 'card_blocked' end
        from unnest(items) r
        join public.nfc_cards c on c.uid = r.card_uid and c.gym_id = gym
         and c.status in ('active', 'blocked') and c.deleted_at is null
      union all
      select r."row", 'card_exists' from unnest(items) r join public.nfc_cards c on c.id = r.card_id
      union all
      select r."row", 'no_branch_access' from unnest(items) r
       where r.branch_id is not null and r.branch_id not in (select app.accessible_branch_ids())
      union all
      select r."row", 'branch_inactive' from unnest(items) r
        left join public.branches b on b.id = r.branch_id and b.is_active and b.deleted_at is null
       where r.branch_id in (select app.accessible_branch_ids()) and b.id is null
    ) p;
  if problems is not null then
    raise exception using errcode = '23514', message = 'import_refused', detail = problems::text;
  end if;

  insert into app.member_import_marks (xact, import_id, action)
  values (pg_current_xact_id(), p_import_id, 'import');
  first_number := app.reserve_member_numbers(gym, member_total);
  begin
    insert into public.member_imports (id, gym_id, file_name, member_count, card_count, kept)
    values (
      p_import_id, gym, p_file_name, member_total, card_total,
      coalesce((select jsonb_object_agg(r.id, r.kept) from unnest(items) r
                 where r.kept is not null and r.kept <> '{}'), '{}')
    )
    returning * into saved;

    -- import_id: the guard takes it from the mark.
    insert into public.members (
      id, gym_id, branch_id, member_number, full_name, gender, phone, emergency_contact_name,
      emergency_phone, birth_date, address, notes, has_health_notes, created_at
    )
    select r.id, gym, r.branch_id, first_number + (row_number() over (order by r."row"))::integer - 1,
           r.full_name, r.gender, r.phone, r.emergency_contact_name, r.emergency_phone, r.birth_date,
           r.address, r.notes, r.medical_notes is not null,
           coalesce((r.joined_on + time '12:00') at time zone 'Asia/Baghdad', now())
      from unnest(items) r
     order by r."row";

    insert into public.member_health (id, gym_id, blood_type, medical_notes)
    select r.id, gym, r.blood_type, r.medical_notes
      from unnest(items) r
     where r.blood_type is not null or r.medical_notes is not null;

    insert into public.nfc_cards (id, gym_id, member_id, uid)
    select r.card_id, gym, r.id, r.card_uid from unnest(items) r where r.card_uid is not null;
  exception
    when unique_violation then
      -- Someone added the same phone or card between the check and now.
      get stacked diagnostics failed_constraint = constraint_name;
      raise exception using errcode = '23505', message = 'import_refused',
        detail = jsonb_build_array(jsonb_build_object(
          'row', null,
          'key', case failed_constraint
                   when 'members_gym_id_phone_key' then 'phone_in_use'
                   when 'nfc_cards_uid_in_use_key' then 'card_in_use'
                   else 'member_exists'
                 end
        ))::text;
  end;
  delete from app.member_import_marks m where m.xact = pg_current_xact_id();

  return saved;
end
$$;

revoke execute on function public.import_members(uuid, text, jsonb) from public, anon;
grant execute on function public.import_members(uuid, text, jsonb) to authenticated;
