-- Step 6c: spa bookings. Booking with a room place and a therapist, the clashes the database refuses
-- (room with its cleaning time, therapist, member), the checks (hours, services, gender, room kind,
-- branch), paying with a package or a plan's sessions, moving, the statuses, arriving with an
-- invoice, a voided invoice, commissions, and who may do what.
begin;
select plan(53);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('43000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
-- Tomorrow in Baghdad at hh:mm.
create function pg_temp.at(clock text) returns timestamptz language sql as $$
  select (((now() at time zone 'Asia/Baghdad')::date + 1) + clock::time) at time zone 'Asia/Baghdad'
$$;
create temporary table tomorrow as select (now() at time zone 'Asia/Baghdad')::date + 1 as d;
grant select on tomorrow to authenticated;

-- The setup, by the Owner.
select tests.authenticate_as(tests.staff('owner'));
select public.save_spa_service(pg_temp.id(1), 'مەساژ', 'massage', 60, 30000, p_cleanup_minutes => 15);
select public.save_spa_service(pg_temp.id(2), 'ساونا', 'sauna', 30, 10000, p_needs_therapist => false);
select public.save_spa_service(pg_temp.id(3), 'چارەسەری دەموچاو', 'facial', 45, 20000, p_gender => 'female');
select public.save_spa_room(pg_temp.id(11), tests.branch('B901'), 'ژووری مەساژ ١', 'massage');
select public.save_spa_room(pg_temp.id(12), tests.branch('B901'), 'ساونا', 'sauna', 2);
select public.save_spa_room(pg_temp.id(13), tests.branch('B901'), 'ژووری دەموچاو', 'facial');
select public.save_spa_room(pg_temp.id(14), tests.branch('B902'), 'ژووری مەساژ', 'massage');
select public.save_spa_room(pg_temp.id(15), tests.branch('B901'), 'ژووری مەساژ ٢', 'massage');
select public.save_spa_therapist(pg_temp.id(21), tests.branch('B901'), 'ڕۆژان', 'female', array[pg_temp.id(1), pg_temp.id(3)],
  (select jsonb_agg(jsonb_build_object('weekday', d, 'from', '08:00', 'until', '24:00')) from generate_series(1, 7) as g (d)),
  p_commission_percent => 10);
select public.save_spa_therapist(pg_temp.id(22), tests.branch('B901'), 'دانا', 'male', array[pg_temp.id(1)],
  (select jsonb_agg(jsonb_build_object('weekday', d, 'from', '09:00', 'until', '12:00')) from generate_series(1, 7) as g (d)));
select public.create_member(p_id => pg_temp.id(31), p_branch_id => tests.branch('B901'), p_full_name => 'ئارام',
  p_gender => 'male', p_phone => '+9647504300031');
select public.create_member(p_id => pg_temp.id(32), p_branch_id => tests.branch('B901'), p_full_name => 'هانا',
  p_gender => 'female', p_phone => '+9647504300032');
select public.create_member(p_id => pg_temp.id(33), p_branch_id => tests.branch('B901'), p_full_name => 'شوان',
  p_gender => 'male', p_phone => '+9647504300033');
select public.create_member(p_id => pg_temp.id(34), p_branch_id => tests.branch('B901'), p_full_name => 'دلێر',
  p_gender => 'male', p_phone => '+9647504300034');
select public.set_member_status(pg_temp.id(34), 'suspended', 'پارەی نەداوە');
select public.save_spa_package(pg_temp.id(41), 'دوو مەساژ', pg_temp.id(1), 2, 50000);
select public.sell_spa_package(pg_temp.id(42), pg_temp.id(43), pg_temp.id(41), pg_temp.id(31), tests.branch('B901'));
select public.save_plan(p_id => pg_temp.id(51), p_name_ckb => 'مانگانە', p_kind => 'time', p_price => 0,
  p_duration_unit => 'month', p_duration_count => 1);
select public.set_plan_spa_sessions(pg_temp.id(51), ('[{"service_id": "' || pg_temp.id(2) || '", "count": 1}]')::jsonb);
select public.sell_subscription(pg_temp.id(52), pg_temp.id(53), pg_temp.id(33), pg_temp.id(51), tests.branch('B901'),
  (now() at time zone 'Asia/Baghdad')::date, 0);

-- Booking and clashes ---------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.book_spa(pg_temp.id(61), tests.branch('B901'), pg_temp.id(31), pg_temp.id(1), pg_temp.at('10:00'),
  pg_temp.id(11), pg_temp.id(21)) ->> 'status', 'booked', 'reception books a massage with a therapist');
select is((select ends_at || ' ' || room_free_at from public.spa_bookings where id = pg_temp.id(61)),
  pg_temp.at('11:00') || ' ' || pg_temp.at('11:15'), 'for its hour, and the room is cleaned for 15 minutes');
select is((select price || ' ' || name_ckb || ' ' || place from public.spa_bookings where id = pg_temp.id(61)),
  '30000.00 مەساژ 1', 'with the service''s name and price copied');
select is(public.book_spa(pg_temp.id(61), tests.branch('B901'), pg_temp.id(31), pg_temp.id(1), pg_temp.at('10:00'),
  pg_temp.id(11), pg_temp.id(21)) ->> 'booking_id', pg_temp.id(61)::text, 'sending it again returns what was saved');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(1),
  pg_temp.at('11:00'), pg_temp.id(11), pg_temp.id(22)) $$,
  '23P01', 'spa_room_taken', 'the room is taken while it is cleaned');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(1),
  pg_temp.at('10:30'), pg_temp.id(15), pg_temp.id(21)) $$,
  '23P01', 'spa_therapist_taken', 'a therapist does one booking at a time');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(31), pg_temp.id(2),
  pg_temp.at('10:30'), pg_temp.id(12)) $$,
  '23P01', 'spa_member_busy', 'and so does a member');
select is(public.book_spa(pg_temp.id(62), tests.branch('B901'), pg_temp.id(32), pg_temp.id(2), pg_temp.at('13:00'),
  pg_temp.id(12)) ->> 'place', '1', 'a sauna for two takes a first guest');
select is(public.book_spa(pg_temp.id(63), tests.branch('B901'), pg_temp.id(33), pg_temp.id(2), pg_temp.at('13:10'),
  pg_temp.id(12), p_paid_with => 'plan', p_subscription_id => pg_temp.id(52)) ->> 'place', '2',
  'and a second at the same time, from his plan''s sessions');
select is((select price from public.spa_bookings where id = pg_temp.id(63)), 0.00, 'which costs nothing more');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(31), pg_temp.id(2),
  pg_temp.at('13:20'), pg_temp.id(12)) $$,
  '23P01', 'spa_room_taken', 'a third doesn''t fit');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(33), pg_temp.id(2),
  pg_temp.at('15:00'), pg_temp.id(12), p_paid_with => 'plan', p_subscription_id => pg_temp.id(52)) $$,
  '23514', 'no_sessions_left', 'the plan included one sauna');
select is((select public.sessions_left(s) from public.subscription_spa_sessions s where s.subscription_id = pg_temp.id(52)),
  0, 'none is left');

-- Checks -------------------------------------------------------------------------------------------------

select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(1),
  pg_temp.at('13:00'), pg_temp.id(15), pg_temp.id(22)) $$,
  '23514', 'therapist_not_working', 'a therapist is booked only in their hours');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(3),
  pg_temp.at('10:00'), pg_temp.id(13), pg_temp.id(22)) $$,
  '23514', 'therapist_cant_do_service', 'and for the services they do');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(2),
  pg_temp.at('16:00'), pg_temp.id(12), pg_temp.id(21)) $$,
  '22023', 'therapist_not_needed', 'a sauna has no therapist');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(1),
  pg_temp.at('16:00'), pg_temp.id(15)) $$,
  '22023', 'therapist_required', 'a massage has one');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(31), pg_temp.id(3),
  pg_temp.at('16:00'), pg_temp.id(13), pg_temp.id(21)) $$,
  '23514', 'spa_wrong_gender', 'a service for women isn''t booked for a man');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(1),
  pg_temp.at('16:00'), pg_temp.id(12), pg_temp.id(21)) $$,
  '23514', 'spa_room_wrong_kind', 'a massage isn''t given in the sauna');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(1),
  pg_temp.at('16:00'), pg_temp.id(14), pg_temp.id(21)) $$,
  'P0002', 'spa_room_not_found', 'nor in another branch''s room');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(34), pg_temp.id(2),
  pg_temp.at('16:00'), pg_temp.id(12)) $$,
  '23514', 'member_not_active', 'a suspended member isn''t booked');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(2),
  now() - interval '2 hours', pg_temp.id(12)) $$,
  '22023', 'invalid_spa_booking', 'nor two hours ago');

-- A package --------------------------------------------------------------------------------------------

select is(public.book_spa(pg_temp.id(64), tests.branch('B901'), pg_temp.id(31), pg_temp.id(1), pg_temp.at('16:00'),
  pg_temp.id(11), pg_temp.id(21), p_paid_with => 'package', p_member_package_id => pg_temp.id(42)) ->> 'status',
  'booked', 'a massage from the package');
select public.book_spa(pg_temp.id(65), tests.branch('B901'), pg_temp.id(31), pg_temp.id(1), pg_temp.at('17:30'),
  pg_temp.id(11), pg_temp.id(21), p_paid_with => 'package', p_member_package_id => pg_temp.id(42));
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(31), pg_temp.id(1),
  pg_temp.at('19:00'), pg_temp.id(11), pg_temp.id(21), p_paid_with => 'package', p_member_package_id => pg_temp.id(42)) $$,
  '23514', 'no_sessions_left', 'a third one is more than the package has');
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(33), pg_temp.id(1),
  pg_temp.at('19:00'), pg_temp.id(11), pg_temp.id(21), p_paid_with => 'package', p_member_package_id => pg_temp.id(42)) $$,
  '23514', 'spa_package_not_usable', 'another member can''t use it');
select is(public.set_spa_booking_status(pg_temp.id(65), 'cancelled', 'نایەت') ->> 'status', 'cancelled',
  'a booking is cancelled before the client comes');
select is((select public.sessions_left(p) from public.member_spa_packages p where p.id = pg_temp.id(42)), 1,
  'and its session is given back');

-- Moving ---------------------------------------------------------------------------------------------------

select is(public.move_spa_booking(pg_temp.id(61), pg_temp.at('12:00'), pg_temp.id(11), pg_temp.id(21)) ->> 'starts_at',
  to_jsonb(pg_temp.at('12:00')) #>> '{}', 'the 10:00 massage moves to 12:00');
select is((select ends_at || ' ' || room_free_at from public.spa_bookings where id = pg_temp.id(61)),
  pg_temp.at('13:00') || ' ' || pg_temp.at('13:15'), 'keeping its length');
select is(public.book_spa(pg_temp.id(66), tests.branch('B901'), pg_temp.id(32), pg_temp.id(1), pg_temp.at('10:00'),
  pg_temp.id(11), pg_temp.id(22)) ->> 'status', 'booked', 'and its old time is free again');
select throws_ok($$ select public.move_spa_booking(pg_temp.id(66), pg_temp.at('12:00'), pg_temp.id(15), pg_temp.id(21)) $$,
  '23P01', 'spa_therapist_taken', 'a move into a clash is refused');
select throws_ok($$ select public.move_spa_booking(pg_temp.id(65), pg_temp.at('20:00'), pg_temp.id(11), pg_temp.id(21)) $$,
  '23514', 'spa_booking_closed', 'a cancelled booking isn''t moved');

-- Statuses, arriving and paying --------------------------------------------------------------------------

select is(public.set_spa_booking_status(pg_temp.id(66), 'confirmed') ->> 'status', 'confirmed', 'a booking is confirmed');
select throws_ok($$ select public.set_spa_booking_status(pg_temp.id(66), 'completed') $$,
  '23514', 'invalid_status_change', 'and completed only after the client arrives');
select throws_ok($$ select public.arrive_spa_booking(pg_temp.id(66), gen_random_uuid()) $$,
  '23514', 'not_today', 'a client arrives on the booking''s day');

-- A sauna now, paid at the door.
select public.book_spa(pg_temp.id(67), tests.branch('B901'), pg_temp.id(32), pg_temp.id(2), now(), pg_temp.id(12),
  p_walk_in => true);
create temporary table arrived as
  select public.arrive_spa_booking(pg_temp.id(67), pg_temp.id(68),
    '{"id": "43000000-0000-4000-8000-000000000069", "method": "cash", "amount": 10000}') as r;
grant select on arrived to authenticated;
select is((select r ->> 'status' from arrived), 'arrived', 'a walk-in arrives');
select is((select kind || ' ' || description_ckb || ' ' || total from public.invoice_items where invoice_id = pg_temp.id(68)),
  'spa ساونا 10000.00', 'and is charged the service on an invoice');
select is((select (r ->> 'paid')::numeric from arrived), 10000.00, 'paid at once');
select is(public.arrive_spa_booking(pg_temp.id(67), gen_random_uuid()) ->> 'invoice_number',
  (select r ->> 'invoice_number' from arrived), 'arriving again changes nothing');
select throws_ok($$ select public.set_spa_booking_status(pg_temp.id(67), 'no_show') $$,
  '23514', 'invalid_status_change', 'a client who came isn''t a no-show');
select tests.authenticate_as(tests.staff('owner'));
select public.void_invoice(pg_temp.id(68), 'هەڵە بوو');
select is((select status from public.spa_bookings where id = pg_temp.id(67)), 'cancelled',
  'voiding its invoice cancels the booking');

-- A therapist's commission (the massage marked arrived with the triggers off: it is tomorrow).
select tests.clear_authentication();
alter table public.spa_bookings disable trigger user;
update public.spa_bookings set status = 'arrived', arrived_at = now() where id = pg_temp.id(61);
alter table public.spa_bookings enable trigger user;
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.set_spa_booking_status(pg_temp.id(61), 'completed') ->> 'status', 'completed', 'the massage is completed');
select is((select commission_amount from public.spa_bookings where id = pg_temp.id(61)), 3000.00,
  'and the therapist earns 10% of its price');
select throws_ok($$ select public.spa_commissions(tests.branch('B901'), current_date, current_date + 2) $$,
  '42501', 'permission_denied', 'reception doesn''t see the commissions (spa.manage)');
select tests.authenticate_as(tests.staff('manager_a'));
select results_eq($$ select full_name, bookings, total, commission
                     from public.spa_commissions(tests.branch('B901'), (select d from tomorrow), (select d from tomorrow)) $$,
  $$ values ('ڕۆژان'::text, 1, 30000.00::numeric, 3000.00::numeric) $$, 'the branch manager does');

-- Plan changes keep the sessions used --------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select public.transfer_subscription(pg_temp.id(52), pg_temp.id(54), pg_temp.id(31), 'گواستنەوە');
select is((select session_count from public.subscription_spa_sessions where subscription_id = pg_temp.id(54)), 0,
  'a transfer carries only the sessions left');

-- Who may do what ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.book_spa(gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(2),
  pg_temp.at('20:00'), pg_temp.id(12)) $$,
  '42501', 'permission_denied', 'a trainer books nothing (spa.book)');
select is((select count(*)::integer from public.spa_bookings), 0, 'nor sees the bookings (spa.view)');
select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.spa_bookings), 0, 'reception of another branch sees none of this one');
select throws_ok($$ select public.set_spa_booking_status(pg_temp.id(66), 'cancelled') $$,
  'P0002', 'spa_booking_not_found', 'nor changes them');
select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.spa_bookings), 7, 'reception of the branch sees them all');
select throws_ok($$ insert into public.spa_bookings (id, branch_id, member_id, service_id, room_id, place, name_ckb, price,
                      starts_at, ends_at, room_free_at, paid_with)
                    values (gen_random_uuid(), tests.branch('B901'), pg_temp.id(32), pg_temp.id(2), pg_temp.id(12), 1, 'x', 0,
                      pg_temp.at('21:00'), pg_temp.at('21:30'), pg_temp.at('21:30'), 'pay') $$,
  '42501', null, 'nobody writes bookings directly');
select throws_ok($$ select public.arrive_spa_booking(pg_temp.id(66)) $$,
  '23514', 'not_today', 'arriving checks the day before the money');

select * from finish();
rollback;
