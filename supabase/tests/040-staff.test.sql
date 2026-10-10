-- staff_users and staff_branches: who sees whom, adding staff, and the escalation guards.
begin;
select plan(30);
select tests.create_fixture();

-- The staff service creates the Auth user first, then the staff row with the caller's session.
select tests.create_auth_user('new_a');
select tests.create_auth_user('new_b');

-- Who sees whom
select tests.authenticate_as_anon();
select throws_ok('select * from public.staff_users', '42501', 'permission denied for table staff_users',
  'anonymous visitors cannot read staff');

select tests.authenticate_as(tests.staff('reception_a'));
select set_eq('select username from public.staff_users', array['reception_a'],
  'staff without staff.view see only themselves');

select tests.authenticate_as(tests.staff('manager_a'));
select set_eq(
  'select username from public.staff_users',
  array['manager_a', 'reception_a', 'former_a', 'trainer_ab', 'owner', 'admin'],
  'a branch manager sees staff of their branch and staff of all branches, not other branches'
);
select is_empty($$ select 1 from public.staff_branches where staff_id = tests.staff('reception_b') $$,
  'a branch manager does not see the branches of staff they cannot see');

select tests.authenticate_as(tests.staff('admin'));
select set_eq('select id from public.staff_users', $$ select * from tests.all_ids('public.staff_users') $$,
  'staff with all branches and staff.view see everyone');

select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select id from public.staff_users', 'deactivated staff see nobody, not even themselves');

-- Adding staff
select tests.authenticate_as(tests.staff('manager_a'));
select lives_ok(
  $$ insert into public.staff_users (id, username, full_name, role_id, must_change_password)
     values (tests.auth_user_id('new_a'), 'new_a', 'کارمەندی نوێ', tests.role('receptionist'), false) $$,
  'a branch manager can add a receptionist'
);
select throws_ok(
  $$ insert into public.staff_users (id, username, full_name, role_id)
     values (tests.auth_user_id('new_b'), 'new_b', 'کارمەندی نوێ', tests.role('admin')) $$,
  '42501', 'cannot_grant_role', 'a branch manager cannot give a role with permissions they do not have'
);
select throws_ok(
  $$ insert into public.staff_users (id, username, full_name, role_id, all_branches)
     values (tests.auth_user_id('new_b'), 'new_b', 'کارمەندی نوێ', tests.role('receptionist'), true) $$,
  '42501', 'cannot_grant_all_branches', 'a branch manager cannot give access to all branches'
);
select lives_ok(
  $$ insert into public.staff_branches (staff_id, branch_id) values (tests.auth_user_id('new_a'), tests.branch('B901')) $$,
  'a branch manager can give staff access to their branch'
);
select throws_ok(
  $$ insert into public.staff_branches (staff_id, branch_id) values (tests.auth_user_id('new_a'), tests.branch('B902')) $$,
  '42501', 'no_branch_access', 'nobody can give access to a branch they cannot access'
);

select tests.clear_authentication();
select is((select must_change_password from public.staff_users where username = 'new_a'), true,
  'new staff must change the password someone else chose for them');

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ insert into public.staff_users (id, username, full_name, role_id)
     values (tests.auth_user_id('new_b'), 'new_b', 'کارمەندی نوێ', tests.role('receptionist')) $$,
  '42501', 'new row violates row-level security policy for table "staff_users"',
  'staff without staff.manage cannot add staff'
);
select throws_ok(
  $$ insert into public.staff_branches (staff_id, branch_id) values (tests.staff('reception_a'), tests.branch('B902')) $$,
  -- The guard trigger runs before the RLS check, so its error comes first.
  '42501', 'cannot_manage_staff',
  'staff without staff.manage cannot change branch access'
);

-- Editing staff
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ update public.staff_users set role_id = tests.role('admin') where username = 'reception_a' $$,
  '42501', 'cannot_grant_role', 'a branch manager cannot promote staff above their own permissions'
);
select is(tests.row_count($$ update public.staff_users set is_active = false where username = 'reception_a' $$), 1,
  'a branch manager can deactivate staff of their branch');
select is(tests.row_count($$ update public.staff_users set is_active = false where username = 'reception_b' $$), 0,
  'a branch manager cannot edit staff of another branch');
select throws_ok($$ update public.staff_users set is_active = false where username = 'trainer_ab' $$,
  '42501', 'cannot_manage_staff', 'a branch manager cannot edit staff who also work in another branch');
select throws_ok($$ update public.staff_users set is_active = false where username = 'admin' $$,
  '42501', 'cannot_manage_staff', 'a branch manager cannot edit staff with more permissions');
select throws_ok($$ update public.staff_users set role_id = tests.role('admin') where username = 'manager_a' $$,
  '42501', 'cannot_edit_own_account', 'nobody can change their own role');
select is(tests.row_count($$ update public.staff_users set preferred_language = 'en' where username = 'manager_a' $$), 1,
  'staff can change their own language');
select is(
  tests.row_count($$ delete from public.staff_branches where staff_id = tests.auth_user_id('new_a') $$), 1,
  'a branch manager can take branch access away from staff they manage'
);

select tests.authenticate_as(tests.staff('admin'));
select throws_ok($$ update public.staff_users set username = 'boss' where username = 'reception_b' $$,
  '42501', 'read_only_column', 'usernames change only through the staff service');
select throws_ok($$ update public.staff_users set role_id = tests.role('owner') where username = 'reception_b' $$,
  '42501', 'cannot_grant_role', 'only the Owner can give the Owner role');
select throws_ok($$ delete from public.staff_users where username = 'reception_b' $$,
  '42501', 'permission denied for table staff_users', 'staff accounts are deactivated, never deleted');

select tests.authenticate_as(tests.staff('owner'));
select lives_ok($$ update public.staff_users set role_id = tests.role('owner') where username = 'admin' $$,
  'the Owner can give the Owner role');

-- Changing your own password (through Supabase Auth) clears must_change_password.
select tests.clear_authentication();
update public.staff_users set must_change_password = true where id = tests.staff('reception_b');
update auth.users set encrypted_password = 'new-hash' where id = tests.staff('reception_b');
select is((select must_change_password from public.staff_users where id = tests.staff('reception_b')), false,
  'changing your password clears must_change_password');

-- The staff service changes the Auth email first, then the username; the two must always match.
select tests.authenticate_as_service_role();
select throws_ok(
  $$ update public.staff_users set username = 'reception_b2' where id = tests.staff('reception_b') $$,
  '23514', 'staff_login_mismatch', 'a username never changes without its login'
);
-- (What Supabase Auth's admin API does for the staff service.)
select tests.clear_authentication();
update auth.users set email = 'reception_b2@pgtap-a.staff.gym-spa.invalid' where id = tests.staff('reception_b');
select tests.authenticate_as_service_role();
select is(tests.row_count($$ update public.staff_users set username = 'reception_b2' where id = tests.auth_user_id('reception_b2') $$), 1,
  'the staff service (service role) can change a username together with its login');

-- New staff need an Auth user whose email is their username at their gym, whoever adds them.
select tests.clear_authentication();
select tests.create_auth_user('new_c', 'pgtap-b');
select throws_ok(
  $$ insert into public.staff_users (id, gym_id, username, full_name, role_id)
     values (tests.auth_user_id('new_c', 'pgtap-b'), tests.gym('pgtap-a'), 'new_c', 'کارمەندی نوێ', tests.role('receptionist')) $$,
  '23514', 'staff_login_mismatch', 'a staff member''s login must name their own gym'
);

select * from finish();
rollback;
