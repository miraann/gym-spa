-- Plans (Phase 3, step 3b; spec §4.2, the Phase 3 plan of 2026-10-24). Additions only.
--
--   * A plan is what the gym sells. Its kind is one of the four combinations of an end date and a
--     visit count: time (a duration in days or months), visits (a number of visits, no end date),
--     hybrid (both: e.g. 20 visits within 2 months) and unlimited (neither: VIP or lifetime).
--   * Its rules: gender (anyone, men or women), the branches it works in (all of them, or the
--     rows in plan_branches), the days of the week and one time window a day (Baghdad time), the
--     most visits per day, and the most freeze days (0: it can't be frozen). The check-in engine
--     (Phase 4) applies them; selling (step 3c) copies them onto the subscription, so changing a
--     plan never changes what was already sold.
--   * Prices are whole dinars (IQD).
--   * Everyone in the gym sees the plans (they are needed to sell). plans.manage adds and changes
--     them, with access to every branch the plan works in (all branches: access to all of them).
--     Plans are never deleted: one that isn't sold any more is made inactive. A read-only gym
--     changes no plans.

-- Plans -------------------------------------------------------------------------------------------

-- ISO days of the week (1 Monday … 7 Sunday), each once and in order, at least one and not all
-- seven (every day is no list at all).
create function app.is_valid_weekdays(days smallint[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select days is null or (
    cardinality(days) between 1 and 6
    and array_position(days, null) is null
    and days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and days = (select array_agg(distinct d order by d) from unnest(days) as u (d))
  )
$$;

-- The last day of a plan that starts on p_start (planEndDate() in packages/core; a test runs the
-- same cases through both). In months: the day before the same date n months later, or that
-- month's last day when it has no such date (from 31 Mar: 30 Apr; from 31 Jan: 28 Feb), so nobody
-- gets less than the months they paid for. In days: n - 1 days after the start, so a 1-day plan
-- ends the day it starts.
create function app.plan_end_date(p_start date, p_unit text, p_count integer)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_unit
    when 'month' then
      case
        -- Postgres moves a missing date to the month's last day: that is the end itself.
        when extract(day from p_start + make_interval(months => p_count)) < extract(day from p_start)
          then (p_start + make_interval(months => p_count))::date
        else (p_start + make_interval(months => p_count))::date - 1
      end
    when 'day' then p_start + p_count - 1
  end
$$;

create table public.plans (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  kind text not null check (kind in ('time', 'visits', 'hybrid', 'unlimited')),
  -- time and hybrid: the duration (app.plan_end_date: 1 month from 24 Oct ends 23 Nov).
  duration_unit text check (duration_unit in ('day', 'month')),
  duration_count integer,
  -- visits and hybrid: how many visits.
  visit_count integer check (visit_count between 1 and 1000),
  -- Whole dinars.
  price numeric(14,2) not null check (price >= 0 and price <= 1000000000 and price = trunc(price)),
  gender text not null default 'any' check (gender in ('any', 'male', 'female')),
  -- false: only the branches in plan_branches.
  all_branches boolean not null default true,
  -- Empty: every day.
  allowed_days smallint[] check (app.is_valid_weekdays(allowed_days)),
  -- Both empty: all day. One window a day, not past midnight.
  allowed_from time,
  allowed_until time,
  -- Empty: no limit (the check-in engine uses 1 for visit and hybrid plans).
  daily_visit_limit smallint check (daily_visit_limit between 1 and 10),
  max_freeze_days integer not null default 0 check (max_freeze_days between 0 and 365),
  -- false: no longer sold; what was sold keeps working.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: plans are never deleted. Here for the shape every table has.
  deleted_at timestamptz,
  constraint plans_id_gym_id_key unique (id, gym_id),
  constraint plans_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint plans_duration check (
    (kind in ('time', 'hybrid')) = (duration_count is not null)
    and (duration_unit is null) = (duration_count is null)
    and (duration_unit is distinct from 'month' or duration_count between 1 and 120)
    and (duration_unit is distinct from 'day' or duration_count between 1 and 3660)
  ),
  constraint plans_visits check ((kind in ('visits', 'hybrid')) = (visit_count is not null)),
  constraint plans_window check (
    (allowed_from is null) = (allowed_until is null)
    and (allowed_from is null or allowed_from < allowed_until)
  ),
  -- Freezing moves the end date: a plan without one can't be frozen.
  constraint plans_freeze check (max_freeze_days = 0 or duration_count is not null),
  constraint plans_never_deleted check (deleted_at is null)
);

create index plans_gym_id_idx on public.plans (gym_id);

-- The branches a plan works in, when it doesn't work in all of them.
create table public.plan_branches (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  plan_id uuid not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint plan_branches_plan_id_branch_id_key unique (plan_id, branch_id),
  constraint plan_branches_plan_id_gym_id_fkey foreign key (plan_id, gym_id) references public.plans (id, gym_id),
  constraint plan_branches_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id)
);

create index plan_branches_plan_id_gym_id_idx on public.plan_branches (plan_id, gym_id);
create index plan_branches_branch_id_gym_id_idx on public.plan_branches (branch_id, gym_id);

-- Guards ------------------------------------------------------------------------------------------

-- Whether the acting staff member reaches every branch the plan works in.
create function app.can_manage_plan(p_plan_id uuid, p_all_branches boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_permission('plans.manage')
    and case
      when p_all_branches then app.has_all_branches()
      else not exists (
        select 1 from public.plan_branches pb
         where pb.plan_id = p_plan_id and pb.gym_id = app.current_gym_id()
           and not app.has_branch_access(pb.branch_id)
      )
    end
$$;

revoke execute on function app.can_manage_plan(uuid, boolean) from public, anon;
grant execute on function app.can_manage_plan(uuid, boolean) to authenticated;

-- BEFORE INSERT OR UPDATE on plans: plans.manage, and access to every branch the plan works in,
-- before the change and after it (no_branch_access).
create function app.guard_plans()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return new;
  end if;
  if not app.has_permission('plans.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing plans needs plans.manage';
  end if;
  if not app.can_manage_plan(new.id, new.all_branches)
     or (tg_op = 'UPDATE' and not app.can_manage_plan(old.id, old.all_branches)) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Changing a plan needs access to every branch it works in';
  end if;
  return new;
end
$$;

-- BEFORE INSERT OR DELETE on plan_branches: plans.manage and access to the branch; only a plan
-- limited to some branches has rows (plan_all_branches).
create function app.guard_plan_branches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed public.plan_branches := case when tg_op = 'DELETE' then old else new end;
begin
  if app.is_system_context() then
    return changed;
  end if;
  if not app.has_permission('plans.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing plans needs plans.manage';
  end if;
  if not app.has_branch_access(changed.branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Changing a plan''s branches needs access to them';
  end if;
  if tg_op = 'INSERT' and exists (
    select 1 from public.plans p where p.id = new.plan_id and p.gym_id = new.gym_id and p.all_branches
  ) then
    raise exception using errcode = '23514', message = 'plan_all_branches',
      detail = 'A plan for all branches lists none';
  end if;
  return changed;
end
$$;

-- BEFORE triggers run in name order: check_writable, guard, read_only, stamp.
create trigger check_writable before insert or update or delete on public.plans
  for each row execute function app.check_gym_writable();
create trigger guard before insert or update on public.plans
  for each row execute function app.guard_plans();
create trigger read_only before update on public.plans
  for each row execute function app.read_only_columns('id', 'gym_id');
create trigger stamp before insert or update on public.plans
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.plans
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.plan_branches
  for each row execute function app.check_gym_writable();
create trigger guard before insert or delete on public.plan_branches
  for each row execute function app.guard_plan_branches();
create trigger read_only before update on public.plan_branches
  for each row execute function app.read_only_columns('id', 'gym_id', 'plan_id', 'branch_id');
create trigger stamp before insert on public.plan_branches
  for each row execute function app.stamp_created();
create trigger audit after insert or update or delete on public.plan_branches
  for each row execute function app.audit_row();

-- Row level security ------------------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.plan_branches enable row level security;

revoke all on table public.plans from anon, authenticated;
revoke all on table public.plan_branches from anon, authenticated;
grant all on table public.plans to service_role;
grant all on table public.plan_branches to service_role;
-- Plans are never deleted; a plan's branch list is rows added and removed.
grant select, insert, update on table public.plans to authenticated;
grant select, insert, delete on table public.plan_branches to authenticated;

create policy "staff see their gym's plans" on public.plans
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

create policy "staff with plans.manage add plans" on public.plans
  for insert to authenticated
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('plans.manage')));

create policy "staff with plans.manage change plans" on public.plans
  for update to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('plans.manage')))
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('plans.manage')));

create policy "staff see their gym's plan branches" on public.plan_branches
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

create policy "staff with plans.manage add plan branches" on public.plan_branches
  for insert to authenticated
  with check (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('plans.manage'))
    and branch_id in (select app.accessible_branch_ids())
  );

create policy "staff with plans.manage remove plan branches" on public.plan_branches
  for delete to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('plans.manage'))
    and branch_id in (select app.accessible_branch_ids())
  );

-- RPCs --------------------------------------------------------------------------------------------

-- Adds a plan (p_id made by the app) or changes one, with its branches, all or nothing. p_branch_ids
-- empty (null): every branch; otherwise at least one (branch_required), each a branch of the gym.
-- As the caller: RLS, the guards and the audit log apply.
create function public.save_plan(
  p_id uuid,
  p_name_ckb text,
  p_kind text,
  p_price numeric,
  p_name_en text default null,
  p_name_ar text default null,
  p_duration_unit text default null,
  p_duration_count integer default null,
  p_visit_count integer default null,
  p_gender text default 'any',
  p_branch_ids uuid[] default null,
  p_allowed_days smallint[] default null,
  p_allowed_from time default null,
  p_allowed_until time default null,
  p_daily_visit_limit smallint default null,
  p_max_freeze_days integer default 0,
  p_is_active boolean default true
)
returns public.plans
language plpgsql
security invoker
set search_path = ''
as $$
declare
  all_branches constant boolean := p_branch_ids is null;
  saved public.plans;
begin
  if not app.has_permission('plans.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing plans needs plans.manage';
  end if;
  if not all_branches and (cardinality(p_branch_ids) = 0 or array_position(p_branch_ids, null) is not null) then
    raise exception using errcode = '23514', message = 'branch_required',
      detail = 'A plan for some branches lists at least one';
  end if;
  if not all_branches and exists (
    select 1 from unnest(p_branch_ids) as b (id)
     where not exists (select 1 from public.branches br where br.id = b.id and br.deleted_at is null)
  ) then
    raise exception using errcode = 'P0002', message = 'branch_not_found',
      detail = 'No such branch in your gym';
  end if;

  -- A list plan changed to all branches drops its list first, so the guard sees the old branches.
  if all_branches then
    delete from public.plan_branches pb where pb.plan_id = p_id;
  end if;

  insert into public.plans as p (
    id, name_ckb, name_en, name_ar, kind, duration_unit, duration_count, visit_count, price, gender,
    all_branches, allowed_days, allowed_from, allowed_until, daily_visit_limit, max_freeze_days, is_active
  )
  values (
    p_id, p_name_ckb, p_name_en, p_name_ar, p_kind, p_duration_unit, p_duration_count, p_visit_count,
    p_price, coalesce(p_gender, 'any'), all_branches, p_allowed_days, p_allowed_from, p_allowed_until,
    p_daily_visit_limit, coalesce(p_max_freeze_days, 0), coalesce(p_is_active, true)
  )
  on conflict (id) do update set
    name_ckb = excluded.name_ckb,
    name_en = excluded.name_en,
    name_ar = excluded.name_ar,
    kind = excluded.kind,
    duration_unit = excluded.duration_unit,
    duration_count = excluded.duration_count,
    visit_count = excluded.visit_count,
    price = excluded.price,
    gender = excluded.gender,
    all_branches = excluded.all_branches,
    allowed_days = excluded.allowed_days,
    allowed_from = excluded.allowed_from,
    allowed_until = excluded.allowed_until,
    daily_visit_limit = excluded.daily_visit_limit,
    max_freeze_days = excluded.max_freeze_days,
    is_active = excluded.is_active
  returning p.* into saved;
  -- Another gym's plan with this id: the upsert's update found no row it may change.
  if saved.id is null then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No plan with this id that you may change';
  end if;

  if not all_branches then
    delete from public.plan_branches pb
     where pb.plan_id = p_id and pb.branch_id <> all (p_branch_ids);
    insert into public.plan_branches (plan_id, branch_id)
    select p_id, b.id from unnest(p_branch_ids) as b (id)
    on conflict (plan_id, branch_id) do nothing;
  end if;
  return saved;
end
$$;

revoke execute on function public.save_plan(uuid, text, text, numeric, text, text, text, integer, integer, text, uuid[], smallint[], time, time, smallint, integer, boolean) from public, anon;
grant execute on function public.save_plan(uuid, text, text, numeric, text, text, text, integer, integer, text, uuid[], smallint[], time, time, smallint, integer, boolean) to authenticated;
