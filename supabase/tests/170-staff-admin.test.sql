-- The staff module's database half (step MT-2, migration 20261010100400_staff_admin): the checks
-- made before any Auth call, the all-or-nothing staff rows of a new account, renames, what a
-- read-only gym still allows, and which left-behind logins may be deleted.
begin;
select plan(67);
select tests.create_fixture();

-- A username that exists only in gym B.
select tests.create_staff('only_b', 'receptionist', array['B902'], gym_code => 'pgtap-b');

-- Checks before creating an account ------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  '42501', 'permission_denied', 'staff without staff.manage cannot create accounts'
);

select tests.authenticate_as(tests.staff('owner'));
select results_eq(
  $$ select gym_id, gym_code from public.staff_admin_prepare_create('new_a', tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  $$ values (tests.gym('pgtap-a'), 'pgtap-a') $$,
  'a valid request returns the manager''s own gym and its code'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('Bad Name', tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  '22023', 'invalid_username', 'a username must have the right form'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create(null, tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  '22023', 'invalid_username', 'a username is required'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('reception_a', tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  '23505', 'username_taken', 'a username is used only once in a gym'
);
select lives_ok(
  $$ select * from public.staff_admin_prepare_create('only_b', tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  'a username another gym uses is free in this one'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('receptionist', 'pgtap-b'), false, array[tests.branch('B901')]) $$,
  '42501', 'cannot_grant_role', 'a role of another gym cannot be given'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('receptionist'), false, array[tests.branch('B901', 'pgtap-b')]) $$,
  '42501', 'no_branch_access', 'a branch of another gym cannot be given'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('receptionist'), false, '{}') $$,
  '23514', 'branches_required', 'a staff member works in at least one branch'
);
select lives_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('admin'), true, '{}') $$,
  'or in all branches'
);
select lives_ok(
  $$ select * from public.staff_admin_prepare_create('new_owner', tests.role('owner'), true, '{}') $$,
  'the Owner can create another Owner'
);

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select results_eq(
  $$ select gym_code from public.staff_admin_prepare_create('new_a', tests.role('receptionist', 'pgtap-b'), false, array[tests.branch('B901', 'pgtap-b')]) $$,
  $$ values ('pgtap-b') $$,
  'the gym always comes from the manager''s session'
);

select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_owner', tests.role('owner'), true, '{}') $$,
  '42501', 'cannot_grant_role', 'only the Owner can create an Owner'
);

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('admin'), false, array[tests.branch('B901')]) $$,
  '42501', 'cannot_grant_role', 'nobody gives a role with permissions they don''t have'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('receptionist'), true, '{}') $$,
  '42501', 'cannot_grant_all_branches', 'only staff with all branches can give all branches'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('receptionist'), false, array[tests.branch('B901'), tests.branch('B902')]) $$,
  '42501', 'no_branch_access', 'nobody gives a branch they can''t access'
);
select lives_ok(
  $$ select * from public.staff_admin_prepare_create('new_a', tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  'a branch manager can add staff to their own branch'
);

-- The staff rows of a new account ---------------------------------------------------------------

select ok(
  not (select p.prosecdef from pg_proc p where p.oid = 'public.create_staff_profile(uuid, text, text, uuid, boolean, uuid[], text)'::regprocedure),
  'create_staff_profile runs as the manager (security invoker), so RLS and the guards decide'
);

select tests.clear_authentication();
select tests.create_auth_user('new_a');
select tests.create_auth_user('new_b');
select tests.create_auth_user('new_all');
select tests.create_auth_user('new_c', 'pgtap-b');

select tests.authenticate_as(tests.staff('manager_a'));
select lives_ok(
  $$ select public.create_staff_profile(tests.auth_user_id('new_a'), 'new_a', 'کارمەندی نوێ',
       tests.role('receptionist'), false, array[tests.branch('B901'), tests.branch('B901')], '0770 123 4567') $$,
  'a branch manager creates a receptionist of their branch'
);
select results_eq(
  $$ select gym_id, must_change_password, created_by from public.staff_users where id = tests.auth_user_id('new_a') $$,
  $$ values (tests.gym('pgtap-a'), true, tests.staff('manager_a')) $$,
  'the account is in the manager''s gym, made by them, and must change its first password'
);
select set_eq(
  $$ select branch_id from public.staff_branches where staff_id = tests.auth_user_id('new_a') $$,
  array[tests.branch('B901')],
  'it gets its branches (each once)'
);
select throws_ok(
  $$ select public.create_staff_profile(tests.auth_user_id('new_b'), 'new_b', 'کارمەندی نوێ',
       tests.role('receptionist'), false, array[tests.branch('B901'), tests.branch('B902')]) $$,
  '42501', 'no_branch_access', 'a branch the manager can''t give refuses the whole account'
);
select throws_ok(
  $$ select public.create_staff_profile(tests.auth_user_id('new_c', 'pgtap-b'), 'new_c', 'کارمەندی نوێ',
       tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  '23514', 'staff_login_mismatch', 'the login must be the username at the manager''s own gym'
);
select tests.clear_authentication();
select is(
  (select count(*)::integer from public.staff_users where id in (tests.auth_user_id('new_b'), tests.auth_user_id('new_c', 'pgtap-b'))),
  0, 'a refused account leaves no staff row behind'
);
select is(
  (select count(*)::integer from public.staff_branches where staff_id = tests.auth_user_id('new_b')),
  0, 'and no branch rows (all or nothing)'
);

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.create_staff_profile(tests.auth_user_id('new_b'), 'new_b', 'کارمەندی نوێ',
       tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  '42501', null, 'staff without staff.manage cannot write staff rows'
);

select tests.authenticate_as(tests.staff('owner'));
select lives_ok(
  $$ select public.create_staff_profile(tests.auth_user_id('new_all'), 'new_all', 'بەڕێوەبەری نوێ',
       tests.role('admin'), true, array[tests.branch('B901')]) $$,
  'the Owner creates an admin with all branches'
);
select is(
  (select count(*)::integer from public.staff_branches where staff_id = tests.auth_user_id('new_all')),
  0, 'all branches needs no branch rows'
);

-- Checks before changing an account --------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_b'), 'deactivate') $$,
  '42501', 'permission_denied', 'staff without staff.manage cannot change accounts'
);

select tests.authenticate_as(tests.staff('owner'));
select results_eq(
  $$ select gym_code, username, is_active from public.staff_admin_prepare_change(tests.staff('reception_a'), 'deactivate') $$,
  $$ values ('pgtap-a', 'reception_a', true) $$,
  'a valid request returns the gym code, the current username and the state'
);
select results_eq(
  $$ select is_active from public.staff_admin_prepare_change(tests.staff('former_a'), 'reactivate') $$,
  $$ values (false) $$,
  'a deactivated staff member can be reactivated'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_a'), 'delete') $$,
  '22023', 'invalid_request', 'only the four changes exist'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('owner'), 'reset_password') $$,
  '42501', 'cannot_edit_own_account', 'nobody manages their own account'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_a', 'pgtap-b'), 'deactivate') $$,
  '42501', 'cannot_manage_staff', 'staff of another gym cannot be managed'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_change('e0000000-0000-4000-8000-000000000001', 'deactivate') $$,
  '42501', 'cannot_manage_staff', 'an unknown staff member gets the same answer as another gym''s'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_a'), 'rename', 'Bad Name') $$,
  '22023', 'invalid_username', 'a new username must have the right form'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_a'), 'rename', 'reception_b') $$,
  '23505', 'username_taken', 'a new username must be free in the gym'
);
select lives_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_a'), 'rename', 'only_b') $$,
  'a username another gym uses is free'
);

select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('owner'), 'deactivate') $$,
  '42501', 'cannot_manage_staff', 'only an Owner manages an Owner, so the last Owner can''t be removed'
);

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('trainer_ab'), 'reset_password') $$,
  '42501', 'cannot_manage_staff', 'nobody manages staff who reach branches they can''t'
);

-- Renames --------------------------------------------------------------------------------------
-- The staff module changes the login first (what Supabase Auth's admin API does is done here
-- directly), then the username under the manager's session.

select tests.clear_authentication();
update auth.users set email = 'desk_a@pgtap-a.staff.gym-spa.invalid' where id = tests.staff('reception_a');
update auth.users set email = 'boss@pgtap-a.staff.gym-spa.invalid' where id = tests.staff('owner');

select tests.authenticate_as(tests.staff('admin'));
select is(
  tests.row_count($$ update public.staff_users set username = 'desk_a' where id = tests.staff('reception_a') $$), 1,
  'a manager changes a username once its login has changed'
);
select throws_ok(
  $$ update public.staff_users set username = 'boss' where id = tests.staff('owner') $$,
  '42501', 'cannot_manage_staff', 'nobody renames staff they can''t manage'
);
select tests.authenticate_as(tests.staff('owner'));
select throws_ok(
  $$ update public.staff_users set username = 'boss' where id = tests.staff('owner') $$,
  '42501', 'cannot_edit_own_account', 'nobody renames themself'
);

-- A read-only gym ------------------------------------------------------------------------------
-- Deactivating and resetting a password only take access away, so they still work.

select tests.clear_authentication();
update public.gyms set suspended_at = now() where code = 'pgtap-a';

select tests.authenticate_as(tests.staff('owner'));
select lives_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_b'), 'deactivate') $$,
  'a read-only gym can still deactivate staff'
);
select lives_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_b'), 'reset_password') $$,
  'and reset passwords'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('former_a'), 'reactivate') $$,
  '42501', 'gym_read_only', 'but not reactivate staff'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_change(tests.staff('reception_b'), 'rename', 'desk_b') $$,
  '42501', 'gym_read_only', 'or rename them'
);
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('new_d', tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  '42501', 'gym_read_only', 'or create accounts'
);

select is(
  tests.row_count($$ update public.staff_users set is_active = false where id = tests.staff('reception_b') $$), 1,
  'deactivating a staff member works while read-only'
);
select is(
  tests.row_count($$ update public.staff_users set must_change_password = true where id = tests.staff('trainer_ab') $$), 1,
  'so does the must-change flag a password reset sets'
);
select throws_ok(
  $$ update public.staff_users set is_active = true where id = tests.staff('former_a') $$,
  '42501', 'gym_read_only', 'reactivating does not'
);
select throws_ok(
  $$ update public.staff_users set must_change_password = false where id = tests.staff('trainer_ab') $$,
  '42501', 'gym_read_only', 'clearing the must-change flag does not'
);
select throws_ok(
  $$ update public.staff_users set is_active = false, full_name = 'ناوی نوێ' where id = tests.staff('desk_a') $$,
  '42501', 'gym_read_only', 'nothing else may change together with a deactivation'
);
select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ update public.staff_users set is_active = false where id = tests.staff('owner') $$,
  '42501', 'cannot_manage_staff', 'the guards still decide who may deactivate whom'
);
select tests.authenticate_as(tests.staff('trainer_ab'));
select is(
  tests.row_count($$ update public.staff_users set is_active = false where id = tests.staff('former_a') $$), 0,
  'and staff without staff.manage still change nobody'
);

select tests.clear_authentication();
update public.gyms set suspended_at = null where code = 'pgtap-a';

-- Logins left behind ----------------------------------------------------------------------------
-- Only a staff login of a gym, made by the staff module for that gym, without a staff account,
-- not a platform admin, and older than 2 minutes, may ever be picked for deletion.

select ok(
  not has_function_privilege('authenticated', 'public.staff_admin_orphan(text)', 'execute')
    and not has_function_privilege('anon', 'public.staff_admin_orphan(text)', 'execute'),
  'only the secret key can look for left-behind logins'
);

-- Platform admins arrive in step MT-3 (Auth users without a staff row); a stand-in table until then.
create table public.platform_admins (user_id uuid primary key);

insert into auth.users (id, email, aud, role, raw_app_meta_data, created_at) values
  ('f0000000-0000-4000-8000-000000000001', 'lost@pgtap-a.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   jsonb_build_object('gym_id', tests.gym('pgtap-a')), now() - interval '3 minutes'),
  ('f0000000-0000-4000-8000-000000000002', 'fresh@pgtap-a.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   jsonb_build_object('gym_id', tests.gym('pgtap-a')), now() - interval '1 minute'),
  ('f0000000-0000-4000-8000-000000000003', 'ali@clickgroup.example', 'authenticated', 'authenticated',
   jsonb_build_object('gym_id', tests.gym('pgtap-a')), now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000004', 'seller@pgtap-a.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   jsonb_build_object('gym_id', tests.gym('pgtap-a')), now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000005', 'cross@pgtap-a.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   jsonb_build_object('gym_id', tests.gym('pgtap-b')), now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000006', 'plain@pgtap-a.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   '{}', now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000007', 'ghost@no-such-gym.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   jsonb_build_object('gym_id', tests.gym('pgtap-a')), now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000008', 'ali+old@pgtap-a.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   jsonb_build_object('gym_id', tests.gym('pgtap-a')), now() - interval '1 day');
insert into public.platform_admins (user_id) values ('f0000000-0000-4000-8000-000000000004');
-- A real staff member whose login otherwise looks left behind.
update auth.users
   set raw_app_meta_data = jsonb_build_object('gym_id', tests.gym('pgtap-a')), created_at = now() - interval '1 day'
 where id = tests.staff('reception_b');

select tests.authenticate_as_service_role();
select is(public.staff_admin_orphan('lost@pgtap-a.staff.gym-spa.invalid'), 'f0000000-0000-4000-8000-000000000001'::uuid,
  'a staff login without a staff account, made by the module, older than 2 minutes, is left behind');
select is(public.staff_admin_orphan('fresh@pgtap-a.staff.gym-spa.invalid'), null,
  'a login made less than 2 minutes ago is never picked (its create may still be running)');
select is(public.staff_admin_orphan('ali@clickgroup.example'), null,
  'a login that is not a staff login address is never picked');
select is(public.staff_admin_orphan('ali+old@pgtap-a.staff.gym-spa.invalid'), null,
  'an address on the staff domain whose name is not a username is never picked');
select is(public.staff_admin_orphan('seller@pgtap-a.staff.gym-spa.invalid'), null,
  'a platform admin is never picked, even with a staff login address');
select is(public.staff_admin_orphan('cross@pgtap-a.staff.gym-spa.invalid'), null,
  'a login the module made for another gym is never picked');
select is(public.staff_admin_orphan('plain@pgtap-a.staff.gym-spa.invalid'), null,
  'a login the module did not make is never picked');
select is(public.staff_admin_orphan('ghost@no-such-gym.staff.gym-spa.invalid'), null,
  'a login for a gym that doesn''t exist is never picked');
select is(public.staff_admin_orphan('reception_b@pgtap-a.staff.gym-spa.invalid'), null,
  'a login with a staff account is never picked');
select is(public.staff_admin_orphan('nobody@pgtap-a.staff.gym-spa.invalid'), null,
  'an unknown address gives nothing');

select tests.clear_authentication();
select is(
  (select count(*)::integer from auth.users where id::text like 'f0000000-0000-4000-8000-00000000000_'),
  8, 'the look-up deletes nothing itself: the module deletes only the login it returns'
);

select * from finish();
rollback;
