-- Personal training and the trainers' report (Phase 7, step 7c; spec §4.6 and the Phase 7 plan in
-- §8 of 2026-10-28). Additions only.
--
--   * pt_packages: N sessions with a trainer, a price, valid for D days or no limit; gym-wide
--     (pt.manage). Never deleted; made inactive.
--   * member_pt_packages: a package sold to a member with their trainer, one invoice (item kind
--     other) and an optional payment (pt.log and payments.create); the member's copy keeps the
--     terms. Voiding the invoice ends it.
--   * pt_sessions: the log (pt.log): a session done or a no-show (both use the session), with the
--     trainer and a note; a mistake is voided with a reason. Sessions left are computed from it.
--     The trainer's earning (their percent of the package price per session) is copied onto it.
--   * trainer_report(): per trainer, classes taught, PT sessions, hours on the clock and what they
--     earned, for a branch and period (hr.view).

-- Packages --------------------------------------------------------------------------------------------

create table public.pt_packages (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  session_count integer not null check (session_count between 1 and 200),
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
  constraint pt_packages_id_gym_id_key unique (id, gym_id),
  constraint pt_packages_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint pt_packages_never_deleted check (deleted_at is null)
);

create index pt_packages_gym_id_idx on public.pt_packages (gym_id);

create table public.member_pt_packages (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  -- Where it was sold (the invoice's branch).
  branch_id uuid not null,
  member_id uuid not null,
  package_id uuid not null,
  trainer_id uuid not null,
  -- The package as it was sold.
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  session_count integer not null check (session_count between 1 and 200),
  price numeric(14,2) not null check (price >= 0),
  starts_on date not null,
  expires_on date,
  invoice_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: sold packages are the history.
  deleted_at timestamptz,
  constraint member_pt_packages_id_gym_id_key unique (id, gym_id),
  constraint member_pt_packages_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint member_pt_packages_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint member_pt_packages_package_id_gym_id_fkey foreign key (package_id, gym_id)
    references public.pt_packages (id, gym_id),
  constraint member_pt_packages_trainer_id_gym_id_fkey foreign key (trainer_id, gym_id)
    references public.staff_users (id, gym_id),
  constraint member_pt_packages_invoice_id_gym_id_fkey foreign key (invoice_id, gym_id) references public.invoices (id, gym_id),
  constraint member_pt_packages_dates check (expires_on is null or expires_on >= starts_on),
  constraint member_pt_packages_never_deleted check (deleted_at is null)
);

create index member_pt_packages_member_id_gym_id_idx on public.member_pt_packages (member_id, gym_id, starts_on desc);
create index member_pt_packages_branch_id_gym_id_idx on public.member_pt_packages (branch_id, gym_id);
create index member_pt_packages_package_id_gym_id_idx on public.member_pt_packages (package_id, gym_id);
create index member_pt_packages_trainer_id_gym_id_idx on public.member_pt_packages (trainer_id, gym_id);
create unique index member_pt_packages_invoice_id_gym_id_key on public.member_pt_packages (invoice_id, gym_id);

-- Sessions ---------------------------------------------------------------------------------------------

create table public.pt_sessions (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  member_pt_package_id uuid not null,
  member_id uuid not null,
  trainer_id uuid not null,
  happened_at timestamptz not null default now(),
  -- done: it took place; no_show: the member didn't come (the session is used all the same).
  status text not null check (status in ('done', 'no_show')),
  note text check (app.is_clean_text(note, 500)),
  -- The trainer's earning: their percent of the package price per session, when it was logged.
  earning numeric(14,2) not null default 0 check (earning >= 0),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (app.is_clean_text(void_reason, 300)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: the log is the history.
  deleted_at timestamptz,
  constraint pt_sessions_id_gym_id_key unique (id, gym_id),
  constraint pt_sessions_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint pt_sessions_member_pt_package_id_gym_id_fkey foreign key (member_pt_package_id, gym_id)
    references public.member_pt_packages (id, gym_id),
  constraint pt_sessions_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint pt_sessions_trainer_id_gym_id_fkey foreign key (trainer_id, gym_id) references public.staff_users (id, gym_id),
  constraint pt_sessions_voided check ((voided_at is null) = (void_reason is null)),
  constraint pt_sessions_never_deleted check (deleted_at is null)
);

create index pt_sessions_member_pt_package_id_gym_id_idx on public.pt_sessions (member_pt_package_id, gym_id);
create index pt_sessions_member_id_gym_id_idx on public.pt_sessions (member_id, gym_id, happened_at desc);
create index pt_sessions_trainer_id_gym_id_idx on public.pt_sessions (trainer_id, gym_id, happened_at);
create index pt_sessions_branch_id_gym_id_idx on public.pt_sessions (branch_id, gym_id, happened_at);

-- Triggers and row level security --------------------------------------------------------------------------

create trigger check_writable before insert or update or delete on public.pt_packages
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.pt_packages
  for each row execute function app.read_only_columns('id', 'gym_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.pt_packages
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.pt_packages
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.member_pt_packages
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.member_pt_packages
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_id', 'package_id', 'name_ckb', 'name_en', 'name_ar', 'session_count',
    'price', 'starts_on', 'expires_on', 'invoice_id', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.member_pt_packages
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.member_pt_packages
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.pt_sessions
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.pt_sessions
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_pt_package_id', 'member_id', 'trainer_id', 'happened_at', 'status', 'earning',
    'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.pt_sessions
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.pt_sessions
  for each row execute function app.audit_row();

alter table public.pt_packages enable row level security;
alter table public.member_pt_packages enable row level security;
alter table public.pt_sessions enable row level security;

revoke all on table public.pt_packages, public.member_pt_packages, public.pt_sessions from anon, authenticated;
grant all on table public.pt_packages, public.member_pt_packages, public.pt_sessions to service_role;
-- Only the functions below write them.
grant select on table public.pt_packages, public.member_pt_packages, public.pt_sessions to authenticated;

create policy "staff see their gym's pt packages" on public.pt_packages
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

-- What a member has: like their subscriptions (members.view).
create policy "staff with members.view see members' pt packages" on public.member_pt_packages
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

create policy "staff with members.view see pt sessions" on public.pt_sessions
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

-- Sessions left -------------------------------------------------------------------------------------------

create function app.used_pt_sessions(p_member_pt_package_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.pt_sessions s
   where s.member_pt_package_id = p_member_pt_package_id and s.voided_at is null
$$;

revoke execute on function app.used_pt_sessions(uuid) from public, anon;
grant execute on function app.used_pt_sessions(uuid) to authenticated;

create function public.sessions_left(p_package public.member_pt_packages)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(p_package.session_count - app.used_pt_sessions(p_package.id), 0)
$$;

revoke execute on function public.sessions_left(public.member_pt_packages) from public, anon;
grant execute on function public.sessions_left(public.member_pt_packages) to authenticated;

-- Saving and selling ----------------------------------------------------------------------------------------

-- Adds a PT package (p_id made by the app) or changes one; packages sold keep their terms.
-- permission_denied (pt.manage); invalid_pt_package.
create function public.save_pt_package(
  p_id uuid,
  p_name_ckb text,
  p_session_count integer,
  p_price numeric,
  p_name_en text default null,
  p_name_ar text default null,
  p_valid_days integer default null,
  p_is_active boolean default true
)
returns public.pt_packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  saved public.pt_packages;
begin
  if gym is null or not app.has_permission('pt.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing PT packages needs pt.manage';
  end if;
  if exists (select 1 from public.pt_packages p where p.id = p_id and p.gym_id <> gym) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No PT package with this id that you may change';
  end if;
  begin
    insert into public.pt_packages as p (id, gym_id, name_ckb, name_en, name_ar, session_count, price, valid_days, is_active)
    values (p_id, gym, p_name_ckb, p_name_en, p_name_ar, p_session_count, p_price, p_valid_days, coalesce(p_is_active, true))
    on conflict (id) do update set
      name_ckb = excluded.name_ckb,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      session_count = excluded.session_count,
      price = excluded.price,
      valid_days = excluded.valid_days,
      is_active = excluded.is_active
    returning p.* into saved;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_pt_package',
        detail = 'A name, 1 to 200 sessions, a whole price and 1 to 3650 days or no limit';
  end;
  return saved;
end
$$;

revoke execute on function public.save_pt_package(uuid, text, integer, numeric, text, text, integer, boolean) from public, anon;
grant execute on function public.save_pt_package(uuid, text, integer, numeric, text, text, integer, boolean) to authenticated;

-- Sells a PT package to a member with their trainer, in a branch: one invoice (item kind other, the
-- package's name on it) with an optional payment, starting today. The same p_member_package_id
-- again returns what was saved. permission_denied (pt.log and payments.create);
-- member_package_exists; pt_package_not_found, pt_package_inactive; trainer_not_found;
-- member_not_found, member_archived; no_branch_access, branch_inactive; invalid_payment;
-- payment_too_large.
create function public.sell_pt_package(
  p_member_package_id uuid,
  p_invoice_id uuid,
  p_package_id uuid,
  p_member_id uuid,
  p_trainer_id uuid,
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
  sold public.member_pt_packages;
  package public.pt_packages;
  member public.members;
  invoice jsonb;
begin
  if gym is null or not (app.has_permission('pt.log') and app.has_permission('payments.create')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Selling a PT package needs pt.log and payments.create';
  end if;
  select * into sold from public.member_pt_packages m where m.id = p_member_package_id;
  if found then
    if sold.gym_id is distinct from gym or sold.member_id <> p_member_id or sold.package_id <> p_package_id then
      raise exception using errcode = '23505', message = 'member_package_exists',
        detail = 'Another sold package has this id';
    end if;
    return jsonb_build_object('member_package_id', sold.id) || app.saved_invoice(sold.invoice_id);
  end if;
  select * into package from public.pt_packages p where p.id = p_package_id and p.gym_id = gym;
  if not found then
    raise exception using errcode = 'P0002', message = 'pt_package_not_found',
      detail = 'No such PT package in your gym';
  end if;
  if not package.is_active then
    raise exception using errcode = '23514', message = 'pt_package_inactive',
      detail = 'This package is no longer sold';
  end if;
  if p_trainer_id is null or not app.is_trainer(p_trainer_id) then
    raise exception using errcode = 'P0002', message = 'trainer_not_found',
      detail = 'The trainer is an active staff member of your gym who teaches';
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

  invoice := app.locker_invoice(p_invoice_id, p_branch_id, p_member_id, 'other', package.name_ckb, package.price, p_payment);
  insert into public.member_pt_packages (
    id, gym_id, branch_id, member_id, package_id, trainer_id, name_ckb, name_en, name_ar, session_count, price,
    starts_on, expires_on, invoice_id
  ) values (
    p_member_package_id, gym, p_branch_id, p_member_id, package.id, p_trainer_id, package.name_ckb, package.name_en,
    package.name_ar, package.session_count, package.price, today, today + package.valid_days - 1, p_invoice_id
  )
  returning * into sold;
  return jsonb_build_object('member_package_id', sold.id, 'expires_on', sold.expires_on) || invoice;
end
$$;

revoke execute on function public.sell_pt_package(uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.sell_pt_package(uuid, uuid, uuid, uuid, uuid, uuid, jsonb) to authenticated;

-- The log -------------------------------------------------------------------------------------------------

-- Logs a session (pt.log) of a member's package in a branch: done or no_show, by the package's trainer
-- unless p_trainer_id names another who teaches, at p_happened_at (now when empty; not in the future,
-- at most 7 days ago). The same p_id again returns it. permission_denied; session_exists;
-- pt_package_not_found; pt_package_not_usable (expired or its invoice voided); no_sessions_left;
-- trainer_not_found; no_branch_access; invalid_pt_session.
create function public.log_pt_session(
  p_id uuid,
  p_member_package_id uuid,
  p_branch_id uuid,
  p_status text,
  p_happened_at timestamptz default null,
  p_trainer_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  package public.member_pt_packages;
  logged public.pt_sessions;
  happened timestamptz := coalesce(p_happened_at, now());
  trainer uuid;
  percent numeric;
begin
  if gym is null or not app.has_permission('pt.log') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Logging PT sessions needs pt.log';
  end if;
  select * into logged from public.pt_sessions s where s.id = p_id;
  if found then
    if logged.gym_id is distinct from gym or logged.member_pt_package_id <> p_member_package_id then
      raise exception using errcode = '23505', message = 'session_exists',
        detail = 'Another session has this id';
    end if;
    return jsonb_build_object('session_id', logged.id, 'sessions_left',
      (select public.sessions_left(m) from public.member_pt_packages m where m.id = logged.member_pt_package_id));
  end if;
  select * into package from public.member_pt_packages m where m.id = p_member_package_id and m.gym_id = gym for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pt_package_not_found',
      detail = 'No PT package of a member with this id';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only in your own branches';
  end if;
  if p_status is null or p_status not in ('done', 'no_show') or happened > now() + interval '5 minutes'
     or happened < now() - interval '7 days' or (p_note is not null and not app.is_clean_text(p_note, 500)) then
    raise exception using errcode = '22023', message = 'invalid_pt_session',
      detail = 'Done or no-show, within the last 7 days, with a short note';
  end if;
  if (happened at time zone 'Asia/Baghdad')::date > package.expires_on
     or exists (select 1 from public.invoices v where v.id = package.invoice_id and v.voided_at is not null) then
    raise exception using errcode = '23514', message = 'pt_package_not_usable',
      detail = 'The package has expired or its invoice was voided';
  end if;
  if app.used_pt_sessions(package.id) >= package.session_count then
    raise exception using errcode = '23514', message = 'no_sessions_left',
      detail = 'The package has no sessions left';
  end if;
  trainer := coalesce(p_trainer_id, package.trainer_id);
  if trainer <> package.trainer_id and not app.is_trainer(trainer) then
    raise exception using errcode = 'P0002', message = 'trainer_not_found',
      detail = 'The trainer is an active staff member of your gym who teaches';
  end if;
  select p.pt_percent into percent from public.staff_profiles p where p.id = trainer;
  insert into public.pt_sessions (
    id, gym_id, branch_id, member_pt_package_id, member_id, trainer_id, happened_at, status, note, earning
  ) values (
    p_id, gym, p_branch_id, package.id, package.member_id, trainer, happened, p_status, p_note,
    trunc(package.price / package.session_count * coalesce(percent, 0) / 100)
  )
  returning * into logged;
  return jsonb_build_object('session_id', logged.id, 'sessions_left',
    package.session_count - app.used_pt_sessions(package.id));
end
$$;

revoke execute on function public.log_pt_session(uuid, uuid, uuid, text, timestamptz, uuid, text) from public, anon;
grant execute on function public.log_pt_session(uuid, uuid, uuid, text, timestamptz, uuid, text) to authenticated;

-- A session logged by mistake counts for nothing (pt.manage, with a reason); the session is given
-- back. Voiding again changes nothing. permission_denied; session_not_found; reason_required.
create function public.void_pt_session(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  logged public.pt_sessions;
begin
  if app.current_gym_id() is null or not app.has_permission('pt.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Voiding a PT session needs pt.manage';
  end if;
  select * into logged from public.pt_sessions s where s.id = p_id and s.gym_id = app.current_gym_id() for update;
  if not found or not app.has_branch_access(logged.branch_id) then
    raise exception using errcode = 'P0002', message = 'session_not_found',
      detail = 'No PT session with this id in your branches';
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 300) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'A short reason';
  end if;
  if logged.voided_at is null then
    update public.pt_sessions s
       set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
     where s.id = logged.id;
  end if;
end
$$;

revoke execute on function public.void_pt_session(uuid, text) from public, anon;
grant execute on function public.void_pt_session(uuid, text) to authenticated;

-- The trainers' report --------------------------------------------------------------------------------------

-- For each staff member who teaches, in a branch from p_from to p_until (Baghdad days, at most 366):
-- the class sessions they taught (not cancelled, already over) and their fee for them (today's
-- class_fee each), the PT sessions logged (not voided) and their earnings, and the hours on the clock
-- (not voided, closed). permission_denied (hr.view); no_branch_access; invalid_request.
create function public.trainer_report(p_branch_id uuid, p_from date, p_until date)
returns table (
  staff_id uuid,
  full_name text,
  classes integer,
  class_earning numeric,
  pt_sessions integer,
  pt_earning numeric,
  clock_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  first_moment timestamptz := p_from::timestamp at time zone 'Asia/Baghdad';
  last_moment timestamptz := (p_until + 1)::timestamp at time zone 'Asia/Baghdad';
begin
  if app.current_gym_id() is null or not app.has_permission('hr.view') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'The trainers'' report needs hr.view';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only your own branches';
  end if;
  if p_from is null or p_until is null or p_until < p_from or p_until - p_from > 366 then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'From a day to a day, at most 366 days';
  end if;
  return query
    with taught as (
      select c.trainer_id as id, count(*)::integer as n
        from public.class_sessions c
       where c.gym_id = app.current_gym_id() and c.branch_id = p_branch_id and c.cancelled_at is null
         and c.starts_at >= first_moment and c.starts_at < last_moment and c.ends_at <= now()
       group by c.trainer_id
    ), trained as (
      select s.trainer_id as id, count(*)::integer as n, sum(s.earning) as earned
        from public.pt_sessions s
       where s.gym_id = app.current_gym_id() and s.branch_id = p_branch_id and s.voided_at is null
         and s.happened_at >= first_moment and s.happened_at < last_moment
       group by s.trainer_id
    ), clocked as (
      select k.staff_id as id,
             (sum(extract(epoch from (k.clocked_out_at - k.clocked_in_at))) / 60)::integer as minutes
        from public.staff_clock k
       where k.gym_id = app.current_gym_id() and k.branch_id = p_branch_id and k.voided_at is null
         and k.clocked_out_at is not null and k.clocked_in_at >= first_moment and k.clocked_in_at < last_moment
       group by k.staff_id
    )
    select u.id, u.full_name, coalesce(t.n, 0), coalesce(t.n, 0) * p.class_fee, coalesce(r.n, 0),
           coalesce(r.earned, 0), coalesce(k.minutes, 0)
      from public.staff_users u
      join public.staff_profiles p on p.id = u.id and p.gym_id = u.gym_id
      left join taught t on t.id = u.id
      left join trained r on r.id = u.id
      left join clocked k on k.id = u.id
     where u.gym_id = app.current_gym_id() and (p.teaches or t.n is not null or r.n is not null)
       and app.can_view_hr(u.id)
     order by u.full_name;
end
$$;

revoke execute on function public.trainer_report(uuid, date, date) from public, anon;
grant execute on function public.trainer_report(uuid, date, date) to authenticated;
