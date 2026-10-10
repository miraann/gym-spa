-- Appearance (spec §6.1, design step D-2). The gym's look is gym-wide rows in settings, so every
-- device of the gym gets it and both editions work the same: brand color, corner style and logo
-- (kept in Postgres, not Storage). Each staff member's own look (light/dark, text size) is on their
-- profile, so it follows them to every device. The app has the same rules in
-- packages/core/src/appearance.ts; tests compare them.

-- True when value is a logo: {"type": PNG, JPEG or WebP, "data": base64}, at most 300 KB, and the
-- file really is that type (its first bytes), so an SVG or a renamed file is refused.
create function app.is_valid_logo(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(value)) <> 2
      or jsonb_typeof(value -> 'type') is distinct from 'string'
      or jsonb_typeof(value -> 'data') is distinct from 'string'
      or value ->> 'type' not in ('image/png', 'image/jpeg', 'image/webp')
      or value ->> 'data' = ''
      or value ->> 'data' !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
      then false
    else (
      select octet_length(bytes) <= 307200
         and case value ->> 'type'
               when 'image/png' then substring(bytes from 1 for 8) = '\x89504e470d0a1a0a'::bytea
               when 'image/jpeg' then substring(bytes from 1 for 3) = '\xffd8ff'::bytea
               else substring(bytes from 1 for 4) = '\x52494646'::bytea
                    and substring(bytes from 9 for 4) = '\x57454250'::bytea
             end
        from (select decode(value ->> 'data', 'base64') as bytes) as decoded
    )
  end
$$;

-- The known setting keys and their allowed values (the app's rules: packages/core).
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
    when 'appearance.brand_color' then jsonb_typeof(value) = 'string' and (value #>> '{}' = any (array['indigo', 'blue', 'purple', 'gray']) or value #>> '{}' ~ '^#[0-9a-f]{6}$')
    -- Corners: soft (the default), medium or sharp.
    when 'appearance.corner_style' then jsonb_typeof(value) = 'string' and value #>> '{}' in ('soft', 'medium', 'sharp')
    when 'appearance.logo' then app.is_valid_logo(value)
    else false
  end
$$;

-- One look for the whole gym: no branch has its own (spec §6.1). Saving needs settings.edit and
-- access to all branches, like every gym-wide setting (the existing policies).
alter table public.settings
  add constraint settings_appearance_gym_wide check (key not like 'appearance.%' or branch_id is null);

-- The audit log keeps a logo's type and size instead of the picture.
create function app.summarize_logo(row_values jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when row_values ? 'value' then
      row_values || jsonb_build_object('value', jsonb_build_object(
        'type', row_values -> 'value' -> 'type',
        'bytes', octet_length(decode(coalesce(row_values -> 'value' ->> 'data', ''), 'base64'))
      ))
    else row_values
  end
$$;

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  redacted text[] := coalesce(tg_argv[0]::text[], '{}');
  old_values jsonb;
  new_values jsonb;
  row_values jsonb;
  changed text[];
  headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_values := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_values := to_jsonb(new);
  end if;
  row_values := coalesce(new_values, old_values);

  if tg_op = 'UPDATE' then
    -- Keep only what changed. A new updated_at/updated_by alone is not a change: the log records
    -- who and when anyway.
    select coalesce(array_agg(n.key order by n.key), '{}')
      into changed
      from jsonb_each(new_values) as n
     where n.key not in ('updated_at', 'updated_by')
       and n.value is distinct from old_values -> n.key;

    if cardinality(changed) = 0 then
      return null;
    end if;

    select jsonb_object_agg(o.key, o.value) into old_values
      from jsonb_each(old_values) as o where o.key = any (changed);
    select jsonb_object_agg(n.key, n.value) into new_values
      from jsonb_each(new_values) as n where n.key = any (changed);
  end if;

  if cardinality(redacted) > 0 then
    select jsonb_object_agg(o.key, case when o.key = any (redacted) then to_jsonb('redacted'::text) else o.value end)
      into old_values
      from jsonb_each(old_values) as o;
    select jsonb_object_agg(n.key, case when n.key = any (redacted) then to_jsonb('redacted'::text) else n.value end)
      into new_values
      from jsonb_each(new_values) as n;
  end if;

  -- Logos are pictures of up to 300 KB: the log keeps their type and size, not the picture.
  if tg_table_name = 'settings' and row_values ->> 'key' = 'appearance.logo' then
    old_values := app.summarize_logo(old_values);
    new_values := app.summarize_logo(new_values);
  end if;

  insert into public.audit_logs
    (actor_id, gym_id, table_name, row_id, branch_id, action, changed_columns, old_values, new_values, ip, device_id)
  values (
    auth.uid(),
    case
      when tg_table_name = 'gyms' then (row_values ->> 'id')::uuid
      else (row_values ->> 'gym_id')::uuid
    end,
    tg_table_name,
    coalesce(row_values ->> 'id', row_values ->> 'staff_id'),
    case
      when tg_table_name = 'branches' then (row_values ->> 'id')::uuid
      else (row_values ->> 'branch_id')::uuid
    end,
    lower(tg_op),
    changed,
    old_values,
    new_values,
    app.request_ip(headers),
    app.request_device_id(headers)
  );
  return null;
end
$$;

-- Each staff member's own look. Empty means not chosen yet: the device keeps what it has (theme:
-- follow the device; text: normal).
alter table public.staff_users
  add column theme_preference text
    constraint staff_users_theme_preference_valid check (theme_preference in ('light', 'dark', 'system')),
  add column text_size text
    constraint staff_users_text_size_valid check (text_size in ('normal', 'large'));

-- Same as before, plus: the look is the staff member's own choice too.
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
