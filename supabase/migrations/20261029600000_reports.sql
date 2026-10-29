-- Reports (Phase 10, step 10b; the Phase 10 plan in spec §8 of 2026-10-29). Additions only.
--
-- One function per report, each for Baghdad days p_from..p_to (at most 366) and one branch or every
-- branch the staff member reaches (p_branch_id empty). They run as the server, with the checks
-- written out: the caller's gym, their branches, reports.view, and reports.financial.view for
-- money, so a manager without payments.view still sees the money reports they may see. Voided
-- invoices and payments never count; the walk-in customer is never a member in member reports.
-- permission_denied; no_branch_access; invalid_range.

-- The branches a report covers, after the checks. p_money: it shows money.
create function app.report_branches(p_from date, p_to date, p_branch_id uuid, p_money boolean)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('reports.view') or (p_money and not app.has_permission('reports.financial.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Reports need reports.view, and money reports reports.financial.view';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception using errcode = '22023', message = 'invalid_range',
      detail = 'From a day to a later one, at most 366 days';
  end if;
  if p_branch_id is not null then
    if not app.has_branch_access(p_branch_id) then
      raise exception using errcode = '42501', message = 'no_branch_access',
        detail = 'Only your own branches';
    end if;
    return array[p_branch_id];
  end if;
  return array(select app.accessible_branch_ids());
end
$$;

revoke execute on function app.report_branches(date, date, uuid, boolean) from public, anon, authenticated;

-- The start of a Baghdad day.
create function app.baghdad_start(p_day date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_day::timestamp at time zone 'Asia/Baghdad'
$$;

-- Revenue -------------------------------------------------------------------------------------------------

-- What was sold per day and source (the invoice item kinds; an item's total is after its discount,
-- and an invoice's discount is the sum of its items'); and, as their own sources, refunds and credits (money a subscription change
-- or cancellation no longer asks for), negative. In dinars.
create function public.report_revenue(p_from date, p_to date, p_branch_id uuid default null)
returns table (day date, source text, amount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, true);
  gym uuid := app.current_gym_id();
begin
  return query
    with sold as (
      select (v.created_at at time zone 'Asia/Baghdad')::date as day, i.kind as source,
             i.total as amount
        from public.invoices v
        join public.invoice_items i on i.invoice_id = v.id and i.gym_id = v.gym_id
       where v.gym_id = gym and v.branch_id = any (branches) and v.voided_at is null
         and v.created_at >= app.baghdad_start(p_from) and v.created_at < app.baghdad_start(p_to + 1)
    ), refunded as (
      select (p.created_at at time zone 'Asia/Baghdad')::date, 'refund'::text, -p.amount
        from public.payments p
       where p.gym_id = gym and p.branch_id = any (branches) and p.kind = 'refund' and p.voided_at is null
         and p.created_at >= app.baghdad_start(p_from) and p.created_at < app.baghdad_start(p_to + 1)
    ), credited as (
      select (c.created_at at time zone 'Asia/Baghdad')::date, 'credit'::text, -c.amount
        from public.invoice_credits c
        join public.invoices v on v.id = c.invoice_id and v.gym_id = c.gym_id
       where c.gym_id = gym and v.branch_id = any (branches) and v.voided_at is null
         and c.created_at >= app.baghdad_start(p_from) and c.created_at < app.baghdad_start(p_to + 1)
    )
    select s.day, s.source, sum(s.amount)::numeric(14,2)
      from (select * from sold union all select * from refunded union all select * from credited) s
     group by s.day, s.source
     order by s.day, s.source;
end
$$;

-- Payments by method and currency: how many, the dinars they counted for (refunds apart), and the
-- dollars handed over.
create function public.report_payments(p_from date, p_to date, p_branch_id uuid default null)
returns table (method text, currency text, payments integer, amount numeric, refunds numeric, dollars numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, true);
begin
  return query
    select p.method, p.currency,
           (count(*) filter (where p.kind = 'payment'))::integer,
           coalesce(sum(p.amount) filter (where p.kind = 'payment'), 0)::numeric(14,2),
           coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0)::numeric(14,2),
           coalesce(sum(p.foreign_amount) filter (where p.kind = 'payment'), 0)::numeric(14,2)
      from public.payments p
     where p.gym_id = app.current_gym_id() and p.branch_id = any (branches) and p.voided_at is null
       and p.created_at >= app.baghdad_start(p_from) and p.created_at < app.baghdad_start(p_to + 1)
     group by p.method, p.currency
     order by 4 desc, p.method;
end
$$;

-- Attendance ---------------------------------------------------------------------------------------------

-- Check-ins per day, and how many different members came.
create function public.report_attendance(p_from date, p_to date, p_branch_id uuid default null)
returns table (day date, visits integer, members integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, false);
begin
  return query
    select d.day::date,
           count(a.id)::integer,
           count(distinct a.member_id)::integer
      from generate_series(p_from, p_to, interval '1 day') as d (day)
      left join public.attendance a
        on a.gym_id = app.current_gym_id() and a.branch_id = any (branches) and a.voided_at is null
       and a.checked_in_at >= app.baghdad_start(d.day::date) and a.checked_in_at < app.baghdad_start(d.day::date + 1)
     group by d.day
     order by d.day;
end
$$;

-- Check-ins per weekday (0 Sunday .. 6 Saturday) and hour (0..23), Baghdad time: the peak hours.
create function public.report_peak_hours(p_from date, p_to date, p_branch_id uuid default null)
returns table (weekday integer, hour integer, visits integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, false);
begin
  return query
    select extract(dow from a.checked_in_at at time zone 'Asia/Baghdad')::integer,
           extract(hour from a.checked_in_at at time zone 'Asia/Baghdad')::integer,
           count(*)::integer
      from public.attendance a
     where a.gym_id = app.current_gym_id() and a.branch_id = any (branches) and a.voided_at is null
       and a.checked_in_at >= app.baghdad_start(p_from) and a.checked_in_at < app.baghdad_start(p_to + 1)
     group by 1, 2
     order by 1, 2;
end
$$;

-- Plans and retention -----------------------------------------------------------------------------------

-- Subscriptions sold per plan (not voided), with what their invoice items came to.
create function public.report_plans(p_from date, p_to date, p_branch_id uuid default null)
returns table (plan_id uuid, name_ckb text, name_en text, name_ar text, sold integer, revenue numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, true);
begin
  return query
    select p.id, p.name_ckb, p.name_en, p.name_ar,
           count(distinct s.id)::integer,
           coalesce(sum(i.total), 0)::numeric(14,2)
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id and p.gym_id = s.gym_id
      left join public.invoice_items i on i.subscription_id = s.id and i.gym_id = s.gym_id and i.kind = 'subscription'
      left join public.invoices v on v.id = i.invoice_id and v.gym_id = i.gym_id
     where s.gym_id = app.current_gym_id() and s.branch_id = any (branches) and s.status <> 'voided'
       and (v.id is null or v.voided_at is null)
       and s.created_at >= app.baghdad_start(p_from) and s.created_at < app.baghdad_start(p_to + 1)
     group by p.id
     order by 5 desc, p.name_ckb;
end
$$;

-- Subscriptions with an end that ended in the range, and when the member renewed: the first other
-- subscription (not voided) that runs past that end and starts at most 30 days after it (an early
-- renewal starts before). Members only (not guests, never the walk-in customer).
create function public.report_retention(p_from date, p_to date, p_branch_id uuid default null)
returns table (subscription_id uuid, member_id uuid, full_name text, member_number integer, ended_on date,
               renewed_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, false);
  gym uuid := app.current_gym_id();
begin
  return query
    select s.id, m.id, m.full_name, m.member_number, s.end_date,
           (select min(n.start_date) from public.subscriptions n
             where n.member_id = s.member_id and n.gym_id = gym and n.id <> s.id and n.status <> 'voided'
               and (n.end_date is null or n.end_date > s.end_date) and n.start_date <= s.end_date + 30)
      from public.subscriptions s
      join public.members m on m.id = s.member_id and m.gym_id = s.gym_id
     where s.gym_id = gym and s.branch_id = any (branches) and s.status = 'active'
       and s.end_date between p_from and p_to
       and m.deleted_at is null and not m.is_walk_in and not m.is_guest
     order by s.end_date, m.full_name;
end
$$;

-- Stock, cash, discounts, staff --------------------------------------------------------------------------

-- Each counted product's stock per branch; its last cost and the stock's value only for staff who
-- keep the stock (inventory.adjust), as on the stock page.
create function public.report_inventory(p_branch_id uuid default null)
returns table (product_id uuid, name_ckb text, name_en text, name_ar text, branch_id uuid, quantity integer,
               low_stock_level integer, unit_cost numeric, value numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  branches uuid[] := app.report_branches(today, today, p_branch_id, false);
  costs boolean := app.has_permission('inventory.adjust');
begin
  return query
    select p.id, p.name_ckb, p.name_en, p.name_ar, s.branch_id, sum(s.quantity)::integer, p.low_stock_level,
           case when costs then last_cost.unit_cost end,
           case when costs then (sum(s.quantity) * last_cost.unit_cost)::numeric(14,2) end
      from public.stock_movements s
      join public.products p on p.id = s.product_id and p.gym_id = s.gym_id
      left join lateral (
        select r.unit_cost from public.stock_movements r
         where r.product_id = p.id and r.gym_id = p.gym_id and r.kind = 'receive' and r.unit_cost is not null
         order by r.created_at desc
         limit 1
      ) last_cost on true
     where s.gym_id = app.current_gym_id() and s.branch_id = any (branches) and p.track_stock and p.deleted_at is null
     group by p.id, s.branch_id, last_cost.unit_cost
     order by p.name_ckb, s.branch_id;
end
$$;

-- Closed cash register shifts with what was expected, counted and the difference.
create function public.report_cash(p_from date, p_to date, p_branch_id uuid default null)
returns table (shift_id uuid, branch_id uuid, opened_at timestamptz, closed_at timestamptz, opened_by text,
               closed_by text, expected_iqd numeric, counted_iqd numeric, difference_iqd numeric,
               expected_usd numeric, counted_usd numeric, difference_usd numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, true);
begin
  return query
    select c.id, c.branch_id, c.opened_at, c.closed_at, o.full_name, k.full_name,
           c.expected_iqd, c.counted_iqd, c.counted_iqd - c.expected_iqd,
           c.expected_usd, c.counted_usd, c.counted_usd - c.expected_usd
      from public.cash_shifts c
      left join public.staff_users o on o.id = c.opened_by
      left join public.staff_users k on k.id = c.closed_by
     where c.gym_id = app.current_gym_id() and c.branch_id = any (branches) and c.closed_at is not null
       and c.closed_at >= app.baghdad_start(p_from) and c.closed_at < app.baghdad_start(p_to + 1)
     order by c.closed_at;
end
$$;

-- Discounts given, per staff member who made the invoice: invoices with a discount, and how much
-- (an invoice's discount is the sum of its items').
create function public.report_discounts(p_from date, p_to date, p_branch_id uuid default null)
returns table (staff_id uuid, full_name text, invoices integer, discount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, true);
begin
  return query
    select v.created_by, s.full_name, count(*)::integer, sum(v.discount)::numeric(14,2)
      from public.invoices v
      left join public.staff_users s on s.id = v.created_by
     where v.gym_id = app.current_gym_id() and v.branch_id = any (branches) and v.voided_at is null
       and v.discount > 0
       and v.created_at >= app.baghdad_start(p_from) and v.created_at < app.baghdad_start(p_to + 1)
     group by v.created_by, s.full_name
     order by 4 desc;
end
$$;

-- What each staff member did: payments taken (and their dinars), subscriptions sold, members let in
-- by hand.
create function public.report_staff(p_from date, p_to date, p_branch_id uuid default null)
returns table (staff_id uuid, full_name text, payments integer, amount numeric, subscriptions integer,
               manual_checkins integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branches uuid[] := app.report_branches(p_from, p_to, p_branch_id, true);
  gym uuid := app.current_gym_id();
  from_at timestamptz := app.baghdad_start(p_from);
  until_at timestamptz := app.baghdad_start(p_to + 1);
begin
  return query
    with work as (
      select p.created_by as staff_id, 1 as payments, p.amount, 0 as subscriptions, 0 as manual_checkins
        from public.payments p
       where p.gym_id = gym and p.branch_id = any (branches) and p.kind = 'payment' and p.voided_at is null
         and p.created_at >= from_at and p.created_at < until_at
      union all
      select s.created_by, 0, 0, 1, 0
        from public.subscriptions s
       where s.gym_id = gym and s.branch_id = any (branches) and s.status <> 'voided'
         and s.created_at >= from_at and s.created_at < until_at
      union all
      select a.created_by, 0, 0, 0, 1
        from public.attendance a
       where a.gym_id = gym and a.branch_id = any (branches) and a.method = 'manual' and a.voided_at is null
         and a.checked_in_at >= from_at and a.checked_in_at < until_at
    )
    select w.staff_id, u.full_name, sum(w.payments)::integer, sum(w.amount)::numeric(14,2),
           sum(w.subscriptions)::integer, sum(w.manual_checkins)::integer
      from work w
      join public.staff_users u on u.id = w.staff_id and u.gym_id = gym
     group by w.staff_id, u.full_name
     order by 4 desc, u.full_name;
end
$$;

revoke execute on function public.report_revenue(date, date, uuid), public.report_payments(date, date, uuid),
  public.report_attendance(date, date, uuid), public.report_peak_hours(date, date, uuid),
  public.report_plans(date, date, uuid), public.report_retention(date, date, uuid),
  public.report_inventory(uuid), public.report_cash(date, date, uuid), public.report_discounts(date, date, uuid),
  public.report_staff(date, date, uuid) from public, anon;
grant execute on function public.report_revenue(date, date, uuid), public.report_payments(date, date, uuid),
  public.report_attendance(date, date, uuid), public.report_peak_hours(date, date, uuid),
  public.report_plans(date, date, uuid), public.report_retention(date, date, uuid),
  public.report_inventory(uuid), public.report_cash(date, date, uuid), public.report_discounts(date, date, uuid),
  public.report_staff(date, date, uuid) to authenticated;
