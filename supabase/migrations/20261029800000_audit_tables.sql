-- The audit log screen (Phase 10, step 10e; the Phase 10 plan in spec §8 of 2026-10-29). Additions
-- only. Staff with audit.view already read audit_logs (RLS); this lists the tables it names, for the
-- screen's filter.

-- The tables the caller's audit log names, in order. As the caller (RLS: audit.view, their gym).
-- One index lookup per table (a skip scan on audit_logs_row_idx), so a long log stays quick.
create function public.audit_tables()
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive names (name) as (
    select min(a.table_name) from public.audit_logs a
    union all
    select (select min(a.table_name) from public.audit_logs a where a.table_name > n.name)
      from names n
     where n.name is not null
  )
  select n.name from names n where n.name is not null
$$;

revoke execute on function public.audit_tables() from public, anon;
grant execute on function public.audit_tables() to authenticated;
