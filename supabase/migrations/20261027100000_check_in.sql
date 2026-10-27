-- Check-in (Phase 4, step 4a; spec §2 "Check-in rules" and the Phase 4 plan in §8 of 2026-10-27).
-- Additions only, and four functions replaced with the same signatures: visits are now counted
-- (app.subscription_used_visits), so a visits plan with none left is no longer running
-- (public.membership, public.membership_ends_on) and can't be transferred
-- (public.transfer_subscription).
--
--   * public.check_in() decides in one transaction whether a member may come in, by card or picked
--     by hand, and stores the visit when they may. The member's row is locked while it decides, so
--     two scans at once never use one visit twice. The result is allowed, warning (allowed, with
--     notes), already (scanned again within the cooldown: nothing counted) or denied (a reason).
--   * Only visits are stored (attendance), never a refused try. A visit is never deleted: a mistake
--     is voided (attendance.void, a reason), which gives the visit back.
--   * checkin.override lets a refused member in anyway, with a note. Such a visit uses no
--     subscription, except one refused only for money owed.
--   * Settings, per gym or per branch: checkin.cooldown_minutes (60), checkin.visit_hours (3: how
--     long a visit counts as inside when nobody checks out), checkin.deny_for_debt (0: money owed
--     now is a warning; 1: it refuses entry when above checkin.debt_limit, in dinars, 0).

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
    else false
  end
$$;

-- A whole-number setting that applies in a branch of the acting staff member's gym: the branch's
-- own row, else the gym's, else p_default (like resolveSetting() in packages/core).
create function app.setting_integer(p_branch_id uuid, p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::integer from public.settings s
      where s.key = p_key and s.branch_id = p_branch_id and s.gym_id = app.current_gym_id()),
    (select (s.value #>> '{}')::integer from public.settings s
      where s.key = p_key and s.branch_id is null and s.gym_id = app.current_gym_id()),
    p_default
  )
$$;

revoke execute on function app.setting_integer(uuid, text, integer) from public, anon;
grant execute on function app.setting_integer(uuid, text, integer) to authenticated;

-- Visits ----------------------------------------------------------------------------------------------

create table public.attendance (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  member_id uuid not null,
  -- The subscription the visit used. Empty: let in anyway without one (override).
  subscription_id uuid,
  -- card: scanned; manual: picked by hand (checkin.manual).
  method text not null check (method in ('card', 'manual')),
  card_id uuid,
  device_id uuid,
  checked_in_at timestamptz not null default now(),
  -- Its day in Baghdad, for daily limits and lists.
  visit_date date not null generated always as ((checked_in_at at time zone 'Asia/Baghdad')::date) stored,
  checked_out_at timestamptz,
  checked_out_by uuid,
  -- Let in although refused (checkin.override): the reason it was refused for, and the staff note.
  override_reason text check (override_reason in (
    'NO_SUBSCRIPTION', 'NOT_STARTED', 'PLAN_EXPIRED', 'PLAN_FROZEN', 'NO_VISITS_LEFT', 'WRONG_BRANCH',
    'WRONG_DAY', 'WRONG_TIME', 'DAILY_LIMIT', 'DEBT'
  )),
  override_note text check (app.is_clean_text(override_note, 300)),
  -- A mistake (attendance.void): it counts for nothing, and its visit is given back.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (app.is_clean_text(void_reason, 300)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: visits are never deleted.
  deleted_at timestamptz,
  constraint attendance_id_gym_id_key unique (id, gym_id),
  constraint attendance_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint attendance_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint attendance_subscription_id_gym_id_fkey foreign key (subscription_id, gym_id)
    references public.subscriptions (id, gym_id),
  constraint attendance_card_id_gym_id_fkey foreign key (card_id, gym_id) references public.nfc_cards (id, gym_id),
  constraint attendance_device_id_gym_id_fkey foreign key (device_id, gym_id) references public.devices (id, gym_id),
  constraint attendance_card check ((method = 'card') = (card_id is not null)),
  constraint attendance_override check (
    (override_reason is null) = (override_note is null) and (subscription_id is not null or override_reason is not null)
    and (subscription_id is null or override_reason is null or override_reason = 'DEBT')
  ),
  constraint attendance_checked_out check (
    (checked_out_at is null) = (checked_out_by is null) and (checked_out_at is null or checked_out_at >= checked_in_at)
  ),
  constraint attendance_voided check ((voided_at is null) = (void_reason is null)),
  constraint attendance_never_deleted check (deleted_at is null)
);

-- A member's visits, a branch's day, a subscription's visits per day, and the foreign keys.
create index attendance_member_id_gym_id_idx on public.attendance (member_id, gym_id, checked_in_at desc);
create index attendance_branch_id_gym_id_idx on public.attendance (branch_id, gym_id, checked_in_at desc);
create index attendance_subscription_id_gym_id_idx on public.attendance (subscription_id, gym_id, visit_date);
create index attendance_card_id_gym_id_idx on public.attendance (card_id, gym_id);
create index attendance_device_id_gym_id_idx on public.attendance (device_id, gym_id);

create trigger check_writable before insert or update or delete on public.attendance
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.attendance
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_id', 'subscription_id', 'method', 'card_id', 'device_id',
    'checked_in_at', 'override_reason', 'override_note', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.attendance
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.attendance
  for each row execute function app.audit_row();

alter table public.attendance enable row level security;
revoke all on table public.attendance from anon, authenticated;
grant all on table public.attendance to service_role;
-- Staff only read visits; the functions below write them.
grant select on table public.attendance to authenticated;

create policy "staff with attendance.view see visits" on public.attendance
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('attendance.view')));

-- Visits used so far (voided ones are given back). Replaces the zero of step 3f.
create or replace function app.subscription_used_visits(p_subscription_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_subscription_id is null then null else (
    select count(*)::integer from public.attendance a
     where a.subscription_id = p_subscription_id and a.voided_at is null
  ) end
$$;

-- For computed fields read as the caller: only their own gym's subscriptions count.
grant execute on function app.subscription_used_visits(uuid) to authenticated;

-- Visits a subscription used (PostgREST: select=used_visits on subscriptions). Empty without a visit
-- count.
create function public.used_visits(p_subscription public.subscriptions)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select case when p_subscription.visit_count is null then null
              when p_subscription.gym_id <> (select app.current_gym_id()) then null
              else app.subscription_used_visits(p_subscription.id) end
$$;

revoke execute on function public.used_visits(public.subscriptions) from public, anon;
grant execute on function public.used_visits(public.subscriptions) to authenticated;

-- Whether a visit still counts as inside: not voided or checked out, and within the branch's
-- checkin.visit_hours (PostgREST: select=inside, and inside=is.true as a filter).
create function public.inside(p_visit public.attendance)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_visit.voided_at is null and p_visit.checked_out_at is null
     and p_visit.checked_in_at > now() - make_interval(hours => app.setting_integer(p_visit.branch_id, 'checkin.visit_hours', 3))
$$;

revoke execute on function public.inside(public.attendance) from public, anon;
grant execute on function public.inside(public.attendance) to authenticated;

-- How many members are inside a branch now (staff with attendance.view; 0 for others).
create function public.branch_occupancy(p_branch_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer from public.attendance a
   where a.branch_id = p_branch_id and a.voided_at is null and a.checked_out_at is null
     and a.checked_in_at > now() - interval '24 hours' and public.inside(a)
$$;

revoke execute on function public.branch_occupancy(uuid) from public, anon;
grant execute on function public.branch_occupancy(uuid) to authenticated;

-- The rules ------------------------------------------------------------------------------------------

-- Why a subscription can't be used for a visit in p_branch_id at p_at, in the order the checks run
-- (app.checkin_steps()), or null when it can.
create function app.checkin_steps()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array['PLAN_EXPIRED', 'NOT_STARTED', 'PLAN_FROZEN', 'NO_VISITS_LEFT', 'WRONG_BRANCH', 'WRONG_DAY',
               'WRONG_TIME', 'DAILY_LIMIT']
$$;

create function app.checkin_refusal(p_subscription public.subscriptions, p_branch_id uuid, p_at timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  local_time timestamp := p_at at time zone 'Asia/Baghdad';
  today date := local_time::date;
  daily_limit integer;
begin
  if p_subscription.end_date is not null and p_subscription.end_date < today then
    return 'PLAN_EXPIRED';
  end if;
  if p_subscription.start_date > today then
    return 'NOT_STARTED';
  end if;
  if app.is_frozen(p_subscription.id, today) then
    return 'PLAN_FROZEN';
  end if;
  if p_subscription.visit_count is not null
     and app.subscription_used_visits(p_subscription.id) >= p_subscription.visit_count then
    return 'NO_VISITS_LEFT';
  end if;
  if p_subscription.branch_ids is not null and not p_branch_id = any (p_subscription.branch_ids) then
    return 'WRONG_BRANCH';
  end if;
  if p_subscription.allowed_days is not null
     and not extract(isodow from local_time)::smallint = any (p_subscription.allowed_days) then
    return 'WRONG_DAY';
  end if;
  if p_subscription.allowed_from is not null
     and not (local_time::time >= p_subscription.allowed_from and local_time::time < p_subscription.allowed_until) then
    return 'WRONG_TIME';
  end if;
  -- Visits plans: one visit a day unless the plan says otherwise.
  daily_limit := coalesce(p_subscription.daily_visit_limit,
                          case when p_subscription.visit_count is not null then 1 end);
  if daily_limit is not null and (
    select count(*) from public.attendance a
     where a.subscription_id = p_subscription.id and a.visit_date = today and a.voided_at is null
  ) >= daily_limit then
    return 'DAILY_LIMIT';
  end if;
  return null;
end
$$;

revoke execute on function app.checkin_refusal(public.subscriptions, uuid, timestamptz) from public, anon, authenticated;

-- What the screen shows of a subscription.
create function app.checkin_subscription(p_subscription public.subscriptions, p_today date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_subscription.id is null then null else jsonb_build_object(
    'id', p_subscription.id,
    'name_ckb', p_subscription.name_ckb,
    'name_en', p_subscription.name_en,
    'name_ar', p_subscription.name_ar,
    'kind', p_subscription.kind,
    'start_date', p_subscription.start_date,
    'end_date', p_subscription.end_date,
    'visit_count', p_subscription.visit_count,
    'visits_left', case when p_subscription.visit_count is not null
      then greatest(0, p_subscription.visit_count - app.subscription_used_visits(p_subscription.id)) end,
    'allowed_days', p_subscription.allowed_days,
    'allowed_from', p_subscription.allowed_from,
    'allowed_until', p_subscription.allowed_until,
    'daily_visit_limit', p_subscription.daily_visit_limit,
    -- The last frozen day, while frozen.
    'frozen_until', (
      select coalesce(f.ended_on - 1, f.end_date) from public.subscription_freezes f
       where f.subscription_id = p_subscription.id
         and f.start_date <= p_today and p_today < coalesce(f.ended_on, f.end_date + 1)
       limit 1
    )
  ) end
$$;

revoke execute on function app.checkin_subscription(public.subscriptions, date) from public, anon, authenticated;

-- Check-in ----------------------------------------------------------------------------------------------

-- Lets a member in, or says why not. By card (p_card_uid, as the reader gives it; checkin.perform) or
-- picked by hand (p_member_id; checkin.manual), in p_branch_id. p_id is the visit's id: the same id
-- again returns the visit already stored. p_override_note lets a refused member in anyway
-- (checkin.override).
--
-- Returns {result, reason, warnings, attendance_id, checked_in_at, previous_at, card_status,
-- member, subscription, owed_now}:
--   * allowed / warning: the visit is stored; warnings are ENDS_SOON (3 days or fewer left),
--     FEW_VISITS (2 or fewer left after this one), DEBT (money owed now), BIRTHDAY; overridden says
--     which refusal was passed over.
--   * already: in again within checkin.cooldown_minutes of their last visit (previous_at); nothing
--     is counted.
--   * denied: reason is CARD_INVALID (no such card in this gym), CARD_BLOCKED (card_status stolen or
--     blocked), MEMBER_NOT_ACTIVE (member.status), NO_SUBSCRIPTION, or the closest subscription's
--     reason (app.checkin_steps()), or DEBT.
-- Errors: permission_denied; no_branch_access, branch_inactive; member_not_found; invalid_request;
-- device_not_found; gym_read_only.
create function public.check_in(
  p_id uuid,
  p_branch_id uuid,
  p_card_uid text default null,
  p_member_id uuid default null,
  p_device_id uuid default null,
  p_override_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz := now();
  today date := (now() at time zone 'Asia/Baghdad')::date;
  gym uuid := app.current_gym_id();
  existing public.attendance;
  card public.nfc_cards;
  member public.members;
  member_json jsonb;
  previous public.attendance;
  chosen public.subscriptions;
  closest public.subscriptions;
  refusal text;
  owed numeric;
  warnings jsonb := '[]'::jsonb;
  scanned_uid text;
  visit_id uuid;
begin
  if p_id is null or p_branch_id is null or (p_card_uid is null) = (p_member_id is null) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A visit id, a branch, and a card or a member';
  end if;
  if not app.has_permission(case when p_card_uid is null then 'checkin.manual' else 'checkin.perform' end) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Check-in needs checkin.perform (card) or checkin.manual (by hand)';
  end if;
  if p_override_note is not null and not app.has_permission('checkin.override') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Letting a refused member in needs checkin.override';
  end if;
  if p_override_note is not null and not app.is_clean_text(p_override_note, 300) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A note has 1 to 300 characters';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Members are checked in only in your own branches';
  end if;
  if not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'branch_inactive',
      detail = 'This branch is deactivated';
  end if;
  if p_device_id is not null
     and not exists (select 1 from public.devices d where d.id = p_device_id and d.gym_id = gym) then
    raise exception using errcode = 'P0002', message = 'device_not_found',
      detail = 'No device with this id in your gym';
  end if;

  -- The same visit again (a retry after a lost answer).
  select * into existing from public.attendance a where a.id = p_id;
  if found then
    if existing.gym_id <> gym then
      raise exception using errcode = '23505', message = 'visit_exists',
        detail = 'Another visit has this id';
    end if;
    select * into member from public.members m where m.id = existing.member_id;
    select * into chosen from public.subscriptions s where s.id = existing.subscription_id;
    return jsonb_build_object('result', 'allowed', 'reason', null, 'warnings', '[]'::jsonb,
      'attendance_id', existing.id, 'checked_in_at', existing.checked_in_at, 'previous_at', null,
      'card_status', null, 'overridden', existing.override_reason,
      'member', jsonb_build_object('id', member.id, 'full_name', member.full_name,
        'member_number', member.member_number, 'gender', member.gender, 'status', member.status,
        'photo_updated_at', member.photo_updated_at),
      'subscription', app.checkin_subscription(chosen, today), 'owed_now', null);
  end if;

  -- Who it is.
  if p_card_uid is not null then
    scanned_uid := app.normalize_card_uid(p_card_uid);
    select * into card from public.nfc_cards c
     where c.gym_id = gym and c.uid = scanned_uid and c.status in ('active', 'blocked');
    if scanned_uid is null or not found then
      return jsonb_build_object('result', 'denied', 'reason', 'CARD_INVALID', 'warnings', '[]'::jsonb,
        'attendance_id', null, 'checked_in_at', null, 'previous_at', null, 'card_status', null,
        'overridden', null, 'member', null, 'subscription', null, 'owed_now', null);
    end if;
    p_member_id := card.member_id;
  end if;
  -- Locked until the visit is stored: two scans at once wait for each other.
  select * into member from public.members m
   where m.id = p_member_id and m.gym_id = gym and m.deleted_at is null
     for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  member_json := jsonb_build_object('id', member.id, 'full_name', member.full_name,
    'member_number', member.member_number, 'gender', member.gender, 'status', member.status,
    'photo_updated_at', member.photo_updated_at);
  select coalesce(sum(d.owed_now), 0) into owed from public.member_debts d
   where d.member_id = member.id and d.gym_id = gym;

  if card.status = 'blocked' then
    return jsonb_build_object('result', 'denied', 'reason', 'CARD_BLOCKED', 'warnings', '[]'::jsonb,
      'attendance_id', null, 'checked_in_at', null, 'previous_at', null,
      'card_status', case when card.end_reason = 'stolen' then 'stolen' else 'blocked' end,
      'overridden', null, 'member', member_json, 'subscription', null, 'owed_now', owed);
  end if;
  if member.status <> 'active' then
    return jsonb_build_object('result', 'denied', 'reason', 'MEMBER_NOT_ACTIVE', 'warnings', '[]'::jsonb,
      'attendance_id', null, 'checked_in_at', null, 'previous_at', null, 'card_status', null,
      'overridden', null, 'member', member_json, 'subscription', null, 'owed_now', owed);
  end if;

  -- Scanned again soon after coming in: nothing more is counted.
  select * into previous from public.attendance a
   where a.member_id = member.id and a.gym_id = gym and a.voided_at is null
   order by a.checked_in_at desc
   limit 1;
  if found and previous.checked_in_at
       > checked_at - make_interval(mins => app.setting_integer(p_branch_id, 'checkin.cooldown_minutes', 60)) then
    select * into chosen from public.subscriptions s where s.id = previous.subscription_id;
    return jsonb_build_object('result', 'already', 'reason', 'ALREADY_CHECKED_IN', 'warnings', '[]'::jsonb,
      'attendance_id', previous.id, 'checked_in_at', null, 'previous_at', previous.checked_in_at,
      'card_status', null, 'overridden', null, 'member', member_json,
      'subscription', app.checkin_subscription(chosen, today), 'owed_now', owed);
  end if;

  -- The subscription that ends first of those that may be used now; else the one that came closest.
  select s.* into chosen from public.subscriptions s
   where s.member_id = member.id and s.gym_id = gym and s.status = 'active'
     and app.checkin_refusal(s, p_branch_id, checked_at) is null
   order by s.end_date nulls last, s.start_date, s.id
   limit 1;
  if not found then
    select s.* into closest from public.subscriptions s
     where s.member_id = member.id and s.gym_id = gym and s.status = 'active'
     order by array_position(app.checkin_steps(), app.checkin_refusal(s, p_branch_id, checked_at)) desc,
              s.end_date desc nulls first, s.id
     limit 1;
    refusal := case when found then app.checkin_refusal(closest, p_branch_id, checked_at) else 'NO_SUBSCRIPTION' end;
  elsif owed > 0 and app.setting_integer(p_branch_id, 'checkin.deny_for_debt', 0) = 1
        and owed > app.setting_integer(p_branch_id, 'checkin.debt_limit', 0) then
    refusal := 'DEBT';
    closest := chosen;
  end if;

  if refusal is not null and p_override_note is null then
    return jsonb_build_object('result', 'denied', 'reason', refusal, 'warnings', '[]'::jsonb,
      'attendance_id', null, 'checked_in_at', null, 'previous_at', null, 'card_status', null,
      'overridden', null, 'member', member_json,
      'subscription', app.checkin_subscription(closest, today), 'owed_now', owed);
  end if;

  if chosen.id is not null then
    if chosen.end_date is not null and chosen.end_date - today <= 3 then
      warnings := warnings || '"ENDS_SOON"'::jsonb;
    end if;
    if chosen.visit_count is not null
       and chosen.visit_count - app.subscription_used_visits(chosen.id) - 1 <= 2 then
      warnings := warnings || '"FEW_VISITS"'::jsonb;
    end if;
  end if;
  if owed > 0 then
    warnings := warnings || '"DEBT"'::jsonb;
  end if;
  if member.birth_date is not null and to_char(member.birth_date, 'MM-DD') = to_char(today, 'MM-DD') then
    warnings := warnings || '"BIRTHDAY"'::jsonb;
  end if;

  visit_id := p_id;
  insert into public.attendance (
    id, gym_id, branch_id, member_id, subscription_id, method, card_id, device_id, checked_in_at,
    override_reason, override_note
  )
  values (
    visit_id, gym, p_branch_id, member.id, chosen.id,
    case when p_card_uid is null then 'manual' else 'card' end, card.id, p_device_id, checked_at,
    refusal, case when refusal is not null then p_override_note end
  );
  return jsonb_build_object(
    'result', case when jsonb_array_length(warnings) > 0 then 'warning' else 'allowed' end,
    'reason', null, 'warnings', warnings, 'attendance_id', visit_id, 'checked_in_at', checked_at,
    'previous_at', null, 'card_status', null, 'overridden', refusal, 'member', member_json,
    'subscription', app.checkin_subscription(case when chosen.id is not null then chosen else closest end, today),
    'owed_now', owed);
end
$$;

revoke execute on function public.check_in(uuid, uuid, text, uuid, uuid, text) from public, anon;
grant execute on function public.check_in(uuid, uuid, text, uuid, uuid, text) to authenticated;

-- The visit the acting staff member works on: of their gym, in one of their branches.
-- visit_not_found otherwise.
create function app.visible_visit(p_attendance_id uuid)
returns public.attendance
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  visit public.attendance;
begin
  select * into visit from public.attendance a
   where a.id = p_attendance_id and a.gym_id = app.current_gym_id();
  if not found or not app.has_branch_access(visit.branch_id) then
    raise exception using errcode = 'P0002', message = 'visit_not_found',
      detail = 'No visit with this id in your branches';
  end if;
  return visit;
end
$$;

revoke execute on function app.visible_visit(uuid) from public, anon, authenticated;

-- The member left (checkin.perform). Checking out again changes nothing. permission_denied;
-- visit_not_found; visit_voided.
create function public.check_out(p_attendance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  visit public.attendance;
begin
  if not app.has_permission('checkin.perform') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Checking out needs checkin.perform';
  end if;
  visit := app.visible_visit(p_attendance_id);
  if visit.voided_at is not null then
    raise exception using errcode = '23514', message = 'visit_voided',
      detail = 'This visit was voided';
  end if;
  if visit.checked_out_at is null then
    update public.attendance a set checked_out_at = greatest(now(), a.checked_in_at), checked_out_by = auth.uid()
     where a.id = visit.id
    returning * into visit;
  end if;
  return jsonb_build_object('attendance_id', visit.id, 'checked_out_at', visit.checked_out_at);
end
$$;

revoke execute on function public.check_out(uuid) from public, anon;
grant execute on function public.check_out(uuid) to authenticated;

-- A visit was a mistake (attendance.void, a reason): it counts for nothing and its visit is given
-- back. permission_denied; visit_not_found; reason_required; already_voided.
create function public.void_visit(p_attendance_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  visit public.attendance;
begin
  if not app.has_permission('attendance.void') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Voiding a visit needs attendance.void';
  end if;
  visit := app.visible_visit(p_attendance_id);
  if p_reason is null or not app.is_clean_text(p_reason, 300) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'Voiding a visit needs a reason';
  end if;
  if visit.voided_at is not null then
    raise exception using errcode = '23514', message = 'already_voided',
      detail = 'This visit was voided already';
  end if;
  update public.attendance a set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where a.id = visit.id;
  return jsonb_build_object('attendance_id', visit.id);
end
$$;

revoke execute on function public.void_visit(uuid, text) from public, anon;
grant execute on function public.void_visit(uuid, text) to authenticated;

-- Memberships: a visits plan with no visits left no longer runs -----------------------------------------

create or replace function public.membership(p_member public.members)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  with today as (select (now() at time zone 'Asia/Baghdad')::date as d),
  sold as (
    select s.id, s.start_date,
           s.status = 'active' and (s.end_date is null or s.end_date >= t.d)
             and (s.visit_count is null or app.subscription_used_visits(s.id) < s.visit_count) as running,
           s.start_date <= t.d as started,
           exists (
             select 1 from public.subscription_freezes f
              where f.subscription_id = s.id and f.gym_id = s.gym_id
                and f.start_date <= t.d and t.d < coalesce(f.ended_on, f.end_date + 1)
           ) as frozen
      from public.subscriptions s, today t
     where s.member_id = p_member.id and s.gym_id = p_member.gym_id and s.status <> 'voided'
  )
  select case
    when bool_or(running and started and frozen) then 'frozen'
    when bool_or(running and started) then 'current'
    when bool_or(running) then 'upcoming'
    when count(*) > 0 then 'expired'
    else 'none'
  end
  from sold
$$;

create or replace function public.membership_ends_on(p_member public.members)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select case when bool_or(s.end_date is null) then null else max(s.end_date) end
    from public.subscriptions s
   where s.member_id = p_member.id and s.gym_id = p_member.gym_id and s.status = 'active'
     and (s.end_date is null or s.end_date >= (now() at time zone 'Asia/Baghdad')::date)
     and (s.visit_count is null or app.subscription_used_visits(s.id) < s.visit_count)
$$;

-- Transferring: a visits plan with no visits left has nothing to give (no_visits_left); otherwise
-- as in step 3f.
create or replace function public.transfer_subscription(
  p_subscription_id uuid,
  p_new_subscription_id uuid,
  p_member_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  old public.subscriptions;
  existing public.subscriptions;
  member public.members;
  used_freeze integer;
begin
  if not app.has_permission('subscriptions.transfer') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Transferring needs subscriptions.transfer';
  end if;
  old := app.visible_subscription(p_subscription_id);
  select * into existing from public.subscriptions s where s.id = p_new_subscription_id;
  if found then
    if existing.transferred_from_id is distinct from old.id then
      raise exception using errcode = '23505', message = 'sale_exists',
        detail = 'Another subscription has this id';
    end if;
    return jsonb_build_object('subscription_id', existing.id, 'start_date', existing.start_date,
      'end_date', existing.end_date);
  end if;
  if old.status <> 'active' then
    raise exception using errcode = '23514', message = 'subscription_not_active',
      detail = format('The subscription is %s', old.status);
  end if;
  if old.end_date < today then
    raise exception using errcode = '23514', message = 'subscription_ended',
      detail = 'The subscription has ended';
  end if;
  if app.is_frozen(old.id, today) then
    raise exception using errcode = '23514', message = 'subscription_frozen',
      detail = 'Unfreeze it first';
  end if;
  if old.visit_count is not null and app.subscription_used_visits(old.id) >= old.visit_count then
    raise exception using errcode = '23514', message = 'no_visits_left',
      detail = 'All its visits are used';
  end if;
  select * into member from public.members m
   where m.id = p_member_id and m.gym_id = old.gym_id and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member.status <> 'active' then
    raise exception using errcode = '42501', message = 'member_not_active',
      detail = format('The member is %s', member.status);
  end if;
  if member.id = old.member_id then
    raise exception using errcode = '23514', message = 'same_member',
      detail = 'The subscription is this member''s already';
  end if;
  if old.gender <> 'any' and old.gender <> member.gender then
    raise exception using errcode = '23514', message = 'plan_gender_mismatch',
      detail = format('This plan is for %s members', old.gender);
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 500) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'A transfer needs a reason';
  end if;
  used_freeze := coalesce((select sum(app.frozen_days(f, null)) from public.subscription_freezes f
                            where f.subscription_id = old.id), 0);

  update public.subscriptions s
     set status = 'transferred', status_reason = p_reason, status_changed_at = now(), status_changed_by = auth.uid()
   where s.id = old.id;
  insert into public.subscriptions (
    id, gym_id, member_id, plan_id, branch_id, name_ckb, name_en, name_ar, kind, duration_unit,
    duration_count, visit_count, price, gender, branch_ids, allowed_days, allowed_from, allowed_until,
    daily_visit_limit, max_freeze_days, start_date, end_date, transferred_from_id
  )
  values (
    p_new_subscription_id, old.gym_id, member.id, old.plan_id, old.branch_id, old.name_ckb, old.name_en,
    old.name_ar, old.kind, old.duration_unit, old.duration_count,
    case when old.visit_count is null then null
         else old.visit_count - app.subscription_used_visits(old.id) end,
    old.price, old.gender, old.branch_ids, old.allowed_days, old.allowed_from, old.allowed_until,
    old.daily_visit_limit, greatest(0, old.max_freeze_days - used_freeze),
    greatest(today, old.start_date), old.end_date, old.id
  );
  return jsonb_build_object('subscription_id', p_new_subscription_id, 'start_date', greatest(today, old.start_date),
    'end_date', old.end_date);
end
$$;
