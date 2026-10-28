-- Step 5a: lockers. Adding and managing them, giving daily lockers (by hand and with a visit),
-- renting and renewing, the release events (check-out, a voided invoice, a lost key, the end of the
-- day), one holder at a time, and who may do what.
begin;
select plan(61);
select tests.create_fixture();

create temporary table today_is as select (now() at time zone 'Asia/Baghdad')::date as d;
grant select on today_is to authenticated;

-- Members (1, 3, 4 and 5 men, 2 a woman, 5 suspended) and a free month for member 4, by the Owner.
select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => ('97000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  p_branch_id => tests.branch('B901'), p_full_name => 'ئەندامی ' || n,
  p_gender => case n when 2 then 'female' else 'male' end,
  p_phone => '+96475091000' || lpad(n::text, 2, '0'))
  from generate_series(1, 5) as g (n);
select public.set_member_status('97000000-0000-4000-8000-000000000005', 'suspended', 'پارەی نەداوە');
select public.save_plan(p_id => '97100000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانە', p_kind => 'time',
  p_price => 0, p_duration_unit => 'month', p_duration_count => 1);
select public.sell_subscription('97200000-0000-4000-8000-000000000001', '97300000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000004', '97100000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is), 0);

-- The locker with this number in branch B901.
create function pg_temp.locker(locker_number text) returns uuid language sql as $$
  select id from public.lockers
   where number = locker_number and branch_id = tests.branch('B901') and deleted_at is null
$$;

-- Adding and managing ----------------------------------------------------------------------------------

select is(public.add_lockers(tests.branch('B901'), 'men', 'daily', '', 1, 10), 10, 'the Owner adds ten daily lockers for men');
select is(public.add_lockers(tests.branch('B901'), 'women', 'daily', 'W', 1, 5), 5, 'and five for women, numbered W1 to W5');
select is(public.add_lockers(tests.branch('B901'), 'mixed', 'rented', 'R', 1, 3), 3, 'and three to rent');
select throws_ok($$ select public.add_lockers(tests.branch('B901'), 'men', 'daily', '', 10, 12) $$,
  '23505', 'locker_number_taken', 'a number used in the branch is refused, and nothing is added');
select is((select count(*)::integer from public.lockers where number in ('11', '12')), 0, 'all or none');
select is(public.add_lockers(tests.branch('B902'), 'men', 'daily', '', 1, 2), 2, 'another branch may use the same numbers');
select throws_ok($$ select public.add_lockers(tests.branch('B901'), 'men', 'daily', '', 1, 400) $$,
  '22023', 'invalid_locker', 'at most 300 at once');
select throws_ok($$ select public.add_lockers(tests.branch('B901'), 'men', 'daily', 'a', 1, 2) $$,
  '22023', 'invalid_locker', 'the prefix is capital Latin letters');

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok($$ select public.add_lockers(tests.branch('B902'), 'men', 'daily', '', 50, 51) $$,
  '42501', 'no_branch_access', 'a branch manager adds lockers only in their own branch');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.add_lockers(tests.branch('B901'), 'men', 'daily', '', 50, 51) $$,
  '42501', 'permission_denied', 'reception can''t add lockers (lockers.manage)');
select throws_ok($$ select public.set_locker_out_of_order(pg_temp.locker('3'), 'شکاوە') $$,
  '42501', 'permission_denied', 'nor mark one out of order');
select throws_ok($$ insert into public.lockers (id, branch_id, number, zone, kind)
                    values (gen_random_uuid(), tests.branch('B901'), '77', 'men', 'daily') $$,
  '42501', null, 'nobody writes lockers directly');
select is((select count(*)::integer from public.lockers), 18, 'reception sees their branch''s lockers');
select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.lockers), 2, 'and reception of the other branch only theirs');
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.lockers), 0, 'a trainer sees no lockers (lockers.view)');

-- Daily lockers ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.give_locker('97400000-0000-4000-8000-000000000001', pg_temp.locker('1'),
  '97000000-0000-4000-8000-000000000001') ->> 'starts_on', (select d::text from today_is),
  'reception gives member 1 a daily locker for today');
select is(public.give_locker('97400000-0000-4000-8000-000000000001', pg_temp.locker('1'),
  '97000000-0000-4000-8000-000000000001') ->> 'assignment_id', '97400000-0000-4000-8000-000000000001',
  'the same id again returns what was saved');
select throws_ok($$ select public.give_locker(gen_random_uuid(), pg_temp.locker('2'), '97000000-0000-4000-8000-000000000001') $$,
  '23505', 'already_has_locker', 'a member holds one daily locker at a time');
select throws_ok($$ select public.give_locker(gen_random_uuid(), pg_temp.locker('1'), '97000000-0000-4000-8000-000000000003') $$,
  '23505', 'locker_taken', 'a locker someone holds is refused at once');
select throws_ok($$ select public.give_locker(gen_random_uuid(), pg_temp.locker('W1'), '97000000-0000-4000-8000-000000000003') $$,
  '23514', 'locker_wrong_zone', 'a man gets no locker in the women''s zone');
select ok(public.give_locker(gen_random_uuid(), pg_temp.locker('W1'), '97000000-0000-4000-8000-000000000002') is not null,
  'a woman does');
select throws_ok($$ select public.give_locker(gen_random_uuid(), pg_temp.locker('R1'), '97000000-0000-4000-8000-000000000003') $$,
  '23514', 'locker_wrong_kind', 'a locker to rent is not given for the day');
select throws_ok($$ select public.give_locker(gen_random_uuid(), pg_temp.locker('3'), '97000000-0000-4000-8000-000000000005') $$,
  '42501', 'member_not_active', 'a suspended member gets no daily locker');
select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok($$ select public.give_locker(gen_random_uuid(), pg_temp.locker('3'), '97000000-0000-4000-8000-000000000003') $$,
  'P0002', 'locker_not_found', 'reception of another branch can''t use this branch''s lockers');

-- With a visit: released at check-out.
select tests.authenticate_as(tests.staff('reception_a'));
select public.check_in('97500000-0000-4000-8000-000000000004', tests.branch('B901'),
  p_member_id => '97000000-0000-4000-8000-000000000004');
select throws_ok($$ select public.give_locker(gen_random_uuid(), pg_temp.locker('4'), '97000000-0000-4000-8000-000000000003',
                      '97500000-0000-4000-8000-000000000004') $$,
  'P0002', 'visit_not_found', 'the visit must be the member''s own');
select ok(public.give_locker('97400000-0000-4000-8000-000000000004', pg_temp.locker('4'),
  '97000000-0000-4000-8000-000000000004', '97500000-0000-4000-8000-000000000004') is not null,
  'a daily locker given with the member''s visit');
select public.check_out('97500000-0000-4000-8000-000000000004');
select is((select release_reason from public.locker_assignments where id = '97400000-0000-4000-8000-000000000004'),
  'checked_out', 'checking out gives the locker back');

-- Managing a locker someone holds ------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select public.set_locker_out_of_order(pg_temp.locker('1'), 'شکاوە') $$,
  '23514', 'locker_in_use', 'a locker someone holds is not marked out of order');
select throws_ok($$ select public.update_locker(pg_temp.locker('1'), '1', 'mixed', 'daily') $$,
  '23514', 'locker_in_use', 'nor moved to another zone');
select lives_ok($$ select public.update_locker(pg_temp.locker('1'), 'M1', 'men', 'daily') $$,
  'but it may get another number');
select throws_ok($$ select public.update_locker(pg_temp.locker('M1'), '2', 'men', 'daily') $$,
  '23505', 'locker_number_taken', 'not one another locker has');
select throws_ok($$ select public.remove_locker(pg_temp.locker('M1')) $$,
  '23514', 'locker_in_use', 'and it is not removed');
select public.set_locker_out_of_order(pg_temp.locker('3'), 'قفڵەکەی شکاوە');
select throws_ok($$ select public.give_locker(gen_random_uuid(), pg_temp.locker('3'), '97000000-0000-4000-8000-000000000003') $$,
  '23514', 'locker_out_of_order', 'nobody gets a locker that is out of order');
select public.set_locker_out_of_order(pg_temp.locker('3'), null);
select is((select out_of_order_at::text || out_of_order_note from public.lockers where id = pg_temp.locker('3')), null,
  'back in order, with no note');
select public.remove_locker(pg_temp.locker('10'));
select ok(pg_temp.locker('10') is null, 'a free locker is removed');
select is(public.add_lockers(tests.branch('B901'), 'men', 'daily', '', 10, 10), 1, 'and its number may be used again');

-- Releasing ----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select public.release_locker('97400000-0000-4000-8000-000000000001');
select is((select release_reason from public.locker_assignments where id = '97400000-0000-4000-8000-000000000001'),
  'returned', 'reception releases a locker given back');
select is(public.release_locker('97400000-0000-4000-8000-000000000001') ->> 'released_at',
  (select to_jsonb(released_at) #>> '{}' from public.locker_assignments where id = '97400000-0000-4000-8000-000000000001'),
  'releasing again changes nothing');
select ok(public.give_locker(gen_random_uuid(), pg_temp.locker('M1'), '97000000-0000-4000-8000-000000000003') is not null,
  'and somebody else may have it now');
select throws_ok($$ update public.locker_assignments set released_at = now(), release_reason = 'returned' $$,
  '42501', null, 'nobody changes holders directly');

-- The end of the day: a daily locker given yesterday (moved back with the triggers off).
select tests.clear_authentication();
alter table public.locker_assignments disable trigger user;
update public.locker_assignments set starts_on = starts_on - 1, assigned_at = assigned_at - interval '1 day'
 where member_id = '97000000-0000-4000-8000-000000000002';
alter table public.locker_assignments enable trigger user;
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.release_daily_lockers(tests.branch('B901')), 1, 'the end-of-day list releases yesterday''s locker');
select is((select release_reason from public.locker_assignments where member_id = '97000000-0000-4000-8000-000000000002'),
  'end_of_day', 'as not given back by the end of the day');
select is((select count(*)::integer from public.locker_assignments where released_at is null and kind = 'daily'), 1,
  'today''s locker stays given');

-- Renting -------------------------------------------------------------------------------------------------

select throws_ok($$ select public.rent_locker(gen_random_uuid(), gen_random_uuid(), pg_temp.locker('R1'),
                      '97000000-0000-4000-8000-000000000001', (select d from today_is), 3, 'کرێی دۆڵاب') $$,
  '23514', 'locker_price_not_set', 'no locker is rented before the gym sets a price');
select tests.authenticate_as(tests.staff('owner'));
insert into public.settings (branch_id, key, value) values (null, 'lockers.rent_month_price', '20000');
select tests.authenticate_as(tests.staff('reception_a'));
create temporary table rental as
  select public.rent_locker('97400000-0000-4000-8000-000000000011', '97600000-0000-4000-8000-000000000011',
    pg_temp.locker('R1'), '97000000-0000-4000-8000-000000000001', (select d from today_is), 3, 'کرێی دۆڵابی R1',
    '{"id": "97700000-0000-4000-8000-000000000011", "method": "cash", "amount": 60000}') as r;
grant select on rental to authenticated;
select is((select (r ->> 'total')::numeric || ' ' || (r ->> 'paid')::numeric from rental), '60000.00 60000.00',
  'three months at the month price, paid in full, on one invoice');
select is((select (r ->> 'ends_on')::date from rental), (select app.plan_end_date(d, 'month', 3) from today_is),
  'it ends three months later');
select is((select kind from public.invoice_items where invoice_id = '97600000-0000-4000-8000-000000000011'), 'locker',
  'the invoice item is a locker');
select is(public.rent_locker('97400000-0000-4000-8000-000000000011', '97600000-0000-4000-8000-000000000011',
    pg_temp.locker('R1'), '97000000-0000-4000-8000-000000000001', (select d from today_is), 3, 'کرێی دۆڵابی R1') ->> 'invoice_number',
  (select number from public.invoices where id = '97600000-0000-4000-8000-000000000011'), 'the same id again returns what was saved');
select throws_ok($$ select public.rent_locker(gen_random_uuid(), gen_random_uuid(), pg_temp.locker('R1'),
                      '97000000-0000-4000-8000-000000000003', (select d from today_is), 1, 'کرێ') $$,
  '23505', 'locker_taken', 'a rented locker is not rented twice');
select throws_ok($$ select public.rent_locker(gen_random_uuid(), gen_random_uuid(), pg_temp.locker('R2'),
                      '97000000-0000-4000-8000-000000000003', (select d from today_is), 13, 'کرێ') $$,
  '22023', 'invalid_rental', 'at most twelve months');
select throws_ok($$ select public.rent_locker(gen_random_uuid(), gen_random_uuid(), pg_temp.locker('R2'),
                      '97000000-0000-4000-8000-000000000003', (select d - 1 from today_is), 1, 'کرێ') $$,
  '22023', 'invalid_rental', 'starting today or later');
select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.rent_locker(gen_random_uuid(), gen_random_uuid(), pg_temp.locker('R2'),
                      '97000000-0000-4000-8000-000000000003', current_date, 1, 'کرێ') $$,
  '42501', 'permission_denied', 'a trainer rents no lockers');

-- Renewing, then the renewal's invoice voided.
select tests.authenticate_as(tests.staff('reception_a'));
create temporary table renewal as
  select public.renew_locker_rental('97400000-0000-4000-8000-000000000012', '97600000-0000-4000-8000-000000000012',
    '97400000-0000-4000-8000-000000000011', 1, 'نوێکردنەوەی دۆڵابی R1') as r;
grant select on renewal to authenticated;
select is((select (r ->> 'starts_on')::date from renewal), (select app.plan_end_date(d, 'month', 3) + 1 from today_is),
  'a renewal starts the day after the last paid day');
select is((select release_reason from public.locker_assignments where id = '97400000-0000-4000-8000-000000000011'),
  'renewed', 'and the old rental ends as renewed');
select tests.authenticate_as(tests.staff('owner'));
select public.void_invoice('97600000-0000-4000-8000-000000000012', 'بە هەڵە');
select is((select release_reason from public.locker_assignments where id = '97400000-0000-4000-8000-000000000012'),
  'invoice_voided', 'voiding the rent invoice releases the locker');

-- A lost key -----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
create temporary table no_fee as
  select public.lost_locker_key((select id from public.locker_assignments where locker_id = pg_temp.locker('M1') and released_at is null),
    gen_random_uuid(), 'کلیلی ونبوو') as r;
grant select on no_fee to authenticated;
select is((select (r ->> 'fee')::integer from no_fee), 0, 'without a fee a lost key only releases the locker');
select is((select release_reason || coalesce(key_fee_invoice_id::text, '') from public.locker_assignments where id = (select (r ->> 'assignment_id')::uuid from no_fee)),
  'key_lost', 'with no invoice');
select tests.authenticate_as(tests.staff('owner'));
insert into public.settings (branch_id, key, value) values (null, 'lockers.lost_key_fee', '15000');
select tests.authenticate_as(tests.staff('reception_a'));
select public.give_locker('97400000-0000-4000-8000-000000000021', pg_temp.locker('5'), '97000000-0000-4000-8000-000000000003');
select is((public.lost_locker_key('97400000-0000-4000-8000-000000000021', '97600000-0000-4000-8000-000000000021',
  'کلیلی ونبوو') ->> 'total')::numeric, 15000.00, 'with a fee the member is charged it');
select is((select kind from public.invoice_items where invoice_id = '97600000-0000-4000-8000-000000000021'), 'penalty',
  'as a penalty');
select is((select key_fee_invoice_id from public.locker_assignments where id = '97400000-0000-4000-8000-000000000021'),
  '97600000-0000-4000-8000-000000000021'::uuid, 'and the holder keeps the fee''s invoice');
select throws_ok($$ select public.lost_locker_key('97400000-0000-4000-8000-000000000021', gen_random_uuid(), 'کلیل') $$,
  '23514', 'already_released', 'a released locker has no key to lose');

select * from finish();
rollback;
