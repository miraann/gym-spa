-- The bell's "7 still to send" (step D-4g, the bell panel the user asked for on 2026-10-30).
-- Additions only.
--
--   * bell_reminders_left(p_since): per day (from p_since) and branch, how many reminders are not
--     done yet, as the caller, so RLS decides what is counted (reminders: notifications.send in the
--     staff member's branches). Days and branches with none left are not listed.

create function public.bell_reminders_left(p_since date)
returns table (remind_on date, branch_id uuid, left_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.remind_on, r.branch_id, count(*)::integer
    from public.reminders r
   where r.remind_on >= p_since and r.done_at is null
   group by r.remind_on, r.branch_id
$$;

revoke execute on function public.bell_reminders_left(date) from public, anon;
grant execute on function public.bell_reminders_left(date) to authenticated;
