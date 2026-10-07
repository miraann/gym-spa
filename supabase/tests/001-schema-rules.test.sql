-- Rules every table and function must follow (CLAUDE.md → Database rules). These also catch new
-- tables in later phases that forget one of them.
begin;
select plan(12);

select is_empty($$
  select c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'every table has row level security enabled');

select is_empty($$
  select c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
$$, 'every table has at least one policy');

select is_empty($$
  select c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
     and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
$$, 'anonymous visitors have no access to any table');

select is_empty($$
  select p.oid::regprocedure from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
$$, 'anonymous visitors cannot call any function');

select is_empty($$
  select p.oid::regprocedure from pg_proc p
   where p.pronamespace in ('app'::regnamespace, 'public'::regnamespace)
     and not exists (select 1 from unnest(p.proconfig) as c where c like 'search_path=%')
$$, 'every function has a fixed search_path');

select is_empty($$
  select c.conrelid::regclass, c.conname from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (select array_agg(k order by o)
                 from unnest(i.indkey::int2[]) with ordinality as t (k, o)
                where o <= cardinality(c.conkey)) = c.conkey
     )
$$, 'every foreign key has an index');

select is_empty($$
  select c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname not in ('permissions', 'device_status', 'staff_branch_access', 'audit_logs')
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'audit')
$$, 'every table is audited, except the permission catalog, device reports, derived branch access and the log itself');

select is_empty($$
  select pt.tablename from pg_publication_tables pt
   where pt.pubname = 'powersync' and pt.tablename in ('staff_pins', 'audit_logs')
$$, 'PIN hashes and the audit log are never synced to devices');

select is_empty($$
  select c.relname, a.attname from pg_attribute a
    join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     and a.atttypid in ('real'::regtype, 'double precision'::regtype, 'money'::regtype)
$$, 'no column stores numbers as float or money (money is numeric(14,2))');

select is_empty($$
  select c.relname, a.attname from pg_attribute a
    join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     and a.atttypid = 'timestamp'::regtype
$$, 'every timestamp is timestamptz');

select is_empty($$
  select c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and not exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and a.atttypid = 'uuid'::regtype
          and a.attnum in (select unnest(i.indkey::int2[]) from pg_index i where i.indrelid = c.oid and i.indisprimary)
     )
     and c.relname <> 'permissions'
$$, 'every primary key is a uuid (the permission catalog uses its key)');

select is_empty($$
  select pt.tablename from pg_publication_tables pt
   where pt.pubname = 'powersync'
     and not has_table_privilege('powersync_role', format('%I.%I', pt.schemaname, pt.tablename), 'SELECT')
$$, 'PowerSync can read every table in the powersync publication');

select * from finish();
rollback;
