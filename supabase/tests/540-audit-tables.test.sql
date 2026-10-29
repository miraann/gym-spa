-- Step 10e: the tables the audit log names, for the screen's filter: only the caller's gym, and
-- only with audit.view.
begin;
select plan(3);
select tests.create_fixture();

select tests.clear_authentication();
insert into public.audit_logs (gym_id, table_name, row_id, action) values
  (tests.gym('pgtap-a'), 'members', 'x', 'insert'),
  (tests.gym('pgtap-a'), 'members', 'y', 'update'),
  (tests.gym('pgtap-a'), 'plans', 'z', 'insert'),
  (tests.gym('pgtap-b'), 'gym_b_only', 'w', 'insert');

select tests.authenticate_as(tests.staff('owner'));
select ok((select array_agg(t) from public.audit_tables() t) @> array['members', 'plans'],
  'the Owner gets the tables of their gym''s log');
select ok(not exists (select 1 from public.audit_tables() t where t = 'gym_b_only'), 'not another gym''s');
select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.audit_tables()), 0, 'reception has no audit log');

select * from finish();
rollback;
