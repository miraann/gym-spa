-- Step 8b: the cash register. Opening a branch's drawer with its float, payments belonging to the
-- open shift, cash in and out, the expected amounts (dinars and dollars, change, refunds, voids),
-- the blind count, closing, and who may do what.
begin;
select plan(22);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('48000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.charge(p_invoice uuid, p_amount integer, p_payment jsonb) returns jsonb language sql as $$
  select public.charge_member(p_invoice, '48000000-0000-4000-8000-000000000001', tests.branch('B901'), 'other', 'تاقیکردنەوە',
    p_amount, p_payment)
$$;

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => pg_temp.id(1), p_branch_id => tests.branch('B901'), p_full_name => 'ئارام',
  p_gender => 'male', p_phone => '+9647504800001');

-- Opening -------------------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is((public.open_cash_shift(pg_temp.id(2), tests.branch('B901'), 50000)).opening_iqd, 50000.00,
  'reception opens the drawer with its float');
select is((public.open_cash_shift(pg_temp.id(2), tests.branch('B901'), 50000)).id, pg_temp.id(2),
  'sending it again returns it');
select throws_ok($$ select public.open_cash_shift(gen_random_uuid(), tests.branch('B901'), 0) $$,
  '23505', 'shift_open', 'one open shift per branch');
select throws_ok($$ select public.open_cash_shift(gen_random_uuid(), tests.branch('B902'), 0) $$,
  '42501', 'no_branch_access', 'only in their own branches');
select throws_ok($$ select public.open_cash_shift(gen_random_uuid(), tests.branch('B901'), 100.5) $$,
  '22023', 'invalid_shift', 'the float is whole dinars');
select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.open_cash_shift(gen_random_uuid(), tests.branch('B902'), 0) $$,
  '42501', 'permission_denied', 'a trainer has no cash register (cash_register.operate)');

-- Payments while it is open ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select pg_temp.charge(pg_temp.id(11), 10000, jsonb_build_object('id', pg_temp.id(12), 'method', 'cash', 'amount', 10000));
select pg_temp.charge(gen_random_uuid(), 5000, jsonb_build_object('id', pg_temp.id(13), 'method', 'card', 'amount', 5000));
select pg_temp.charge(gen_random_uuid(), 15000, jsonb_build_object('id', pg_temp.id(14), 'method', 'cash', 'currency', 'USD',
  'foreign_amount', 20, 'exchange_rate', 1300));
select pg_temp.charge(gen_random_uuid(), 3000, jsonb_build_object('id', pg_temp.id(15), 'method', 'cash', 'amount', 3000));
select is((select count(*)::integer from public.payments where cash_shift_id = pg_temp.id(2)), 4,
  'every payment taken at the branch belongs to its open shift');
select tests.authenticate_as(tests.staff('owner'));
select public.refund_invoice(gen_random_uuid(), pg_temp.id(11), tests.branch('B901'), 2000, 'cash', 'زۆری دا');
select public.void_payment(pg_temp.id(15), 'هەڵە');

-- Cash in and out.
select tests.authenticate_as(tests.staff('reception_a'));
select is((public.add_cash_movement(pg_temp.id(21), pg_temp.id(2), 'out', 'IQD', 5000, 'کڕینی پاککەرەوە')).amount, 5000.00,
  'reception takes cash out with a reason');
select public.add_cash_movement(gen_random_uuid(), pg_temp.id(2), 'in', 'USD', 10, 'ورد');
select throws_ok($$ select public.add_cash_movement(gen_random_uuid(), pg_temp.id(2), 'out', 'IQD', 10.5, 'x') $$,
  '22023', 'invalid_cash_movement', 'dinars are whole');
select throws_ok($$ select public.add_cash_movement(gen_random_uuid(), pg_temp.id(2), 'out', 'IQD', 10, ' ') $$,
  '22023', 'invalid_cash_movement', 'a reason is needed');

-- What the drawer should have: 50,000 + 10,000 cash - 11,000 change for the dollars - 2,000 given back
-- - 5,000 taken out (the voided 3,000 counts for nothing); and 20 + 10 dollars.
select is(public.cash_shift_report(pg_temp.id(2)) ->> 'expected_iqd', null, 'reception counts blind while it is open');
select tests.authenticate_as(tests.staff('manager_a'));
select is((public.cash_shift_report(pg_temp.id(2)) ->> 'expected_iqd')::numeric, 42000.00,
  'the branch manager sees what the drawer should have (cash_register.view_all)');
select is((public.cash_shift_report(pg_temp.id(2)) ->> 'expected_usd')::numeric, 30.00, 'in dollars too');
select is((select r -> 'methods' from public.cash_shift_report(pg_temp.id(2)) r)
            @> '[{"method": "card", "kind": "payment", "count": 1, "amount": 5000}]', true,
  'the report shows what came in per method');

-- Closing ------------------------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is((public.close_cash_shift(pg_temp.id(2), 41000, 30, 'هەزارێک کەمە') ->> 'difference_iqd')::numeric, -1000.00,
  'closing with the count shows the difference');
select results_eq($$ select expected_iqd, counted_iqd, expected_usd from public.cash_shifts where id = '48000000-0000-4000-8000-000000000002' $$,
  $$ values (42000.00::numeric, 41000.00::numeric, 30.00::numeric) $$, 'and saves it');
select is((public.close_cash_shift(pg_temp.id(2), 41000, 30) ->> 'counted_iqd')::numeric, 41000.00,
  'sending the same count again returns the report');
select throws_ok($$ select public.close_cash_shift('48000000-0000-4000-8000-000000000002', 42000, 30) $$,
  '23514', 'shift_closed', 'a closed shift stays closed');
select throws_ok($$ select public.add_cash_movement(gen_random_uuid(), '48000000-0000-4000-8000-000000000002', 'in', 'IQD', 1000, 'x') $$,
  '23514', 'shift_closed', 'and takes no more cash in or out');
select pg_temp.charge(gen_random_uuid(), 1000, jsonb_build_object('id', pg_temp.id(16), 'method', 'cash', 'amount', 1000));
select is((select cash_shift_id from public.payments where id = pg_temp.id(16)), null,
  'cash taken while the drawer is closed belongs to no shift');

-- Who sees what.
select tests.authenticate_as(tests.staff('reception_b'));
select public.open_cash_shift(gen_random_uuid(), tests.branch('B902'), 0);
select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.cash_shifts), 1, 'reception sees their own branch''s shifts');
select tests.clear_authentication();
select throws_ok($$ update public.payments set cash_shift_id = null where id = '48000000-0000-4000-8000-000000000012' $$,
  '42501', 'read_only_column', 'a payment''s shift never changes');

select * from finish();
rollback;
