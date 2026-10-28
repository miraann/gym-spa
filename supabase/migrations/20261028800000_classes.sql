-- Group classes (Phase 7, step 7b; spec §4.6 and the Phase 7 plan in §8 of 2026-10-28). Additions
-- only.
--
--   * class_types: what the gym teaches (yoga, zumba...), gym-wide, with a default length and
--     capacity. Never deleted; made inactive.
--   * class_schedules: a type in a branch on a weekday at a time, with a trainer (a staff member who
--     teaches), a capacity and a place, from a day until an optional last day (classes.manage).
--   * class_sessions: one date of a schedule, made only when something happens to it (a booking, a
--     cancellation), with its own copy of the time, trainer and capacity. No scheduled job needed.
--   * class_bookings: a member booked (or on the waitlist) for a session. A member whose membership
--     is current books once per session; a full session puts them on the waitlist, and a booked
--     member cancelling gives the first on the waitlist the place in the same transaction.
--     Attendance is attended or no-show.

-- Types ------------------------------------------------------------------------------------------------

create table public.class_types (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 240),
  capacity integer not null default 20 check (capacity between 1 and 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: types are never deleted.
  deleted_at timestamptz,
  constraint class_types_id_gym_id_key unique (id, gym_id),
  constraint class_types_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint class_types_never_deleted check (deleted_at is null)
);

create index class_types_gym_id_idx on public.class_types (gym_id);

-- Schedules ------------------------------------------------------------------------------------------

create table public.class_schedules (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  class_type_id uuid not null,
  -- ISO, 1 Monday … 7 Sunday; Baghdad time.
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  duration_minutes integer not null check (duration_minutes between 15 and 240),
  capacity integer not null check (capacity between 1 and 200),
  trainer_id uuid,
  place text check (app.is_clean_text(place, 60)),
  starts_on date not null,
  -- Empty: no last day.
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: schedules are made inactive or end.
  deleted_at timestamptz,
  constraint class_schedules_id_gym_id_key unique (id, gym_id),
  constraint class_schedules_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint class_schedules_class_type_id_gym_id_fkey foreign key (class_type_id, gym_id)
    references public.class_types (id, gym_id),
  constraint class_schedules_trainer_id_gym_id_fkey foreign key (trainer_id, gym_id)
    references public.staff_users (id, gym_id),
  constraint class_schedules_dates check (ends_on is null or ends_on >= starts_on),
  -- A class ends by midnight.
  constraint class_schedules_time check (starts_at + make_interval(mins => duration_minutes) > starts_at),
  constraint class_schedules_never_deleted check (deleted_at is null)
);

create index class_schedules_branch_id_gym_id_idx on public.class_schedules (branch_id, gym_id, weekday);
create index class_schedules_class_type_id_gym_id_idx on public.class_schedules (class_type_id, gym_id);
create index class_schedules_trainer_id_gym_id_idx on public.class_schedules (trainer_id, gym_id);

-- Sessions ---------------------------------------------------------------------------------------------

create table public.class_sessions (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  schedule_id uuid not null,
  class_type_id uuid not null,
  session_date date not null,
  -- The schedule's time on that date, as it was when the session was made.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 200),
  trainer_id uuid,
  place text check (app.is_clean_text(place, 60)),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text check (app.is_clean_text(cancel_reason, 300)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: sessions are cancelled, not deleted.
  deleted_at timestamptz,
  constraint class_sessions_id_gym_id_key unique (id, gym_id),
  constraint class_sessions_schedule_id_session_date_key unique (schedule_id, session_date),
  constraint class_sessions_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint class_sessions_schedule_id_gym_id_fkey foreign key (schedule_id, gym_id)
    references public.class_schedules (id, gym_id),
  constraint class_sessions_class_type_id_gym_id_fkey foreign key (class_type_id, gym_id)
    references public.class_types (id, gym_id),
  constraint class_sessions_trainer_id_gym_id_fkey foreign key (trainer_id, gym_id)
    references public.staff_users (id, gym_id),
  constraint class_sessions_times check (starts_at < ends_at),
  constraint class_sessions_cancelled check ((cancelled_at is null) = (cancel_reason is null)),
  constraint class_sessions_never_deleted check (deleted_at is null)
);

create index class_sessions_branch_id_gym_id_idx on public.class_sessions (branch_id, gym_id, starts_at);
create index class_sessions_schedule_id_gym_id_idx on public.class_sessions (schedule_id, gym_id);
create index class_sessions_class_type_id_gym_id_idx on public.class_sessions (class_type_id, gym_id);
create index class_sessions_trainer_id_gym_id_idx on public.class_sessions (trainer_id, gym_id, starts_at);

-- Bookings ---------------------------------------------------------------------------------------------

create table public.class_bookings (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  session_id uuid not null,
  member_id uuid not null,
  status text not null check (status in ('booked', 'waitlisted', 'attended', 'no_show', 'cancelled')),
  -- The waitlist's order: when the member joined it.
  waitlisted_at timestamptz,
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: bookings are the history.
  deleted_at timestamptz,
  constraint class_bookings_id_gym_id_key unique (id, gym_id),
  constraint class_bookings_session_id_gym_id_fkey foreign key (session_id, gym_id)
    references public.class_sessions (id, gym_id),
  constraint class_bookings_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint class_bookings_never_deleted check (deleted_at is null)
);

-- A member books a session once (a cancelled booking may be made again).
create unique index class_bookings_member_session_key on public.class_bookings (session_id, member_id)
  where status <> 'cancelled';
create index class_bookings_session_id_gym_id_idx on public.class_bookings (session_id, gym_id, status);
create index class_bookings_member_id_gym_id_idx on public.class_bookings (member_id, gym_id, created_at desc);

-- Triggers and row level security ------------------------------------------------------------------------

create trigger check_writable before insert or update or delete on public.class_types
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.class_types
  for each row execute function app.read_only_columns('id', 'gym_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.class_types
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.class_types
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.class_schedules
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.class_schedules
  for each row execute function app.read_only_columns('id', 'gym_id', 'branch_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.class_schedules
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.class_schedules
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.class_sessions
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.class_sessions
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'schedule_id', 'class_type_id', 'session_date', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.class_sessions
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.class_sessions
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.class_bookings
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.class_bookings
  for each row execute function app.read_only_columns('id', 'gym_id', 'session_id', 'member_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.class_bookings
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.class_bookings
  for each row execute function app.audit_row();

alter table public.class_types enable row level security;
alter table public.class_schedules enable row level security;
alter table public.class_sessions enable row level security;
alter table public.class_bookings enable row level security;

revoke all on table public.class_types, public.class_schedules, public.class_sessions, public.class_bookings
  from anon, authenticated;
grant all on table public.class_types, public.class_schedules, public.class_sessions, public.class_bookings
  to service_role;
-- Only the functions below write them.
grant select on table public.class_types, public.class_schedules, public.class_sessions, public.class_bookings
  to authenticated;

create policy "staff see their gym's class types" on public.class_types
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

create policy "staff with classes.view see their branches' class schedules" on public.class_schedules
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('classes.view'))
    and branch_id in (select app.accessible_branch_ids())
  );

create policy "staff with classes.view see their branches' class sessions" on public.class_sessions
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('classes.view'))
    and branch_id in (select app.accessible_branch_ids())
  );

create policy "staff with classes.view see their branches' class bookings" on public.class_bookings
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('classes.view'))
    and session_id in (
      select s.id from public.class_sessions s where s.branch_id in (select app.accessible_branch_ids())
    )
  );

-- Saving (classes.manage) -----------------------------------------------------------------------------------

-- Adds a class type (p_id made by the app) or changes one. permission_denied; invalid_class_type.
create function public.save_class_type(
  p_id uuid,
  p_name_ckb text,
  p_duration_minutes integer default 60,
  p_capacity integer default 20,
  p_name_en text default null,
  p_name_ar text default null,
  p_is_active boolean default true
)
returns public.class_types
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  saved public.class_types;
begin
  if gym is null or not app.has_permission('classes.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing classes needs classes.manage';
  end if;
  if exists (select 1 from public.class_types t where t.id = p_id and t.gym_id <> gym) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No class type with this id that you may change';
  end if;
  begin
    insert into public.class_types as t (id, gym_id, name_ckb, name_en, name_ar, duration_minutes, capacity, is_active)
    values (p_id, gym, p_name_ckb, p_name_en, p_name_ar, p_duration_minutes, p_capacity, coalesce(p_is_active, true))
    on conflict (id) do update set
      name_ckb = excluded.name_ckb,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      duration_minutes = excluded.duration_minutes,
      capacity = excluded.capacity,
      is_active = excluded.is_active
    returning t.* into saved;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_class_type',
        detail = 'A name, 15 to 240 minutes and a capacity of 1 to 200';
  end;
  return saved;
end
$$;

revoke execute on function public.save_class_type(uuid, text, integer, integer, text, text, boolean) from public, anon;
grant execute on function public.save_class_type(uuid, text, integer, integer, text, text, boolean) to authenticated;

-- Whether a staff member is an active trainer of the gym (their profile says they teach).
create function app.is_trainer(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_users u
      join public.staff_profiles p on p.id = u.id and p.gym_id = u.gym_id
     where u.id = p_staff_id and u.gym_id = app.current_gym_id() and u.is_active and p.teaches
  )
$$;

revoke execute on function app.is_trainer(uuid) from public, anon, authenticated;

-- Adds a weekly class (p_id made by the app) or changes one (its branch stays). Sessions already made
-- keep their own time, trainer and capacity. permission_denied; no_branch_access; branch_inactive (a
-- new one); class_type_not_found; trainer_not_found (not an active staff member who teaches);
-- invalid_class_schedule.
create function public.save_class_schedule(
  p_id uuid,
  p_branch_id uuid,
  p_class_type_id uuid,
  p_weekday smallint,
  p_starts_at time,
  p_duration_minutes integer,
  p_capacity integer,
  p_starts_on date,
  p_trainer_id uuid default null,
  p_place text default null,
  p_ends_on date default null,
  p_is_active boolean default true
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  old public.class_schedules;
  saved public.class_schedules;
begin
  if gym is null or not app.has_permission('classes.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing classes needs classes.manage';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only the classes of your own branches';
  end if;
  select * into old from public.class_schedules s where s.id = p_id;
  if found and (old.gym_id <> gym or old.branch_id <> p_branch_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No class with this id in this branch that you may change';
  end if;
  if not found and not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '23514', message = 'branch_inactive',
      detail = 'Classes are added to active branches';
  end if;
  if not exists (select 1 from public.class_types t where t.id = p_class_type_id and t.gym_id = gym) then
    raise exception using errcode = 'P0002', message = 'class_type_not_found',
      detail = 'No such class type in your gym';
  end if;
  if p_trainer_id is not null and not app.is_trainer(p_trainer_id) then
    raise exception using errcode = 'P0002', message = 'trainer_not_found',
      detail = 'The trainer is an active staff member of your gym who teaches';
  end if;
  begin
    insert into public.class_schedules as s (
      id, gym_id, branch_id, class_type_id, weekday, starts_at, duration_minutes, capacity, trainer_id, place,
      starts_on, ends_on, is_active
    ) values (
      p_id, gym, p_branch_id, p_class_type_id, p_weekday, p_starts_at, p_duration_minutes, p_capacity, p_trainer_id,
      p_place, p_starts_on, p_ends_on, coalesce(p_is_active, true)
    )
    on conflict (id) do update set
      class_type_id = excluded.class_type_id,
      weekday = excluded.weekday,
      starts_at = excluded.starts_at,
      duration_minutes = excluded.duration_minutes,
      capacity = excluded.capacity,
      trainer_id = excluded.trainer_id,
      place = excluded.place,
      starts_on = excluded.starts_on,
      ends_on = excluded.ends_on,
      is_active = excluded.is_active
    returning s.* into saved;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_class_schedule',
        detail = 'A weekday, a time, 15 to 240 minutes ending by midnight, a capacity of 1 to 200 and dates in order';
  end;
  return saved;
end
$$;

revoke execute on function public.save_class_schedule(uuid, uuid, uuid, smallint, time, integer, integer, date, uuid, text, date, boolean) from public, anon;
grant execute on function public.save_class_schedule(uuid, uuid, uuid, smallint, time, integer, integer, date, uuid, text, date, boolean) to authenticated;

-- Sessions ---------------------------------------------------------------------------------------------------

-- The session of a schedule on a date, made from the schedule when it doesn't exist yet, locked for
-- this transaction. class_not_found (not a schedule of the acting staff member's branches);
-- not_a_class_day (another weekday, before its first day or after its last, or an inactive
-- schedule for a new session).
create function app.class_session(p_schedule_id uuid, p_date date)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule public.class_schedules;
  session public.class_sessions;
  starts timestamptz;
begin
  select * into schedule from public.class_schedules s
   where s.id = p_schedule_id and s.gym_id = app.current_gym_id();
  if not found or not app.has_branch_access(schedule.branch_id) then
    raise exception using errcode = 'P0002', message = 'class_not_found',
      detail = 'No class with this id in your branches';
  end if;
  select * into session from public.class_sessions s
   where s.schedule_id = schedule.id and s.session_date = p_date
     for update;
  if found then
    return session;
  end if;
  if p_date is null or extract(isodow from p_date) <> schedule.weekday or p_date < schedule.starts_on
     or p_date > schedule.ends_on or not schedule.is_active then
    raise exception using errcode = '23514', message = 'not_a_class_day',
      detail = 'The class doesn''t take place on this day';
  end if;
  starts := (p_date + schedule.starts_at) at time zone 'Asia/Baghdad';
  insert into public.class_sessions (
    id, gym_id, branch_id, schedule_id, class_type_id, session_date, starts_at, ends_at, capacity, trainer_id, place
  ) values (
    gen_random_uuid(), schedule.gym_id, schedule.branch_id, schedule.id, schedule.class_type_id, p_date, starts,
    starts + make_interval(mins => schedule.duration_minutes), schedule.capacity, schedule.trainer_id, schedule.place
  )
  on conflict (schedule_id, session_date) do nothing;
  select * into session from public.class_sessions s
   where s.schedule_id = schedule.id and s.session_date = p_date
     for update;
  return session;
end
$$;

revoke execute on function app.class_session(uuid, date) from public, anon, authenticated;

-- Places taken in a session (booked or already attended).
create function app.class_taken(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.class_bookings b
   where b.session_id = p_session_id and b.status in ('booked', 'attended', 'no_show')
$$;

revoke execute on function app.class_taken(uuid) from public, anon, authenticated;

-- Places taken, as a column the app can read on a session (PostgREST computed field).
create function public.taken(p_session public.class_sessions)
returns integer
language sql
stable
set search_path = ''
as $$
  select app.class_taken(p_session.id)
$$;

revoke execute on function public.taken(public.class_sessions) from public, anon;
grant execute on function public.taken(public.class_sessions) to authenticated;
grant execute on function app.class_taken(uuid) to authenticated;

-- Books a member on a schedule's date (classes.book): booked, or waitlisted when it is full. The same
-- p_booking_id again returns what was saved. permission_denied; booking_exists; class_not_found;
-- not_a_class_day; class_cancelled; class_over (it ended); member_not_found; member_not_active;
-- no_membership (their membership isn't current); already_booked.
create function public.book_class(p_booking_id uuid, p_schedule_id uuid, p_date date, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  booking public.class_bookings;
  session public.class_sessions;
  member public.members;
begin
  if gym is null or not app.has_permission('classes.book') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Booking classes needs classes.book';
  end if;
  select * into booking from public.class_bookings b where b.id = p_booking_id;
  if found then
    if booking.gym_id is distinct from gym or booking.member_id <> p_member_id then
      raise exception using errcode = '23505', message = 'booking_exists',
        detail = 'Another booking has this id';
    end if;
    return jsonb_build_object('booking_id', booking.id, 'session_id', booking.session_id, 'status', booking.status);
  end if;
  session := app.class_session(p_schedule_id, p_date);
  if session.cancelled_at is not null then
    raise exception using errcode = '23514', message = 'class_cancelled',
      detail = 'This class was cancelled';
  end if;
  if session.ends_at < now() then
    raise exception using errcode = '23514', message = 'class_over',
      detail = 'This class has ended';
  end if;
  select * into member from public.members m where m.id = p_member_id and m.gym_id = gym and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member.status <> 'active' then
    raise exception using errcode = '23514', message = 'member_not_active',
      detail = 'Only active members book classes';
  end if;
  if public.membership(member) <> 'current' then
    raise exception using errcode = '23514', message = 'no_membership',
      detail = 'Only members with a current subscription book classes';
  end if;
  if exists (
    select 1 from public.class_bookings b
     where b.session_id = session.id and b.member_id = member.id and b.status <> 'cancelled'
  ) then
    raise exception using errcode = '23505', message = 'already_booked',
      detail = 'The member is booked (or waiting) for this class already';
  end if;
  insert into public.class_bookings (id, gym_id, session_id, member_id, status, waitlisted_at)
  select p_booking_id, gym, session.id, member.id,
         case when app.class_taken(session.id) < session.capacity then 'booked' else 'waitlisted' end,
         case when app.class_taken(session.id) < session.capacity then null else now() end
  returning * into booking;
  return jsonb_build_object('booking_id', booking.id, 'session_id', session.id, 'status', booking.status,
    'position', case when booking.status = 'waitlisted' then (
      select count(*) from public.class_bookings b
       where b.session_id = session.id and b.status = 'waitlisted' and b.waitlisted_at <= booking.waitlisted_at
    ) end);
end
$$;

revoke execute on function public.book_class(uuid, uuid, date, uuid) from public, anon;
grant execute on function public.book_class(uuid, uuid, date, uuid) to authenticated;

-- The booking the acting staff member works on, with its session locked. booking_not_found.
create function app.lock_class_booking(p_booking_id uuid)
returns public.class_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.class_bookings;
begin
  select * into booking from public.class_bookings b where b.id = p_booking_id and b.gym_id = app.current_gym_id();
  if not found or not exists (
    select 1 from public.class_sessions s where s.id = booking.session_id and app.has_branch_access(s.branch_id)
  ) then
    raise exception using errcode = 'P0002', message = 'booking_not_found',
      detail = 'No class booking with this id in your branches';
  end if;
  perform 1 from public.class_sessions s where s.id = booking.session_id for update;
  select * into booking from public.class_bookings b where b.id = p_booking_id for update;
  return booking;
end
$$;

revoke execute on function app.lock_class_booking(uuid) from public, anon, authenticated;

-- Gives free places to the waitlist, first come first served.
create function app.fill_class_from_waitlist(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.class_sessions;
  free integer;
begin
  select * into session from public.class_sessions s where s.id = p_session_id;
  free := session.capacity - app.class_taken(session.id);
  if free > 0 and session.cancelled_at is null then
    update public.class_bookings b
       set status = 'booked', status_changed_at = now(), status_changed_by = auth.uid()
     where b.id in (
       select w.id from public.class_bookings w
        where w.session_id = session.id and w.status = 'waitlisted'
        order by w.waitlisted_at, w.id
        limit free
     );
  end if;
end
$$;

revoke execute on function app.fill_class_from_waitlist(uuid) from public, anon, authenticated;

-- Cancels a booking or a place on the waitlist; a freed place goes to the first on the waitlist at
-- once. Cancelling again changes nothing. permission_denied; booking_not_found; class_attended (it
-- already took place for them).
create function public.cancel_class_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.class_bookings;
begin
  if app.current_gym_id() is null or not app.has_permission('classes.book') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Cancelling a class booking needs classes.book';
  end if;
  booking := app.lock_class_booking(p_booking_id);
  if booking.status in ('attended', 'no_show') then
    raise exception using errcode = '23514', message = 'class_attended',
      detail = 'Attendance was marked already';
  end if;
  if booking.status <> 'cancelled' then
    update public.class_bookings b
       set status = 'cancelled', status_changed_at = now(), status_changed_by = auth.uid()
     where b.id = booking.id
    returning * into booking;
    perform app.fill_class_from_waitlist(booking.session_id);
  end if;
  return jsonb_build_object('booking_id', booking.id, 'status', booking.status);
end
$$;

revoke execute on function public.cancel_class_booking(uuid) from public, anon;
grant execute on function public.cancel_class_booking(uuid) to authenticated;

-- Marks attendance: attended or no_show, for a booked member, from an hour before the class.
-- Changing it between the two is allowed. permission_denied; booking_not_found;
-- invalid_status_change (waitlisted or cancelled); too_early.
create function public.mark_class_attendance(p_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.class_bookings;
begin
  if app.current_gym_id() is null or not app.has_permission('classes.book') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Marking attendance needs classes.book';
  end if;
  booking := app.lock_class_booking(p_booking_id);
  if p_status is null or p_status not in ('attended', 'no_show')
     or booking.status not in ('booked', 'attended', 'no_show') then
    raise exception using errcode = '23514', message = 'invalid_status_change',
      detail = 'A booked member attended or didn''t come';
  end if;
  if (select s.starts_at from public.class_sessions s where s.id = booking.session_id) > now() + interval '1 hour' then
    raise exception using errcode = '23514', message = 'too_early',
      detail = 'Attendance is marked from an hour before the class';
  end if;
  update public.class_bookings b
     set status = p_status, status_changed_at = now(), status_changed_by = auth.uid()
   where b.id = booking.id
  returning * into booking;
  return jsonb_build_object('booking_id', booking.id, 'status', booking.status);
end
$$;

revoke execute on function public.mark_class_attendance(uuid, text) from public, anon;
grant execute on function public.mark_class_attendance(uuid, text) to authenticated;

-- Cancels one date of a class (classes.manage, with a reason): its bookings and waitlist are
-- cancelled. Cancelling again changes nothing. permission_denied; class_not_found; not_a_class_day;
-- reason_required.
create function public.cancel_class_session(p_schedule_id uuid, p_date date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.class_sessions;
  affected integer := 0;
begin
  if app.current_gym_id() is null or not app.has_permission('classes.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Cancelling a class needs classes.manage';
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 300) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'A short reason';
  end if;
  session := app.class_session(p_schedule_id, p_date);
  if session.cancelled_at is null then
    update public.class_sessions s
       set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason
     where s.id = session.id;
    update public.class_bookings b
       set status = 'cancelled', status_changed_at = now(), status_changed_by = auth.uid()
     where b.session_id = session.id and b.status in ('booked', 'waitlisted');
    get diagnostics affected = row_count;
  end if;
  return jsonb_build_object('session_id', session.id, 'cancelled_bookings', affected);
end
$$;

revoke execute on function public.cancel_class_session(uuid, date, text) from public, anon;
grant execute on function public.cancel_class_session(uuid, date, text) to authenticated;
