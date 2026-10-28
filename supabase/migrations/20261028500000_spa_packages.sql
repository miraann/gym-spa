-- Spa packages and the spa sessions plans include (Phase 6, step 6b; the Phase 6 plan in §8 of
-- 2026-10-28). Additions only.
--
--   * spa_packages: N sessions of one service for a price, valid for D days after selling or with no
--     limit; gym-wide, like services (spa.manage). Never deleted; made inactive.
--   * member_spa_packages: a package sold to a member, with its own copy of the terms, one invoice
--     (item kind spa) and an optional payment, in one function (spa.book and payments.create).
--     Voiding the invoice ends it.
--   * plan_spa_sessions: the sessions a plan includes per subscription (plans.manage), and
--     subscription_spa_sessions: their copy on each subscription, made by a trigger whichever way the
--     subscription is made, so changing the plan never changes what was sold.
--   * Sessions left are never stored: step 6c counts the bookings that use them.

-- Packages ------------------------------------------------------------------------------------------

create table public.spa_packages (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  service_id uuid not null,
  session_count integer not null check (session_count between 1 and 100),
  -- Whole dinars, for all the sessions.
  price numeric(14,2) not null check (price >= 0 and price <= 1000000000 and price = trunc(price)),
  -- Days it can be used after it is sold; empty: no limit.
  valid_days integer check (valid_days between 1 and 3650),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: packages are never deleted.
  deleted_at timestamptz,
  constraint spa_packages_id_gym_id_key unique (id, gym_id),
  constraint spa_packages_service_id_gym_id_fkey foreign key (service_id, gym_id)
    references public.spa_services (id, gym_id),
  constraint spa_packages_never_deleted check (deleted_at is null)
);

create index spa_packages_service_id_gym_id_idx on public.spa_packages (service_id, gym_id);

create table public.member_spa_packages (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  -- Where it was sold (the invoice's branch). It can be used in any branch.
  branch_id uuid not null,
  member_id uuid not null,
  package_id uuid not null,
  -- The package as it was sold.
  service_id uuid not null,
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  session_count integer not null check (session_count between 1 and 100),
  price numeric(14,2) not null check (price >= 0),
  -- Its first and last day (Baghdad); empty last day: no limit.
  starts_on date not null,
  expires_on date,
  invoice_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: sold packages are the history.
  deleted_at timestamptz,
  constraint member_spa_packages_id_gym_id_key unique (id, gym_id),
  constraint member_spa_packages_branch_id_gym_id_fkey foreign key (branch_id, gym_id)
    references public.branches (id, gym_id),
  constraint member_spa_packages_member_id_gym_id_fkey foreign key (member_id, gym_id)
    references public.members (id, gym_id),
  constraint member_spa_packages_package_id_gym_id_fkey foreign key (package_id, gym_id)
    references public.spa_packages (id, gym_id),
  constraint member_spa_packages_service_id_gym_id_fkey foreign key (service_id, gym_id)
    references public.spa_services (id, gym_id),
  constraint member_spa_packages_invoice_id_gym_id_fkey foreign key (invoice_id, gym_id)
    references public.invoices (id, gym_id),
  constraint member_spa_packages_dates check (expires_on is null or expires_on >= starts_on),
  constraint member_spa_packages_never_deleted check (deleted_at is null)
);

create index member_spa_packages_member_id_gym_id_idx on public.member_spa_packages (member_id, gym_id, starts_on desc);
create index member_spa_packages_branch_id_gym_id_idx on public.member_spa_packages (branch_id, gym_id);
create index member_spa_packages_package_id_gym_id_idx on public.member_spa_packages (package_id, gym_id);
create index member_spa_packages_service_id_gym_id_idx on public.member_spa_packages (service_id, gym_id);
create unique index member_spa_packages_invoice_id_gym_id_key on public.member_spa_packages (invoice_id, gym_id);

-- Sessions in plans -----------------------------------------------------------------------------------

create table public.plan_spa_sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  plan_id uuid not null,
  service_id uuid not null,
  session_count integer not null check (session_count between 1 and 100),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint plan_spa_sessions_plan_id_service_id_key unique (plan_id, service_id),
  constraint plan_spa_sessions_plan_id_gym_id_fkey foreign key (plan_id, gym_id) references public.plans (id, gym_id),
  constraint plan_spa_sessions_service_id_gym_id_fkey foreign key (service_id, gym_id)
    references public.spa_services (id, gym_id)
);

create index plan_spa_sessions_plan_id_gym_id_idx on public.plan_spa_sessions (plan_id, gym_id);
create index plan_spa_sessions_service_id_gym_id_idx on public.plan_spa_sessions (service_id, gym_id);

create table public.subscription_spa_sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  subscription_id uuid not null,
  service_id uuid not null,
  session_count integer not null check (session_count between 0 and 100),
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint subscription_spa_sessions_id_gym_id_key unique (id, gym_id),
  constraint subscription_spa_sessions_subscription_id_service_id_key unique (subscription_id, service_id),
  constraint subscription_spa_sessions_subscription_id_gym_id_fkey foreign key (subscription_id, gym_id)
    references public.subscriptions (id, gym_id),
  constraint subscription_spa_sessions_service_id_gym_id_fkey foreign key (service_id, gym_id)
    references public.spa_services (id, gym_id)
);

create index subscription_spa_sessions_subscription_id_gym_id_idx on public.subscription_spa_sessions (subscription_id, gym_id);
create index subscription_spa_sessions_service_id_gym_id_idx on public.subscription_spa_sessions (service_id, gym_id);

-- Triggers ------------------------------------------------------------------------------------------

create trigger check_writable before insert or update or delete on public.spa_packages
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.spa_packages
  for each row execute function app.read_only_columns('id', 'gym_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.spa_packages
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.spa_packages
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.member_spa_packages
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.member_spa_packages
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_id', 'package_id', 'service_id', 'name_ckb', 'name_en', 'name_ar',
    'session_count', 'price', 'starts_on', 'expires_on', 'invoice_id', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.member_spa_packages
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.member_spa_packages
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.plan_spa_sessions
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.plan_spa_sessions
  for each row execute function app.read_only_columns('id', 'gym_id', 'plan_id', 'service_id');
create trigger stamp before insert or update on public.plan_spa_sessions
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.plan_spa_sessions
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.subscription_spa_sessions
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.subscription_spa_sessions
  for each row execute function app.read_only_columns('id', 'gym_id', 'subscription_id', 'service_id', 'session_count');
create trigger stamp before insert on public.subscription_spa_sessions
  for each row execute function app.stamp_created();
create trigger audit after insert or update or delete on public.subscription_spa_sessions
  for each row execute function app.audit_row();

-- Row level security ----------------------------------------------------------------------------------

alter table public.spa_packages enable row level security;
alter table public.member_spa_packages enable row level security;
alter table public.plan_spa_sessions enable row level security;
alter table public.subscription_spa_sessions enable row level security;

revoke all on table public.spa_packages, public.member_spa_packages, public.plan_spa_sessions,
  public.subscription_spa_sessions from anon, authenticated;
grant all on table public.spa_packages, public.member_spa_packages, public.plan_spa_sessions,
  public.subscription_spa_sessions to service_role;
-- Only the functions below (and the trigger) write them.
grant select on table public.spa_packages, public.member_spa_packages, public.plan_spa_sessions,
  public.subscription_spa_sessions to authenticated;

-- What is sold: everyone in the gym, like plans and services.
create policy "staff see their gym's spa packages" on public.spa_packages
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

create policy "staff see the spa sessions their gym's plans include" on public.plan_spa_sessions
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

-- What a member has: like their subscriptions (members.view).
create policy "staff with members.view see members' spa packages" on public.member_spa_packages
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

create policy "staff with members.view see subscriptions' spa sessions" on public.subscription_spa_sessions
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

-- Copying a plan's sessions ---------------------------------------------------------------------------

-- AFTER INSERT on subscriptions: the plan's spa sessions as they are now, onto the subscription.
create function app.copy_plan_spa_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscription_spa_sessions (gym_id, subscription_id, service_id, session_count)
  select new.gym_id, new.id, p.service_id, p.session_count
    from public.plan_spa_sessions p
   where p.plan_id = new.plan_id and p.gym_id = new.gym_id;
  return null;
end
$$;

revoke execute on function app.copy_plan_spa_sessions() from public, anon, authenticated;

create trigger copy_spa_sessions after insert on public.subscriptions
  for each row execute function app.copy_plan_spa_sessions();

-- Saving --------------------------------------------------------------------------------------------------

-- Adds a package (p_id made by the app) or changes one; packages already sold keep their terms.
-- permission_denied (spa.manage, or another gym's id); spa_service_not_found; invalid_spa_package.
create function public.save_spa_package(
  p_id uuid,
  p_name_ckb text,
  p_service_id uuid,
  p_session_count integer,
  p_price numeric,
  p_name_en text default null,
  p_name_ar text default null,
  p_valid_days integer default null,
  p_is_active boolean default true
)
returns public.spa_packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  saved public.spa_packages;
begin
  perform app.require_spa_manager(null);
  if exists (select 1 from public.spa_packages p where p.id = p_id and p.gym_id <> gym) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No package with this id that you may change';
  end if;
  if not exists (select 1 from public.spa_services s where s.id = p_service_id and s.gym_id = gym) then
    raise exception using errcode = 'P0002', message = 'spa_service_not_found',
      detail = 'No such service in your gym';
  end if;
  begin
    insert into public.spa_packages as p (
      id, gym_id, name_ckb, name_en, name_ar, service_id, session_count, price, valid_days, is_active
    ) values (
      p_id, gym, p_name_ckb, p_name_en, p_name_ar, p_service_id, p_session_count, p_price, p_valid_days,
      coalesce(p_is_active, true)
    )
    on conflict (id) do update set
      name_ckb = excluded.name_ckb,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      service_id = excluded.service_id,
      session_count = excluded.session_count,
      price = excluded.price,
      valid_days = excluded.valid_days,
      is_active = excluded.is_active
    returning p.* into saved;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_spa_package',
        detail = 'A name, 1 to 100 sessions, a whole price and 1 to 3650 days or no limit';
  end;
  return saved;
end
$$;

revoke execute on function public.save_spa_package(uuid, text, uuid, integer, numeric, text, text, integer, boolean) from public, anon;
grant execute on function public.save_spa_package(uuid, text, uuid, integer, numeric, text, text, integer, boolean) to authenticated;

-- The spa sessions a plan includes per subscription, replaced as a whole: p_sessions is
-- [{"service_id": uuid, "count": 1-100}, ...], each service once ([] for none). Subscriptions already
-- sold keep theirs. permission_denied (plans.manage); plan_not_found; no_branch_access (a branch the
-- plan works in that the staff member doesn't reach); spa_service_not_found; invalid_spa_sessions.
create function public.set_plan_spa_sessions(p_plan_id uuid, p_sessions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  plan public.plans;
begin
  if gym is null or not app.has_permission('plans.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing plans needs plans.manage';
  end if;
  select * into plan from public.plans p where p.id = p_plan_id and p.gym_id = gym for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'plan_not_found',
      detail = 'No plan with this id in your gym';
  end if;
  if not app.can_manage_plan(plan.id, plan.all_branches) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'The plan works in a branch you don''t reach';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' or jsonb_array_length(p_sessions) > 20 or exists (
    select 1 from jsonb_array_elements(p_sessions) as e
     where case
             when jsonb_typeof(e) <> 'object'
               or coalesce(e ->> 'service_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               or coalesce(e ->> 'count', '') !~ '^[0-9]{1,3}$' then true
             else (e ->> 'count')::integer not between 1 and 100
           end
  ) or (
    select count(distinct e ->> 'service_id') <> count(*) from jsonb_array_elements(p_sessions) as e
  ) then
    raise exception using errcode = '22023', message = 'invalid_spa_sessions',
      detail = 'A list of services, each once, with 1 to 100 sessions';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sessions) as e
     where not exists (
       select 1 from public.spa_services s where s.id = (e ->> 'service_id')::uuid and s.gym_id = gym
     )
  ) then
    raise exception using errcode = 'P0002', message = 'spa_service_not_found',
      detail = 'No such service in your gym';
  end if;

  delete from public.plan_spa_sessions p
   where p.plan_id = plan.id
     and p.service_id not in (select (e ->> 'service_id')::uuid from jsonb_array_elements(p_sessions) as e);
  insert into public.plan_spa_sessions (gym_id, plan_id, service_id, session_count)
  select gym, plan.id, (e ->> 'service_id')::uuid, (e ->> 'count')::integer
    from jsonb_array_elements(p_sessions) as e
  on conflict (plan_id, service_id) do update set session_count = excluded.session_count
   where plan_spa_sessions.session_count <> excluded.session_count;
  return coalesce((
    select jsonb_agg(jsonb_build_object('service_id', p.service_id, 'count', p.session_count) order by p.created_at)
      from public.plan_spa_sessions p where p.plan_id = plan.id
  ), '[]'::jsonb);
end
$$;

revoke execute on function public.set_plan_spa_sessions(uuid, jsonb) from public, anon;
grant execute on function public.set_plan_spa_sessions(uuid, jsonb) to authenticated;

-- Selling a package ---------------------------------------------------------------------------------

-- Sells a package to a member (a guest too) in a branch: one invoice (item kind spa, the package's
-- name on it) with an optional payment, and the member's copy of the package, starting today
-- (Baghdad). The same p_member_package_id again returns what was saved.
-- permission_denied (spa.book and payments.create); member_package_exists; spa_package_not_found,
-- spa_package_inactive; member_not_found, member_archived; no_branch_access, branch_inactive;
-- invalid_payment; payment_too_large.
create function public.sell_spa_package(
  p_member_package_id uuid,
  p_invoice_id uuid,
  p_package_id uuid,
  p_member_id uuid,
  p_branch_id uuid,
  p_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  today date := app.baghdad_today();
  sold public.member_spa_packages;
  package public.spa_packages;
  member public.members;
  invoice jsonb;
begin
  if gym is null or not (app.has_permission('spa.book') and app.has_permission('payments.create')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Selling a spa package needs spa.book and payments.create';
  end if;
  select * into sold from public.member_spa_packages m where m.id = p_member_package_id;
  if found then
    if sold.gym_id is distinct from gym or sold.member_id <> p_member_id or sold.package_id <> p_package_id then
      raise exception using errcode = '23505', message = 'member_package_exists',
        detail = 'Another sold package has this id';
    end if;
    return jsonb_build_object('member_package_id', sold.id) || app.saved_invoice(sold.invoice_id);
  end if;
  select * into package from public.spa_packages p where p.id = p_package_id and p.gym_id = gym;
  if not found then
    raise exception using errcode = 'P0002', message = 'spa_package_not_found',
      detail = 'No such package in your gym';
  end if;
  if not package.is_active then
    raise exception using errcode = '23514', message = 'spa_package_inactive',
      detail = 'This package is no longer sold';
  end if;
  select * into member from public.members m where m.id = p_member_id and m.gym_id = gym and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member.status = 'archived' then
    raise exception using errcode = '23514', message = 'member_archived',
      detail = 'An archived member buys nothing';
  end if;
  perform app.check_money_branch(p_branch_id);

  invoice := app.locker_invoice(p_invoice_id, p_branch_id, p_member_id, 'spa', package.name_ckb,
    package.price, p_payment);
  insert into public.member_spa_packages (
    id, gym_id, branch_id, member_id, package_id, service_id, name_ckb, name_en, name_ar, session_count,
    price, starts_on, expires_on, invoice_id
  ) values (
    p_member_package_id, gym, p_branch_id, p_member_id, package.id, package.service_id, package.name_ckb,
    package.name_en, package.name_ar, package.session_count, package.price, today,
    today + package.valid_days - 1, p_invoice_id
  )
  returning * into sold;
  return jsonb_build_object('member_package_id', sold.id, 'expires_on', sold.expires_on) || invoice;
end
$$;

revoke execute on function public.sell_spa_package(uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.sell_spa_package(uuid, uuid, uuid, uuid, uuid, jsonb) to authenticated;
