-- Step 10a: the dashboard. Today's check-ins (per hour), who is inside, members (not guests, never
-- the walk-in customer), memberships ending this week, spa bookings, and money only for staff who
-- may see it; per branch or every branch the staff member reaches.
begin;
select plan(14);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('51000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'Asia/Baghdad')::date
$$;

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => pg_temp.id(n), p_branch_id => tests.branch('B901'), p_full_name => 'ئەندامی ' || n,
  p_gender => 'male', p_phone => '+96475051000' || lpad(n::text, 2, '0'))
  from generate_series(1, 3) as g (n);
select public.save_plan(p_id => pg_temp.id(10), p_name_ckb => 'هەفتانە', p_kind => 'time',
  p_price => 20000, p_duration_unit => 'day', p_duration_count => 5);
select public.save_plan(p_id => pg_temp.id(11), p_name_ckb => 'مانگانە', p_kind => 'time',
  p_price => 0, p_duration_unit => 'month', p_duration_count => 1);
-- Member 1 pays 15,000 of 20,000 for five days (ends this week); member 2 has a month.
select public.sell_subscription(pg_temp.id(20), pg_temp.id(30), pg_temp.id(1), pg_temp.id(10), tests.branch('B901'),
  pg_temp.today(), 20000, p_payment => jsonb_build_object('id', pg_temp.id(40), 'method', 'cash', 'amount', 15000));
select public.sell_subscription(pg_temp.id(21), pg_temp.id(31), pg_temp.id(2), pg_temp.id(11), tests.branch('B901'),
  pg_temp.today(), 0);
select public.check_in(pg_temp.id(50), tests.branch('B901'), p_member_id => pg_temp.id(1));
select public.check_in(pg_temp.id(51), tests.branch('B901'), p_member_id => pg_temp.id(2));
-- The walk-in customer buys something: money, but not a member.
select public.save_product(pg_temp.id(12), 'ئاو', 500, p_track_stock => false);
select public.sell_products(gen_random_uuid(), tests.branch('B901'),
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.id(12), 'quantity', 2, 'price', 500)),
  jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 1000), null);
select tests.clear_authentication();
insert into public.members (id, gym_id, branch_id, full_name, gender, phone, is_guest)
values (pg_temp.id(6), tests.gym('pgtap-a'), tests.branch('B901'), 'میوان', 'female', '+9647505100006', true);

select tests.authenticate_as(tests.staff('owner'));
create temporary table summary as select public.dashboard_summary() as s;
grant select on summary to authenticated;
select is((select (s ->> 'checkins_today')::integer from summary), 2, 'two check-ins today');
select is((select (s ->> 'inside_now')::integer from summary), 2, 'both still inside');
select is((select (s -> 'hourly' ->> extract(hour from now() at time zone 'Asia/Baghdad')::integer)::integer from summary), 2,
  'both in this hour');
select is((select jsonb_array_length(s -> 'hourly') from summary), 24, 'an hour by hour list of the day');
select is((select (s ->> 'active_members')::integer from summary), 3, 'three members: no guest, no walk-in customer');
select is((select (s ->> 'new_this_month')::integer from summary), 3, 'all new this month');
select is((select (s ->> 'ending_this_week')::integer from summary), 1, 'one membership ends this week');
select is((select (s ->> 'takings_today')::numeric from summary), 16000.00, 'today''s takings: the payment and the shop');
select is((select (s ->> 'owed_now')::numeric from summary), 5000.00, 'and what is owed now');
select is((public.dashboard_summary(tests.branch('B902')) ->> 'checkins_today')::integer, 0, 'another branch had none');

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.dashboard_summary() $$, '42501', 'permission_denied', 'a trainer has no dashboard');
select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok($$ select public.dashboard_summary(tests.branch('B901')) $$, '42501', 'no_branch_access',
  'only the staff member''s branches');
select tests.authenticate_as(tests.staff('reception_a'));
select ok(public.dashboard_summary() ? 'takings_today', 'reception sees the takings (payments.view)');
select is(public.dashboard_summary() ->> 'spa_today', '0', 'and today''s spa bookings');

select * from finish();
rollback;
