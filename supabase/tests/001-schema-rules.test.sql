-- Rules every table and function must follow (CLAUDE.md → Database rules). These also catch new
-- tables in later phases that forget one of them.
begin;
select plan(16);

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

select ok(
  not has_column_privilege('authenticated', 'public.staff_pins', 'pin_hash', 'SELECT')
    and not has_column_privilege('anon', 'public.staff_pins', 'pin_hash', 'SELECT'),
  'no client can read PIN hashes'
);

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

-- Many gyms (spec §2.6) ------------------------------------------------------------------------

select is_empty($$
  select c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname not in ('permissions', 'gyms')
     and not exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'gym_id' and a.atttypid = 'uuid'::regtype
          and (a.attnotnull or c.relname = 'audit_logs')
     )
$$, 'every table except the permission catalog belongs to a gym (gym_id, not null; the log keeps old entries without one)');

select is_empty($$
  select c.relname, p.polname from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relnamespace = 'public'::regnamespace and c.relname <> 'permissions'
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), 'current_gym_id') !~ 'current_gym_id'
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'current_gym_id') !~ 'current_gym_id')
$$, 'every policy checks the gym (app.current_gym_id()) in each of its conditions');

select is_empty($$
  select c.conrelid::regclass, c.conname from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'gym_id')
     and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'gym_id')
     and not exists (
       select 1 from pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'gym_id' and a.attnum = any (c.conkey)
     )
$$, 'every link between two gym tables includes gym_id, so it can never cross gyms');

select is_empty($$
  select c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname <> 'audit_logs'
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'gym_id')
     and not exists (
       select 1 from pg_trigger t
        where t.tgrelid = c.oid and t.tgname = 'read_only'
          and 'gym_id' = any (string_to_array(encode(t.tgargs, 'escape'), '\000'))
     )
$$, 'a row''s gym never changes (read_only trigger; the log can''t change at all)');

select is_empty($$
  select c.relname from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname not in ('staff_pins', 'device_status', 'staff_branch_access', 'audit_logs')
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'gym_id')
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'check_writable')
$$, 'every gym table refuses changes while the gym is read-only, except PINs, device reports, derived access and the log');

select * from finish();
rollback;
