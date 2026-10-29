-- The dashboard (Phase 10, step 10a; the Phase 10 plan in spec §8 of 2026-10-29). Additions only.
--
--   * dashboard_summary(p_branch_id): today's numbers for one branch (or every branch the staff
--     member reaches, p_branch_id empty), as the caller, so RLS decides what is counted. Each part is
--     null without its permission: visits with attendance.view, members with members.view, spa with
--     spa.view, money with reports.financial.view or payments.view.

create function public.dashboard_summary(p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  day_start timestamptz := today::timestamp at time zone 'Asia/Baghdad';
  month_start timestamptz := date_trunc('month', today)::timestamp at time zone 'Asia/Baghdad';
  visits boolean := app.has_permission('attendance.view');
  members boolean := app.has_permission('members.view');
  spa boolean := app.has_permission('spa.view');
  money boolean := app.has_permission('reports.financial.view') or app.has_permission('payments.view');
  result jsonb := '{}';
begin
  if not app.has_permission('dashboard.view') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'The dashboard needs dashboard.view';
  end if;
  if p_branch_id is not null and not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only your own branches';
  end if;

  if visits then
    result := result || jsonb_build_object(
      'checkins_today', (
        select count(*) from public.attendance a
         where a.voided_at is null and a.checked_in_at >= day_start
           and (p_branch_id is null or a.branch_id = p_branch_id)
      ),
      'inside_now', (
        select count(*) from public.attendance a
         where a.voided_at is null and a.checked_out_at is null
           and a.checked_in_at > now() - interval '24 hours' and public.inside(a)
           and (p_branch_id is null or a.branch_id = p_branch_id)
      ),
      -- Check-ins per hour today (Baghdad), 0 to 23.
      'hourly', (
        select jsonb_agg(coalesce(c.visits, 0) order by h.hour)
          from generate_series(0, 23) as h (hour)
          left join (
            select extract(hour from a.checked_in_at at time zone 'Asia/Baghdad')::integer as hour, count(*) as visits
              from public.attendance a
             where a.voided_at is null and a.checked_in_at >= day_start
               and (p_branch_id is null or a.branch_id = p_branch_id)
             group by 1
          ) c on c.hour = h.hour
      )
    );
  end if;

  if members then
    -- Members of the gym (not guests; the walk-in customer is hidden by RLS).
    result := result || jsonb_build_object(
      'active_members', (
        select count(*) from public.members m
         where m.deleted_at is null and not m.is_guest and m.status = 'active'
      ),
      'new_this_month', (
        select count(*) from public.members m
         where m.deleted_at is null and not m.is_guest and m.created_at >= month_start
      ),
      -- Memberships whose last running day is within the next 7 days (as membership_ends_on()).
      'ending_this_week', (
        select count(*) from (
          select s.member_id
            from public.subscriptions s
            join public.members m on m.id = s.member_id
           where s.status = 'active' and m.deleted_at is null and not m.is_guest and m.status = 'active'
             and (s.end_date is null or s.end_date >= today)
             and (s.visit_count is null or app.subscription_used_visits(s.id) < s.visit_count)
           group by s.member_id
          having not bool_or(s.end_date is null) and max(s.end_date) <= today + 7
        ) ending
      )
    );
  end if;

  if spa then
    result := result || jsonb_build_object(
      'spa_today', (
        select count(*) from public.spa_bookings b
         where b.status in ('booked', 'confirmed', 'arrived', 'completed')
           and (b.starts_at at time zone 'Asia/Baghdad')::date = today
           and (p_branch_id is null or b.branch_id = p_branch_id)
      )
    );
  end if;

  if money then
    result := result || jsonb_build_object(
      -- Dinars taken today, less what was given back; voided ones count for nothing.
      'takings_today', (
        select coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0)
          from public.payments p
         where p.voided_at is null and p.created_at >= day_start
           and (p_branch_id is null or p.branch_id = p_branch_id)
      ),
      'owed_now', (
        select coalesce(sum(d.owed_now), 0) from public.member_debts d
      )
    );
  end if;

  return result;
end
$$;

revoke execute on function public.dashboard_summary(uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid) to authenticated;
