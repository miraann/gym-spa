-- staff_branch_access: the branch rule kept as rows, for RLS and the sync streams.
begin;
select plan(11);
select tests.create_fixture();

create temporary view access as
select s.username, b.code
  from public.staff_branch_access a
  join public.staff_users s on s.id = a.staff_id
  join public.branches b on b.id = a.branch_id;
grant select on access to authenticated;

select set_eq(
  $$ select code from access where username = 'trainer_ab' $$, array['B901', 'B902'],
  'staff get a row for each of their branches'
);
select set_eq(
  $$ select code from access where username = 'admin' $$, $$ select code from public.branches $$,
  'staff with all branches get every branch'
);
select is_empty($$ select code from access where username = 'former_a' $$,
  'deactivated staff get no rows');

-- Changes keep the rows up to date.
insert into public.branches (code, name_ckb) values ('B903', 'لقی نوێ');
select set_eq($$ select username from access where code = 'B903' $$, array['owner', 'admin'],
  'a new branch is added for staff with all branches only');

insert into public.staff_branches (staff_id, branch_id) values (tests.staff('reception_a'), tests.branch('B902'));
select set_eq($$ select code from access where username = 'reception_a' $$, array['B901', 'B902'],
  'giving a branch adds its row');

delete from public.staff_branches where staff_id = tests.staff('reception_a') and branch_id = tests.branch('B901');
select set_eq($$ select code from access where username = 'reception_a' $$, array['B902'],
  'taking a branch away removes its row');

update public.staff_users set is_active = true where username = 'former_a';
select set_eq($$ select code from access where username = 'former_a' $$, array['B901'],
  'reactivating staff gives their branches back');

update public.staff_users set all_branches = true where username = 'reception_b';
select is((select count(*)::integer from access where username = 'reception_b'), tests.total_rows('public.branches'),
  'giving all branches adds every branch');

update public.staff_users set deleted_at = now() where username = 'trainer_ab';
select is_empty($$ select code from access where username = 'trainer_ab' $$, 'deleted staff lose every row');

-- Clients read only their own rows and can't write any.
select tests.authenticate_as(tests.staff('manager_a'));
select set_eq('select staff_id from public.staff_branch_access', array[tests.staff('manager_a')],
  'staff read only their own access rows');
select throws_ok(
  $$ insert into public.staff_branch_access (staff_id, branch_id) values (tests.staff('manager_a'), tests.branch('B902')) $$,
  '42501', 'permission denied for table staff_branch_access', 'nobody writes access rows directly'
);

select * from finish();
rollback;
