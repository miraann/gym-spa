-- Step 7b: group classes. Types and the weekly schedule, sessions made when first booked, booking with
-- a waitlist that fills a freed place at once, attendance, cancelling a date, and who may do what.
begin;
select plan(30);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('45000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create temporary table days as
  select (now() at time zone 'Asia/Baghdad')::date as today, (now() at time zone 'Asia/Baghdad')::date + 1 as tomorrow;
grant select on days to authenticated;
create function pg_temp.tomorrow() returns date language sql as $$ select tomorrow from days $$;

select tests.authenticate_as(tests.staff('owner'));
select public.save_staff_profile(tests.staff('trainer_ab'), 'commission', p_teaches => true);
select public.save_plan(p_id => pg_temp.id(1), p_name_ckb => 'مانگانە', p_kind => 'time', p_price => 0,
  p_duration_unit => 'month', p_duration_count => 1);
-- Members 11 to 15; all but 15 have a current subscription.
select public.create_member(p_id => pg_temp.id(10 + n), p_branch_id => tests.branch('B901'), p_full_name => 'ئەندامی ' || n,
  p_gender => 'female', p_phone => '+96475045000' || lpad(n::text, 2, '0'))
  from generate_series(1, 5) as g (n);
select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), pg_temp.id(10 + n), pg_temp.id(1), tests.branch('B901'),
  (select today from days), 0)
  from generate_series(1, 4) as g (n);

-- Types and schedule ---------------------------------------------------------------------------------

select is((public.save_class_type(pg_temp.id(2), 'یۆگا', 60, 20)).capacity, 20, 'the Owner adds a class type');
select throws_ok($$ select public.save_class_type(gen_random_uuid(), 'یۆگا', 600) $$,
  '22023', 'invalid_class_type', 'a class is at most 240 minutes');
select is((public.save_class_schedule(pg_temp.id(3), tests.branch('B901'), pg_temp.id(2),
  extract(isodow from pg_temp.tomorrow())::smallint, '18:00', 60, 2, (select today from days),
  p_trainer_id => tests.staff('trainer_ab'), p_place => 'هۆڵی ١')).capacity, 2,
  'and yoga every week on tomorrow''s weekday, for two');
select throws_ok($$ select public.save_class_schedule(gen_random_uuid(), tests.branch('B901'), pg_temp.id(2), 1::smallint,
  '18:00', 60, 10, current_date, p_trainer_id => tests.staff('reception_a')) $$,
  'P0002', 'trainer_not_found', 'only staff who teach are trainers');
select throws_ok($$ select public.save_class_schedule(gen_random_uuid(), tests.branch('B901'), pg_temp.id(2), 1::smallint,
  '23:30', 60, 10, current_date) $$,
  '22023', 'invalid_class_schedule', 'a class ends by midnight');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.save_class_type(gen_random_uuid(), 'زومبا') $$,
  '42501', 'permission_denied', 'reception doesn''t change classes (classes.manage)');

-- Booking and the waitlist ----------------------------------------------------------------------------

select is(public.book_class(pg_temp.id(21), pg_temp.id(3), pg_temp.tomorrow(), pg_temp.id(11)) ->> 'status', 'booked',
  'reception books a member');
select is(public.book_class(pg_temp.id(22), pg_temp.id(3), pg_temp.tomorrow(), pg_temp.id(12)) ->> 'status', 'booked',
  'and another');
select is(public.book_class(pg_temp.id(23), pg_temp.id(3), pg_temp.tomorrow(), pg_temp.id(13)), jsonb_build_object(
  'booking_id', pg_temp.id(23), 'session_id', (select id from public.class_sessions), 'status', 'waitlisted', 'position', 1),
  'a third goes on the waitlist, first');
select is(public.book_class(pg_temp.id(24), pg_temp.id(3), pg_temp.tomorrow(), pg_temp.id(14)) ->> 'position', '2',
  'and a fourth second');
select is((select count(*)::integer from public.class_sessions), 1, 'the session was made once, by the first booking');
select is(public.book_class(pg_temp.id(21), pg_temp.id(3), pg_temp.tomorrow(), pg_temp.id(11)) ->> 'status', 'booked',
  'sending a booking again returns it');
select throws_ok($$ select public.book_class(gen_random_uuid(), pg_temp.id(3), pg_temp.tomorrow(), pg_temp.id(11)) $$,
  '23505', 'already_booked', 'a member books a session once');
select throws_ok($$ select public.book_class(gen_random_uuid(), pg_temp.id(3), pg_temp.tomorrow(), pg_temp.id(15)) $$,
  '23514', 'no_membership', 'a member without a current subscription isn''t booked');
select throws_ok($$ select public.book_class(gen_random_uuid(), pg_temp.id(3), pg_temp.tomorrow() + 1, pg_temp.id(11)) $$,
  '23514', 'not_a_class_day', 'nor on a day the class doesn''t take place');
select is((select public.taken(s) from public.class_sessions s), 2, 'two places are taken');

select is(public.cancel_class_booking(pg_temp.id(21)) ->> 'status', 'cancelled', 'a booked member cancels');
select is((select status from public.class_bookings where id = pg_temp.id(23)), 'booked',
  'and the first on the waitlist gets the place at once');
select is((select status from public.class_bookings where id = pg_temp.id(24)), 'waitlisted', 'the second still waits');
select is(public.cancel_class_booking(pg_temp.id(24)) ->> 'status', 'cancelled', 'someone on the waitlist may cancel too');
select lives_ok($$ select public.book_class(gen_random_uuid(), pg_temp.id(3), pg_temp.tomorrow(), pg_temp.id(11)) $$,
  'a cancelled member may book again (and waits)');

-- Attendance ---------------------------------------------------------------------------------------------

select throws_ok($$ select public.mark_class_attendance(pg_temp.id(22), 'attended') $$,
  '23514', 'too_early', 'attendance is marked from an hour before the class');
select tests.clear_authentication();
alter table public.class_sessions disable trigger user;
update public.class_sessions set starts_at = now() - interval '10 minutes', ends_at = now() + interval '50 minutes';
alter table public.class_sessions enable trigger user;
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.mark_class_attendance(pg_temp.id(22), 'attended') ->> 'status', 'attended', 'a member attended');
select throws_ok($$ select public.mark_class_attendance(pg_temp.id(24), 'attended') $$,
  '23514', 'invalid_status_change', 'a cancelled booking isn''t marked');
select throws_ok($$ select public.cancel_class_booking(pg_temp.id(22)) $$,
  '23514', 'class_attended', 'nor is an attended one cancelled');

-- Cancelling a date, and who may do what ----------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is(public.cancel_class_session(pg_temp.id(3), pg_temp.tomorrow() + 7, 'ڕاهێنەر نەخۆشە') ->> 'cancelled_bookings', '0',
  'the Owner cancels next week''s date');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.book_class(gen_random_uuid(), pg_temp.id(3), pg_temp.tomorrow() + 7, pg_temp.id(12)) $$,
  '23514', 'class_cancelled', 'nobody is booked on a cancelled date');
select throws_ok($$ insert into public.class_bookings (id, session_id, member_id, status)
                    values (gen_random_uuid(), (select id from public.class_sessions limit 1), pg_temp.id(14), 'booked') $$,
  '42501', null, 'nobody writes bookings directly');
select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.class_sessions), 0, 'reception of another branch sees none of these');
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.class_bookings where status = 'attended'), 1, 'the trainer sees the class''s bookings');

select * from finish();
rollback;
