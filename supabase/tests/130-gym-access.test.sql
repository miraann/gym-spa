-- A gym's access state (spec §2.6): active, then 30 days of grace after paid_until, then read-only.
-- Suspended gyms are read-only at once; locked (or closed) gyms lose all access. And the limits on
-- active branches and devices.
begin;
select plan(39);
select tests.create_fixture();

insert into public.staff_pins (staff_id, gym_id, pin_hash)
values (tests.staff('reception_a'), tests.gym('pgtap-a'), extensions.crypt('482915', extensions.gen_salt('bf', 4)));
insert into public.devices (id, gym_id, branch_id, code, name, platform)
values ('d0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), tests.branch('B901'), 'D01', 'کۆمپیوتەری پێشوازی', 'windows');

-- Active and grace ---------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'active', 'a gym without an end date is active');

select tests.clear_authentication();
update public.gyms set paid_until = now() + interval '3 days' where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'active', 'a gym is active until paid_until');

select tests.clear_authentication();
update public.gyms set paid_until = now() - interval '10 days' where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'grace', 'for 30 days after paid_until the gym is in grace');
select lives_ok($$ insert into public.branches (code, name_ckb) values ('B903', 'لقی نوێ') $$,
  'a gym in grace still works as usual');

-- Read-only: more than 30 days after paid_until --------------------------------------------------

select tests.clear_authentication();
update public.gyms set paid_until = now() - interval '31 days' where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'read_only', 'after the grace period the gym is read-only');
select set_eq('select code from public.branches', array['B1', 'B901', 'B902', 'B903'],
  'a read-only gym still sees its data');
select throws_ok($$ insert into public.branches (code, name_ckb) values ('B904', 'لقی نوێ') $$,
  '42501', 'gym_read_only', 'a read-only gym adds nothing');
select throws_ok($$ update public.branches set phone = '0770 123 4567' where code = 'B901' $$,
  '42501', 'gym_read_only', 'a read-only gym changes nothing');
select throws_ok($$ insert into public.settings (key, value) values ('security.idle_lock_minutes', '15') $$,
  '42501', 'gym_read_only', 'a read-only gym changes no settings');
select throws_ok($$ insert into public.roles (name_ckb) values ('ڕۆڵی نوێ') $$,
  '42501', 'gym_read_only', 'a read-only gym adds no roles');
select throws_ok($$ update public.staff_users set is_active = false where username = 'reception_a' $$,
  '42501', 'gym_read_only', 'a read-only gym changes no staff accounts');
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-0000000000a2', tests.branch('B901'), 'ئامێر', 'web') $$,
  '42501', 'gym_read_only', 'a read-only gym registers no new devices'
);
select is(tests.row_count($$ update public.staff_users set preferred_language = 'en' where username = 'owner' $$), 1,
  'staff can still change their own language');

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'ok', 'PINs still work');
select lives_ok($$ select public.device_heartbeat('d0000000-0000-4000-8000-0000000000a1', '0.2.0') $$,
  'devices still report');
select tests.authenticate_with_password(tests.staff('reception_b'), now());
select lives_ok($$ select public.set_my_pin('593017') $$, 'staff can still set their PIN');

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select lives_ok($$ insert into public.branches (code, name_ckb) values ('B903', 'لقی نوێ') $$,
  'other gyms are not affected');

select tests.authenticate_as_service_role();
select is(tests.row_count($$ update public.branches set phone = '0770 123 4567' where gym_id = tests.gym('pgtap-a') and code = 'B901' $$), 1,
  'server code (the secret key) can still change a read-only gym');

-- Suspended: read-only at once, whatever paid_until says --------------------------------------

select tests.clear_authentication();
update public.gyms set paid_until = now() + interval '1 year', suspended_at = now() where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'read_only', 'a suspended gym is read-only, even when paid');
select throws_ok($$ insert into public.branches (code, name_ckb) values ('B904', 'لقی نوێ') $$,
  '42501', 'gym_read_only', 'a suspended gym adds nothing');

select tests.clear_authentication();
update public.gyms set suspended_at = null where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select lives_ok($$ insert into public.branches (code, name_ckb) values ('B904', 'لقی نوێ') $$,
  'a reactivated gym works again');

-- Locked: no access at all ----------------------------------------------------------------------

select tests.clear_authentication();
update public.gyms set locked_at = now() where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'locked', 'staff of a locked gym can be told that it is locked');
select ok(not app.is_active_staff(), 'staff of a locked gym are not active staff');
select is(app.my_permissions(), '{}'::text[], 'staff of a locked gym have no permissions');
select is_empty('select id from public.branches', 'staff of a locked gym see no branches');
select is_empty('select id from public.staff_users', 'staff of a locked gym see no staff, not even themselves');
select is_empty('select id from public.settings', 'staff of a locked gym see no settings');
select is(tests.row_count($$ update public.staff_users set preferred_language = 'ar' where username = 'owner' $$), 0,
  'staff of a locked gym change nothing, not even their language');
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'gym_locked',
  'a PIN tells a locked gym''s staff why it doesn''t open');
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select ok(exists (select 1 from public.branches), 'other gyms are not affected');

-- A closed gym (deleted_at) is locked too.
select tests.clear_authentication();
update public.gyms set locked_at = null, deleted_at = now() where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'locked', 'a closed gym is locked');
select is_empty('select id from public.branches', 'staff of a closed gym see nothing');

select tests.clear_authentication();
update public.gyms set deleted_at = null where code = 'pgtap-a';

-- Limits ------------------------------------------------------------------------------------------
-- Gym A now has 5 active branches: B1, B901, B902, B903, B904.

update public.gyms set max_branches = 5, max_devices = 1 where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ insert into public.branches (code, name_ckb) values ('B905', 'لقی نوێ') $$,
  '23514', 'gym_branch_limit', 'a gym can''t have more active branches than its limit');
select lives_ok($$ update public.branches set is_active = false where code = 'B904' $$,
  'deactivating a branch is always allowed');
select lives_ok($$ insert into public.branches (code, name_ckb) values ('B905', 'لقی نوێ') $$,
  'a deactivated branch frees its place');
select throws_ok($$ update public.branches set is_active = true where code = 'B904' $$,
  '23514', 'gym_branch_limit', 'reactivating a branch counts against the limit too');

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-0000000000a3', tests.branch('B901'), 'ئامێر', 'web') $$,
  '23514', 'gym_device_limit', 'a gym can''t have more active devices than its limit'
);

select tests.authenticate_as_service_role();
select throws_ok(
  $$ insert into public.branches (gym_id, code, name_ckb) values (tests.gym('pgtap-a'), 'B906', 'لقی نوێ') $$,
  '23514', 'gym_branch_limit', 'the limits apply to server code too (Click Group raises the limit instead)'
);

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select lives_ok($$ insert into public.branches (code, name_ckb) values ('B905', 'لقی نوێ') $$,
  'a gym''s limit does not apply to other gyms');

select * from finish();
rollback;
