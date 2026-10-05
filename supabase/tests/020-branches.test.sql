-- branches: who can see, add and edit them.
begin;
select plan(12);
select tests.create_fixture();

select tests.authenticate_as_anon();
select throws_ok('select * from public.branches', '42501', 'permission denied for table branches',
  'anonymous visitors cannot read branches');

select tests.authenticate_as(tests.staff('reception_a'));
select set_eq('select id from public.branches', array[tests.branch('B901')],
  'staff see only their own branches');

select tests.authenticate_as(tests.staff('trainer_ab'));
select set_eq('select id from public.branches', array[tests.branch('B901'), tests.branch('B902')],
  'staff with several branches see each of them');

select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select id from public.branches', 'deactivated staff see no branches');

select tests.authenticate_as(tests.staff('admin'));
select set_eq('select id from public.branches', $$ select * from tests.all_ids('public.branches') $$,
  'staff with all branches see every branch');
select lives_ok(
  $$ insert into public.branches (code, name_ckb) values ('B903', 'لقی نوێ') returning id $$,
  'staff with branches.manage and all branches can add a branch (and read it back)'
);
select is(
  tests.row_count($$ update public.branches set phone = '0770 123 4567' where code = 'B901' $$), 1,
  'staff with branches.manage can edit a branch'
);
select throws_ok(
  $$ update public.branches set code = 'B999' where code = 'B901' $$, '42501', 'read_only_column',
  'a branch code never changes (it is printed on receipts)'
);
select throws_ok($$ delete from public.branches where code = 'B901' $$, '42501',
  'permission denied for table branches', 'branches are never deleted (deleted_at instead)');

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ insert into public.branches (code, name_ckb) values ('B904', 'لقی نوێ') $$, '42501',
  'new row violates row-level security policy for table "branches"',
  'a branch manager cannot add branches'
);
select is(
  tests.row_count($$ update public.branches set phone = '0770 123 4567' where code = 'B901' $$), 0,
  'a branch manager cannot edit branches'
);

-- branches.manage alone is not enough: adding branches also needs access to all of them.
select tests.clear_authentication();
select tests.create_staff('branch_editor', tests.create_role('دروستکەری لق', array['branches.manage'])::text,
  array['B901']);
select tests.authenticate_as(tests.staff('branch_editor'));
select throws_ok(
  $$ insert into public.branches (code, name_ckb) values ('B905', 'لقی نوێ') $$, '42501',
  'new row violates row-level security policy for table "branches"',
  'branches.manage without access to all branches cannot add branches'
);

select * from finish();
rollback;
