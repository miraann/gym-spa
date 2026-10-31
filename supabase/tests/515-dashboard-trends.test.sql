-- Step D-4: the dashboard's trends. The last 7 days of check-ins and money (today last), yesterday's
-- up to this time of day, today's classes (every schedule falling on today, with or without a
-- session row, cancelled ones left out) with their places, personal training today; each part only
-- with its permission, per branch or every branch the staff member reaches.
begin;
select plan(16);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('51500000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create temporary table days as
  select (now() at time zone 'Asia/Baghdad')::date as today,
         extract(hour from now() at time zone 'Asia/Baghdad')::integer as hour;
grant select on days to authenticated;
create function pg_temp.today() returns date language sql as $$ select today from days $$;

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => pg_temp.id(n), p_branch_id => tests.branch('B901'), p_full_name => 'ئەندامی ' || n,
  p_gender => 'female', p_phone => '+96475051500' || lpad(n::text, 2, '0'))
  from generate_series(1, 2) as g (n);
select public.save_plan(p_id => pg_temp.id(10), p_name_ckb => 'مانگانە', p_kind => 'time',
  p_price => 20000, p_duration_unit => 'month', p_duration_count => 1);
select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), pg_temp.id(n), pg_temp.id(10), tests.branch('B901'),
  pg_temp.today(), 20000, p_payment => jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 20000))
  from generate_series(1, 2) as g (n);
select public.check_in(pg_temp.id(20 + n), tests.branch('B901'), p_member_id => pg_temp.id(n))
  from generate_series(1, 2) as g (n);

-- Two classes today at 22:00 (the second cancelled for today) and one tomorrow; member 1 books today's
-- while it isn't over (until 23:00).
select public.save_class_type(pg_temp.id(30), 'یۆگا', 60, 20);
select public.save_class_schedule(pg_temp.id(31), tests.branch('B901'), pg_temp.id(30),
  extract(isodow from pg_temp.today())::smallint, '22:00', 60, 8, pg_temp.today());
select public.save_class_schedule(pg_temp.id(32), tests.branch('B901'), pg_temp.id(30),
  extract(isodow from pg_temp.today())::smallint, '22:00', 60, 5, pg_temp.today(), p_place => 'هۆڵی ٢');
select public.save_class_schedule(pg_temp.id(33), tests.branch('B901'), pg_temp.id(30),
  extract(isodow from pg_temp.today() + 1)::smallint, '10:00', 60, 30, pg_temp.today());
select public.book_class(pg_temp.id(40), pg_temp.id(31), pg_temp.today(), pg_temp.id(1)) from days where hour < 23;
select public.cancel_class_session(pg_temp.id(32), pg_temp.today(), 'ڕاهێنەر نەخۆشە');

create temporary table trends as select public.dashboard_trends() as t;
grant select on trends to authenticated;
select is((select jsonb_array_length(t -> 'checkins_week') from trends), 7, 'seven days of check-ins');
select is((select (t -> 'checkins_week' ->> 6)::integer from trends), 2, 'today last: two check-ins');
select is((select (t ->> 'checkins_yesterday')::integer from trends), 0, 'none yesterday by this time');
select is((select jsonb_array_length(t -> 'takings_week') from trends), 7, 'seven days of money');
select is((select (t -> 'takings_week' ->> 6)::numeric from trends), 40000.00, 'today last: what was taken today');
select is((select (t ->> 'takings_yesterday')::numeric from trends), 0.00, 'nothing yesterday by this time');
select is((select (t ->> 'classes_today')::integer from trends), 1, 'one class today: the cancelled one left out');
select is((select (t ->> 'class_places')::integer from trends), 8, 'eight places in it');
select is((select (t ->> 'class_taken')::integer from trends), (select case when hour < 23 then 1 else 0 end from days),
  'one of them taken (when it could still be booked)');
select is((select (t ->> 'classes_now')::integer from trends), (select case when hour = 22 then 1 else 0 end from days),
  'running now only from 22:00 to 23:00');
select is((select (t ->> 'pt_today')::integer from trends), 0, 'no personal training today');
select is((public.dashboard_trends(tests.branch('B902')) -> 'checkins_week' ->> 6)::integer, 0,
  'another branch had none');

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.dashboard_trends() $$, '42501', 'permission_denied', 'a trainer has no dashboard');
select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok($$ select public.dashboard_trends(tests.branch('B901')) $$, '42501', 'no_branch_access',
  'only the staff member''s branches');
select tests.authenticate_as(tests.staff('reception_a'));
select ok(public.dashboard_trends() ? 'takings_week', 'reception sees the money (payments.view)');
select tests.clear_authentication();
select ok(not has_function_privilege('anon', 'public.dashboard_trends(uuid)', 'execute'), 'never for anon');

select * from finish();
rollback;
