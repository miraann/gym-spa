-- Spa bookings (Phase 6, step 6c; the Phase 6 plan in §8 of 2026-10-28). Additions only;
-- app.copy_plan_spa_sessions replaced with the same signature.
--
--   * spa_bookings: a member (or guest) booked for a service in a branch: a room and one of its
--     places, a therapist when the service needs one, a start and an end. The service's name and
--     price are copied onto it. The database refuses a second booking of the same room place,
--     therapist or member at an overlapping time (exclusion constraints; the room stays taken for
--     the service's cleaning time). Only open bookings (booked, confirmed, arrived, completed) hold
--     their time.
--   * Paid by: pay (an invoice made when the client arrives), a spa package of the member, or a
--     plan's included sessions. Sessions left are counted from the open bookings, never stored
--     (sessions_left() on member_spa_packages and subscription_spa_sessions).
--   * Statuses: booked → confirmed → arrived → completed, or cancelled / no-show before arriving.
--     Completing stores the therapist's commission. Voiding the invoice of an arrived booking
--     cancels it.
--   * Only the functions below write bookings; staff with spa.view see their branches' bookings.

create extension if not exists btree_gist with schema extensions;

create table public.spa_bookings (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  member_id uuid not null,
  service_id uuid not null,
  room_id uuid not null,
  -- Which of the room's places (1 for a room for one).
  place smallint not null check (place between 1 and 20),
  -- Empty for a service without a therapist.
  therapist_id uuid,
  -- The service as it was booked.
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  price numeric(14,2) not null check (price >= 0 and price = trunc(price)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- The room is taken until then (the cleaning time after the service).
  room_free_at timestamptz not null,
  paid_with text not null check (paid_with in ('pay', 'package', 'plan')),
  member_package_id uuid,
  -- paid_with plan: the subscription whose sessions it uses.
  subscription_id uuid,
  -- Came without booking first.
  walk_in boolean not null default false,
  note text check (app.is_clean_text(note, 500)),
  status text not null default 'booked'
    check (status in ('booked', 'confirmed', 'arrived', 'completed', 'no_show', 'cancelled')),
  status_note text check (app.is_clean_text(status_note, 500)),
  status_changed_at timestamptz,
  status_changed_by uuid,
  arrived_at timestamptz,
  completed_at timestamptz,
  -- paid_with pay: the invoice made when the client arrived (none when the price is 0).
  invoice_id uuid,
  -- Completed with a therapist: their percent of the price.
  commission_amount numeric(14,2) check (commission_amount >= 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: bookings are the history.
  deleted_at timestamptz,
  room_time tstzrange generated always as (tstzrange(starts_at, room_free_at)) stored,
  service_time tstzrange generated always as (tstzrange(starts_at, ends_at)) stored,
  constraint spa_bookings_id_gym_id_key unique (id, gym_id),
  constraint spa_bookings_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint spa_bookings_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint spa_bookings_service_id_gym_id_fkey foreign key (service_id, gym_id)
    references public.spa_services (id, gym_id),
  constraint spa_bookings_room_id_gym_id_fkey foreign key (room_id, gym_id) references public.spa_rooms (id, gym_id),
  constraint spa_bookings_therapist_id_gym_id_fkey foreign key (therapist_id, gym_id)
    references public.spa_therapists (id, gym_id),
  constraint spa_bookings_member_package_id_gym_id_fkey foreign key (member_package_id, gym_id)
    references public.member_spa_packages (id, gym_id),
  constraint spa_bookings_subscription_id_gym_id_fkey foreign key (subscription_id, gym_id)
    references public.subscriptions (id, gym_id),
  constraint spa_bookings_invoice_id_gym_id_fkey foreign key (invoice_id, gym_id) references public.invoices (id, gym_id),
  constraint spa_bookings_times check (starts_at < ends_at and ends_at <= room_free_at),
  constraint spa_bookings_paid_with check (
    (paid_with = 'package') = (member_package_id is not null)
    and (paid_with = 'plan') = (subscription_id is not null)
    and (paid_with = 'pay' or invoice_id is null)
  ),
  constraint spa_bookings_never_deleted check (deleted_at is null),
  -- The second booking of the same time is refused at once.
  constraint spa_bookings_room_place_free exclude using gist (room_id with =, place with =, room_time with &&)
    where (status in ('booked', 'confirmed', 'arrived', 'completed')),
  constraint spa_bookings_therapist_free exclude using gist (therapist_id with =, service_time with &&)
    where (therapist_id is not null and status in ('booked', 'confirmed', 'arrived', 'completed')),
  constraint spa_bookings_member_free exclude using gist (member_id with =, service_time with &&)
    where (status in ('booked', 'confirmed', 'arrived', 'completed'))
);

-- The calendar (a branch's days), a member's bookings, and the foreign keys.
create index spa_bookings_branch_id_gym_id_idx on public.spa_bookings (branch_id, gym_id, starts_at);
create index spa_bookings_member_id_gym_id_idx on public.spa_bookings (member_id, gym_id, starts_at desc);
create index spa_bookings_service_id_gym_id_idx on public.spa_bookings (service_id, gym_id);
create index spa_bookings_room_id_gym_id_idx on public.spa_bookings (room_id, gym_id);
create index spa_bookings_therapist_id_gym_id_idx on public.spa_bookings (therapist_id, gym_id, starts_at);
create index spa_bookings_member_package_id_gym_id_idx on public.spa_bookings (member_package_id, gym_id);
create index spa_bookings_subscription_id_gym_id_idx on public.spa_bookings (subscription_id, gym_id, service_id);
create index spa_bookings_invoice_id_gym_id_idx on public.spa_bookings (invoice_id, gym_id);

create trigger check_writable before insert or update or delete on public.spa_bookings
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.spa_bookings
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_id', 'service_id', 'name_ckb', 'name_en', 'name_ar', 'price',
    'paid_with', 'member_package_id', 'subscription_id', 'walk_in', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.spa_bookings
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.spa_bookings
  for each row execute function app.audit_row();

alter table public.spa_bookings enable row level security;
revoke all on table public.spa_bookings from anon, authenticated;
grant all on table public.spa_bookings to service_role;
grant select on table public.spa_bookings to authenticated;

create policy "staff with spa.view see their branches' spa bookings" on public.spa_bookings
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('spa.view'))
    and branch_id in (select app.accessible_branch_ids())
  );

-- Sessions left -------------------------------------------------------------------------------------------

-- Sessions of a sold package that open bookings use.
create function app.used_package_sessions(p_member_package_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.spa_bookings b
   where b.member_package_id = p_member_package_id
     and b.status in ('booked', 'confirmed', 'arrived', 'completed')
$$;

revoke execute on function app.used_package_sessions(uuid) from public, anon, authenticated;

-- Sessions of a subscription's service that open bookings use.
create function app.used_plan_sessions(p_subscription_id uuid, p_service_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.spa_bookings b
   where b.subscription_id = p_subscription_id and b.service_id = p_service_id
     and b.status in ('booked', 'confirmed', 'arrived', 'completed')
$$;

revoke execute on function app.used_plan_sessions(uuid, uuid) from public, anon, authenticated;

-- Sessions left, as a column the app can read (PostgREST computed fields). Only what RLS shows the
-- caller reaches these, so the counts give nothing else away.
create function public.sessions_left(p_package public.member_spa_packages)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(p_package.session_count - app.used_package_sessions(p_package.id), 0)
$$;

create function public.sessions_left(p_sessions public.subscription_spa_sessions)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(p_sessions.session_count - app.used_plan_sessions(p_sessions.subscription_id, p_sessions.service_id), 0)
$$;

revoke execute on function public.sessions_left(public.member_spa_packages) from public, anon;
grant execute on function public.sessions_left(public.member_spa_packages) to authenticated;
revoke execute on function public.sessions_left(public.subscription_spa_sessions) from public, anon;
grant execute on function public.sessions_left(public.subscription_spa_sessions) to authenticated;
-- The computed fields call these as the staff member.
grant execute on function app.used_package_sessions(uuid) to authenticated;
grant execute on function app.used_plan_sessions(uuid, uuid) to authenticated;

-- A subscription that takes another's place (a plan change, a transfer) keeps the sessions the old
-- one used: a transfer carries the old one's sessions left, a plan change gives the new plan's
-- sessions less those the old one used of the same service.
create or replace function app.copy_plan_spa_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.transferred_from_id is not null then
    insert into public.subscription_spa_sessions (gym_id, subscription_id, service_id, session_count)
    select new.gym_id, new.id, o.service_id,
           greatest(o.session_count - app.used_plan_sessions(o.subscription_id, o.service_id), 0)
      from public.subscription_spa_sessions o
     where o.subscription_id = new.transferred_from_id and o.gym_id = new.gym_id;
  else
    insert into public.subscription_spa_sessions (gym_id, subscription_id, service_id, session_count)
    select new.gym_id, new.id, p.service_id,
           greatest(p.session_count - case
             when new.replaces_id is null then 0
             else app.used_plan_sessions(new.replaces_id, p.service_id)
           end, 0)
      from public.plan_spa_sessions p
     where p.plan_id = new.plan_id and p.gym_id = new.gym_id;
  end if;
  return null;
end
$$;

-- Checks ------------------------------------------------------------------------------------------------

-- Whether a therapist works for the whole of [p_starts, p_ends): one window of the start's weekday
-- (Baghdad) covers it. A booking may end at midnight but not go past it.
create function app.therapist_works(p_therapist_id uuid, p_starts timestamptz, p_ends timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with local as (
    select (p_starts at time zone 'Asia/Baghdad') as starts, (p_ends at time zone 'Asia/Baghdad') as ends
  )
  select exists (
    select 1 from public.spa_therapist_hours h, local
     where h.therapist_id = p_therapist_id
       and h.weekday = extract(isodow from local.starts)
       and h.starts_at - time '00:00' <= local.starts - local.starts::date
       and h.ends_at - time '00:00' >= local.ends - local.starts::date
  )
$$;

revoke execute on function app.therapist_works(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Fills in the place and checks the room, the therapist, the time and what pays for the booking,
-- for a new booking or a move. spa_room_not_found, spa_room_inactive, spa_room_wrong_kind,
-- spa_room_taken; therapist_required, therapist_not_needed, therapist_not_found,
-- therapist_inactive, therapist_cant_do_service, therapist_not_working; invalid_spa_booking (the
-- time); spa_package_not_usable, spa_plan_not_usable, no_sessions_left.
create function app.check_spa_booking(p_booking public.spa_bookings, p_service public.spa_services)
returns public.spa_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.spa_bookings := p_booking;
  room public.spa_rooms;
  therapist public.spa_therapists;
  day date := (p_booking.starts_at at time zone 'Asia/Baghdad')::date;
  package public.member_spa_packages;
  sessions public.subscription_spa_sessions;
  subscription public.subscriptions;
  free_place integer;
begin
  if booking.starts_at < now() - interval '1 hour' or booking.starts_at > now() + interval '366 days' then
    raise exception using errcode = '22023', message = 'invalid_spa_booking',
      detail = 'A booking starts from an hour ago up to a year ahead';
  end if;

  select * into room from public.spa_rooms r
   where r.id = booking.room_id and r.gym_id = booking.gym_id and r.branch_id = booking.branch_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'spa_room_not_found',
      detail = 'No such room in this branch';
  end if;
  if not room.is_active then
    raise exception using errcode = '23514', message = 'spa_room_inactive',
      detail = 'This room is not used now';
  end if;
  if room.kind <> p_service.kind then
    raise exception using errcode = '23514', message = 'spa_room_wrong_kind',
      detail = 'The service is given in another kind of room';
  end if;
  select min(p.place) into free_place
    from generate_series(1, room.capacity) as p (place)
   where not exists (
     select 1 from public.spa_bookings b
      where b.room_id = room.id and b.place = p.place and b.id <> booking.id
        and b.status in ('booked', 'confirmed', 'arrived', 'completed')
        and b.room_time && tstzrange(booking.starts_at, booking.room_free_at)
   );
  if free_place is null then
    raise exception using errcode = '23P01', message = 'spa_room_taken',
      detail = 'Every place of the room is taken at this time';
  end if;
  booking.place := free_place;

  if p_service.needs_therapist and booking.therapist_id is null then
    raise exception using errcode = '22023', message = 'therapist_required',
      detail = 'This service needs a therapist';
  end if;
  if not p_service.needs_therapist and booking.therapist_id is not null then
    raise exception using errcode = '22023', message = 'therapist_not_needed',
      detail = 'This service is given without a therapist';
  end if;
  if booking.therapist_id is not null then
    select * into therapist from public.spa_therapists t
     where t.id = booking.therapist_id and t.gym_id = booking.gym_id and t.branch_id = booking.branch_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'therapist_not_found',
        detail = 'No such therapist in this branch';
    end if;
    if not therapist.is_active then
      raise exception using errcode = '23514', message = 'therapist_inactive',
        detail = 'This therapist doesn''t work here now';
    end if;
    if not exists (
      select 1 from public.spa_therapist_services s
       where s.therapist_id = therapist.id and s.service_id = p_service.id
    ) then
      raise exception using errcode = '23514', message = 'therapist_cant_do_service',
        detail = 'This therapist doesn''t do this service';
    end if;
    if not app.therapist_works(therapist.id, booking.starts_at, booking.ends_at) then
      raise exception using errcode = '23514', message = 'therapist_not_working',
        detail = 'The therapist doesn''t work at this time';
    end if;
  end if;

  if booking.paid_with = 'package' then
    select * into package from public.member_spa_packages m
     where m.id = booking.member_package_id and m.gym_id = booking.gym_id
       for update;
    if not found or package.member_id <> booking.member_id or package.service_id <> p_service.id
       or day < package.starts_on or day > package.expires_on
       or exists (select 1 from public.invoices v where v.id = package.invoice_id and v.voided_at is not null) then
      raise exception using errcode = '23514', message = 'spa_package_not_usable',
        detail = 'The package isn''t the member''s for this service on this day';
    end if;
    if app.used_package_sessions(package.id) - (case when booking.created_at is null then 0 else 1 end) >= package.session_count then
      raise exception using errcode = '23514', message = 'no_sessions_left',
        detail = 'The package has no sessions left';
    end if;
  elsif booking.paid_with = 'plan' then
    select * into subscription from public.subscriptions s
     where s.id = booking.subscription_id and s.gym_id = booking.gym_id;
    select * into sessions from public.subscription_spa_sessions x
     where x.subscription_id = booking.subscription_id and x.service_id = p_service.id
       for update;
    if subscription.id is null or sessions.id is null or subscription.member_id <> booking.member_id
       or subscription.status <> 'active' or day < subscription.start_date or day > subscription.end_date
       or app.is_frozen(subscription.id, day) then
      raise exception using errcode = '23514', message = 'spa_plan_not_usable',
        detail = 'The member''s subscription doesn''t include this service on this day';
    end if;
    if app.used_plan_sessions(subscription.id, p_service.id) - (case when booking.created_at is null then 0 else 1 end)
       >= sessions.session_count then
      raise exception using errcode = '23514', message = 'no_sessions_left',
        detail = 'The subscription has no sessions of this service left';
    end if;
  end if;
  return booking;
end
$$;

revoke execute on function app.check_spa_booking(public.spa_bookings, public.spa_services) from public, anon, authenticated;

-- The booking the acting staff member works on, locked: of their gym, in a branch they reach.
-- spa_booking_not_found.
create function app.lock_spa_booking(p_booking_id uuid)
returns public.spa_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.spa_bookings;
begin
  select * into booking from public.spa_bookings b
   where b.id = p_booking_id and b.gym_id = app.current_gym_id()
     for update;
  if not found or not app.has_branch_access(booking.branch_id) then
    raise exception using errcode = 'P0002', message = 'spa_booking_not_found',
      detail = 'No booking with this id that you may see';
  end if;
  return booking;
end
$$;

revoke execute on function app.lock_spa_booking(uuid) from public, anon, authenticated;

-- What a booking is, for the screens.
create function app.spa_booking_result(p_booking public.spa_bookings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'booking_id', p_booking.id, 'status', p_booking.status, 'place', p_booking.place,
    'starts_at', p_booking.starts_at, 'ends_at', p_booking.ends_at, 'room_id', p_booking.room_id,
    'therapist_id', p_booking.therapist_id
  )
$$;

revoke execute on function app.spa_booking_result(public.spa_bookings) from public, anon, authenticated;

-- Saves a booking row, turning a clash with another booking into its error key: spa_room_taken,
-- spa_therapist_taken, spa_member_busy.
create function app.save_spa_booking_row(p_booking public.spa_bookings, p_new boolean)
returns public.spa_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.spa_bookings;
  failed_constraint text;
begin
  begin
    if p_new then
      insert into public.spa_bookings (
        id, gym_id, branch_id, member_id, service_id, room_id, place, therapist_id, name_ckb, name_en, name_ar,
        price, starts_at, ends_at, room_free_at, paid_with, member_package_id, subscription_id, walk_in, note, status
      ) values (
        p_booking.id, p_booking.gym_id, p_booking.branch_id, p_booking.member_id, p_booking.service_id,
        p_booking.room_id, p_booking.place, p_booking.therapist_id, p_booking.name_ckb, p_booking.name_en,
        p_booking.name_ar, p_booking.price, p_booking.starts_at, p_booking.ends_at, p_booking.room_free_at,
        p_booking.paid_with, p_booking.member_package_id, p_booking.subscription_id, p_booking.walk_in,
        p_booking.note, p_booking.status
      )
      returning * into saved;
    else
      update public.spa_bookings b
         set room_id = p_booking.room_id, place = p_booking.place, therapist_id = p_booking.therapist_id,
             starts_at = p_booking.starts_at, ends_at = p_booking.ends_at, room_free_at = p_booking.room_free_at
       where b.id = p_booking.id
      returning * into saved;
    end if;
  exception
    when exclusion_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      raise exception using errcode = '23P01',
        message = case failed_constraint
          when 'spa_bookings_therapist_free' then 'spa_therapist_taken'
          when 'spa_bookings_member_free' then 'spa_member_busy'
          else 'spa_room_taken'
        end,
        detail = 'Another booking has this time';
  end;
  return saved;
end
$$;

revoke execute on function app.save_spa_booking_row(public.spa_bookings, boolean) from public, anon, authenticated;

-- Booking ------------------------------------------------------------------------------------------------

-- Books a service for a member or guest (p_id made by the app): in p_branch_id, from p_starts_at for
-- the service's duration, in p_room_id (the first free place), with p_therapist_id when the service
-- needs one, paid by p_paid_with (pay, package with p_member_package_id, plan with
-- p_subscription_id). p_walk_in: the client is here now (the screen marks the arrival next). The same
-- p_id again returns what was saved.
-- permission_denied (spa.book); spa_booking_exists; no_branch_access, branch_inactive;
-- spa_service_not_found, spa_service_inactive; member_not_found, member_not_active,
-- spa_wrong_gender; invalid_spa_booking; and those of app.check_spa_booking and
-- app.save_spa_booking_row.
create function public.book_spa(
  p_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_room_id uuid,
  p_therapist_id uuid default null,
  p_paid_with text default 'pay',
  p_member_package_id uuid default null,
  p_subscription_id uuid default null,
  p_walk_in boolean default false,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  booking public.spa_bookings;
  service public.spa_services;
  member public.members;
begin
  if gym is null or not app.has_permission('spa.book') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Booking the spa needs spa.book';
  end if;
  select * into booking from public.spa_bookings b where b.id = p_id;
  if found then
    if booking.gym_id is distinct from gym or booking.member_id <> p_member_id or booking.service_id <> p_service_id then
      raise exception using errcode = '23505', message = 'spa_booking_exists',
        detail = 'Another booking has this id';
    end if;
    return app.spa_booking_result(booking);
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only the spa of your own branches';
  end if;
  if not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '23514', message = 'branch_inactive',
      detail = 'This branch is deactivated';
  end if;
  select * into service from public.spa_services s where s.id = p_service_id and s.gym_id = gym;
  if not found then
    raise exception using errcode = 'P0002', message = 'spa_service_not_found',
      detail = 'No such service in your gym';
  end if;
  if not service.is_active then
    raise exception using errcode = '23514', message = 'spa_service_inactive',
      detail = 'This service is no longer booked';
  end if;
  select * into member from public.members m where m.id = p_member_id and m.gym_id = gym and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member.status <> 'active' then
    raise exception using errcode = '23514', message = 'member_not_active',
      detail = 'Only active members and guests are booked';
  end if;
  if service.gender <> 'any' and service.gender <> member.gender then
    raise exception using errcode = '23514', message = 'spa_wrong_gender',
      detail = 'This service is for the other gender';
  end if;
  if p_starts_at is null or p_paid_with is null or p_paid_with not in ('pay', 'package', 'plan')
     or (p_paid_with = 'package') <> (p_member_package_id is not null)
     or (p_paid_with = 'plan') <> (p_subscription_id is not null) then
    raise exception using errcode = '22023', message = 'invalid_spa_booking',
      detail = 'A start, and pay, a package with its id, or a plan with the subscription''s id';
  end if;

  booking.id := p_id;
  booking.gym_id := gym;
  booking.branch_id := p_branch_id;
  booking.member_id := p_member_id;
  booking.service_id := service.id;
  booking.room_id := p_room_id;
  booking.therapist_id := p_therapist_id;
  booking.name_ckb := service.name_ckb;
  booking.name_en := service.name_en;
  booking.name_ar := service.name_ar;
  booking.price := case when p_paid_with = 'pay' then service.price else 0 end;
  booking.starts_at := p_starts_at;
  booking.ends_at := p_starts_at + make_interval(mins => service.duration_minutes);
  booking.room_free_at := booking.ends_at + make_interval(mins => service.cleanup_minutes);
  booking.paid_with := p_paid_with;
  booking.member_package_id := p_member_package_id;
  booking.subscription_id := p_subscription_id;
  booking.walk_in := coalesce(p_walk_in, false);
  booking.note := p_note;
  booking.status := 'booked';
  booking := app.check_spa_booking(booking, service);
  booking := app.save_spa_booking_row(booking, true);
  return app.spa_booking_result(booking);
end
$$;

revoke execute on function public.book_spa(uuid, uuid, uuid, uuid, timestamptz, uuid, uuid, text, uuid, uuid, boolean, text) from public, anon;
grant execute on function public.book_spa(uuid, uuid, uuid, uuid, timestamptz, uuid, uuid, text, uuid, uuid, boolean, text) to authenticated;

-- Moves a booked or confirmed booking to another start, room or therapist (drag and drop, or the
-- move dialog), checked like a new one; its length stays. permission_denied; spa_booking_not_found;
-- spa_booking_closed (arrived, completed, cancelled, no-show); and those of app.check_spa_booking and
-- app.save_spa_booking_row.
create function public.move_spa_booking(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_room_id uuid,
  p_therapist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.spa_bookings;
  service public.spa_services;
  length interval;
  cleaning interval;
begin
  if app.current_gym_id() is null or not app.has_permission('spa.book') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Moving a booking needs spa.book';
  end if;
  booking := app.lock_spa_booking(p_booking_id);
  if booking.status not in ('booked', 'confirmed') then
    raise exception using errcode = '23514', message = 'spa_booking_closed',
      detail = 'Only a booking not arrived yet is moved';
  end if;
  if p_starts_at is null then
    raise exception using errcode = '22023', message = 'invalid_spa_booking',
      detail = 'A booking needs a start';
  end if;
  select * into service from public.spa_services s where s.id = booking.service_id;
  length := booking.ends_at - booking.starts_at;
  cleaning := booking.room_free_at - booking.ends_at;
  booking.starts_at := p_starts_at;
  booking.ends_at := p_starts_at + length;
  booking.room_free_at := booking.ends_at + cleaning;
  booking.room_id := p_room_id;
  booking.therapist_id := p_therapist_id;
  booking := app.check_spa_booking(booking, service);
  booking := app.save_spa_booking_row(booking, false);
  return app.spa_booking_result(booking);
end
$$;

revoke execute on function public.move_spa_booking(uuid, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.move_spa_booking(uuid, timestamptz, uuid, uuid) to authenticated;

-- Statuses -------------------------------------------------------------------------------------------------

-- confirmed (from booked), cancelled or no_show (from booked or confirmed, with an optional note),
-- completed (from arrived: the therapist's commission is stored). Arriving is arrive_spa_booking().
-- The same status again changes nothing. permission_denied (spa.book); spa_booking_not_found;
-- invalid_status_change; invalid_request (the note).
create function public.set_spa_booking_status(p_booking_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.spa_bookings;
  percent numeric;
begin
  if app.current_gym_id() is null or not app.has_permission('spa.book') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing a booking needs spa.book';
  end if;
  booking := app.lock_spa_booking(p_booking_id);
  if booking.status = p_status then
    return app.spa_booking_result(booking);
  end if;
  if not (
    (p_status = 'confirmed' and booking.status = 'booked')
    or (p_status in ('cancelled', 'no_show') and booking.status in ('booked', 'confirmed'))
    or (p_status = 'completed' and booking.status = 'arrived')
  ) then
    raise exception using errcode = '23514', message = 'invalid_status_change',
      detail = 'Confirm a booking, cancel it or mark a no-show before arriving, or complete it after';
  end if;
  if p_note is not null and not app.is_clean_text(p_note, 500) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A note of at most 500 characters';
  end if;
  if p_status = 'completed' and booking.therapist_id is not null then
    select t.commission_percent into percent from public.spa_therapists t where t.id = booking.therapist_id;
  end if;
  update public.spa_bookings b
     set status = p_status,
         status_note = coalesce(p_note, b.status_note),
         status_changed_at = now(),
         status_changed_by = auth.uid(),
         completed_at = case when p_status = 'completed' then now() else b.completed_at end,
         commission_amount = case
           when p_status = 'completed' and percent is not null then trunc(b.price * percent / 100)
           else b.commission_amount
         end
   where b.id = booking.id
  returning * into booking;
  return app.spa_booking_result(booking);
end
$$;

revoke execute on function public.set_spa_booking_status(uuid, text, text) from public, anon;
grant execute on function public.set_spa_booking_status(uuid, text, text) to authenticated;

-- The client has come (on the booking's day, Baghdad). A booking paid by pay with a price gets its
-- invoice (item kind spa, the service's name) with an optional payment, which needs payments.create
-- too. Arriving again returns what was saved. permission_denied; spa_booking_not_found;
-- invalid_status_change; not_today; no_branch_access, branch_inactive; invalid_payment;
-- payment_too_large.
create function public.arrive_spa_booking(
  p_booking_id uuid,
  p_invoice_id uuid default null,
  p_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.spa_bookings;
  invoice jsonb;
  charged boolean;
begin
  if app.current_gym_id() is null or not app.has_permission('spa.book') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Marking an arrival needs spa.book';
  end if;
  booking := app.lock_spa_booking(p_booking_id);
  if booking.status in ('arrived', 'completed') then
    return app.spa_booking_result(booking)
      || coalesce(case when booking.invoice_id is not null then app.saved_invoice(booking.invoice_id) end, '{}'::jsonb);
  end if;
  if booking.status not in ('booked', 'confirmed') then
    raise exception using errcode = '23514', message = 'invalid_status_change',
      detail = 'A cancelled booking or a no-show doesn''t arrive';
  end if;
  if (booking.starts_at at time zone 'Asia/Baghdad')::date <> app.baghdad_today() then
    raise exception using errcode = '23514', message = 'not_today',
      detail = 'A client arrives on the booking''s day';
  end if;
  charged := booking.paid_with = 'pay' and booking.price > 0;
  if charged then
    if not app.has_permission('payments.create') then
      raise exception using errcode = '42501', message = 'permission_denied',
        detail = 'Charging the booking needs payments.create';
    end if;
    if p_invoice_id is null then
      raise exception using errcode = '22023', message = 'invalid_request',
        detail = 'A booking to pay needs an invoice id';
    end if;
    perform app.check_money_branch(booking.branch_id);
    invoice := app.locker_invoice(p_invoice_id, booking.branch_id, booking.member_id, 'spa', booking.name_ckb,
      booking.price, p_payment);
  end if;
  update public.spa_bookings b
     set status = 'arrived', arrived_at = now(), status_changed_at = now(), status_changed_by = auth.uid(),
         invoice_id = case when charged then p_invoice_id end
   where b.id = booking.id
  returning * into booking;
  return app.spa_booking_result(booking) || coalesce(invoice, '{}'::jsonb);
end
$$;

revoke execute on function public.arrive_spa_booking(uuid, uuid, jsonb) from public, anon;
grant execute on function public.arrive_spa_booking(uuid, uuid, jsonb) to authenticated;

-- A voided invoice cancels the arrived booking it charged (a completed one stays, and its
-- commission no longer counts).
create function app.cancel_invoice_spa_bookings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.spa_bookings b
     set status = 'cancelled', status_note = coalesce(b.status_note, new.void_reason),
         status_changed_at = now(), status_changed_by = auth.uid()
   where b.invoice_id = new.id and b.gym_id = new.gym_id and b.status = 'arrived';
  return null;
end
$$;

revoke execute on function app.cancel_invoice_spa_bookings() from public, anon, authenticated;

create trigger cancel_spa_bookings after update of voided_at on public.invoices
  for each row
  when (old.voided_at is null and new.voided_at is not null)
  execute function app.cancel_invoice_spa_bookings();

-- Commissions ----------------------------------------------------------------------------------------------

-- Each therapist's completed bookings in a branch from p_from to p_until (Baghdad days of the start,
-- at most 366 days), with the prices and their commission; bookings whose invoice was voided are left
-- out. permission_denied (spa.manage); no_branch_access; invalid_request (the days).
create function public.spa_commissions(p_branch_id uuid, p_from date, p_until date)
returns table (therapist_id uuid, full_name text, bookings integer, total numeric, commission numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_spa_manager(p_branch_id);
  if p_from is null or p_until is null or p_until < p_from or p_until - p_from > 366 then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'From a day to a day, at most 366 days';
  end if;
  return query
    select t.id, t.full_name, count(*)::integer, sum(b.price), sum(coalesce(b.commission_amount, 0))
      from public.spa_bookings b
      join public.spa_therapists t on t.id = b.therapist_id
      left join public.invoices v on v.id = b.invoice_id
     where b.gym_id = app.current_gym_id() and b.branch_id = p_branch_id and b.status = 'completed'
       and (b.starts_at at time zone 'Asia/Baghdad')::date between p_from and p_until
       and v.voided_at is null
     group by t.id, t.full_name
     order by t.full_name;
end
$$;

revoke execute on function public.spa_commissions(uuid, date, date) from public, anon;
grant execute on function public.spa_commissions(uuid, date, date) to authenticated;
