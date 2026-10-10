-- settings: values are validated; global settings need access to all branches.
begin;
select plan(15);
select tests.create_fixture();

select tests.authenticate_as(tests.staff('admin'));
select lives_ok(
  $$ insert into public.settings (key, value) values ('security.idle_lock_minutes', '15') $$,
  'settings.edit with all branches can set a setting for every branch'
);
select throws_ok(
  $$ insert into public.settings (key, value) values ('security.pin_max_attempts', '0') $$,
  '23514', 'new row for relation "settings" violates check constraint "settings_valid_value"',
  'a value out of range is rejected'
);
select throws_ok(
  $$ insert into public.settings (key, value) values ('security.pin_max_attempts', '"5"') $$,
  '23514', 'new row for relation "settings" violates check constraint "settings_valid_value"',
  'a value of the wrong type is rejected'
);
select throws_ok(
  $$ insert into public.settings (key, value) values ('no.such.setting', '5') $$,
  '23514', 'new row for relation "settings" violates check constraint "settings_valid_value"',
  'an unknown setting is rejected'
);
select throws_ok(
  $$ insert into public.settings (key, value) values ('security.idle_lock_minutes', '20') $$,
  '23505', 'duplicate key value violates unique constraint "settings_gym_id_branch_id_key_key"',
  'a setting for every branch exists only once'
);
select lives_ok(
  $$ insert into public.settings (branch_id, key, value) values (tests.branch('B902'), 'security.idle_lock_minutes', '30') $$,
  'a branch can have its own value'
);
select throws_ok(
  $$ update public.settings set key = 'security.pin_max_attempts' where branch_id = tests.branch('B902') $$,
  '42501', 'read_only_column', 'a setting row never changes its key'
);

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ insert into public.settings (key, value) values ('security.pin_max_attempts', '4') $$,
  '42501', 'new row violates row-level security policy for table "settings"',
  'a branch manager cannot change settings for every branch'
);
select lives_ok(
  $$ insert into public.settings (branch_id, key, value) values (tests.branch('B901'), 'security.idle_lock_minutes', '5') $$,
  'a branch manager can set their branch''s own value'
);
select throws_ok(
  $$ insert into public.settings (branch_id, key, value) values (tests.branch('B902'), 'security.pin_max_attempts', '4') $$,
  '42501', 'new row violates row-level security policy for table "settings"',
  'a branch manager cannot set another branch''s value'
);
select is(
  tests.row_count($$ update public.settings set value = '45' where branch_id = tests.branch('B902') $$), 0,
  'a branch manager cannot change another branch''s value'
);

select tests.authenticate_as(tests.staff('reception_a'));
select set_eq(
  'select value::integer from public.settings', array[15, 5],
  'staff read the settings for every branch and for their own branch'
);
select is(tests.row_count($$ update public.settings set value = '60' $$), 0,
  'staff without settings.edit cannot change settings');

select tests.authenticate_as(tests.staff('manager_a'));
select is(
  tests.row_count($$ delete from public.settings where branch_id = tests.branch('B901') $$), 1,
  'removing a branch''s value goes back to the setting for every branch'
);

select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select id from public.settings', 'deactivated staff read no settings');

select * from finish();
rollback;
