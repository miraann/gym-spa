-- A member's membership (Phase 3, step 3g; spec §4.1: expired and frozen come from the
-- subscriptions and are never stored on the member). Additions only.
--
--   * public.membership(members): what the member's subscriptions make them today (Baghdad):
--     frozen (a running one is frozen today), current (one runs today), upcoming (one starts
--     later), expired (they had subscriptions, none runs now), none (never had one). Voided sales
--     don't count. Read with the member as a computed column (PostgREST: select=membership, and
--     membership=eq.expired as a filter), as the caller, so RLS on subscriptions applies.
--   * public.membership_ends_on(members): the last day of what runs (empty: no end, or nothing
--     runs).
--   * Visits plans count as running until check-in (Phase 4) counts their visits.

create function public.membership(p_member public.members)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  with today as (select (now() at time zone 'Asia/Baghdad')::date as d),
  sold as (
    select s.id, s.start_date,
           s.status = 'active' and (s.end_date is null or s.end_date >= t.d) as running,
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

revoke execute on function public.membership(public.members) from public, anon;
grant execute on function public.membership(public.members) to authenticated;

create function public.membership_ends_on(p_member public.members)
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
$$;

revoke execute on function public.membership_ends_on(public.members) from public, anon;
grant execute on function public.membership_ends_on(public.members) to authenticated;
