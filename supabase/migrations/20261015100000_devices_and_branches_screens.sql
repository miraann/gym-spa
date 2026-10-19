-- The branches and devices screens and required device registration (step 1e-3).
--
--   * The app now unlocks with unlock_on_device() (migration 20261011100000): a PIN works only on
--     a registered, active device of an active branch. unlock_with_pin() stays, unchanged, so the
--     web app, APK and EXE already installed keep working until they are updated (expand first,
--     drop later). Its removal waits in supabase/pending-migrations/.
--   * device_overview(): the devices screen in one call, with each device's last report and who
--     used it last.
--   * gym_limits(): the gym's branch and device limits and how many are in use, so the screens can
--     say how many places are left before a refusal (gym_branch_limit, gym_device_limit).

-- The devices of the caller's branches (devices.manage), with their last report. last_seen_by_name:
-- the staff member signed in at the last report, when they belong to the gym.
create function public.device_overview()
returns table (
  id uuid,
  code text,
  name text,
  platform text,
  default_language public.language_code,
  is_active boolean,
  branch_id uuid,
  created_at timestamptz,
  last_seen_at timestamptz,
  app_version text,
  last_seen_by uuid,
  last_seen_by_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.code, d.name, d.platform, d.default_language, d.is_active, d.branch_id,
         d.created_at, s.last_seen_at, s.app_version, s.last_seen_by, u.full_name
    from public.devices d
    left join public.device_status s on s.device_id = d.id
    left join public.staff_users u on u.id = s.last_seen_by and u.gym_id = d.gym_id
   where app.has_permission('devices.manage')
     and d.gym_id = app.current_gym_id()
     and d.deleted_at is null
     and d.branch_id in (select app.accessible_branch_ids())
   order by d.is_active desc, d.name, d.code
$$;

revoke execute on function public.device_overview() from public, anon;
grant execute on function public.device_overview() to authenticated;

-- The caller's gym: its most active branches and devices (null: no limit), and how many are active
-- now. Every active staff member may read it; it holds no business data.
create function public.gym_limits()
returns table (
  max_branches integer,
  max_devices integer,
  active_branches integer,
  active_devices integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.max_branches,
         g.max_devices,
         (select count(*)::integer from public.branches b
           where b.gym_id = g.id and b.is_active and b.deleted_at is null),
         (select count(*)::integer from public.devices d
           where d.gym_id = g.id and d.is_active and d.deleted_at is null)
    from public.gyms g
   where g.id = app.current_gym_id()
$$;

revoke execute on function public.gym_limits() from public, anon;
grant execute on function public.gym_limits() to authenticated;

-- As before (migration 20261011100000), but staff who aren't active in a gym that isn't locked get
-- staff_inactive instead of an empty answer, so "not registered" is never said by mistake: a device
-- whose gym was just locked keeps its registration.
create or replace function public.my_device(p_device_id uuid)
returns table (
  id uuid,
  code text,
  name text,
  platform text,
  default_language public.language_code,
  is_active boolean,
  branch_id uuid,
  branch_code text,
  branch_name_ckb text,
  branch_name_en text,
  branch_name_ar text,
  branch_is_active boolean,
  can_use boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if app.current_gym_id() is null then
    raise exception using errcode = '42501', message = 'staff_inactive',
      detail = 'Only active staff of a gym that is not locked can read its devices';
  end if;
  return query
    select d.id, d.code, d.name, d.platform, d.default_language, d.is_active,
           b.id, b.code, b.name_ckb, b.name_en, b.name_ar, b.is_active and b.deleted_at is null,
           app.has_branch_access(b.id)
      from public.devices d
      join public.branches b on b.id = d.branch_id
     where d.id = p_device_id
       and d.gym_id = app.current_gym_id()
       and d.deleted_at is null;
end
$$;
