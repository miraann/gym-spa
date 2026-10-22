-- The seller panel's member counts (step 2h, migration 20261022100000): numbers per gym for
-- platform admins with two-step login, never any member's data, and nothing for anyone else.
begin;
select plan(8);
select tests.create_fixture();
select tests.create_platform_admin('ali@clickgroup.example');

insert into public.members (id, gym_id, branch_id, full_name, gender, phone, status, status_reason)
values
  ('28000000-0000-4000-8000-000000000001', tests.gym('pgtap-a'), tests.branch('B901'), 'ئارام کەریم', 'male', '+9647502800001', 'active', null),
  ('28000000-0000-4000-8000-000000000002', tests.gym('pgtap-a'), tests.branch('B901'), 'هانا عومەر', 'female', '+9647502800002', 'active', null),
  ('28000000-0000-4000-8000-000000000003', tests.gym('pgtap-a'), tests.branch('B902'), 'دانا سەلیم', 'male', '+9647502800003', 'suspended', 'تاقیکردنەوە'),
  ('28000000-0000-4000-8000-000000000004', tests.gym('pgtap-a'), tests.branch('B902'), 'شوان ڕەشید', 'male', '+9647502800004', 'archived', 'تاقیکردنەوە'),
  ('28000000-0000-4000-8000-000000000005', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'لاڤین قادر', 'female', '+9647502800005', 'active', null);
update public.members set deleted_at = now() where id = '28000000-0000-4000-8000-000000000002';
create temporary table all_gyms on commit drop as select count(*)::integer as total from public.gyms;
grant select on all_gyms to authenticated;

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select results_eq(
  $$ select members, active_members from public.seller_member_counts()
      where gym_id = tests.gym('pgtap-a') $$,
  $$ values (2, 1) $$,
  'members leave out archived and deleted ones; active members are only the active ones'
);
select results_eq(
  $$ select members, active_members from public.seller_member_counts(tests.gym('pgtap-b')) $$,
  $$ values (1, 1) $$,
  'one gym''s counts'
);
select is(
  (select count(*)::integer from public.seller_member_counts()),
  (select total from all_gyms),
  'every gym has a row, also one without members'
);
select is(
  (select array_to_string(proargnames, ',') from pg_proc
    where oid = 'public.seller_member_counts(uuid)'::regprocedure),
  'p_gym_id,gym_id,members,active_members',
  'it returns numbers only, never names'
);

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal1');
select throws_ok($$ select * from public.seller_member_counts() $$,
  '42501', 'mfa_required', 'a platform admin needs the two-step login');

select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select * from public.seller_member_counts() $$,
  '42501', 'not_platform_admin', 'a gym''s Owner can''t read the counts');

select tests.authenticate_as_anon();
select throws_ok($$ select * from public.seller_member_counts() $$,
  '42501', null, 'nor can anyone who isn''t logged in');

select tests.clear_authentication();
select ok(
  not has_function_privilege('anon', 'public.seller_member_counts(uuid)', 'execute'),
  'anon has no execute privilege'
);

select * from finish();
rollback;
