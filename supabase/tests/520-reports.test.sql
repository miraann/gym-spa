-- Step 10b: the reports. Revenue by source (less discounts, refunds as their own line), payments
-- by method, attendance and peak hours, plans, retention (renewed or not), stock with its value,
-- cash register differences, discounts and staff work; ranges, branches and permissions.
begin;
select plan(19);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('52000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'Asia/Baghdad')::date
$$;

select tests.authenticate_as(tests.staff('owner'));
select public.open_cash_shift(pg_temp.id(60), tests.branch('B901'), 0);
select public.create_member(p_id => pg_temp.id(n), p_branch_id => tests.branch('B901'), p_full_name => 'ئەندامی ' || n,
  p_gender => 'male', p_phone => '+96475052000' || lpad(n::text, 2, '0'))
  from generate_series(1, 2) as g (n);
select public.save_plan(p_id => pg_temp.id(10), p_name_ckb => 'مانگانە', p_kind => 'time',
  p_price => 30000, p_duration_unit => 'month', p_duration_count => 1);
-- Member 1: 5,000 off, pays the rest; member 2 owes it all.
select public.sell_subscription(pg_temp.id(20), pg_temp.id(30), pg_temp.id(1), pg_temp.id(10), tests.branch('B901'),
  pg_temp.today(), 30000, p_discount => 5000, p_discount_reason => 'هاوڕێی خاوەن',
  p_payment => jsonb_build_object('id', pg_temp.id(40), 'method', 'cash', 'amount', 25000));
select public.sell_subscription(pg_temp.id(21), pg_temp.id(31), pg_temp.id(2), pg_temp.id(10), tests.branch('B901'),
  pg_temp.today(), 30000);
select public.refund_invoice(pg_temp.id(41), pg_temp.id(30), tests.branch('B901'), 5000, 'cash', 'هەڵەی نرخ');
select public.save_product(pg_temp.id(12), 'ئاو', 500);
select public.receive_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(12), 10, 300);
select public.sell_products(gen_random_uuid(), tests.branch('B901'),
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.id(12), 'quantity', 2, 'price', 500)),
  jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 1000), null);
select public.check_in(pg_temp.id(50), tests.branch('B901'), p_member_id => pg_temp.id(1));
select public.close_cash_shift(pg_temp.id(60), 20000);

create temporary table range as select pg_temp.today() as from_day, pg_temp.today() as to_day;
grant select on range to authenticated;

-- Money ----------------------------------------------------------------------------------------------------

select results_eq(
  $$ select source, sum(amount) from public.report_revenue(pg_temp.today(), pg_temp.today()) group by source order by source $$,
  $$ values ('product', 1000.00::numeric), ('refund', -5000.00), ('subscription', 55000.00) $$,
  'revenue by source: the subscriptions less the discount, the shop, and the refund'
);
select results_eq(
  $$ select method, currency, payments, amount, refunds from public.report_payments(pg_temp.today(), pg_temp.today()) $$,
  $$ values ('cash', 'IQD', 2, 26000.00::numeric, 5000.00::numeric) $$,
  'payments by method'
);
select results_eq(
  $$ select name_ckb, sold, revenue from public.report_plans(pg_temp.today(), pg_temp.today()) $$,
  $$ values ('مانگانە', 2, 55000.00::numeric) $$,
  'two of the monthly plan sold'
);
select results_eq(
  $$ select expected_iqd, counted_iqd, difference_iqd from public.report_cash(pg_temp.today(), pg_temp.today()) $$,
  $$ values (21000.00::numeric, 20000.00::numeric, -1000.00::numeric) $$,
  'the shift was 1,000 short'
);
select results_eq(
  $$ select staff_id, invoices, discount from public.report_discounts(pg_temp.today(), pg_temp.today()) $$,
  $$ values (tests.staff('owner'), 1, 5000.00::numeric) $$,
  'the Owner gave one discount'
);
select results_eq(
  $$ select staff_id, payments, amount, subscriptions, manual_checkins from public.report_staff(pg_temp.today(), pg_temp.today()) $$,
  $$ values (tests.staff('owner'), 2, 26000.00::numeric, 2, 1) $$,
  'what the Owner did'
);

-- Visits, retention, stock ------------------------------------------------------------------------------

select results_eq(
  $$ select visits, members from public.report_attendance(pg_temp.today(), pg_temp.today()) $$,
  $$ values (1, 1) $$, 'one visit today'
);
select is((select count(*)::integer from public.report_attendance(pg_temp.today() - 6, pg_temp.today())), 7,
  'every day of the range, quiet ones too');
select is((select sum(visits)::integer from public.report_peak_hours(pg_temp.today(), pg_temp.today())), 1,
  'the peak hours hold the visit');
select is((select count(*)::integer from public.report_retention(pg_temp.today(), pg_temp.today() + 40)
            where renewed_on is null), 2, 'both memberships end in the range, not renewed yet');
select public.sell_subscription(pg_temp.id(22), pg_temp.id(32), pg_temp.id(1), pg_temp.id(10), tests.branch('B901'),
  (select end_date + 1 from public.subscriptions where id = pg_temp.id(20)), 30000);
select is((select renewed_on from public.report_retention(pg_temp.today(), pg_temp.today() + 40)
            where subscription_id = pg_temp.id(20)),
  (select end_date + 1 from public.subscriptions where id = pg_temp.id(20)), 'member 1 renewed the day after');
select results_eq(
  $$ select quantity, unit_cost, value from public.report_inventory() $$,
  $$ values (8, 300.00::numeric, 2400.00::numeric) $$, 'eight bottles left, worth 2,400'
);

-- Ranges, branches, who ---------------------------------------------------------------------------------

select throws_ok($$ select * from public.report_revenue(pg_temp.today(), pg_temp.today() - 1) $$,
  '22023', 'invalid_range', 'a range runs forwards');
select throws_ok($$ select * from public.report_attendance(pg_temp.today() - 400, pg_temp.today()) $$,
  '22023', 'invalid_range', 'and covers at most 366 days');
select is((select count(*)::integer from public.report_payments(pg_temp.today(), pg_temp.today(), tests.branch('B902'))), 0,
  'one branch only');
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok($$ select * from public.report_payments(pg_temp.today(), pg_temp.today(), tests.branch('B902')) $$,
  '42501', 'no_branch_access', 'only the staff member''s branches');
select is((select sum(amount) from public.report_payments(pg_temp.today(), pg_temp.today())), 26000.00,
  'a branch manager sees the money reports without payments.view');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select * from public.report_attendance(pg_temp.today(), pg_temp.today()) $$,
  '42501', 'permission_denied', 'reception has no reports');
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is((select count(*)::integer from public.report_revenue(pg_temp.today(), pg_temp.today())), 0,
  'another gym sees none of it');

select * from finish();
rollback;
