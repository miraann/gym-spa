-- Auth spike (throwaway), staff admin design A: plain Postgres functions, called by RPC under the
-- manager's own session, that write Supabase Auth's tables (auth.users, auth.identities,
-- auth.sessions) in the same transaction as the staff rows. No service key, no Edge Function, no
-- gym-server endpoint: the same SQL in both editions. Not a migration; staff-admin-test.mjs loads
-- it into the database it tests and drops it again.
--
-- The usual guards still run: is_system_context() reads the JWT role (not current_user), so the
-- staff_users / staff_branches triggers check the manager (can_grant_role, branches, ...).

create or replace function public.spike_create_staff(
  p_username text,
  p_full_name text,
  p_password text,
  p_role_id uuid,
  p_branch_ids uuid[] default '{}',
  p_all_branches boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  login_email text := lower(p_username) || '@staff.gym-spa.invalid';
begin
  if not app.has_permission('staff.manage') then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception using errcode = '22023', message = 'weak_password';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = login_email) then
    raise exception using errcode = '23505', message = 'username_taken';
  end if;

  -- What Supabase Auth's admin API writes for a confirmed email user. The token columns are ''
  -- (not null), as Auth itself writes them.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', login_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (
    new_id::text, new_id,
    jsonb_build_object('sub', new_id::text, 'email', login_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  );

  -- Guards run here; a bad username fails the check constraint. Any error undoes the Auth rows too.
  insert into public.staff_users (id, username, full_name, role_id, all_branches)
  values (new_id, p_username, p_full_name, p_role_id, p_all_branches);
  insert into public.staff_branches (staff_id, branch_id)
  select new_id, b from unnest(p_branch_ids) as b;
  return new_id;
end
$$;

create or replace function public.spike_reset_staff_password(p_staff_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can_manage_staff(p_staff_id) then
    raise exception using errcode = '42501', message = 'cannot_manage_staff';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception using errcode = '22023', message = 'weak_password';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = p_staff_id;
  -- Logged out everywhere: their refresh tokens belong to these sessions.
  delete from auth.sessions where user_id = p_staff_id;
  -- The password trigger cleared it; someone else chose this password, so it is set again.
  update public.staff_users set must_change_password = true where id = p_staff_id;
end
$$;

create or replace function public.spike_set_staff_active(p_staff_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.can_manage_staff(p_staff_id) then
    raise exception using errcode = '42501', message = 'cannot_manage_staff';
  end if;
  update public.staff_users set is_active = p_active where id = p_staff_id;
  -- Auth refuses logins and token refreshes for a banned user. Not 'infinity': Auth (Go) cannot
  -- read it and fails with "Database error querying schema". 100 years, like ban_duration 876000h.
  update auth.users set banned_until = case when p_active then null else now() + interval '100 years' end
   where id = p_staff_id;
  if not p_active then
    delete from auth.sessions where user_id = p_staff_id;
  end if;
end
$$;

revoke all on function public.spike_create_staff(text, text, text, uuid, uuid[], boolean) from public, anon;
revoke all on function public.spike_reset_staff_password(uuid, text) from public, anon;
revoke all on function public.spike_set_staff_active(uuid, boolean) from public, anon;
grant execute on function public.spike_create_staff(text, text, text, uuid, uuid[], boolean) to authenticated;
grant execute on function public.spike_reset_staff_password(uuid, text) to authenticated;
grant execute on function public.spike_set_staff_active(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
