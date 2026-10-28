-- Daily lockers released every night (Phase 5 follow-up, step 5d; asked for by the user on
-- 2026-10-28, spec §8 Phase 5). Additions only, and app.is_valid_setting replaced with the same
-- signature (one new key).
--
--   * lockers.night_release_minute: when each night the daily lockers not given back are released,
--     in minutes after midnight in Baghdad (default 180 = 03:00), per gym (a branch may differ).
--   * app.release_daily_lockers_at_night() releases every open daily locker given before the most
--     recent release time of its branch, as 'end_of_day' with no staff member (released_by null:
--     the app shows it as automatic). Gyms that are read-only or locked are skipped.
--   * The cloud runs it every 5 minutes with pg_cron, so a locker is released at most 5 minutes
--     after the set time. Postgres for Windows has no pg_cron: on the offline edition the gym's
--     server will call the same function on a timer (offline packaging phase), and until then the
--     end-of-day list's button (release_daily_lockers) still does it by hand.

-- Settings ------------------------------------------------------------------------------------------

create or replace function app.is_valid_setting(setting_key text, value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case setting_key
    -- Wrong PIN tries before the staff member must log in with their password again.
    when 'security.pin_max_attempts' then app.is_json_integer(value, 3, 10)
    -- Minutes without activity before the app locks.
    when 'security.idle_lock_minutes' then app.is_json_integer(value, 1, 240)
    -- The gym's brand color: a preset, or a custom color as lowercase #rrggbb.
    when 'appearance.brand_color' then jsonb_typeof(value) = 'string' and (value #>> '{}' = any (array['indigo', 'blue', 'purple', 'gray', 'midnight', 'gold', 'teal']) or value #>> '{}' ~ '^#[0-9a-f]{6}$')
    -- Corners: soft (the default), medium or sharp.
    when 'appearance.corner_style' then jsonb_typeof(value) = 'string' and value #>> '{}' in ('soft', 'medium', 'sharp')
    when 'appearance.logo' then app.is_valid_logo(value)
    -- Minutes after a visit in which another scan counts nothing (shown as "already in").
    when 'checkin.cooldown_minutes' then app.is_json_integer(value, 1, 720)
    -- Hours a visit counts as inside when nobody checks the member out.
    when 'checkin.visit_hours' then app.is_json_integer(value, 1, 24)
    -- 1: money owed now above checkin.debt_limit refuses entry; 0: it is only a warning.
    when 'checkin.deny_for_debt' then app.is_json_integer(value, 0, 1)
    -- Dinars a member may owe now and still come in, when checkin.deny_for_debt is 1.
    when 'checkin.debt_limit' then app.is_json_integer(value, 0, 1000000000)
    -- Dinars a rented locker costs per month; 0: not set, so lockers can't be rented yet.
    when 'lockers.rent_month_price' then app.is_json_integer(value, 0, 1000000000)
    -- Dinars charged for a lost locker key; 0: no fee.
    when 'lockers.lost_key_fee' then app.is_json_integer(value, 0, 1000000000)
    -- When each night the daily lockers not given back are released: minutes after midnight in
    -- Baghdad (180 = 03:00).
    when 'lockers.night_release_minute' then app.is_json_integer(value, 0, 1439)
    else false
  end
$$;

-- The night release ---------------------------------------------------------------------------------------

-- The most recent release time of a branch at p_now: today's in Baghdad once it has passed, else
-- yesterday's. Runs without a staff session (pg_cron), so it reads the branch's gym itself.
create function app.last_night_release(p_gym_id uuid, p_branch_id uuid, p_now timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with setting as (
    select coalesce(
      (select (s.value #>> '{}')::integer from public.settings s
        where s.key = 'lockers.night_release_minute' and s.branch_id = p_branch_id and s.gym_id = p_gym_id),
      (select (s.value #>> '{}')::integer from public.settings s
        where s.key = 'lockers.night_release_minute' and s.branch_id is null and s.gym_id = p_gym_id),
      180
    ) as minute
  ), today as (
    select (p_now at time zone 'Asia/Baghdad')::date + make_interval(mins => setting.minute) as local_time
      from setting
  )
  select (case
            when today.local_time <= (p_now at time zone 'Asia/Baghdad') then today.local_time
            else today.local_time - interval '1 day'
          end) at time zone 'Asia/Baghdad'
    from today
$$;

revoke execute on function app.last_night_release(uuid, uuid, timestamptz) from public, anon, authenticated;

-- Releases every open daily locker given before its branch's most recent release time, in gyms that
-- may still change data (active or grace), and returns how many. Run by pg_cron on the cloud and,
-- later, by the offline server; p_now is for the tests.
create function app.release_daily_lockers_at_night(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
begin
  update public.locker_assignments a
     set released_at = greatest(p_now, a.assigned_at), released_by = null, release_reason = 'end_of_day'
    from public.gyms g
   where g.id = a.gym_id and app.gym_access(g) in ('active', 'grace')
     and a.kind = 'daily' and a.released_at is null
     and a.assigned_at < app.last_night_release(a.gym_id, a.branch_id, p_now);
  get diagnostics released = row_count;
  return released;
end
$$;

revoke execute on function app.release_daily_lockers_at_night(timestamptz) from public, anon, authenticated;

-- Every 5 minutes on the cloud. Skipped where pg_cron isn't installed (the offline edition's
-- Postgres for Windows); cron.schedule with a name replaces a job of the same name.
do $$
begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('release-daily-lockers', '*/5 * * * *',
      'select app.release_daily_lockers_at_night()');
  end if;
end
$$;
