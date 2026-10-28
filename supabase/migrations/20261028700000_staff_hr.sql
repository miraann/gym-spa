-- Staff & HR (Phase 7, step 7a; spec §4.7 and the Phase 7 plan in §8 of 2026-10-28). Additions only.
--
--   * staff_profiles: a staff member's pay terms (salary type fixed, hourly or commission only, with
--     the monthly amount or hourly rate), the fee per class they teach, their percent of PT
--     sessions, whether they teach, the hire date and a note. hr.view reads, hr.manage writes;
--     nobody changes their own. public.trainers() lists who teaches, without the pay terms.
--   * staff_cards: a staff member's card. A UID is a member's or a staff member's, never both: a
--     trigger on each side refuses the other's.
--   * staff_clock: clocking in and out, by card at the check-in screen (checkin.perform) or by hand
--     (hr.manage). Never deleted; a mistake is voided with a reason.
--   * staff_shifts: planned hours; one person's shifts never overlap (an exclusion constraint).

-- Who may see and change whose HR rows ----------------------------------------------------------

-- Whether the acting staff member reaches this staff member: of their gym, their role covered,
-- and (unless the acting one has all branches) a branch in common; staff with all branches only
-- by those with all branches.
create function app.reaches_staff(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_users t
     where t.id = p_staff_id and t.gym_id = app.current_gym_id()
       and (
         app.has_all_branches()
         or (not t.all_branches and exists (
           select 1 from public.staff_branches sb
            where sb.staff_id = t.id and app.has_branch_access(sb.branch_id)
         ))
       )
  )
$$;

revoke execute on function app.reaches_staff(uuid) from public, anon, authenticated;

-- hr.view on someone they reach, or their own rows.
create function app.can_view_hr(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_staff_id = auth.uid() or (app.has_permission('hr.view') and app.reaches_staff(p_staff_id))
$$;

-- hr.manage on someone else they reach whose role they cover.
create function app.can_manage_hr(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('hr.manage')
    and p_staff_id is distinct from auth.uid()
    and app.reaches_staff(p_staff_id)
    and exists (select 1 from public.staff_users t where t.id = p_staff_id and app.covers_role(t.role_id))
$$;

revoke execute on function app.can_view_hr(uuid) from public, anon;
grant execute on function app.can_view_hr(uuid) to authenticated;
revoke execute on function app.can_manage_hr(uuid) from public, anon;
grant execute on function app.can_manage_hr(uuid) to authenticated;

-- Profiles --------------------------------------------------------------------------------------------

create table public.staff_profiles (
  -- The staff member's id.
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  salary_type text not null default 'fixed' check (salary_type in ('fixed', 'hourly', 'commission')),
  -- fixed: dinars a month; hourly: dinars an hour.
  monthly_salary numeric(14,2) check (monthly_salary >= 0 and monthly_salary = trunc(monthly_salary)),
  hourly_rate numeric(14,2) check (hourly_rate >= 0 and hourly_rate = trunc(hourly_rate)),
  -- Dinars for each class session taught.
  class_fee numeric(14,2) not null default 0 check (class_fee >= 0 and class_fee = trunc(class_fee)),
  -- Percent of each PT session's value.
  pt_percent numeric(5,2) not null default 0 check (pt_percent between 0 and 100),
  -- Offered as a trainer for classes and personal training.
  teaches boolean not null default false,
  hired_on date,
  note text check (app.is_clean_text(note, 1000)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: a profile goes with its staff account, which is never deleted.
  deleted_at timestamptz,
  constraint staff_profiles_id_gym_id_key unique (id, gym_id),
  constraint staff_profiles_id_gym_id_fkey foreign key (id, gym_id) references public.staff_users (id, gym_id),
  constraint staff_profiles_pay check (
    (salary_type <> 'fixed' or monthly_salary is not null)
    and (salary_type <> 'hourly' or hourly_rate is not null)
  ),
  constraint staff_profiles_never_deleted check (deleted_at is null)
);

create trigger check_writable before insert or update or delete on public.staff_profiles
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.staff_profiles
  for each row execute function app.read_only_columns('id', 'gym_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.staff_profiles
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.staff_profiles
  for each row execute function app.audit_row();

alter table public.staff_profiles enable row level security;
revoke all on table public.staff_profiles from anon, authenticated;
grant all on table public.staff_profiles to service_role;
grant select on table public.staff_profiles to authenticated;

create policy "staff see the pay terms they may see" on public.staff_profiles
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and app.can_view_hr(id));

-- Saves a staff member's profile as a whole. permission_denied (hr.manage, someone they reach whose
-- role they cover, never themselves); invalid_staff_profile.
create function public.save_staff_profile(
  p_staff_id uuid,
  p_salary_type text,
  p_monthly_salary numeric default null,
  p_hourly_rate numeric default null,
  p_class_fee numeric default 0,
  p_pt_percent numeric default 0,
  p_teaches boolean default false,
  p_hired_on date default null,
  p_note text default null
)
returns public.staff_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.staff_profiles;
begin
  if app.current_gym_id() is null or not app.can_manage_hr(p_staff_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing pay terms needs hr.manage, for someone you reach (never yourself)';
  end if;
  begin
    insert into public.staff_profiles as p (
      id, gym_id, salary_type, monthly_salary, hourly_rate, class_fee, pt_percent, teaches, hired_on, note
    ) values (
      p_staff_id, app.current_gym_id(), p_salary_type,
      case when p_salary_type = 'fixed' then p_monthly_salary end,
      case when p_salary_type = 'hourly' then p_hourly_rate end,
      coalesce(p_class_fee, 0), coalesce(p_pt_percent, 0), coalesce(p_teaches, false), p_hired_on, p_note
    )
    on conflict (id) do update set
      salary_type = excluded.salary_type,
      monthly_salary = excluded.monthly_salary,
      hourly_rate = excluded.hourly_rate,
      class_fee = excluded.class_fee,
      pt_percent = excluded.pt_percent,
      teaches = excluded.teaches,
      hired_on = excluded.hired_on,
      note = excluded.note
    returning p.* into saved;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_staff_profile',
        detail = 'A salary type with its amount, whole dinars, a percent of 0 to 100 and a short note';
  end;
  return saved;
end
$$;

revoke execute on function public.save_staff_profile(uuid, text, numeric, numeric, numeric, numeric, boolean, date, text) from public, anon;
grant execute on function public.save_staff_profile(uuid, text, numeric, numeric, numeric, numeric, boolean, date, text) to authenticated;

-- The active staff who teach, for choosing a trainer (classes.view, pt.log or hr.view): names
-- only, never the pay terms. p_branch_id: those who work in that branch.
create function public.trainers(p_branch_id uuid default null)
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if app.current_gym_id() is null
     or not (app.has_permission('classes.view') or app.has_permission('pt.log') or app.has_permission('hr.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Listing trainers needs classes.view, pt.log or hr.view';
  end if;
  return query
    select u.id, u.full_name
      from public.staff_users u
      join public.staff_profiles p on p.id = u.id and p.gym_id = u.gym_id
     where u.gym_id = app.current_gym_id() and u.is_active and p.teaches
       and (p_branch_id is null or exists (
         select 1 from public.staff_branch_access a where a.staff_id = u.id and a.branch_id = p_branch_id
       ))
     order by u.full_name;
end
$$;

revoke execute on function public.trainers(uuid) from public, anon;
grant execute on function public.trainers(uuid) to authenticated;

-- Staff cards -----------------------------------------------------------------------------------------

create table public.staff_cards (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  staff_id uuid not null,
  -- As app.normalize_card_uid() writes it.
  uid text not null check (app.normalize_card_uid(uid) is not distinct from uid),
  status text not null default 'active' check (status in ('active', 'ended')),
  end_reason text check (end_reason in ('returned', 'lost', 'replaced')),
  ended_at timestamptz,
  ended_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: cards are the history.
  deleted_at timestamptz,
  constraint staff_cards_id_gym_id_key unique (id, gym_id),
  constraint staff_cards_staff_id_gym_id_fkey foreign key (staff_id, gym_id) references public.staff_users (id, gym_id),
  constraint staff_cards_ended check ((status = 'ended') = (ended_at is not null) and (status = 'ended') = (end_reason is not null)),
  constraint staff_cards_never_deleted check (deleted_at is null)
);

create unique index staff_cards_uid_in_use_key on public.staff_cards (gym_id, uid) where status = 'active';
create unique index staff_cards_staff_active_key on public.staff_cards (gym_id, staff_id) where status = 'active';
create index staff_cards_staff_id_gym_id_idx on public.staff_cards (staff_id, gym_id);

create trigger check_writable before insert or update or delete on public.staff_cards
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.staff_cards
  for each row execute function app.read_only_columns('id', 'gym_id', 'staff_id', 'uid', 'created_at', 'created_by');
create trigger stamp before insert or update on public.staff_cards
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.staff_cards
  for each row execute function app.audit_row();

alter table public.staff_cards enable row level security;
revoke all on table public.staff_cards from anon, authenticated;
grant all on table public.staff_cards to service_role;
grant select on table public.staff_cards to authenticated;

create policy "staff see the staff cards they may see" on public.staff_cards
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and app.can_view_hr(staff_id));

-- BEFORE INSERT on nfc_cards and staff_cards: a UID in use on the other side is card_in_use.
create function app.check_card_uid_free()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'nfc_cards' and exists (
    select 1 from public.staff_cards s where s.gym_id = new.gym_id and s.uid = new.uid and s.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'card_in_use',
      detail = 'This card is a staff member''s card';
  end if;
  if tg_table_name = 'staff_cards' and exists (
    select 1 from public.nfc_cards c where c.gym_id = new.gym_id and c.uid = new.uid and c.status in ('active', 'blocked')
  ) then
    raise exception using errcode = '23505', message = 'card_in_use',
      detail = 'This card is a member''s card';
  end if;
  return new;
end
$$;

revoke execute on function app.check_card_uid_free() from public, anon, authenticated;

create trigger check_uid_free before insert on public.nfc_cards
  for each row execute function app.check_card_uid_free();
create trigger check_uid_free before insert on public.staff_cards
  for each row execute function app.check_card_uid_free();

-- Gives a staff member a card (p_id made by the app); a card they had is ended as replaced. The same
-- p_id again returns it. permission_denied (hr.manage, someone they reach); staff_not_found;
-- invalid_card_uid; card_in_use; card_exists.
create function public.give_staff_card(p_id uuid, p_staff_id uuid, p_uid text)
returns public.staff_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  card_uid text := app.normalize_card_uid(p_uid);
  given public.staff_cards;
  failed_constraint text;
begin
  if app.current_gym_id() is null or not app.can_manage_hr(p_staff_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Giving a staff card needs hr.manage, for someone you reach (never yourself)';
  end if;
  select * into given from public.staff_cards c where c.id = p_id;
  if found then
    if given.staff_id <> p_staff_id or given.gym_id <> app.current_gym_id() then
      raise exception using errcode = '23505', message = 'card_exists',
        detail = 'A card with this id was already saved';
    end if;
    return given;
  end if;
  if card_uid is null then
    raise exception using errcode = '22023', message = 'invalid_card_uid',
      detail = 'A card UID is 4, 7 or 10 bytes of hex, or 10 digits';
  end if;
  if exists (
    select 1 from public.staff_cards c
     where c.gym_id = app.current_gym_id() and c.uid = card_uid and c.status = 'active' and c.staff_id <> p_staff_id
  ) then
    raise exception using errcode = '23505', message = 'card_in_use',
      detail = 'This card is another staff member''s card';
  end if;
  update public.staff_cards c
     set status = 'ended', end_reason = 'replaced', ended_at = now(), ended_by = auth.uid()
   where c.gym_id = app.current_gym_id() and c.staff_id = p_staff_id and c.status = 'active';
  begin
    insert into public.staff_cards (id, gym_id, staff_id, uid)
    values (p_id, app.current_gym_id(), p_staff_id, card_uid)
    returning * into given;
  exception
    when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint = 'staff_cards_uid_in_use_key' then
        raise exception using errcode = '23505', message = 'card_in_use',
          detail = 'This card was given to someone else at the same moment';
      end if;
      raise;
  end;
  return given;
end
$$;

revoke execute on function public.give_staff_card(uuid, uuid, text) from public, anon;
grant execute on function public.give_staff_card(uuid, uuid, text) to authenticated;

-- Ends a staff member's card: returned or lost. Ending it again changes nothing.
-- permission_denied; staff_card_not_found; invalid_request (the reason).
create function public.end_staff_card(p_card_id uuid, p_reason text)
returns public.staff_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.staff_cards;
begin
  select * into card from public.staff_cards c where c.id = p_card_id and c.gym_id = app.current_gym_id() for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'staff_card_not_found',
      detail = 'No staff card with this id in your gym';
  end if;
  if not app.can_manage_hr(card.staff_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Ending a staff card needs hr.manage, for someone you reach (never yourself)';
  end if;
  if p_reason is null or p_reason not in ('returned', 'lost') then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A card is returned or lost';
  end if;
  if card.status = 'active' then
    update public.staff_cards c
       set status = 'ended', end_reason = p_reason, ended_at = now(), ended_by = auth.uid()
     where c.id = card.id
    returning * into card;
  end if;
  return card;
end
$$;

revoke execute on function public.end_staff_card(uuid, text) from public, anon;
grant execute on function public.end_staff_card(uuid, text) to authenticated;

-- Clocking in and out -------------------------------------------------------------------------------------

create table public.staff_clock (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  staff_id uuid not null,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  -- card: scanned; manual: by a manager (hr.manage), with a note.
  method text not null check (method in ('card', 'manual')),
  card_id uuid,
  note text check (app.is_clean_text(note, 300)),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (app.is_clean_text(void_reason, 300)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: the clock is the history.
  deleted_at timestamptz,
  constraint staff_clock_id_gym_id_key unique (id, gym_id),
  constraint staff_clock_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint staff_clock_staff_id_gym_id_fkey foreign key (staff_id, gym_id) references public.staff_users (id, gym_id),
  constraint staff_clock_card_id_gym_id_fkey foreign key (card_id, gym_id) references public.staff_cards (id, gym_id),
  constraint staff_clock_times check (clocked_out_at is null or clocked_out_at >= clocked_in_at),
  constraint staff_clock_voided check ((voided_at is null) = (void_reason is null)),
  constraint staff_clock_method check ((method = 'card') = (card_id is not null)),
  constraint staff_clock_never_deleted check (deleted_at is null)
);

-- One open record per person.
create unique index staff_clock_open_key on public.staff_clock (gym_id, staff_id)
  where clocked_out_at is null and voided_at is null;
create index staff_clock_branch_id_gym_id_idx on public.staff_clock (branch_id, gym_id, clocked_in_at desc);
create index staff_clock_staff_id_gym_id_idx on public.staff_clock (staff_id, gym_id, clocked_in_at desc);
create index staff_clock_card_id_gym_id_idx on public.staff_clock (card_id, gym_id);

create trigger check_writable before insert or update or delete on public.staff_clock
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.staff_clock
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'staff_id', 'clocked_in_at', 'method', 'card_id', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.staff_clock
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.staff_clock
  for each row execute function app.audit_row();

alter table public.staff_clock enable row level security;
revoke all on table public.staff_clock from anon, authenticated;
grant all on table public.staff_clock to service_role;
grant select on table public.staff_clock to authenticated;

create policy "staff see the clock records they may see" on public.staff_clock
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and app.can_view_hr(staff_id));

-- What a clock record is, for the screens.
create function app.clock_result(p_record public.staff_clock, p_result text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'result', p_result, 'record_id', p_record.id, 'staff_id', p_record.staff_id,
    'full_name', (select u.full_name from public.staff_users u where u.id = p_record.staff_id),
    'clocked_in_at', p_record.clocked_in_at, 'clocked_out_at', p_record.clocked_out_at
  )
$$;

revoke execute on function app.clock_result(public.staff_clock, text) from public, anon, authenticated;

-- A staff card scanned in a branch (checkin.perform): clocks its staff member in, or out when they
-- are in. Within 2 minutes of the last scan nothing changes (result already). result: in, out or
-- already. card_not_staff (not a staff card: the screen treats it as a member's); staff_inactive;
-- no_branch_access (the device's staff member); staff_wrong_branch (the card's owner doesn't work
-- in this branch).
create function public.staff_clock_by_card(p_uid text, p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  card public.staff_cards;
  staff public.staff_users;
  entry public.staff_clock;
begin
  if gym is null or not app.has_permission('checkin.perform') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Scanning cards needs checkin.perform';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only in your own branches';
  end if;
  select * into card from public.staff_cards c
   where c.gym_id = gym and c.uid = app.normalize_card_uid(p_uid) and c.status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'card_not_staff',
      detail = 'This is not a staff card';
  end if;
  select * into staff from public.staff_users u where u.id = card.staff_id for update;
  if not staff.is_active then
    raise exception using errcode = '23514', message = 'staff_inactive',
      detail = 'This staff account is deactivated';
  end if;
  if not exists (
    select 1 from public.staff_branch_access a where a.staff_id = staff.id and a.branch_id = p_branch_id
  ) then
    raise exception using errcode = '23514', message = 'staff_wrong_branch',
      detail = 'The staff member doesn''t work in this branch';
  end if;

  select * into entry from public.staff_clock k
   where k.gym_id = gym and k.staff_id = staff.id and k.voided_at is null
   order by greatest(k.clocked_in_at, coalesce(k.clocked_out_at, k.clocked_in_at)) desc
   limit 1;
  if found and greatest(entry.clocked_in_at, coalesce(entry.clocked_out_at, entry.clocked_in_at)) > now() - interval '2 minutes' then
    return app.clock_result(entry, 'already');
  end if;
  if found and entry.clocked_out_at is null then
    update public.staff_clock k set clocked_out_at = now() where k.id = entry.id returning * into entry;
    return app.clock_result(entry, 'out');
  end if;
  insert into public.staff_clock (id, gym_id, branch_id, staff_id, method, card_id)
  values (gen_random_uuid(), gym, p_branch_id, staff.id, 'card', card.id)
  returning * into entry;
  return app.clock_result(entry, 'in');
end
$$;

revoke execute on function public.staff_clock_by_card(text, uuid) from public, anon;
grant execute on function public.staff_clock_by_card(text, uuid) to authenticated;

-- A manager clocks someone in (p_in, at p_at in a branch) or out (their open record, at p_at), with
-- a note. permission_denied; no_branch_access; invalid_request (the time: not in the future, not
-- before the clock-in, the note); already_clocked_in; not_clocked_in.
create function public.staff_clock_manual(
  p_staff_id uuid,
  p_branch_id uuid,
  p_in boolean,
  p_at timestamptz,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.staff_clock;
begin
  if app.current_gym_id() is null or not app.can_manage_hr(p_staff_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Clocking someone by hand needs hr.manage, for someone you reach (never yourself)';
  end if;
  if p_at is null or p_at > now() + interval '1 minute' or p_note is null or not app.is_clean_text(p_note, 300) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A time that has passed and a note';
  end if;
  select * into entry from public.staff_clock k
   where k.gym_id = app.current_gym_id() and k.staff_id = p_staff_id
     and k.clocked_out_at is null and k.voided_at is null
     for update;
  if p_in then
    if found then
      raise exception using errcode = '23505', message = 'already_clocked_in',
        detail = 'They are clocked in already';
    end if;
    if not app.has_branch_access(p_branch_id) then
      raise exception using errcode = '42501', message = 'no_branch_access',
        detail = 'Only in your own branches';
    end if;
    insert into public.staff_clock (id, gym_id, branch_id, staff_id, clocked_in_at, method, note)
    values (gen_random_uuid(), app.current_gym_id(), p_branch_id, p_staff_id, p_at, 'manual', p_note)
    returning * into entry;
    return app.clock_result(entry, 'in');
  end if;
  if not found then
    raise exception using errcode = '23514', message = 'not_clocked_in',
      detail = 'They are not clocked in';
  end if;
  if p_at < entry.clocked_in_at then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'Clocking out before clocking in';
  end if;
  update public.staff_clock k
     set clocked_out_at = p_at, note = coalesce(k.note || ' · ', '') || p_note
   where k.id = entry.id
  returning * into entry;
  return app.clock_result(entry, 'out');
end
$$;

revoke execute on function public.staff_clock_manual(uuid, uuid, boolean, timestamptz, text) from public, anon;
grant execute on function public.staff_clock_manual(uuid, uuid, boolean, timestamptz, text) to authenticated;

-- A clock record that was a mistake counts for nothing (hr.manage, with a reason). Voiding again
-- changes nothing. permission_denied; clock_not_found; reason_required.
create function public.void_staff_clock(p_record_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.staff_clock;
begin
  select * into entry from public.staff_clock k
   where k.id = p_record_id and k.gym_id = app.current_gym_id() for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'clock_not_found',
      detail = 'No clock record with this id in your gym';
  end if;
  if not app.can_manage_hr(entry.staff_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Voiding a clock record needs hr.manage, for someone you reach (never yourself)';
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 300) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'A short reason';
  end if;
  if entry.voided_at is null then
    update public.staff_clock k
       set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
     where k.id = entry.id;
  end if;
end
$$;

revoke execute on function public.void_staff_clock(uuid, text) from public, anon;
grant execute on function public.void_staff_clock(uuid, text) to authenticated;

-- Shifts --------------------------------------------------------------------------------------------------

create table public.staff_shifts (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (app.is_clean_text(note, 300)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Set when the shift is removed (soft delete).
  deleted_at timestamptz,
  shift_time tstzrange generated always as (tstzrange(starts_at, ends_at)) stored,
  constraint staff_shifts_id_gym_id_key unique (id, gym_id),
  constraint staff_shifts_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint staff_shifts_staff_id_gym_id_fkey foreign key (staff_id, gym_id) references public.staff_users (id, gym_id),
  constraint staff_shifts_times check (starts_at < ends_at and ends_at <= starts_at + interval '16 hours'),
  constraint staff_shifts_no_overlap exclude using gist (staff_id with =, shift_time with &&) where (deleted_at is null)
);

create index staff_shifts_branch_id_gym_id_idx on public.staff_shifts (branch_id, gym_id, starts_at);
create index staff_shifts_staff_id_gym_id_idx on public.staff_shifts (staff_id, gym_id, starts_at);

create trigger check_writable before insert or update or delete on public.staff_shifts
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.staff_shifts
  for each row execute function app.read_only_columns('id', 'gym_id', 'staff_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.staff_shifts
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.staff_shifts
  for each row execute function app.audit_row();

alter table public.staff_shifts enable row level security;
revoke all on table public.staff_shifts from anon, authenticated;
grant all on table public.staff_shifts to service_role;
grant select on table public.staff_shifts to authenticated;

create policy "staff see the shifts they may see" on public.staff_shifts
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and app.can_view_hr(staff_id));

-- Adds a shift (p_id made by the app) or changes one (its staff member stays). permission_denied;
-- no_branch_access; invalid_shift (at most 16 hours, ending after it starts); shift_overlaps.
create function public.save_staff_shift(
  p_id uuid,
  p_staff_id uuid,
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_note text default null
)
returns public.staff_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  old public.staff_shifts;
  saved public.staff_shifts;
begin
  if app.current_gym_id() is null or not app.can_manage_hr(p_staff_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Planning shifts needs hr.manage, for someone you reach (never yourself)';
  end if;
  select * into old from public.staff_shifts s where s.id = p_id;
  if found and (old.gym_id <> app.current_gym_id() or old.staff_id <> p_staff_id or old.deleted_at is not null) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No shift with this id of this staff member';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only in your own branches';
  end if;
  begin
    insert into public.staff_shifts as s (id, gym_id, branch_id, staff_id, starts_at, ends_at, note)
    values (p_id, app.current_gym_id(), p_branch_id, p_staff_id, p_starts_at, p_ends_at, p_note)
    on conflict (id) do update set
      branch_id = excluded.branch_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      note = excluded.note
    returning s.* into saved;
  exception
    when exclusion_violation then
      raise exception using errcode = '23P01', message = 'shift_overlaps',
        detail = 'This person has another shift at this time';
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_shift',
        detail = 'A shift ends after it starts, at most 16 hours later';
  end;
  return saved;
end
$$;

revoke execute on function public.save_staff_shift(uuid, uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.save_staff_shift(uuid, uuid, uuid, timestamptz, timestamptz, text) to authenticated;

-- Removes a planned shift. Removing again changes nothing. permission_denied; shift_not_found.
create function public.remove_staff_shift(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift public.staff_shifts;
begin
  select * into shift from public.staff_shifts s where s.id = p_id and s.gym_id = app.current_gym_id() for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'shift_not_found',
      detail = 'No shift with this id in your gym';
  end if;
  if not app.can_manage_hr(shift.staff_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Removing a shift needs hr.manage, for someone you reach (never yourself)';
  end if;
  if shift.deleted_at is null then
    update public.staff_shifts s set deleted_at = now() where s.id = shift.id;
  end if;
end
$$;

revoke execute on function public.remove_staff_shift(uuid) from public, anon;
grant execute on function public.remove_staff_shift(uuid) to authenticated;
