-- devices, device_status, register_device(), device_heartbeat().
begin;
select plan(20);
select tests.create_fixture();

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select code from public.register_device('d0000000-0000-4000-8000-000000000001', tests.branch('B901'), 'کۆمپیوتەری پێشوازی', 'windows') $$,
  $$ values ('D01') $$,
  'the first device of a branch gets code D01'
);
select results_eq(
  $$ select code from public.register_device('d0000000-0000-4000-8000-000000000002', tests.branch('B901'), 'تابلێتی دەرگا', 'android', 'ckb') $$,
  $$ values ('D02') $$,
  'the next device gets the next code'
);
select results_eq(
  $$ select code from public.register_device('d0000000-0000-4000-8000-000000000001', tests.branch('B901'), 'کۆمپیوتەری پێشوازی', 'windows') $$,
  $$ values ('D01') $$,
  'registering the same device again returns it unchanged (safe to retry)'
);
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-000000000003', tests.branch('B902'), 'ئامێر', 'web') $$,
  '42501', 'not_allowed', 'nobody can register a device in a branch they cannot access'
);

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-000000000003', tests.branch('B901'), 'ئامێر', 'web') $$,
  '42501', 'not_allowed', 'staff without devices.manage cannot register devices'
);
select throws_ok(
  $$ insert into public.devices (id, branch_id, code, name, platform)
     values ('d0000000-0000-4000-8000-000000000003', tests.branch('B901'), 'D50', 'ئامێر', 'web') $$,
  '42501', 'permission denied for table devices', 'devices are added only through register_device()'
);

select tests.authenticate_as(tests.staff('admin'));
select results_eq(
  $$ select code from public.register_device('d0000000-0000-4000-8000-000000000004', tests.branch('B902'), 'کۆمپیوتەر', 'web') $$,
  $$ values ('D01') $$,
  'codes are counted per branch'
);
select throws_ok(
  $$ select public.register_device('d0000000-0000-4000-8000-000000000001', tests.branch('B902'), 'کۆمپیوتەر', 'web') $$,
  '23514', 'device_in_other_branch', 'a device belongs to one branch'
);

-- A retired device keeps its code: old receipts carry it.
update public.devices set deleted_at = now() where id = 'd0000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select code from public.register_device('d0000000-0000-4000-8000-000000000005', tests.branch('B901'), 'ئامێری نوێ', 'web') $$,
  $$ values ('D03') $$,
  'codes of retired devices are never reused'
);
select throws_ok(
  $$ update public.devices set branch_id = tests.branch('B902') where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', 'read_only_column', 'a device never moves to another branch'
);

select tests.authenticate_as(tests.staff('reception_b'));
select set_eq('select code from public.devices', array['D01'], 'staff see the devices of their branches only');

select tests.authenticate_as(tests.staff('reception_a'));
select is(
  tests.row_count($$ update public.devices set name = 'ناوی نوێ' where id = 'd0000000-0000-4000-8000-000000000001' $$), 0,
  'staff without devices.manage cannot rename devices'
);

select tests.authenticate_as(tests.staff('manager_a'));
select is(
  tests.row_count($$ update public.devices set name = 'ناوی نوێ', default_language = 'ar' where id = 'd0000000-0000-4000-8000-000000000001' $$), 1,
  'devices.manage can rename a device and set its language'
);
select throws_ok(
  $$ update public.devices set code = 'D09' where id = 'd0000000-0000-4000-8000-000000000001' $$,
  '42501', 'read_only_column', 'a device code never changes'
);

-- Heartbeats
select tests.authenticate_as(tests.staff('reception_a'));
select lives_ok(
  $$ select public.device_heartbeat('d0000000-0000-4000-8000-000000000001', '0.1.0', 3, now() - interval '2 hours') $$,
  'staff of the branch can report a device''s state'
);
select is_empty('select device_id from public.device_status', 'staff without devices.manage cannot read device reports');

select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok(
  $$ select public.device_heartbeat('d0000000-0000-4000-8000-000000000001', '0.1.0', 0, null) $$,
  '42501', 'device_not_accessible', 'staff cannot report for a device of another branch'
);

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  'select pending_changes, last_seen_by from public.device_status',
  $$ values (3, tests.staff('reception_a')) $$,
  'devices.manage reads the reports of their branches'' devices'
);
select lives_ok(
  $$ select public.device_heartbeat('d0000000-0000-4000-8000-000000000001', '0.1.0', 1, now() + interval '1 day') $$,
  'a device can report again'
);
select ok((select pending_since <= now() from public.device_status), 'a report never claims a time in the future');

select * from finish();
rollback;
