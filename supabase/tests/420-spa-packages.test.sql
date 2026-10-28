-- Step 6b: spa packages (saved, sold with an invoice and a payment, retried) and the spa sessions
-- plans include, copied onto each subscription when it is sold.
begin;
select plan(26);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('42000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create temporary table today_is as select (now() at time zone 'Asia/Baghdad')::date as d;
grant select on today_is to authenticated;

select tests.authenticate_as(tests.staff('owner'));
select public.save_spa_service(pg_temp.id(1), 'مەساژ', 'massage', 60, 30000);
select public.save_spa_service(pg_temp.id(2), 'ساونا', 'sauna', 30, 10000, p_needs_therapist => false);
select public.create_member(p_id => pg_temp.id(11), p_branch_id => tests.branch('B901'), p_full_name => 'ئارام',
  p_gender => 'male', p_phone => '+9647504200011');
select public.create_member(p_id => pg_temp.id(12), p_branch_id => tests.branch('B901'), p_full_name => 'شوان',
  p_gender => 'male', p_phone => '+9647504200012');
select public.set_member_status(pg_temp.id(12), 'archived', 'ڕۆیشت');

-- Packages ------------------------------------------------------------------------------------------

select is((public.save_spa_package(pg_temp.id(21), 'پێنج مەساژ', pg_temp.id(1), 5, 120000, p_valid_days => 90)).session_count,
  5, 'the Owner adds a package of five massages');
select public.save_spa_package(pg_temp.id(22), 'دە ساونا', pg_temp.id(2), 10, 80000, p_is_active => false);
select throws_ok($$ select public.save_spa_package(gen_random_uuid(), 'پاکێج', pg_temp.id(1), 0, 1000) $$,
  '22023', 'invalid_spa_package', 'at least one session');
select throws_ok($$ select public.save_spa_package(gen_random_uuid(), 'پاکێج', gen_random_uuid(), 5, 1000) $$,
  'P0002', 'spa_service_not_found', 'of a service of the gym');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.save_spa_package(gen_random_uuid(), 'پاکێج', pg_temp.id(1), 5, 1000) $$,
  '42501', 'permission_denied', 'reception doesn''t change packages (spa.manage)');

-- Selling a package ----------------------------------------------------------------------------------

create temporary table sold as
  select public.sell_spa_package(pg_temp.id(31), pg_temp.id(32), pg_temp.id(21), pg_temp.id(11), tests.branch('B901'),
    '{"id": "42000000-0000-4000-8000-000000000033", "method": "cash", "amount": 50000}') as r;
grant select on sold to authenticated;
select is((select (r ->> 'total')::numeric from sold), 120000.00, 'reception sells the package for its price');
select is((select (r ->> 'paid')::numeric from sold), 50000.00, 'with a part paid now');
select is((select kind || ' ' || description_ckb from public.invoice_items where invoice_id = pg_temp.id(32)),
  'spa پێنج مەساژ', 'on one invoice, as spa');
select is((select expires_on from public.member_spa_packages where id = pg_temp.id(31)), (select d + 89 from today_is),
  'valid for 90 days from today');
select is((select session_count || ' ' || service_id from public.member_spa_packages where id = pg_temp.id(31)),
  '5 ' || pg_temp.id(1), 'with its own copy of the terms');
select is(public.sell_spa_package(pg_temp.id(31), pg_temp.id(32), pg_temp.id(21), pg_temp.id(11), tests.branch('B901')) ->> 'invoice_number',
  (select r ->> 'invoice_number' from sold), 'sending it again returns what was saved');
select is((select count(*)::integer from public.invoices where member_id = pg_temp.id(11)), 1, 'and sells nothing more');
select throws_ok($$ select public.sell_spa_package(pg_temp.id(31), gen_random_uuid(), pg_temp.id(21), pg_temp.id(12), tests.branch('B901')) $$,
  '23505', 'member_package_exists', 'the id of another sale is refused');
select throws_ok($$ select public.sell_spa_package(gen_random_uuid(), gen_random_uuid(), pg_temp.id(22), pg_temp.id(11), tests.branch('B901')) $$,
  '23514', 'spa_package_inactive', 'an inactive package isn''t sold');
select throws_ok($$ select public.sell_spa_package(gen_random_uuid(), gen_random_uuid(), pg_temp.id(21), pg_temp.id(12), tests.branch('B901')) $$,
  '23514', 'member_archived', 'nor to an archived member');
select throws_ok($$ select public.sell_spa_package(gen_random_uuid(), gen_random_uuid(), pg_temp.id(21), pg_temp.id(11), tests.branch('B902')) $$,
  '42501', 'no_branch_access', 'nor in a branch the staff member doesn''t reach');
select throws_ok($$ insert into public.member_spa_packages (id, branch_id, member_id, package_id, service_id, name_ckb,
                      session_count, price, starts_on, invoice_id)
                    values (gen_random_uuid(), tests.branch('B901'), pg_temp.id(11), pg_temp.id(21), pg_temp.id(1), 'x', 5, 0,
                      current_date, pg_temp.id(32)) $$,
  '42501', null, 'nobody writes sold packages directly');
select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.sell_spa_package(gen_random_uuid(), gen_random_uuid(), pg_temp.id(21), pg_temp.id(11), tests.branch('B901')) $$,
  '42501', 'permission_denied', 'a trainer sells no packages (spa.book and payments.create)');

-- Sessions in plans ----------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select public.save_plan(p_id => pg_temp.id(41), p_name_ckb => 'مانگانەی زێڕین', p_kind => 'time', p_price => 0,
  p_duration_unit => 'month', p_duration_count => 1);
select is(jsonb_array_length(public.set_plan_spa_sessions(pg_temp.id(41),
  ('[{"service_id": "' || pg_temp.id(1) || '", "count": 2}, {"service_id": "' || pg_temp.id(2) || '", "count": 4}]')::jsonb)),
  2, 'a plan includes 2 massages and 4 saunas');
select public.sell_subscription(pg_temp.id(51), pg_temp.id(52), pg_temp.id(11), pg_temp.id(41), tests.branch('B901'),
  (select d from today_is), 0);
select set_eq($$ select service_id, session_count from public.subscription_spa_sessions where subscription_id = pg_temp.id(51) $$,
  $$ values (pg_temp.id(1), 2), (pg_temp.id(2), 4) $$, 'selling the plan copies them onto the subscription');
select is(jsonb_array_length(public.set_plan_spa_sessions(pg_temp.id(41),
  ('[{"service_id": "' || pg_temp.id(1) || '", "count": 3}]')::jsonb)), 1, 'the plan changes to 3 massages');
select set_eq($$ select service_id, session_count from public.subscription_spa_sessions where subscription_id = pg_temp.id(51) $$,
  $$ values (pg_temp.id(1), 2), (pg_temp.id(2), 4) $$, 'what was sold stays as it was');
select throws_ok($$ select public.set_plan_spa_sessions(pg_temp.id(41),
  ('[{"service_id": "' || pg_temp.id(1) || '", "count": 2}, {"service_id": "' || pg_temp.id(1) || '", "count": 4}]')::jsonb) $$,
  '22023', 'invalid_spa_sessions', 'each service once');
select throws_ok($$ select public.set_plan_spa_sessions(pg_temp.id(41), ('[{"service_id": "' || pg_temp.id(1) || '", "count": 0}]')::jsonb) $$,
  '22023', 'invalid_spa_sessions', 'at least one session');
select throws_ok($$ select public.set_plan_spa_sessions(pg_temp.id(41), ('[{"service_id": "' || gen_random_uuid() || '", "count": 1}]')::jsonb) $$,
  'P0002', 'spa_service_not_found', 'of a service of the gym');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.set_plan_spa_sessions(pg_temp.id(41), '[]') $$,
  '42501', 'permission_denied', 'reception doesn''t change plans');
select throws_ok($$ insert into public.subscription_spa_sessions (subscription_id, service_id, session_count)
                    values (pg_temp.id(51), pg_temp.id(1), 9) $$,
  '42501', null, 'nobody adds sessions to a subscription directly');

select * from finish();
rollback;
