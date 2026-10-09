-- staff_pins: PINs are set and checked only by the server functions; nobody reads a hash.
begin;
select plan(26);
select tests.create_fixture();

-- Setting a PIN
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.set_my_pin('482915') $$,
  '42501', 'password_login_required', 'a session without a password login cannot set a PIN');

select tests.authenticate_with_password(tests.staff('reception_a'), now() - interval '1 hour');
select throws_ok($$ select public.set_my_pin('482915') $$,
  '42501', 'password_login_required', 'a password login more than 15 minutes ago cannot set a PIN');

select tests.authenticate_with_password(tests.staff('reception_a'), now());
select throws_ok($$ select public.set_my_pin('48291') $$, '22023', 'pin_length', 'a PIN has 6 digits');
select throws_ok($$ select public.set_my_pin('١٢٣٤٥٦') $$, '22023', 'pin_length', 'the app sends Latin digits only');
select throws_ok($$ select public.set_my_pin('111111') $$, '22023', 'pin_weak', 'one repeated digit is too weak');
select throws_ok($$ select public.set_my_pin('987654') $$, '22023', 'pin_weak', 'a run is too weak');
select throws_ok($$ select public.set_my_pin('121212') $$, '22023', 'pin_weak', 'a repeated pair is too weak');
select lives_ok($$ select public.set_my_pin('482915') $$, 'staff set their own PIN right after a password login');
select results_eq('select staff_id, failed_attempts from public.staff_pins',
  $$ values (tests.staff('reception_a'), 0) $$, 'staff see their own PIN row');
select throws_ok('select pin_hash from public.staff_pins', '42501',
  'permission denied for table staff_pins', 'nobody reads a PIN hash, not even its owner');
select throws_ok($$ update public.staff_pins set failed_attempts = 0 $$, '42501',
  'permission denied for table staff_pins', 'clients never change PIN rows directly');

select tests.authenticate_with_password(tests.staff('former_a'), now());
select throws_ok($$ select public.set_my_pin('482915') $$, '42501', 'not_allowed', 'deactivated staff cannot set a PIN');

select tests.authenticate_as(tests.staff('manager_a'));
select is_empty('select staff_id from public.staff_pins', 'other staff cannot see someone''s PIN row');

-- Unlocking (the fixture has no settings, so 5 tries)
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_with_pin('482915', tests.branch('B902')) ->> 'result', 'no_branch_access',
  'a PIN does not open a device in a branch the staff member cannot access');
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'ok', 'the right PIN unlocks');
select is(public.unlock_with_pin('000001', tests.branch('B901')), '{"result": "wrong_pin", "tries_left": 4}'::jsonb,
  'a wrong PIN says how many tries are left');
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'ok', 'the right PIN still unlocks');
select is(public.unlock_with_pin('000001', tests.branch('B901')) ->> 'tries_left', '4', 'the right PIN resets the count');
select lives_ok($$ select public.unlock_with_pin('000002', tests.branch('B901')) from generate_series(1, 4) $$,
  'four more wrong PINs');
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'locked_out',
  'after too many wrong PINs even the right one is refused');

-- Only a password login after the lockout clears it.
select tests.authenticate_with_password(tests.staff('reception_a'), now() - interval '1 minute');
select public.clear_my_pin_lockout();
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'locked_out',
  'a session from before the lockout cannot clear it');
select tests.authenticate_with_password(tests.staff('reception_a'), now() + interval '1 second');
select public.clear_my_pin_lockout();
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'ok',
  'a password login after the lockout clears it');

-- Resetting someone's PIN
select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok($$ select public.reset_staff_pin(tests.staff('reception_a')) $$,
  '42501', 'cannot_manage_staff', 'staff without staff.manage cannot reset PINs');
select tests.authenticate_as(tests.staff('manager_a'));
select lives_ok($$ select public.reset_staff_pin(tests.staff('reception_a')) $$,
  'a branch manager can reset the PIN of staff they manage');
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_with_pin('482915', tests.branch('B901')) ->> 'result', 'no_pin', 'after a reset there is no PIN');

select tests.clear_authentication();
select results_eq(
  $$ select count(*) filter (where v ->> 'pin_hash' <> 'redacted')::integer,
            (count(*) filter (where v ->> 'pin_hash' = 'redacted') > 0)
       from public.audit_logs a, lateral (values (a.old_values), (a.new_values)) as each_value (v)
      where a.table_name = 'staff_pins' and v ? 'pin_hash' $$,
  $$ values (0, true) $$,
  'the audit log records PIN changes but never a PIN hash'
);

select * from finish();
rollback;
