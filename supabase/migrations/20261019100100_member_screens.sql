-- The members screens (Phase 2, step 2b). Additions only.
--
--   * member_tags(): the tags in use in the gym, for the list's tag filter and the form's
--     suggestions.
--   * A gym's counters go with the gym. Gyms are never deleted (deleted_at instead); only the
--     end-to-end tests remove the throwaway gyms they make, and the counters must not stop them.

-- The tags of the gym's members (archived ones left out), most used first. At most 100.
create function public.member_tags()
returns table (tag text, member_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.tag, count(*)::integer
    from public.members m
   cross join lateral unnest(m.tags) as t (tag)
   where m.deleted_at is null and m.status <> 'archived'
   group by t.tag
   order by count(*) desc, t.tag
   limit 100
$$;

revoke execute on function public.member_tags() from public, anon;
grant execute on function public.member_tags() to authenticated;

alter table app.gym_counters
  drop constraint gym_counters_gym_id_fkey,
  add constraint gym_counters_gym_id_fkey foreign key (gym_id) references public.gyms (id) on delete cascade;
