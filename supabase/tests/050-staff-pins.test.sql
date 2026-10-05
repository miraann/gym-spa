-- staff_pins: only the owner reads or changes their PIN hash; managers can only reset it.
begin;
select plan(17);
select tests.create_fixture();

insert into public.staff_pins (staff_id, algorithm, iterations, salt, hash)
select tests.staff(username), 'pbkdf2-sha256', 600000, 'c2FsdHNhbHRzYWx0c2FsdA==', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  from unnest(array['reception_a', 'former_a']) as username;

select tests.authenticate_as(tests.staff('reception_a'));
select set_eq('select staff_id from public.staff_pins', array[tests.staff('reception_a')],
  'staff read their own PIN hash, and only theirs');

select tests.authenticate_as(tests.staff('manager_a'));
select is_empty('select staff_id from public.staff_pins', 'a branch manager cannot read other staff PINs');

select tests.authenticate_as(tests.staff('owner'));
select is_empty('select staff_id from public.staff_pins', 'Super Admin cannot read other staff PINs');

select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select staff_id from public.staff_pins', 'deactivated staff cannot read their PIN');

select tests.authenticate_as(tests.staff('reception_b'));
select lives_ok(
  $$ insert into public.staff_pins (staff_id, algorithm, iterations, salt, hash)
     values (tests.staff('reception_b'), 'pbkdf2-sha256', 600000, 'c2FsdHNhbHRzYWx0c2FsdA==',
             'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=') $$,
  'staff can set their own PIN'
);
select is(tests.row_count($$ update public.staff_pins set iterations = 700000 where staff_id = tests.staff('reception_b') $$), 1,
  'staff can change their own PIN');
select throws_ok(
  $$ insert into public.staff_pins (staff_id, algorithm, iterations, salt, hash)
     values (tests.staff('reception_a'), 'pbkdf2-sha256', 600000, 'c2FsdHNhbHRzYWx0c2FsdA==',
             'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=') $$,
  '42501', 'new row violates row-level security policy for table "staff_pins"',
  'nobody can set someone else''s PIN'
);
select is(tests.row_count($$ update public.staff_pins set iterations = 700000 where staff_id = tests.staff('reception_a') $$), 0,
  'nobody can change someone else''s PIN');
select throws_ok(
  $$ update public.staff_pins set hash = 'not-a-hash' where staff_id = tests.staff('reception_b') $$,
  '23514', 'new row for relation "staff_pins" violates check constraint "staff_pins_hash_check"',
  'a PIN hash must be a base64 SHA-256 hash'
);
select throws_ok(
  $$ update public.staff_pins set iterations = 1000 where staff_id = tests.staff('reception_b') $$,
  '23514', 'new row for relation "staff_pins" violates check constraint "staff_pins_iterations_check"',
  'a PIN hash must use enough PBKDF2 iterations'
);
select is(tests.row_count($$ delete from public.staff_pins where staff_id = tests.staff('reception_b') $$), 1,
  'staff can remove their own PIN');

-- Resetting someone's PIN
select tests.authenticate_as(tests.staff('manager_a'));
select lives_ok($$ select public.reset_staff_pin(tests.staff('reception_a')) $$,
  'a branch manager can reset the PIN of staff they manage');
select throws_ok($$ select public.reset_staff_pin(tests.staff('trainer_ab')) $$,
  '42501', 'cannot_manage_staff', 'a branch manager cannot reset the PIN of staff they do not manage');

select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok($$ select public.reset_staff_pin(tests.staff('reception_a')) $$,
  '42501', 'cannot_manage_staff', 'staff without staff.manage cannot reset PINs');

select tests.authenticate_as_anon();
select throws_ok($$ select public.reset_staff_pin(tests.staff('reception_a')) $$,
  '42501', 'permission denied for function reset_staff_pin', 'anonymous visitors cannot reset PINs');

select tests.clear_authentication();
select is_empty($$ select 1 from public.staff_pins where staff_id = tests.staff('reception_a') $$,
  'the reset removed the PIN');

-- The audit log records PIN changes but never the hash or salt.
select results_eq(
  $$ select count(*)::integer from public.audit_logs
      where table_name = 'staff_pins'
        and coalesce(new_values, old_values) ->> 'hash' = 'redacted'
        and coalesce(new_values, old_values) ->> 'salt' = 'redacted' $$,
  $$ select count(*)::integer from public.audit_logs
      where table_name = 'staff_pins' and coalesce(new_values, old_values) ? 'hash' $$,
  'the audit log never stores a PIN hash or salt'
);

select * from finish();
rollback;
