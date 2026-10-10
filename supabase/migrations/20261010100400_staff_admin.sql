-- The staff module (spec §2.5 design B, step MT-2). Staff logins are created and changed through
-- Supabase Auth's admin API by one shared TypeScript module (packages/staff-admin): the staff-admin
-- Edge Function online, a gym-server route offline. These functions are its database half:
--
--   * staff_admin_prepare_create / staff_admin_prepare_change check a request under the manager's
--     own session before any Auth call, so a refused request changes nothing anywhere. They raise
--     the same stable keys as the guards.
--   * create_staff_profile writes a new account's staff rows, all or nothing, under the manager's
--     session (security invoker): RLS, the guards and the audit log apply as for any other write.
--   * staff_admin_orphan finds a login left behind when a create failed and could not be undone,
--     so its username can be used again. Secret key only.
--
-- Also: a manager may now change a username (the module changes the login first; login_matches
-- still refuses a username that doesn't match it), and a read-only gym may still deactivate staff
-- and reset their passwords, which only take access away.

-- Usernames -------------------------------------------------------------------------------------

-- Same pattern as the staff_users.username check and USERNAME_PATTERN in packages/core.
create function app.is_valid_username(username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select username ~ '^[a-z][a-z0-9._-]{2,31}$'
$$;

-- Checks before any Auth call ---------------------------------------------------------------------

-- Whether the signed-in staff member may create this account. Returns their own gym (its id and
-- code: the login address uses the code); the gym never comes from the request.
create function public.staff_admin_prepare_create(
  p_username text,
  p_role_id uuid,
  p_all_branches boolean,
  p_branch_ids uuid[]
)
returns table (gym_id uuid, gym_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('staff.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Managing staff needs the staff.manage permission';
  end if;
  if not app.gym_writable() then
    raise exception using errcode = '42501', message = 'gym_read_only',
      detail = 'This gym is read-only: it is suspended, or its subscription or license has ended';
  end if;
  if p_username is null or not app.is_valid_username(p_username) then
    raise exception using errcode = '22023', message = 'invalid_username',
      detail = 'A username has 3 to 32 characters: a-z first, then a-z, 0-9, ".", "_" or "-"';
  end if;
  if exists (
    select 1 from public.staff_users s
     where s.gym_id = app.current_gym_id() and s.username = p_username
  ) then
    raise exception using errcode = '23505', message = 'username_taken',
      detail = 'Another staff member of this gym has this username';
  end if;
  if p_role_id is null or not app.can_grant_role(p_role_id) then
    raise exception using errcode = '42501', message = 'cannot_grant_role',
      detail = 'You can only give roles whose permissions you have yourself';
  end if;
  if coalesce(p_all_branches, false) and not app.has_all_branches() then
    raise exception using errcode = '42501', message = 'cannot_grant_all_branches',
      detail = 'Only staff with access to all branches can give it';
  end if;
  if not coalesce(p_all_branches, false) and coalesce(cardinality(p_branch_ids), 0) = 0 then
    raise exception using errcode = '23514', message = 'branches_required',
      detail = 'A staff member works in at least one branch, or in all of them';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_branch_ids, '{}')) as b (id)
     where b.id is null or not app.has_branch_access(b.id)
  ) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'You can only give access to your own branches';
  end if;

  return query
    select g.id, g.code from public.gyms g where g.id = app.current_gym_id();
end
$$;

-- Whether the signed-in staff member may reset_password, deactivate, reactivate or rename this
-- staff member (rename: to p_new_username). Returns the target's gym code, username and state.
-- Deactivating and resetting a password still work while the gym is read-only: they only take
-- access away (a fired employee must be locked out even while the gym is unpaid).
create function public.staff_admin_prepare_change(
  p_staff_id uuid,
  p_action text,
  p_new_username text default null
)
returns table (gym_code text, username text, is_active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('staff.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Managing staff needs the staff.manage permission';
  end if;
  if p_action is null or p_action not in ('reset_password', 'deactivate', 'reactivate', 'rename') then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'The action is reset_password, deactivate, reactivate or rename';
  end if;
  if p_action in ('reactivate', 'rename') and not app.gym_writable() then
    raise exception using errcode = '42501', message = 'gym_read_only',
      detail = 'This gym is read-only: it is suspended, or its subscription or license has ended';
  end if;
  if p_staff_id = auth.uid() then
    raise exception using errcode = '42501', message = 'cannot_edit_own_account',
      detail = 'Nobody manages their own account; another manager does';
  end if;
  -- Also refuses staff of another gym, and staff that don't exist: the same answer for both.
  if p_staff_id is null
     or not app.can_manage_staff(p_staff_id)
     or exists (select 1 from public.staff_users s where s.id = p_staff_id and s.deleted_at is not null)
  then
    raise exception using errcode = '42501', message = 'cannot_manage_staff',
      detail = 'This staff member has access you do not have';
  end if;
  if p_action = 'rename' then
    if p_new_username is null or not app.is_valid_username(p_new_username) then
      raise exception using errcode = '22023', message = 'invalid_username',
        detail = 'A username has 3 to 32 characters: a-z first, then a-z, 0-9, ".", "_" or "-"';
    end if;
    if exists (
      select 1 from public.staff_users s
       where s.gym_id = app.current_gym_id() and s.username = p_new_username and s.id <> p_staff_id
    ) then
      raise exception using errcode = '23505', message = 'username_taken',
        detail = 'Another staff member of this gym has this username';
    end if;
  end if;

  return query
    select g.code, s.username, s.is_active
      from public.staff_users s
      join public.gyms g on g.id = s.gym_id
     where s.id = p_staff_id;
end
$$;

revoke execute on function public.staff_admin_prepare_create(text, uuid, boolean, uuid[]) from public, anon;
grant execute on function public.staff_admin_prepare_create(text, uuid, boolean, uuid[]) to authenticated;
revoke execute on function public.staff_admin_prepare_change(uuid, text, text) from public, anon;
grant execute on function public.staff_admin_prepare_change(uuid, text, text) to authenticated;

-- A new account's staff rows ---------------------------------------------------------------------

-- The staff account and its branches for the Auth user p_id, which the staff module has just
-- created. One call, so all rows are written or none. Security invoker: it runs as the manager,
-- so RLS and the guards decide, as if the app wrote the rows itself. gym_id fills itself in from
-- the manager's gym, and login_matches checks the login's address.
create function public.create_staff_profile(
  p_id uuid,
  p_username text,
  p_full_name text,
  p_role_id uuid,
  p_all_branches boolean,
  p_branch_ids uuid[],
  p_phone text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.staff_users (id, username, full_name, phone, role_id, all_branches)
  values (p_id, p_username, p_full_name, p_phone, p_role_id, coalesce(p_all_branches, false));

  -- With all branches the rows aren't needed: access follows the flag.
  insert into public.staff_branches (staff_id, branch_id)
  select distinct p_id, b.id
    from unnest(coalesce(p_branch_ids, '{}')) as b (id)
   where not coalesce(p_all_branches, false);
end
$$;

revoke execute on function public.create_staff_profile(uuid, text, text, uuid, boolean, uuid[], text) from public, anon;
grant execute on function public.create_staff_profile(uuid, text, text, uuid, boolean, uuid[], text) to authenticated;

-- Logins left behind ------------------------------------------------------------------------------

-- The Auth user with this email if it is a staff login left behind by a create that failed and
-- could not be undone; otherwise null. Such a login keeps its username blocked (Auth's emails are
-- unique), so the staff module deletes it through the Auth admin API and tries again. It may only
-- ever pick a login that is all of these:
--   * a staff login address (<username>@<gym code>.staff.gym-spa.invalid) of an existing gym, and
--     created by the staff module for that gym (app_metadata.gym_id);
--   * not a platform admin. Platform admins (step MT-3) are Auth users without a staff row, kept
--     in public.platform_admins (user_id). That table doesn't exist before MT-3; MT-3 replaces
--     this dynamic look-up with a direct one. A look-up that fails refuses (raises);
--   * without a staff account, and made more than 2 minutes ago, so a create still running is
--     never touched.
-- Deciding here, in one place, keeps the rule testable (supabase/tests/170-staff-admin).
create function public.staff_admin_orphan(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  login auth.users;
  platform_admins regclass := to_regclass('public.platform_admins');
  is_platform_admin boolean := false;
begin
  select * into login from auth.users u where u.email = p_email and not u.is_sso_user;
  if not found then
    return null;
  end if;

  if login.email !~ '^[a-z][a-z0-9._-]{2,31}@[a-z](-?[a-z0-9])+\.staff\.gym-spa\.invalid$'
     or not exists (
       select 1 from public.gyms g
        where login.email = split_part(login.email, '@', 1) || '@' || g.code || '.staff.gym-spa.invalid'
          and login.raw_app_meta_data ->> 'gym_id' = g.id::text
     )
  then
    return null;
  end if;

  if platform_admins is not null then
    execute format('select exists (select 1 from %s a where a.user_id = $1)', platform_admins)
      into is_platform_admin
      using login.id;
    if is_platform_admin then
      return null;
    end if;
  end if;

  if exists (select 1 from public.staff_users s where s.id = login.id)
     or login.created_at > now() - interval '2 minutes'
  then
    return null;
  end if;
  return login.id;
end
$$;

revoke execute on function public.staff_admin_orphan(text) from public, anon, authenticated;
grant execute on function public.staff_admin_orphan(text) to service_role;

-- Guards ------------------------------------------------------------------------------------------

-- As before, plus: a manager may change a username. The staff module changes the login's address
-- first; login_matches refuses a username that doesn't match it. Nobody renames themself.
create or replace function app.guard_staff_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not app.can_grant_role(new.role_id) then
      raise exception using errcode = '42501', message = 'cannot_grant_role',
        detail = 'You can only give roles whose permissions you have yourself';
    end if;
    if new.all_branches and not app.has_all_branches() then
      raise exception using errcode = '42501', message = 'cannot_grant_all_branches',
        detail = 'Only staff with access to all branches can give it';
    end if;
    -- Someone else chose the first password, so the new staff member has to change it.
    new.must_change_password := true;
    -- Their own choices, made later by them.
    new.nav_tabs := null;
    new.theme_preference := null;
    new.text_size := null;
    return new;
  end if;

  if old.id = auth.uid() then
    if (new.username, new.full_name, new.phone, new.role_id, new.all_branches, new.is_active,
        new.must_change_password, new.deleted_at)
       is distinct from
       (old.username, old.full_name, old.phone, old.role_id, old.all_branches, old.is_active,
        old.must_change_password, old.deleted_at)
    then
      raise exception using errcode = '42501', message = 'cannot_edit_own_account',
        detail = 'Staff can change only their own language, tabs and look; a manager changes the rest';
    end if;
    return new;
  end if;

  if (new.nav_tabs, new.theme_preference, new.text_size)
     is distinct from (old.nav_tabs, old.theme_preference, old.text_size) then
    raise exception using errcode = '42501', message = 'own_preference_only',
      detail = 'Only the staff member themself chooses their tabs and look';
  end if;
  if not app.can_manage_staff(old.id) then
    raise exception using errcode = '42501', message = 'cannot_manage_staff',
      detail = 'This staff member has access you do not have';
  end if;
  if new.role_id is distinct from old.role_id and not app.can_grant_role(new.role_id) then
    raise exception using errcode = '42501', message = 'cannot_grant_role',
      detail = 'You can only give roles whose permissions you have yourself';
  end if;
  if new.all_branches and not old.all_branches and not app.has_all_branches() then
    raise exception using errcode = '42501', message = 'cannot_grant_all_branches',
      detail = 'Only staff with access to all branches can give it';
  end if;
  return new;
end
$$;

-- As before, plus: while the gym is read-only, a manager can still deactivate a staff member and
-- set must_change_password (a password reset). Both only take access away; nothing else on the
-- row may change with them. The guards still decide who may do it.
create or replace function app.check_gym_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'staff_users' and tg_op = 'UPDATE' then
    if old.id = auth.uid() then
      return new;
    end if;
    if (to_jsonb(new) - array['is_active', 'must_change_password', 'updated_at', 'updated_by'])
         = (to_jsonb(old) - array['is_active', 'must_change_password', 'updated_at', 'updated_by'])
       and (new.is_active = old.is_active or not new.is_active)
       and (new.must_change_password = old.must_change_password or new.must_change_password)
    then
      return new;
    end if;
  end if;
  if not app.gym_writable() then
    raise exception using errcode = '42501', message = 'gym_read_only',
      detail = 'This gym is read-only: it is suspended, or its subscription or license has ended';
  end if;
  return coalesce(new, old);
end
$$;
