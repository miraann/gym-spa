-- Phase 2, step 2h: how many members each gym has, for the seller panel (Click Group). Counts
-- only: the seller never reads member data itself (spec §2.6). Expand first: a new function,
-- nothing older clients use changes.

-- members: every member who isn't archived; active_members: those with the status active.
create function public.seller_member_counts(p_gym_id uuid default null)
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
      left join public.members m on m.gym_id = g.id and m.deleted_at is null
     where p_gym_id is null or g.id = p_gym_id
     group by g.id;
end
$$;

comment on function public.seller_member_counts(uuid) is
  'Member counts per gym for the seller panel (numbers only, never names). Platform admins with two-step login only.';

revoke execute on function public.seller_member_counts(uuid) from public, anon;
grant execute on function public.seller_member_counts(uuid) to authenticated;
