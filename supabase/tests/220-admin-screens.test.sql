-- Step 1e: staff_directory(), save_staff_access(), role_overview(), save_role(), create_branch(),
-- the last active branch, register_device() / move_device() / my_device(), unlock_on_device(), and
-- what a read-only gym still allows on devices.
begin;
select plan(91);
select tests.create_fixture();

-- A custom role that may manage roles but has few permissions itself, and someone who has it.
select tests.create_role('بەڕێوەبەری ڕۆڵ', array['roles.manage', 'members.view', 'staff.view']);
select tests.create_staff('role_keeper', (select id::text from public.roles where name_ckb = 'بەڕێوەبەری ڕۆڵ'), array['B901']);
insert into public.staff_pins (gym_id, staff_id, pin_hash)
values (tests.gym('pgtap-a'), tests.staff('reception_a'), extensions.crypt('482915', extensions.gen_salt('bf', 4)));
-- A removed staff member (deleted_at): never listed, never changed.
select tests.create_staff('gone_a', 'receptionist', array['B901']);
update public.staff_users set is_active = false, deleted_at = now() where id = tests.staff('gone_a');
update auth.users set last_sign_in_at = '2026-10-01 09:00+03' where id = tests.staff('reception_a');

-- staff_directory() -------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select set_eq('select username from public.staff_directory()', array['reception_a'],
  'staff without staff.view see only themselves');

select tests.authenticate_as(tests.staff('manager_a'));
select set_eq('select username from public.staff_directory()',
  array['owner', 'admin', 'manager_a', 'reception_a', 'trainer_ab', 'former_a', 'role_keeper'],
  'staff.view shows the staff who share a branch with the caller, and those with all branches');
select results_eq(
  $$ select branch_ids, hidden_branch_count from public.staff_directory() where username = 'trainer_ab' $$,
  $$ values (array[tests.branch('B901')], 1) $$,
  'branches the caller cannot access are counted, not listed'
);
select set_eq('select username from public.staff_directory() where can_manage',
  array['reception_a', 'former_a'],
  'can_manage follows the guards: never yourself, nobody with more access or other branches');
select results_eq(
  $$ select has_pin, pin_locked, last_login_at, is_active from public.staff_directory() where username = 'reception_a' $$,
  $$ values (true, false, '2026-10-01 09:00+03'::timestamptz, true) $$,
  'the list shows the PIN state, the last login and whether the account is active'
);

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is((select count(*)::integer from public.staff_directory() where id = tests.staff('reception_a')), 0,
  'another gym''s staff are never listed');

-- save_staff_access() ----------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('manager_a'));
select lives_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام کەریم', tests.role('receptionist'), false, array[tests.branch('B901')], '0750 123 4567') $$,
  'a staff manager changes a staff member''s name and phone'
);
select results_eq(
  $$ select full_name, phone from public.staff_users where id = tests.staff('reception_a') $$,
  $$ values ('ئارام کەریم'::text, '0750 123 4567'::text) $$,
  'the change is saved'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ناوی تر', tests.role('receptionist'), false, array[tests.branch('B901'), tests.branch('B902')], null) $$,
  '42501', 'no_branch_access', 'nobody gives a branch they cannot access'
);
select is((select full_name from public.staff_users where id = tests.staff('reception_a')), 'ئارام کەریم',
  'a refused change changes nothing (all or nothing)');
select throws_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام کەریم', tests.role('receptionist'), true, '{}', null) $$,
  '42501', 'cannot_grant_all_branches', 'only staff with all branches give all branches'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام کەریم', tests.role('receptionist'), false, '{}', null) $$,
  '23514', 'branches_required', 'a staff member works in at least one branch'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام کەریم', tests.role('receptionist'), false, array[null::uuid], null) $$,
  '42501', 'no_branch_access', 'an empty branch id is refused'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('manager_a'), 'Manager', tests.role('branch_manager'), false, array[tests.branch('B901')], null) $$,
  '42501', 'cannot_edit_own_account', 'nobody changes their own access'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('admin'), 'Admin', tests.role('admin'), true, '{}', null) $$,
  '42501', 'cannot_manage_staff', 'nobody manages someone with more access'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('trainer_ab'), 'Trainer', tests.role('trainer'), false, array[tests.branch('B901')], null) $$,
  '42501', 'cannot_manage_staff', 'nobody manages someone who also works in a branch they cannot access'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('reception_a', 'pgtap-b'), 'Other', tests.role('receptionist'), false, array[tests.branch('B901')], null) $$,
  '42501', 'cannot_manage_staff', 'another gym''s staff cannot be changed'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('gone_a'), 'Gone', tests.role('receptionist'), false, array[tests.branch('B901')]) $$,
  '42501', 'cannot_manage_staff', 'a removed staff member cannot be changed'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام کەریم', tests.role('owner'), false, array[tests.branch('B901')], null) $$,
  '42501', 'cannot_grant_role', 'nobody gives a role above their own'
);

select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام کەریم', tests.role('receptionist'), false, array[tests.branch('B901')], null) $$,
  '42501', 'permission_denied', 'changing staff needs staff.manage'
);

select tests.authenticate_as(tests.staff('admin'));
select lives_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام کەریم', tests.role('cashier'), true, array[tests.branch('B901')], null) $$,
  'staff with all branches give all branches and another role'
);
select results_eq(
  $$ select s.all_branches, s.role_id, (select count(*)::integer from public.staff_branches sb where sb.staff_id = s.id)
       from public.staff_users s where s.id = tests.staff('reception_a') $$,
  $$ values (true, tests.role('cashier'), 0) $$,
  'with all branches the branch rows go: access follows the flag'
);
select lives_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام کەریم', tests.role('receptionist'), false, array[tests.branch('B902'), tests.branch('B902')], null) $$,
  'back to listed branches'
);
select set_eq($$ select branch_id from public.staff_branches where staff_id = tests.staff('reception_a') $$,
  array[tests.branch('B902')], 'only the listed branches remain, each once');
select tests.clear_authentication();
select set_eq(
  $$ select branch_id from public.staff_branch_access where staff_id = tests.staff('reception_a') $$,
  array[tests.branch('B902')]::uuid[],
  'branch access follows at once'
);
select tests.authenticate_as(tests.staff('admin'));
select ok(
  exists (select 1 from public.audit_logs
           where table_name = 'staff_branches' and actor_id = tests.staff('admin') and action = 'insert'),
  'branch changes go into the audit log'
);

-- role_overview() --------------------------------------------------------------------------------

select results_eq(
  $$ select cardinality(permission_keys), can_edit, can_grant from public.role_overview() where key = 'owner' $$,
  $$ values ((select count(*)::integer from public.permissions), false, false) $$,
  'the Owner role has every permission; only an Owner edits or gives it'
);
select results_eq(
  $$ select is_own_role, can_edit, can_edit_permissions from public.role_overview() where key = 'admin' $$,
  $$ values (true, false, false) $$,
  'nobody changes their own role, and built-in roles are the Owner''s to edit'
);
select is((select staff_count from public.role_overview() where key = 'receptionist'), 3,
  'the number of staff with the role counts deactivated staff too');
select is((select count(*)::integer from public.role_overview() where id = tests.role('receptionist', 'pgtap-b')), 0,
  'another gym''s roles are never listed');

select tests.authenticate_as(tests.staff('owner'));
select results_eq(
  $$ select key, can_edit, can_edit_permissions from public.role_overview() where key in ('owner', 'receptionist') order by key $$,
  $$ values ('owner'::text, true, false), ('receptionist'::text, true, true) $$,
  'the Owner edits built-in roles; the Owner role''s permissions never change'
);

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select key, can_edit, can_grant from public.role_overview() where key in ('owner', 'receptionist') order by key $$,
  $$ values ('owner'::text, false, false), ('receptionist'::text, false, true) $$,
  'without roles.manage nothing is editable; can_grant follows the caller''s own permissions'
);

-- save_role() ------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('admin'));
select lives_ok(
  $$ select public.save_role('a0000000-0000-4000-8000-000000000001', 'یارمەتیدەر', array['members.view', 'checkin.perform', 'members.view'], 'Helper', null) $$,
  'roles.manage creates a custom role with its permissions'
);
select results_eq(
  $$ select is_system, permission_keys from public.role_overview() where id = 'a0000000-0000-4000-8000-000000000001' $$,
  $$ values (false, array['checkin.perform', 'members.view']) $$,
  'the new role has exactly those permissions, each once'
);
select lives_ok(
  $$ select public.save_role('a0000000-0000-4000-8000-000000000001', 'یارمەتیدەری پێشوازی', array['members.view', 'payments.view'], 'Helper', null) $$,
  'the role''s names and permissions change in one call'
);
select results_eq(
  $$ select r.name_ckb, o.permission_keys from public.roles r join public.role_overview() o on o.id = r.id
      where r.id = 'a0000000-0000-4000-8000-000000000001' $$,
  $$ values ('یارمەتیدەری پێشوازی'::text, array['members.view', 'payments.view']) $$,
  'permissions not listed are taken away, new ones added'
);
select lives_ok(
  $$ select public.save_role('a0000000-0000-4000-8000-000000000001', 'یارمەتیدەر', null, null, null) $$,
  'without a permission list only the names change'
);
select is((select cardinality(permission_keys) from public.role_overview() where id = 'a0000000-0000-4000-8000-000000000001'), 2,
  'the permissions stay as they were');
select throws_ok(
  $$ select public.save_role('a0000000-0000-4000-8000-000000000001', 'یارمەتیدەر', array['members.fly'], null, null) $$,
  '22023', 'unknown_permission', 'only permissions of the catalog'
);
select throws_ok(
  $$ select public.save_role(tests.role('receptionist'), 'پێشوازی', array['members.view'], null, null) $$,
  '42501', 'system_role_read_only', 'only the Owner edits built-in roles'
);
select ok(
  tests.error_code($$ select public.save_role(tests.role('receptionist', 'pgtap-b'), 'دزی', null, null, null) $$) is not null,
  'another gym''s role cannot be changed'
);
select tests.clear_authentication();
select is((select name_ckb from public.roles where id = tests.role('receptionist', 'pgtap-b')), 'کارمەندی پێشوازی',
  'it keeps its name');

select tests.authenticate_as(tests.staff('role_keeper'));
select throws_ok(
  $$ select public.save_role('a0000000-0000-4000-8000-000000000002', 'تاقیکردنەوە', array['members.view', 'payments.refund'], null, null) $$,
  '42501', 'cannot_grant_permission', 'nobody gives a permission they don''t have'
);
select is((select count(*)::integer from public.roles where id = 'a0000000-0000-4000-8000-000000000002'), 0,
  'a refused role is not created at all (all or nothing)');
select throws_ok(
  $$ select public.save_role((select role_id from public.staff_users where id = auth.uid()), 'بەڕێوەبەری ڕۆڵ', array['roles.manage', 'staff.view'], null, null) $$,
  '42501', 'cannot_edit_own_role', 'nobody changes their own role''s permissions'
);
select results_eq(
  $$ select is_own_role, can_edit, can_edit_permissions from public.role_overview()
      where id = (select role_id from public.staff_users where id = auth.uid()) $$,
  $$ values (true, true, false) $$,
  'your own custom role: its names can change, its permissions can''t'
);
select lives_ok(
  $$ select public.save_role((select role_id from public.staff_users where id = auth.uid()), 'بەڕێوەبەری ڕۆڵەکان', array['roles.manage', 'members.view', 'staff.view'], null, null) $$,
  'renaming your own role without changing its permissions is fine'
);
select throws_ok(
  $$ select public.save_role('a0000000-0000-4000-8000-000000000001', 'یارمەتیدەر', array['members.view'], null, null) $$,
  '42501', 'cannot_edit_role', 'nobody edits a role with permissions they don''t have'
);

select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok(
  $$ select public.save_role('a0000000-0000-4000-8000-000000000003', 'تاقیکردنەوە', '{}', null, null) $$,
  '42501', 'permission_denied', 'managing roles needs roles.manage'
);

select tests.authenticate_as(tests.staff('owner'));
select lives_ok(
  $$ select public.save_role(tests.role('receptionist'), 'کارمەندی پێشوازی', array['members.view', 'checkin.perform'], 'Front desk', null) $$,
  'the Owner edits a built-in role'
);
select throws_ok(
  $$ select public.save_role(tests.role('owner'), 'خاوەن', array['members.view'], 'Owner', null) $$,
  '23514', 'owner_has_all_permissions', 'the Owner role''s permissions are not stored'
);
select lives_ok(
  $$ select public.save_role(tests.role('owner'), 'خاوەنی جیم', null, 'Owner', null) $$,
  'the Owner renames the Owner role'
);
update public.roles set deleted_at = now() where id = 'a0000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select public.save_role('a0000000-0000-4000-8000-000000000001', 'یارمەتیدەر', null, null, null) $$,
  '23514', 'role_deleted', 'a deleted role stays deleted'
);

-- create_branch() and the last active branch -------------------------------------------------------

select tests.authenticate_as(tests.staff('admin'));
select results_eq(
  $$ select code from public.create_branch('b0000000-0000-4000-8000-000000000001', 'لقی شار', 'City', null, '0750 111 2222') $$,
  $$ values ('B903'::text) $$,
  'a new branch gets the gym''s next code'
);
select ok(
  tests.staff('admin') in (select staff_id from public.staff_branch_access where branch_id = 'b0000000-0000-4000-8000-000000000001'),
  'staff with all branches reach the new branch at once'
);
select tests.authenticate_as(tests.staff('admin', 'pgtap-b'));
select results_eq(
  $$ select code from public.create_branch('b0000000-0000-4000-8000-000000000002', 'لقی شار') $$,
  $$ values ('B903'::text) $$,
  'codes are counted per gym'
);

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.create_branch('b0000000-0000-4000-8000-000000000003', 'لقی تر') $$,
  '42501', 'permission_denied', 'adding a branch needs branches.manage and all branches'
);

select tests.clear_authentication();
update public.gyms set max_branches = 4 where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ select public.create_branch('b0000000-0000-4000-8000-000000000003', 'لقی تر') $$,
  '23514', 'gym_branch_limit', 'the gym''s branch limit applies'
);
select lives_ok(
  $$ update public.branches set is_active = false where code = 'B903' $$,
  'a branch can be deactivated'
);
select results_eq(
  $$ select code from public.create_branch('b0000000-0000-4000-8000-000000000003', 'لقی تر') $$,
  $$ values ('B904'::text) $$,
  'a deactivated branch keeps its code; the next branch gets a new one'
);

select tests.authenticate_as(tests.staff('admin', 'pgtap-b'));
update public.branches set is_active = false where code in ('B901', 'B902', 'B903');
select throws_ok(
  $$ update public.branches set is_active = false where code = 'B1' $$,
  '23514', 'last_active_branch', 'a gym keeps at least one active branch'
);

-- Devices ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select code from public.register_device('d0000000-0000-4000-8000-000000000001', tests.branch('B901'), 'کۆمپیوتەری پێشوازی', 'windows') $$,
  $$ values ('D01'::text) $$,
  'devices.manage registers a device'
);
select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'ئامێر', 'web') $$,
  '23514', 'branch_inactive', 'devices are registered in active branches only'
);
select tests.authenticate_as(tests.staff('admin', 'pgtap-b'));
select lives_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-000000000009', tests.branch('B1', 'pgtap-b'), 'ئامێری ب', 'web') $$,
  'gym B registers a device'
);
select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-000000000009', tests.branch('B901'), 'ئامێر', 'web') $$,
  '23514', 'device_in_other_gym', 'a device id of another gym is refused'
);
select is_empty($$ select id from public.my_device('d0000000-0000-4000-8000-000000000009') $$,
  'my_device() never shows another gym''s device');

select tests.authenticate_as(tests.staff('reception_b'));
select results_eq(
  $$ select code, branch_id, can_use, is_active, branch_is_active from public.my_device('d0000000-0000-4000-8000-000000000001') $$,
  $$ values ('D01'::text, tests.branch('B901'), false, true, true) $$,
  'every staff member learns the device''s branch, and whether they may work on it'
);
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select can_use from public.my_device('d0000000-0000-4000-8000-000000000001')), true,
  'staff with access to the device''s branch may use it');
select is_empty($$ select id from public.my_device('d0000000-0000-4000-8000-0000000000ff') $$,
  'an unregistered device has no row');

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.move_device('d0000000-0000-4000-8000-000000000001', tests.branch('B902')) $$,
  '42501', 'no_branch_access', 'a device moves only to the caller''s own branches'
);
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.move_device('d0000000-0000-4000-8000-000000000001', tests.branch('B901')) $$,
  '42501', 'not_allowed', 'moving a device needs devices.manage'
);
select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ select public.move_device('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001') $$,
  '23514', 'branch_inactive', 'devices move to active branches only'
);
select results_eq(
  $$ select code, branch_id from public.move_device('d0000000-0000-4000-8000-000000000001', tests.branch('B902')) $$,
  $$ values ('D01'::text, tests.branch('B902')) $$,
  'a moved device gets the next code of its new branch'
);
select throws_ok(
  $$ update public.devices set branch_id = tests.branch('B901') where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', 'read_only_column', 'a device moves only through move_device()'
);
select is(current_setting('app.moving_device', true), '', 'move_device() leaves no flag behind');

-- unlock_on_device()
select tests.authenticate_as(tests.staff('reception_a'));
select results_eq(
  $$ select public.unlock_on_device('482915', 'd0000000-0000-4000-8000-000000000001') ->> 'result' $$,
  $$ values ('ok'::text) $$,
  'the right PIN on a registered device of the staff member''s branch unlocks'
);
select is(public.unlock_on_device('111111', 'd0000000-0000-4000-8000-000000000001'),
  '{"result": "wrong_pin", "tries_left": 4}'::jsonb, 'a wrong PIN uses up a try');
select is(public.unlock_on_device('482915', 'd0000000-0000-4000-8000-0000000000ff') ->> 'result', 'device_not_registered',
  'an unregistered device does not unlock');
select is(public.unlock_on_device('482915', 'd0000000-0000-4000-8000-000000000009') ->> 'result', 'device_not_registered',
  'nor does another gym''s device');
-- The device is in B902 now; manager_a works in B901 only.
select tests.authenticate_as(tests.staff('manager_a'));
select is(public.unlock_on_device('482915', 'd0000000-0000-4000-8000-000000000001') ->> 'result', 'no_branch_access',
  'staff of other branches cannot work on the device');

select tests.authenticate_as(tests.staff('admin'));
update public.devices set is_active = false where id = 'd0000000-0000-4000-8000-000000000001';
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_on_device('482915', 'd0000000-0000-4000-8000-000000000001') ->> 'result', 'device_inactive',
  'a deactivated device does not unlock');
select tests.authenticate_as(tests.staff('admin'));
update public.devices set is_active = true where id = 'd0000000-0000-4000-8000-000000000001';
update public.branches set is_active = false where code = 'B902';
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_on_device('482915', 'd0000000-0000-4000-8000-000000000001') ->> 'result', 'branch_inactive',
  'a device of a deactivated branch does not unlock');
select is((select failed_attempts from public.staff_pins where staff_id = auth.uid()), 1,
  'refusals about the device never use up a try');

-- Read-only gym and the device limit
select tests.authenticate_as(tests.staff('admin'));
update public.branches set is_active = true where code = 'B902';
select tests.clear_authentication();
update public.gyms set suspended_at = now() where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('admin'));
select throws_ok(
  $$ update public.devices set name = 'ناوی نوێ' where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', 'gym_read_only', 'a read-only gym renames no device'
);
select throws_ok(
  $$ select public.move_device('d0000000-0000-4000-8000-000000000001', tests.branch('B901')) $$,
  '42501', 'gym_read_only', 'a read-only gym moves no device'
);
select is(
  tests.row_count($$ update public.devices set is_active = false where id = 'd0000000-0000-4000-8000-000000000001' $$), 1,
  'a read-only gym can still deactivate a device: it only takes access away'
);
select throws_ok(
  $$ update public.devices set is_active = true where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', 'gym_read_only', 'but not reactivate it'
);
select throws_ok(
  $$ select public.save_staff_access(tests.staff('reception_a'), 'ئارام', tests.role('receptionist'), false, array[tests.branch('B901')], null) $$,
  '42501', 'gym_read_only', 'a read-only gym changes no staff access'
);
select throws_ok(
  $$ select public.create_branch('b0000000-0000-4000-8000-000000000004', 'لقی تر') $$,
  '42501', 'gym_read_only', 'a read-only gym adds no branch'
);

select tests.clear_authentication();
update public.gyms set suspended_at = null, max_devices = 1 where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('admin'));
select lives_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-000000000003', tests.branch('B901'), 'مۆبایلی بەڕێوەبەر', 'android') $$,
  'one active device fits under a limit of one'
);
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-000000000004', tests.branch('B901'), 'مۆبایلی خاوەن', 'web') $$,
  '23514', 'gym_device_limit', 'every device counts toward max_devices, a manager''s phone too'
);

select * from finish();
rollback;
