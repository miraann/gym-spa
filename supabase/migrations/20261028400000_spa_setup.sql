-- The spa's setup (Phase 6, step 6a; spec §4.5 and the Phase 6 plan in §8 of 2026-10-28). Additions
-- only; app.is_valid_setting and public.seller_member_counts replaced with the same signatures.
--
--   * spa_services: what the spa sells, gym-wide like plans: names, a kind that is also the room kind
--     it needs, duration, cleaning time after it, price, gender, whether it needs a therapist.
--   * spa_rooms: a branch's rooms, of one kind, with a capacity (places used at the same time).
--   * spa_therapists: a branch's therapists, with the services they do (spa_therapist_services:
--     their "skills") and their weekly working hours (spa_therapist_hours, Baghdad time), a
--     commission percent, and an optional link to their staff login.
--   * Guest profiles: a member row with is_guest (walk-ins and non-members), made with spa.book, so
--     invoices, payments and debts work unchanged. A guest can be made a full member later.
--   * Nothing is deleted: services, rooms and therapists are made inactive. Only the functions
--     below write these tables; staff read them (services: everyone in the gym, the rest with
--     spa.view in their branches).

-- Settings ------------------------------------------------------------------------------------------

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
    -- The gym's brand color: a preset, or a custom color as lowercase #rrggbb.
    when 'appearance.brand_color' then jsonb_typeof(value) = 'string' and (value #>> '{}' = any (array['indigo', 'blue', 'purple', 'gray', 'midnight', 'gold', 'teal']) or value #>> '{}' ~ '^#[0-9a-f]{6}$')
    -- Corners: soft (the default), medium or sharp.
    when 'appearance.corner_style' then jsonb_typeof(value) = 'string' and value #>> '{}' in ('soft', 'medium', 'sharp')
    when 'appearance.logo' then app.is_valid_logo(value)
    -- Minutes after a visit in which another scan counts nothing (shown as "already in").
    when 'checkin.cooldown_minutes' then app.is_json_integer(value, 1, 720)
    -- Hours a visit counts as inside when nobody checks the member out.
    when 'checkin.visit_hours' then app.is_json_integer(value, 1, 24)
    -- 1: money owed now above checkin.debt_limit refuses entry; 0: it is only a warning.
    when 'checkin.deny_for_debt' then app.is_json_integer(value, 0, 1)
    -- Dinars a member may owe now and still come in, when checkin.deny_for_debt is 1.
    when 'checkin.debt_limit' then app.is_json_integer(value, 0, 1000000000)
    -- Dinars a rented locker costs per month; 0: not set, so lockers can't be rented yet.
    when 'lockers.rent_month_price' then app.is_json_integer(value, 0, 1000000000)
    -- Dinars charged for a lost locker key; 0: no fee.
    when 'lockers.lost_key_fee' then app.is_json_integer(value, 0, 1000000000)
    -- When each night the daily lockers not given back are released: minutes after midnight in
    -- Baghdad (180 = 03:00).
    when 'lockers.night_release_minute' then app.is_json_integer(value, 0, 1439)
    -- The hours the spa calendar shows (Baghdad time): from this hour until that one.
    when 'spa.calendar_from_hour' then app.is_json_integer(value, 0, 23)
    when 'spa.calendar_until_hour' then app.is_json_integer(value, 1, 24)
    -- The calendar's step in minutes.
    when 'spa.slot_minutes' then app.is_json_integer(value, 5, 60)
    else false
  end
$$;

-- Services ------------------------------------------------------------------------------------------

create table public.spa_services (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  -- Also the kind of room it needs.
  kind text not null check (kind in ('massage', 'sauna', 'steam', 'jacuzzi', 'facial', 'moroccan_bath', 'other')),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  -- The room stays taken this long after it (cleaning, getting it ready).
  cleanup_minutes integer not null default 0 check (cleanup_minutes between 0 and 60),
  -- Whole dinars.
  price numeric(14,2) not null check (price >= 0 and price <= 1000000000 and price = trunc(price)),
  gender text not null default 'any' check (gender in ('any', 'male', 'female')),
  -- false: only a room (sauna, steam, jacuzzi).
  needs_therapist boolean not null default true,
  -- false: no longer booked; bookings already made keep it.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: services are never deleted.
  deleted_at timestamptz,
  constraint spa_services_id_gym_id_key unique (id, gym_id),
  constraint spa_services_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint spa_services_never_deleted check (deleted_at is null)
);

create index spa_services_gym_id_idx on public.spa_services (gym_id);

-- Rooms ---------------------------------------------------------------------------------------------

create table public.spa_rooms (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  name_ckb text not null check (app.is_clean_text(name_ckb, 60)),
  name_en text check (app.is_clean_text(name_en, 60)),
  name_ar text check (app.is_clean_text(name_ar, 60)),
  -- Services of this kind are given here.
  kind text not null check (kind in ('massage', 'sauna', 'steam', 'jacuzzi', 'facial', 'moroccan_bath', 'other')),
  -- How many people at the same time: a booking takes one of its places.
  capacity integer not null default 1 check (capacity between 1 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: rooms are never deleted.
  deleted_at timestamptz,
  constraint spa_rooms_id_gym_id_key unique (id, gym_id),
  constraint spa_rooms_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint spa_rooms_never_deleted check (deleted_at is null)
);

-- A room's name is unique in its branch.
create unique index spa_rooms_branch_id_gym_id_name_key on public.spa_rooms (branch_id, gym_id, name_ckb);
create index spa_rooms_branch_id_gym_id_idx on public.spa_rooms (branch_id, gym_id);

-- Therapists ----------------------------------------------------------------------------------------

create table public.spa_therapists (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  full_name text not null check (app.is_clean_text(full_name, 100)),
  gender text not null check (gender in ('male', 'female')),
  phone text check (app.is_valid_member_phone(phone)),
  -- Their staff login, if they have one (to see their own day).
  staff_user_id uuid,
  -- Percent of the service price earned on each completed booking.
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: therapists are never deleted.
  deleted_at timestamptz,
  constraint spa_therapists_id_gym_id_key unique (id, gym_id),
  constraint spa_therapists_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint spa_therapists_staff_user_id_gym_id_fkey foreign key (staff_user_id, gym_id)
    references public.staff_users (id, gym_id),
  constraint spa_therapists_never_deleted check (deleted_at is null)
);

create index spa_therapists_branch_id_gym_id_idx on public.spa_therapists (branch_id, gym_id);
-- One therapist per staff login.
create unique index spa_therapists_staff_user_id_gym_id_key on public.spa_therapists (staff_user_id, gym_id);

-- The services a therapist does.
create table public.spa_therapist_services (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  therapist_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint spa_therapist_services_therapist_id_service_id_key unique (therapist_id, service_id),
  constraint spa_therapist_services_therapist_id_gym_id_fkey foreign key (therapist_id, gym_id)
    references public.spa_therapists (id, gym_id),
  constraint spa_therapist_services_service_id_gym_id_fkey foreign key (service_id, gym_id)
    references public.spa_services (id, gym_id)
);

create index spa_therapist_services_therapist_id_gym_id_idx on public.spa_therapist_services (therapist_id, gym_id);
create index spa_therapist_services_service_id_gym_id_idx on public.spa_therapist_services (service_id, gym_id);

-- When a therapist works: windows of a weekday (ISO, 1 Monday … 7 Sunday), Baghdad time, until
-- 24:00 at most. Windows of one day don't overlap.
create table public.spa_therapist_hours (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  therapist_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint spa_therapist_hours_window check (starts_at < ends_at),
  constraint spa_therapist_hours_therapist_id_gym_id_fkey foreign key (therapist_id, gym_id)
    references public.spa_therapists (id, gym_id)
);

create index spa_therapist_hours_therapist_id_gym_id_idx on public.spa_therapist_hours (therapist_id, gym_id, weekday);

-- Triggers ------------------------------------------------------------------------------------------

create trigger check_writable before insert or update or delete on public.spa_services
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.spa_services
  for each row execute function app.read_only_columns('id', 'gym_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.spa_services
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.spa_services
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.spa_rooms
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.spa_rooms
  for each row execute function app.read_only_columns('id', 'gym_id', 'branch_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.spa_rooms
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.spa_rooms
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.spa_therapists
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.spa_therapists
  for each row execute function app.read_only_columns('id', 'gym_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.spa_therapists
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.spa_therapists
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.spa_therapist_services
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.spa_therapist_services
  for each row execute function app.read_only_columns('id', 'gym_id', 'therapist_id', 'service_id');
create trigger stamp before insert on public.spa_therapist_services
  for each row execute function app.stamp_created();
create trigger audit after insert or update or delete on public.spa_therapist_services
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.spa_therapist_hours
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.spa_therapist_hours
  for each row execute function app.read_only_columns('id', 'gym_id', 'therapist_id');
create trigger stamp before insert on public.spa_therapist_hours
  for each row execute function app.stamp_created();
create trigger audit after insert or update or delete on public.spa_therapist_hours
  for each row execute function app.audit_row();

-- Row level security ----------------------------------------------------------------------------------

alter table public.spa_services enable row level security;
alter table public.spa_rooms enable row level security;
alter table public.spa_therapists enable row level security;
alter table public.spa_therapist_services enable row level security;
alter table public.spa_therapist_hours enable row level security;

revoke all on table public.spa_services, public.spa_rooms, public.spa_therapists,
  public.spa_therapist_services, public.spa_therapist_hours from anon, authenticated;
grant all on table public.spa_services, public.spa_rooms, public.spa_therapists,
  public.spa_therapist_services, public.spa_therapist_hours to service_role;
-- Only the functions below write them.
grant select on table public.spa_services, public.spa_rooms, public.spa_therapists,
  public.spa_therapist_services, public.spa_therapist_hours to authenticated;

-- The price list: everyone in the gym (like plans), for the calendar, the member page and selling.
create policy "staff see their gym's spa services" on public.spa_services
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

create policy "staff with spa.view see their branches' spa rooms" on public.spa_rooms
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('spa.view'))
    and branch_id in (select app.accessible_branch_ids())
  );

create policy "staff with spa.view see their branches' therapists" on public.spa_therapists
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('spa.view'))
    and branch_id in (select app.accessible_branch_ids())
  );

create policy "staff with spa.view see what their branches' therapists do" on public.spa_therapist_services
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('spa.view'))
    and therapist_id in (
      select t.id from public.spa_therapists t where t.branch_id in (select app.accessible_branch_ids())
    )
  );

create policy "staff with spa.view see when their branches' therapists work" on public.spa_therapist_hours
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('spa.view'))
    and therapist_id in (
      select t.id from public.spa_therapists t where t.branch_id in (select app.accessible_branch_ids())
    )
  );

-- Saving (spa.manage) -----------------------------------------------------------------------------------

-- Checks that the acting staff member may manage the spa (spa.manage) in this branch of their gym.
-- permission_denied; no_branch_access.
create function app.require_spa_manager(p_branch_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if app.current_gym_id() is null or not app.has_permission('spa.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing the spa''s setup needs spa.manage';
  end if;
  if p_branch_id is not null and not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only the spa of your own branches';
  end if;
end
$$;

revoke execute on function app.require_spa_manager(uuid) from public, anon, authenticated;

-- Adds a service (p_id made by the app) or changes one. permission_denied (spa.manage, or another
-- gym's id); invalid_spa_service (a value out of range).
create function public.save_spa_service(
  p_id uuid,
  p_name_ckb text,
  p_kind text,
  p_duration_minutes integer,
  p_price numeric,
  p_name_en text default null,
  p_name_ar text default null,
  p_cleanup_minutes integer default 0,
  p_gender text default 'any',
  p_needs_therapist boolean default true,
  p_is_active boolean default true
)
returns public.spa_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  saved public.spa_services;
begin
  perform app.require_spa_manager(null);
  if exists (select 1 from public.spa_services s where s.id = p_id and s.gym_id <> gym) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No service with this id that you may change';
  end if;
  begin
    insert into public.spa_services as s (
      id, gym_id, name_ckb, name_en, name_ar, kind, duration_minutes, cleanup_minutes, price, gender,
      needs_therapist, is_active
    ) values (
      p_id, gym, p_name_ckb, p_name_en, p_name_ar, p_kind, p_duration_minutes, coalesce(p_cleanup_minutes, 0),
      p_price, coalesce(p_gender, 'any'), coalesce(p_needs_therapist, true), coalesce(p_is_active, true)
    )
    on conflict (id) do update set
      name_ckb = excluded.name_ckb,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      kind = excluded.kind,
      duration_minutes = excluded.duration_minutes,
      cleanup_minutes = excluded.cleanup_minutes,
      price = excluded.price,
      gender = excluded.gender,
      needs_therapist = excluded.needs_therapist,
      is_active = excluded.is_active
    returning s.* into saved;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_spa_service',
        detail = 'A name, a kind, 5 to 480 minutes, 0 to 60 cleaning minutes and a whole price';
  end;
  return saved;
end
$$;

revoke execute on function public.save_spa_service(uuid, text, text, integer, numeric, text, text, integer, text, boolean, boolean) from public, anon;
grant execute on function public.save_spa_service(uuid, text, text, integer, numeric, text, text, integer, text, boolean, boolean) to authenticated;

-- Adds a room to a branch (p_id made by the app) or changes one; its branch never changes.
-- permission_denied; no_branch_access; branch_inactive (a new room); spa_room_name_taken;
-- invalid_spa_room.
create function public.save_spa_room(
  p_id uuid,
  p_branch_id uuid,
  p_name_ckb text,
  p_kind text,
  p_capacity integer default 1,
  p_name_en text default null,
  p_name_ar text default null,
  p_is_active boolean default true
)
returns public.spa_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  old public.spa_rooms;
  saved public.spa_rooms;
  failed_constraint text;
begin
  perform app.require_spa_manager(p_branch_id);
  select * into old from public.spa_rooms r where r.id = p_id;
  if found and (old.gym_id <> gym or old.branch_id <> p_branch_id) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No room with this id in this branch that you may change';
  end if;
  if not found and not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '23514', message = 'branch_inactive',
      detail = 'Rooms are added to active branches';
  end if;
  begin
    insert into public.spa_rooms as r (id, gym_id, branch_id, name_ckb, name_en, name_ar, kind, capacity, is_active)
    values (p_id, gym, p_branch_id, p_name_ckb, p_name_en, p_name_ar, p_kind, coalesce(p_capacity, 1),
            coalesce(p_is_active, true))
    on conflict (id) do update set
      name_ckb = excluded.name_ckb,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      kind = excluded.kind,
      capacity = excluded.capacity,
      is_active = excluded.is_active
    returning r.* into saved;
  exception
    when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint = 'spa_rooms_branch_id_gym_id_name_key' then
        raise exception using errcode = '23505', message = 'spa_room_name_taken',
          detail = 'Another room of this branch has this name';
      end if;
      raise;
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_spa_room',
        detail = 'A name, a kind and a capacity of 1 to 20';
  end;
  return saved;
end
$$;

revoke execute on function public.save_spa_room(uuid, uuid, text, text, integer, text, text, boolean) from public, anon;
grant execute on function public.save_spa_room(uuid, uuid, text, text, integer, text, text, boolean) to authenticated;

-- Adds a therapist (p_id made by the app) or changes one, with the services they do and their weekly
-- hours, all or nothing. p_hours: [{"weekday": 1-7, "from": "09:00", "until": "17:00"}, ...], at most
-- 28 windows, those of one day not overlapping, "until" at most "24:00". A therapist may move to
-- another branch the manager reaches.
-- permission_denied; no_branch_access; branch_inactive; invalid_therapist; invalid_hours;
-- spa_service_not_found; staff_not_found; staff_already_therapist.
create function public.save_spa_therapist(
  p_id uuid,
  p_branch_id uuid,
  p_full_name text,
  p_gender text,
  p_service_ids uuid[],
  p_hours jsonb,
  p_phone text default null,
  p_staff_user_id uuid default null,
  p_commission_percent numeric default 0,
  p_is_active boolean default true
)
returns public.spa_therapists
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  old public.spa_therapists;
  saved public.spa_therapists;
  failed_constraint text;
begin
  perform app.require_spa_manager(p_branch_id);
  select * into old from public.spa_therapists t where t.id = p_id;
  if found and (old.gym_id <> gym or not app.has_branch_access(old.branch_id)) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No therapist with this id that you may change';
  end if;
  if (not found or old.branch_id <> p_branch_id) and not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '23514', message = 'branch_inactive',
      detail = 'Therapists work in active branches';
  end if;
  if p_service_ids is null or array_position(p_service_ids, null) is not null or exists (
    select 1 from unnest(p_service_ids) as s (id)
     where not exists (select 1 from public.spa_services v where v.id = s.id and v.gym_id = gym)
  ) then
    raise exception using errcode = 'P0002', message = 'spa_service_not_found',
      detail = 'Every service the therapist does is a service of this gym';
  end if;
  if not app.is_valid_spa_hours(p_hours) then
    raise exception using errcode = '22023', message = 'invalid_hours',
      detail = 'Windows of weekday 1-7, from before until, until 24:00 at most, not overlapping on one day';
  end if;
  if p_staff_user_id is not null and not exists (
    select 1 from public.staff_users u where u.id = p_staff_user_id and u.gym_id = gym
  ) then
    raise exception using errcode = 'P0002', message = 'staff_not_found',
      detail = 'No staff member with this id in your gym';
  end if;

  begin
    insert into public.spa_therapists as t (
      id, gym_id, branch_id, full_name, gender, phone, staff_user_id, commission_percent, is_active
    ) values (
      p_id, gym, p_branch_id, p_full_name, p_gender, p_phone, p_staff_user_id, coalesce(p_commission_percent, 0),
      coalesce(p_is_active, true)
    )
    on conflict (id) do update set
      branch_id = excluded.branch_id,
      full_name = excluded.full_name,
      gender = excluded.gender,
      phone = excluded.phone,
      staff_user_id = excluded.staff_user_id,
      commission_percent = excluded.commission_percent,
      is_active = excluded.is_active
    returning t.* into saved;
  exception
    when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint = 'spa_therapists_staff_user_id_gym_id_key' then
        raise exception using errcode = '23505', message = 'staff_already_therapist',
          detail = 'This staff login belongs to another therapist';
      end if;
      raise;
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_therapist',
        detail = 'A name, a gender, a valid phone and a commission of 0 to 100 percent';
  end;

  delete from public.spa_therapist_services s
   where s.therapist_id = p_id and s.service_id <> all (p_service_ids);
  insert into public.spa_therapist_services (gym_id, therapist_id, service_id)
  select gym, p_id, s.id from unnest(p_service_ids) as s (id)
  on conflict (therapist_id, service_id) do nothing;

  -- The hours are replaced when they differ.
  if p_hours is distinct from app.spa_therapist_hours_json(p_id) then
    delete from public.spa_therapist_hours h where h.therapist_id = p_id;
    insert into public.spa_therapist_hours (gym_id, therapist_id, weekday, starts_at, ends_at)
    select gym, p_id, (w ->> 'weekday')::smallint, (w ->> 'from')::time, (w ->> 'until')::time
      from jsonb_array_elements(p_hours) as w;
  end if;
  return saved;
end
$$;

-- Whether p_hours is a valid list of working windows (see save_spa_therapist).
create function app.is_valid_spa_hours(p_hours jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  window_count integer;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then
    return false;
  end if;
  window_count := jsonb_array_length(p_hours);
  if window_count > 28 then
    return false;
  end if;
  -- A case, so the times are read only once they are known to be times.
  if exists (
    select 1 from jsonb_array_elements(p_hours) as w
     where case
             when jsonb_typeof(w) <> 'object'
               or coalesce(w ->> 'weekday', '') !~ '^[1-7]$'
               or coalesce(w ->> 'from', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
               or coalesce(w ->> 'until', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then true
             else (w ->> 'from')::time >= (w ->> 'until')::time
           end
  ) then
    return false;
  end if;
  return not exists (
    select 1
      from jsonb_array_elements(p_hours) with ordinality as a (w, n)
      join jsonb_array_elements(p_hours) with ordinality as b (w, n)
        on a.n < b.n and a.w ->> 'weekday' = b.w ->> 'weekday'
     where (a.w ->> 'from')::time < (b.w ->> 'until')::time
       and (b.w ->> 'from')::time < (a.w ->> 'until')::time
  );
end
$$;

revoke execute on function app.is_valid_spa_hours(jsonb) from public, anon, authenticated;

-- A therapist's hours as save_spa_therapist takes them, in a fixed order.
create function app.spa_therapist_hours_json(p_therapist_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'weekday', h.weekday, 'from', to_char(h.starts_at, 'HH24:MI'),
           'until', case when h.ends_at = time '24:00' then '24:00' else to_char(h.ends_at, 'HH24:MI') end
         ) order by h.weekday, h.starts_at), '[]'::jsonb)
    from public.spa_therapist_hours h
   where h.therapist_id = p_therapist_id
$$;

revoke execute on function app.spa_therapist_hours_json(uuid) from public, anon, authenticated;

revoke execute on function public.save_spa_therapist(uuid, uuid, text, text, uuid[], jsonb, text, uuid, numeric, boolean) from public, anon;
grant execute on function public.save_spa_therapist(uuid, uuid, text, text, uuid[], jsonb, text, uuid, numeric, boolean) to authenticated;

-- Guests ------------------------------------------------------------------------------------------------

-- A guest profile: a walk-in or a non-member who books the spa. Left out of the members list and the
-- counts unless asked for.
alter table public.members add column is_guest boolean not null default false;

-- BEFORE UPDATE on members: a guest becomes a member only with members.create, and a member never
-- becomes a guest.
create function app.guard_member_guest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_guest is not distinct from old.is_guest or app.is_system_context() then
    return new;
  end if;
  if new.is_guest then
    raise exception using errcode = '42501', message = 'read_only_column',
      detail = 'A member is never made a guest';
  end if;
  if not app.has_permission('members.create') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Making a guest a member needs members.create';
  end if;
  return new;
end
$$;

revoke execute on function app.guard_member_guest() from public, anon, authenticated;

-- BEFORE triggers run in name order: check_writable, guard, guard_guest, ...
create trigger guard_guest before update of is_guest on public.members
  for each row execute function app.guard_member_guest();

-- Adds a guest (p_id made by the app): a name, gender and phone, in one of the staff member's
-- branches. permission_denied (spa.book); no_branch_access, branch_inactive (the members guard);
-- phone_in_use (look the person up first: they may be a member already); member_exists;
-- invalid_guest.
create function public.create_guest(
  p_id uuid,
  p_branch_id uuid,
  p_full_name text,
  p_gender text,
  p_phone text
)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.members;
  failed_constraint text;
begin
  if app.current_gym_id() is null or not app.has_permission('spa.book') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Adding a guest needs spa.book';
  end if;
  if p_phone is null then
    raise exception using errcode = '22023', message = 'invalid_guest',
      detail = 'A guest needs a name, a gender and a phone';
  end if;
  begin
    insert into public.members (id, gym_id, branch_id, full_name, gender, phone, is_guest)
    values (p_id, app.current_gym_id(), p_branch_id, p_full_name, p_gender, p_phone, true)
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
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_guest',
        detail = 'A guest needs a name, a gender and a phone';
  end;
  return created;
end
$$;

revoke execute on function public.create_guest(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_guest(uuid, uuid, text, text, text) to authenticated;

-- Makes a guest a full member (their bookings, invoices and payments stay theirs). Needs
-- members.create and members.edit (the members guard). Nothing changes for a member.
-- permission_denied; member_not_found.
create function public.make_guest_member(p_member_id uuid)
returns public.members
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved public.members;
begin
  if not (app.has_permission('members.create') and app.has_permission('members.edit')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Making a guest a member needs members.create and members.edit';
  end if;
  update public.members m set is_guest = false where m.id = p_member_id and m.is_guest
  returning * into saved;
  if saved.id is null then
    select * into saved from public.members m where m.id = p_member_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'member_not_found',
        detail = 'No member with this id that you may see';
    end if;
  end if;
  return saved;
end
$$;

revoke execute on function public.make_guest_member(uuid) from public, anon;
grant execute on function public.make_guest_member(uuid) to authenticated;

-- The seller's member counts leave guests out.
create or replace function public.seller_member_counts(p_gym_id uuid default null)
returns table (gym_id uuid, members integer, active_members integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select g.id,
           (count(m.id) filter (where m.status <> 'archived'))::integer,
           (count(m.id) filter (where m.status = 'active'))::integer
      from public.gyms g
      left join public.members m on m.gym_id = g.id and m.deleted_at is null and not m.is_guest
     where p_gym_id is null or g.id = p_gym_id
     group by g.id;
end
$$;
