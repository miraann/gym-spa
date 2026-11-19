-- The dashboard's trends (step D-4, the design the user asked for on 2026-10-30). Additions only.
--
--   * dashboard_trends(p_branch_id): what the dashboard's tiles compare and draw, for one branch (or
--     every branch the staff member reaches, p_branch_id empty), as the caller, so RLS decides what is
--     counted; dashboard_summary() is left as it is. Each part is there only with the permission
--     dashboard_summary() asks for it:
--       - attendance.view: check-ins yesterday up to this time of day (the "+12%" beside today's) and
--         the last 7 days, day by day (Baghdad), today last;
--       - reports.financial.view or payments.view: the same for the money taken;
--       - classes.view: today's classes (every schedule that falls on today, whether or not a session
--         row was made yet, without cancelled ones), how many run now, and their places taken of all;
--       - members.view: personal training sessions logged today.

create function public.dashboard_trends(p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  day_start timestamptz := today::timestamp at time zone 'Asia/Baghdad';
  yesterday_start timestamptz := (today - 1)::timestamp at time zone 'Asia/Baghdad';
  week_start timestamptz := (today - 6)::timestamp at time zone 'Asia/Baghdad';
  money boolean := app.has_permission('reports.financial.view') or app.has_permission('payments.view');
  result jsonb := '{}'::jsonb;
begin
  if not app.has_permission('dashboard.view') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'The dashboard needs dashboard.view';
  end if;
  if p_branch_id is not null and not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only your own branches';
  end if;

  if app.has_permission('attendance.view') then
    result := result || jsonb_build_object(
      'checkins_yesterday', (
        select count(*) from public.attendance a
         where a.voided_at is null and a.checked_in_at >= yesterday_start
           and a.checked_in_at < now() - interval '1 day'
           and (p_branch_id is null or a.branch_id = p_branch_id)
      ),
      'checkins_week', (
        select jsonb_agg(coalesce(c.visits, 0) order by d.day)
          from generate_series(today - 6, today, interval '1 day') as d (day)
          left join (
            select (a.checked_in_at at time zone 'Asia/Baghdad')::date as day, count(*) as visits
              from public.attendance a
             where a.voided_at is null and a.checked_in_at >= week_start
               and (p_branch_id is null or a.branch_id = p_branch_id)
             group by 1
          ) c on c.day = d.day::date
      )
    );
  end if;

  if money then
    -- Dinars less what was given back, voided ones left out (as dashboard_summary()).
    result := result || jsonb_build_object(
      'takings_yesterday', (
        select coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0)
          from public.payments p
         where p.voided_at is null and p.created_at >= yesterday_start
           and p.created_at < now() - interval '1 day'
           and (p_branch_id is null or p.branch_id = p_branch_id)
      ),
      'takings_week', (
        select jsonb_agg(coalesce(t.taken, 0) order by d.day)
          from generate_series(today - 6, today, interval '1 day') as d (day)
          left join (
            select (p.created_at at time zone 'Asia/Baghdad')::date as day,
                   sum(case when p.kind = 'refund' then -p.amount else p.amount end) as taken
              from public.payments p
             where p.voided_at is null and p.created_at >= week_start
               and (p_branch_id is null or p.branch_id = p_branch_id)
             group by 1
          ) t on t.day = d.day::date
      )
    );
  end if;

  if app.has_permission('classes.view') then
    result := result || (
      select jsonb_build_object(
               'classes_today', count(*),
               'classes_now', count(*) filter (where now() >= c.starts and now() < c.ends),
               'class_places', coalesce(sum(c.capacity), 0),
               'class_taken', coalesce(sum(c.taken), 0)
             )
        from (
          select coalesce(cs.starts_at, (today + s.starts_at) at time zone 'Asia/Baghdad') as starts,
                 coalesce(cs.ends_at,
                   (today + s.starts_at) at time zone 'Asia/Baghdad' + make_interval(mins => s.duration_minutes)) as ends,
                 coalesce(cs.capacity, s.capacity) as capacity,
                 case when cs.id is null then 0 else app.class_taken(cs.id) end as taken
            from public.class_schedules s
            left join public.class_sessions cs on cs.schedule_id = s.id and cs.session_date = today
           where s.is_active and s.weekday = extract(isodow from today)
             and s.starts_on <= today and (s.ends_on is null or s.ends_on >= today)
             and cs.cancelled_at is null
             and (p_branch_id is null or s.branch_id = p_branch_id)
        ) c
    );
  end if;

  if app.has_permission('members.view') then
    result := result || jsonb_build_object(
      'pt_today', (
        select count(*) from public.pt_sessions s
         where s.voided_at is null and s.status = 'done' and s.happened_at >= day_start
           and (p_branch_id is null or s.branch_id = p_branch_id)
      )
    );
  end if;

  return result;
end
$$;

revoke execute on function public.dashboard_trends(uuid) from public, anon;
grant execute on function public.dashboard_trends(uuid) to authenticated;
