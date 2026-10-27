-- Step 3g: a member's membership, computed from their subscriptions: none, current, frozen,
-- upcoming and expired; voided sales don't count; it follows RLS like the subscriptions.
begin;
select plan(9);
select tests.create_fixture();

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => '80000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
  p_full_name => 'ئارام کەریم', p_gender => 'male', p_phone => '+9647508000001');
select public.create_member(p_id => '80000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
  p_full_name => 'شیلان عەلی', p_gender => 'female', p_phone => '+9647508000002');
select public.create_member(p_id => '80000000-0000-4000-8000-000000000003', p_branch_id => tests.branch('B901'),
  p_full_name => 'هێمن جەلال', p_gender => 'male', p_phone => '+9647508000003');
select public.create_member(p_id => '80000000-0000-4000-8000-000000000004', p_branch_id => tests.branch('B901'),
  p_full_name => 'ڤیان سەردار', p_gender => 'female', p_phone => '+9647508000004');
select public.save_plan(p_id => '81000000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانە', p_kind => 'time',
  p_price => 30000, p_duration_unit => 'month', p_duration_count => 1, p_max_freeze_days => 10);

create temporary table today_is as select (now() at time zone 'Asia/Baghdad')::date as d;
grant select on today_is to authenticated;

select is(public.membership(m), 'none', 'a member who never bought anything has none')
  from public.members m where m.id = '80000000-0000-4000-8000-000000000001';

-- Current, from ten days ago; frozen today; upcoming from tomorrow.
select public.sell_subscription('82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is) - 10, 30000);
select public.sell_subscription('82000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is), 30000);
select public.freeze_subscription('84000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000002',
  (select d from today_is), 3);
select public.sell_subscription('82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000003',
  '80000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is) + 1, 30000);

select is(public.membership(m), 'current', 'a month that runs today is current')
  from public.members m where m.id = '80000000-0000-4000-8000-000000000001';
select is(public.membership_ends_on(m), app.plan_end_date((select d from today_is) - 10, 'month', 1),
  'and ends on its last day')
  from public.members m where m.id = '80000000-0000-4000-8000-000000000001';
select is(public.membership(m), 'frozen', 'a month frozen today is frozen')
  from public.members m where m.id = '80000000-0000-4000-8000-000000000002';
select is(public.membership(m), 'upcoming', 'one that starts tomorrow is upcoming')
  from public.members m where m.id = '80000000-0000-4000-8000-000000000003';

-- Ended: a month cancelled; a voided sale counts for nothing.
select public.cancel_subscription('82000000-0000-4000-8000-000000000001', 'ڕۆیشت');
select is(public.membership(m), 'expired', 'a member whose subscriptions all ended is expired')
  from public.members m where m.id = '80000000-0000-4000-8000-000000000001';
select public.sell_subscription('82000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000004',
  '80000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is), 30000);
select public.void_invoice('83000000-0000-4000-8000-000000000004', 'هەڵە');
select is(public.membership(m), 'none', 'a voided sale doesn''t count')
  from public.members m where m.id = '80000000-0000-4000-8000-000000000004';

select is(
  (select count(*)::integer from public.members m where public.membership(m) = 'expired'),
  1, 'members can be filtered by it'
);

-- Without members.view no subscription is seen, so nobody looks like they have one.
select tests.clear_authentication();
select tests.create_role('بێ ئەندامان', array['dashboard.view']);
select tests.create_staff('no_members_a', (select id::text from public.roles where name_ckb = 'بێ ئەندامان'), array['B901']);
select tests.authenticate_as(tests.staff('no_members_a'));
select is(
  (select public.membership(m) from public.members m where m.id = '80000000-0000-4000-8000-000000000002'),
  null, 'without members.view the member isn''t even seen'
);

select * from finish();
rollback;
