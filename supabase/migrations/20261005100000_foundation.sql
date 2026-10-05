-- Foundation: the private `app` schema, shared types, and the triggers every table uses (row
-- stamps, read-only columns, audit log).
--
-- Conventions for every table (see README → Database):
--   * RLS enabled, explicit grants (nothing is exposed by default), policies tested in supabase/tests.
--   * Errors raised by guards use a stable key as the message (e.g. 'cannot_grant_role') and an
--     English explanation as the detail. The app translates the key; the detail is for logs.
--     SQLSTATE 42501 = not allowed, 23514 = invalid value.

-- Internal helpers live in `app`. The Data API exposes only `public`, so nothing here can be called
-- as an RPC. Only signed-in users (for RLS policies) and the service role can use the schema.
create schema app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Languages of the app: Kurdish Sorani (the default), English and Arabic.
create type public.language_code as enum ('ckb', 'en', 'ar');

-- Text that is either empty (null) or 1..max_length characters with no spaces at either end.
create function app.is_clean_text(value text, max_length integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is null
    or (length(value) between 1 and max_length and value !~ '^\s' and value !~ '\s$')
$$;

-- True when no staff member is acting: migrations, Supabase Auth itself, and server code using the
-- secret (service role) key, such as the bootstrap script and Edge Functions. Guards skip their
-- per-user checks in this case. The anon role has no table privileges, so it never gets that far.
create function app.is_system_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', 'none') in ('none', 'service_role')
$$;

-- Row stamps for tables with created_at/created_by/updated_at/updated_by.
-- Devices upload each change under its author's own session, so auth.uid() is the real author and
-- these columns are never taken from the payload. created_at may come from the device (a row made
-- offline keeps the time it was made), but never lies in the future.
create function app.stamp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := least(coalesce(new.created_at, now()), now());
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_at := now();
    new.updated_by := new.created_by;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end
$$;

-- The same for link tables that only have created_at/created_by (rows are added and removed, never
-- edited).
create function app.stamp_created()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := least(coalesce(new.created_at, now()), now());
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end
$$;

-- Rejects updates that change any column named in the trigger arguments.
create function app.read_only_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  column_name text;
begin
  foreach column_name in array tg_argv loop
    if new_row -> column_name is distinct from old_row -> column_name then
      raise exception using
        errcode = '42501',
        message = 'read_only_column',
        detail = format('%s.%s cannot be changed', tg_table_name, column_name);
    end if;
  end loop;
  return new;
end
$$;

-- Audit log ------------------------------------------------------------------------------------

-- Append-only record of every change to important tables, written by app.audit_row(). Read online
-- only (it is not synced to devices). Values of redacted columns (secrets) are never stored.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- auth.uid() of the staff member; empty for system changes (migrations, Auth, server code).
  actor_id uuid,
  table_name text not null,
  row_id text not null,
  -- The branch the row belongs to, for filtering. Empty for rows that belong to no single branch.
  branch_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- For updates: the columns that changed. old_values/new_values then hold only those columns.
  changed_columns text[],
  old_values jsonb,
  new_values jsonb,
  -- From the request headers. Informational only: both can be set by the client.
  ip inet,
  device_id uuid
);

create index audit_logs_row_idx on public.audit_logs (table_name, row_id, occurred_at desc);
create index audit_logs_occurred_at_idx on public.audit_logs (occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);
create index audit_logs_branch_idx on public.audit_logs (branch_id, occurred_at desc);

-- Read access is granted in the access-control migration (it needs has_permission()). Until then
-- RLS without policies lets nobody read.
alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;
grant select, insert on table public.audit_logs to service_role;

create function app.reject_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'audit_log_append_only',
    detail = 'Audit log entries cannot be changed or deleted';
end
$$;

create trigger append_only
  before update or delete on public.audit_logs
  for each row execute function app.reject_audit_change();

create trigger append_only_truncate
  before truncate on public.audit_logs
  for each statement execute function app.reject_audit_change();

-- The client's IP address: the first X-Forwarded-For entry, if it is a valid address.
create function app.request_ip(headers jsonb)
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  candidate text := btrim(split_part(coalesce(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', ''), ',', 1));
begin
  if candidate !~ '^[0-9A-Fa-f:.]{2,45}$' then
    return null;
  end if;
  return candidate::inet;
exception
  when invalid_text_representation then
    return null;
end
$$;

-- The device that sent the request (the app sends its device ID in an X-Device-Id header).
create function app.request_device_id(headers jsonb)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if headers ->> 'x-device-id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return (headers ->> 'x-device-id')::uuid;
  end if;
  return null;
end
$$;

-- AFTER trigger for audited tables. Optional argument: a text[] literal of columns whose values are
-- secret, e.g. execute function app.audit_row('{salt,hash}').
create function app.audit_row()
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

  insert into public.audit_logs
    (actor_id, table_name, row_id, branch_id, action, changed_columns, old_values, new_values, ip, device_id)
  values (
    auth.uid(),
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
