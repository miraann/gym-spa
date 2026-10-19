-- Step 1e-3: device_overview(), gym_limits(), the device limit counting active devices only, and
-- unlock_with_pin() kept unchanged for clients not yet updated (expand first, drop later).
begin;
select plan(20);
select tests.create_fixture();

insert into public.devices (id, gym_id, branch_id, code, name, platform, is_active) values
  ('d0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), tests.branch('B901'), 'D01', 'کۆمپیوتەری پێشوازی', 'windows', true),
  ('d0000000-0000-4000-8000-0000000000a2', tests.gym('pgtap-a'), tests.branch('B902'), 'D01', 'تابلێتی دەرگا', 'android', true),
  ('d0000000-0000-4000-8000-0000000000a3', tests.gym('pgtap-a'), tests.branch('B901'), 'D02', 'کۆنە', 'web', false),
  ('d0000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'D01', 'ئامێری ب', 'web', true);
insert into public.device_status (device_id, gym_id, last_seen_at, last_seen_by, app_version) values
  ('d0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), '2026-10-15 09:00+03', tests.staff('reception_a'), '0.2.0');
update public.gyms set max_branches = 5, max_devices = 4 where code = 'pgtap-a';

insert into public.staff_pins (staff_id, gym_id, pin_hash)
values (tests.staff('reception_a'), tests.gym('pgtap-a'), extensions.crypt('482915', extensions.gen_salt('bf', 4)));

-- Clients not yet updated still unlock with unlock_with_pin(); its removal waits in
-- supabase/pending-migrations until every client is on step 1e or newer.
select has_function('public', 'unlock_with_pin', array['text', 'uuid'],
  'unlock_with_pin() stays for clients not yet updated');
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'ok',
  'it still unlocks with the right PIN, as before');
select is(public.unlock_with_pin('482915', tests.branch('B902')) ->> 'result', 'no_branch_access',
  'and still refuses a branch the staff member cannot access');

-- device_overview()
select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select code, name, is_active, app_version, last_seen_by_name from public.device_overview() order by code $$,
  $$ values ('D01'::text, 'کۆمپیوتەری پێشوازی'::text, true, '0.2.0'::text, 'Reception_a'::text),
            ('D02'::text, 'کۆنە'::text, false, null::text, null::text) $$,
  'devices.manage sees the devices of their branches, with the last report and who used them'
);
select tests.authenticate_as(tests.staff('admin'));
select is((select count(*)::integer from public.device_overview()), 3,
  'with all branches: every device of the gym, active or not');
select tests.authenticate_as(tests.staff('reception_a'));
select is_empty('select id from public.device_overview()', 'without devices.manage: nothing');
select tests.authenticate_as(tests.staff('admin', 'pgtap-b'));
select set_eq('select id from public.device_overview()', array['d0000000-0000-4000-8000-0000000000b1'::uuid],
  'another gym''s devices are never listed');

-- gym_limits()
select tests.authenticate_as(tests.staff('reception_a'));
select results_eq('select max_branches, max_devices, active_branches, active_devices from public.gym_limits()',
  $$ values (5, 4, 3, 2) $$, 'every staff member reads the gym''s limits and what is in use');
select tests.authenticate_as(tests.staff('reception_a', 'pgtap-b'));
select results_eq('select max_branches, max_devices, active_branches, active_devices from public.gym_limits()',
  $$ values (null::integer, null::integer, 3, 1) $$, 'each gym its own: no limit is null');
select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select * from public.gym_limits()', 'nothing for deactivated staff');
select throws_ok($$ select * from public.my_device('d0000000-0000-4000-8000-0000000000a1') $$,
  '42501', 'staff_inactive', 'my_device() refuses deactivated staff instead of saying "not registered"');
-- The device limit counts active devices only: deactivating an old one frees its place.
select tests.clear_authentication();
update public.gyms set max_devices = 2 where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-0000000000c1', tests.branch('B901'), 'وێبگەڕی نوێ', 'web') $$,
  '23514', 'gym_device_limit', 'two active devices fill a limit of two; the deactivated one does not count'
);
select is(
  tests.row_count($$ update public.devices set is_active = false where id = 'd0000000-0000-4000-8000-0000000000a1' $$), 1,
  'a manager deactivates an old device (say, a browser whose data was cleared)'
);
select results_eq('select active_devices from public.gym_limits()', $$ values (1) $$,
  'it no longer counts');
select lives_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-0000000000c1', tests.branch('B901'), 'وێبگەڕی نوێ', 'web') $$,
  'which frees its place for the new device'
);
select throws_ok(
  $$ update public.devices set is_active = true where id = 'd0000000-0000-4000-8000-0000000000a1' $$,
  '23514', 'gym_device_limit', 'reactivating the old device would go over the limit, so it is refused'
);

select tests.clear_authentication();
update public.gyms set locked_at = now() where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select is_empty('select * from public.gym_limits()', 'nothing for a locked gym');
select is_empty('select id from public.device_overview()', 'no devices for a locked gym');
select throws_ok($$ select * from public.my_device('d0000000-0000-4000-8000-0000000000a1') $$,
  '42501', 'staff_inactive', 'and my_device() says why, so the device keeps its registration');

select tests.authenticate_as_anon();
select throws_ok('select * from public.gym_limits()', '42501', null, 'anonymous visitors cannot call it');

select * from finish();
rollback;
