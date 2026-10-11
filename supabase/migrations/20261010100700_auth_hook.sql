-- Lock blocks the login itself (spec §2.6, step MT-3).
--
-- Supabase Auth calls this function (its "Customize Access Token" hook) every time it is about to
-- issue a token: at a password login, at every token refresh, and after the second login step. It
-- refuses the token to a staff member of a locked gym, with the message gym_locked. Data access
-- already stops at once without it (app.current_gym_id); with it, no new session starts and no
-- open session gets a new token. Reactivating the gym lets the same sessions refresh again.
--
-- It runs for every login of every gym and of Click Group, so a mistake here would lock everyone
-- out. Therefore:
--   * it refuses ONLY a staff member of a locked gym. Anything else (platform admins, users without
--     a staff account, a missing or unexpected user id or claims) gets the event back unchanged;
--   * it never raises: any error inside returns the event unchanged (data access stays blocked by
--     the database for a locked gym either way);
--   * it reads nothing but the staff member's gym.
-- If logins break anyway, the README (Seller panel → The Auth hook) says how to turn it off in the
-- Supabase dashboard. Locally it is turned on in supabase/config.toml; the cloud project turns it
-- on in the dashboard.

create schema auth_hooks;
revoke all on schema auth_hooks from public;
grant usage on schema auth_hooks to supabase_auth_admin;

create function auth_hooks.custom_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  user_text text;
begin
  user_text := event ->> 'user_id';
  if user_text is null
     or user_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return event;
  end if;

  if exists (
    select 1
      from public.staff_users s
      join public.gyms g on g.id = s.gym_id
     where s.id = user_text::uuid
       and app.gym_access(g) = 'locked'
  ) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'gym_locked'));
  end if;
  return event;
exception
  when others then
    return event;
end
$$;

revoke execute on function auth_hooks.custom_access_token(jsonb) from public, anon, authenticated, service_role;
grant execute on function auth_hooks.custom_access_token(jsonb) to supabase_auth_admin;
