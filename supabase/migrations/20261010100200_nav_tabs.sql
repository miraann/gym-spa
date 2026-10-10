-- The phone's bottom tab bar: each staff member may choose their own 4 tabs (design step D-1).
-- Empty means their role's defaults, which live in the app (packages/core/src/nav-tabs.ts).
-- Tabs follow the staff member to every device, and only they change them.

-- True when tabs are exactly 4 different pages of the menu. Keep the list identical to
-- NAV_ITEM_KEYS in packages/core/src/nav-tabs.ts (a test compares them), on one line.
create function app.is_valid_nav_tabs(tabs text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(tabs) = 4
     and array_ndims(tabs) = 1
     and tabs <@ array['home', 'checkin', 'members', 'plans', 'subscriptions', 'payments', 'shop', 'cashRegister', 'lockers', 'spa', 'classes', 'trainers', 'staff', 'roles', 'branches', 'reports', 'notifications', 'auditLog', 'devices', 'settings']::text[]
     and (select count(distinct tab) from unnest(tabs) as tab) = 4
$$;

alter table public.staff_users
  add column nav_tabs text[],
  add constraint staff_users_nav_tabs_valid check (nav_tabs is null or app.is_valid_nav_tabs(nav_tabs));

-- Same as before, plus: a new staff member starts with their role's tabs, and nobody changes
-- another staff member's tabs (a manager could otherwise move a receptionist's tabs under them).
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
    -- Their own choice, made later by them.
    new.nav_tabs := null;
    return new;
  end if;

  if new.username is distinct from old.username then
    raise exception using errcode = '42501', message = 'read_only_column',
      detail = 'Usernames change through the staff service, which also changes the login';
  end if;

  if old.id = auth.uid() then
    if (new.full_name, new.phone, new.role_id, new.all_branches, new.is_active, new.must_change_password, new.deleted_at)
       is distinct from
       (old.full_name, old.phone, old.role_id, old.all_branches, old.is_active, old.must_change_password, old.deleted_at)
    then
      raise exception using errcode = '42501', message = 'cannot_edit_own_account',
        detail = 'Staff can change only their own language and tabs; a manager changes the rest';
    end if;
    return new;
  end if;

  if new.nav_tabs is distinct from old.nav_tabs then
    raise exception using errcode = '42501', message = 'own_preference_only',
      detail = 'Only the staff member themself chooses their tabs';
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
