-- audit_logs: what gets recorded, and that nobody can change it.
begin;
select plan(14);
select tests.create_fixture();

-- An edit from the app, with the headers the app sends.
select tests.authenticate_as(tests.staff('admin'));
select set_config('request.headers',
  '{"x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-device-id": "d0000000-0000-4000-8000-0000000000aa"}', true);
update public.branches set phone = '0770 555 5555' where code = 'B901';

-- Bad header values, and an update that changes nothing.
select set_config('request.headers', '{"x-forwarded-for": "not-an-ip", "x-device-id": "not-a-uuid"}', true);
update public.branches set phone = '0770 666 6666' where code = 'B902';
update public.branches set phone = '0770 666 6666' where code = 'B902';
select set_config('request.headers', '', true);

insert into public.settings (key, value) values ('security.pin_max_attempts', '6');
delete from public.settings where key = 'security.pin_max_attempts';

select tests.clear_authentication();
select results_eq(
  $$ select actor_id, changed_columns, old_values, new_values, ip, device_id
       from public.audit_logs
      where table_name = 'branches' and row_id = tests.branch('B901')::text and action = 'update' $$,
  $$ values (tests.staff('admin'), array['phone'], '{"phone": null}'::jsonb, '{"phone": "0770 555 5555"}'::jsonb,
             '203.0.113.7'::inet, 'd0000000-0000-4000-8000-0000000000aa'::uuid) $$,
  'an update records who, which columns, old and new values, IP and device'
);
select is(
  (select branch_id from public.audit_logs where table_name = 'branches' and row_id = tests.branch('B901')::text limit 1),
  tests.branch('B901'), 'a branch''s log entries belong to that branch'
);
select results_eq(
  $$ select ip, device_id from public.audit_logs
      where table_name = 'branches' and row_id = tests.branch('B902')::text and action = 'update' $$,
  $$ values (null::inet, null::uuid) $$,
  'invalid IP and device headers are ignored, and an update that changes nothing is not logged'
);
select results_eq(
  $$ select actor_id, new_values ->> 'code' from public.audit_logs
      where table_name = 'branches' and row_id = tests.branch('B901')::text and action = 'insert' $$,
  $$ values (null::uuid, 'B901') $$,
  'an insert records the whole row; system changes have no actor'
);
select results_eq(
  $$ select action, old_values ->> 'key', new_values ->> 'key' from public.audit_logs
      where table_name = 'settings' order by occurred_at, action desc $$,
  $$ values ('insert', null, 'security.pin_max_attempts'), ('delete', 'security.pin_max_attempts', null) $$,
  'a delete records the removed row'
);

-- Nobody can change the log, not even the table owner.
select throws_ok('update public.audit_logs set actor_id = null', '42501', 'audit_log_append_only',
  'audit log entries cannot be changed');
select throws_ok('delete from public.audit_logs', '42501', 'audit_log_append_only',
  'audit log entries cannot be deleted');
select throws_ok('truncate public.audit_logs', '42501', 'audit_log_append_only',
  'the audit log cannot be emptied');

-- Reading it
select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ insert into public.audit_logs (table_name, row_id, action) values ('branches', 'x', 'insert') $$,
  '42501', 'permission denied for table audit_logs', 'nobody can write to the audit log directly'
);
select is((select count(*)::integer from public.audit_logs), tests.total_rows('public.audit_logs'),
  'audit.view with all branches reads every entry');

select tests.authenticate_as(tests.staff('manager_a'));
select is_empty('select id from public.audit_logs', 'staff without audit.view read nothing');

select tests.clear_authentication();
select tests.create_staff('auditor_a', tests.create_role('چاودێر', array['audit.view'])::text, array['B901']);
select tests.authenticate_as(tests.staff('auditor_a'));
select ok(exists (select 1 from public.audit_logs), 'audit.view in one branch reads that branch''s entries');
select is_empty(
  $$ select id from public.audit_logs where branch_id is distinct from tests.branch('B901') $$,
  'audit.view in one branch reads nothing of other branches or of no branch'
);

select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select id from public.audit_logs', 'deactivated staff read nothing');

select * from finish();
rollback;
