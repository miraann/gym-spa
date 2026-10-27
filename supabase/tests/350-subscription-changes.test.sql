-- Step 3f: changing subscriptions. Freezing and unfreezing (the end date moves, one freeze at a
-- time, the plan's freeze days), changing to another plan with the unused part settled pro rata,
-- transferring to another member, cancelling with a refund, the preview, who may, read-only gyms.
begin;
select plan(47);
select tests.create_fixture();

create temporary table today_is as select (now() at time zone 'Asia/Baghdad')::date as d;
grant select on today_is to authenticated;

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => '70000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
  p_full_name => 'ئارام کەریم', p_gender => 'male', p_phone => '+9647507000001');
select public.create_member(p_id => '70000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
  p_full_name => 'شیلان عەلی', p_gender => 'female', p_phone => '+9647507000002');
select public.create_member(p_id => '70000000-0000-4000-8000-000000000003', p_branch_id => tests.branch('B901'),
  p_full_name => 'هێمن جەلال', p_gender => 'male', p_phone => '+9647507000003');
select public.save_plan(p_id => '71000000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانە', p_kind => 'time',
  p_price => 30000, p_duration_unit => 'month', p_duration_count => 1, p_max_freeze_days => 10);
select public.save_plan(p_id => '71000000-0000-4000-8000-000000000002', p_name_ckb => 'سێ مانگ', p_kind => 'time',
  p_price => 81000, p_duration_unit => 'month', p_duration_count => 3, p_max_freeze_days => 15);
select public.save_plan(p_id => '71000000-0000-4000-8000-000000000003', p_name_ckb => 'دوانزە جار', p_kind => 'visits',
  p_price => 24000, p_visit_count => 12);
select public.save_plan(p_id => '71000000-0000-4000-8000-000000000004', p_name_ckb => 'VIP', p_kind => 'unlimited',
  p_price => 100000);

-- S1: a month from ten days ago, paid. S2: a month from today, owed. S3: twelve visits, paid.
-- S4: unlimited. S5: three months from today, paid. S6: a month from tomorrow. S7: a month from ten
-- days ago, owed.
select public.sell_subscription('72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is) - 10, 30000, p_payment => '{"id": "74000000-0000-4000-8000-000000000001", "method": "cash", "amount": 30000}');
select public.sell_subscription('72000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is), 30000);
select public.sell_subscription('72000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003', tests.branch('B901'),
  (select d from today_is), 24000, p_payment => '{"id": "74000000-0000-4000-8000-000000000003", "method": "cash", "amount": 24000}');
select public.sell_subscription('72000000-0000-4000-8000-000000000004', '73000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', tests.branch('B901'),
  (select d from today_is), 100000);
select public.sell_subscription('72000000-0000-4000-8000-000000000005', '73000000-0000-4000-8000-000000000005',
  '70000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002', tests.branch('B901'),
  (select d from today_is), 81000, p_payment => '{"id": "74000000-0000-4000-8000-000000000005", "method": "cash", "amount": 81000}');
select public.sell_subscription('72000000-0000-4000-8000-000000000006', '73000000-0000-4000-8000-000000000006',
  '70000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is) + 1, 30000);
select public.sell_subscription('72000000-0000-4000-8000-000000000007', '73000000-0000-4000-8000-000000000007',
  '70000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (select d from today_is) - 10, 30000);

-- What a month from ten days ago is worth today: the days left of the days sold.
create temporary table s1_worth as
select round(30000 * ((app.plan_end_date(d - 10, 'month', 1) - (d - 10) + 1) - 10)::numeric
                   / (app.plan_end_date(d - 10, 'month', 1) - (d - 10) + 1)) as worth
  from today_is;
grant select on s1_worth to authenticated;

-- Freezing ----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(
  (public.freeze_subscription('75000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
     (select d from today_is), 5, 'گەشت') ->> 'end_date')::date,
  app.plan_end_date((select d from today_is) - 10, 'month', 1) + 5,
  'a receptionist freezes a month for five days from today: it ends five days later'
);
select results_eq(
  $$ select start_date, end_date, ended_on, reason from public.subscription_freezes where id = '75000000-0000-4000-8000-000000000001' $$,
  $$ select d, d + 4, null::date, 'گەشت'::text from today_is $$,
  'the freeze is kept, with its days and reason'
);
select ok(app.is_frozen('72000000-0000-4000-8000-000000000001', (select d from today_is)), 'it is frozen today');
select throws_ok(
  $$ select public.freeze_subscription('75000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001',
       (select d from today_is) + 10, 2) $$,
  '23514', 'already_frozen', 'one freeze at a time'
);
select is(
  (public.freeze_subscription('75000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
     (select d from today_is), 5) ->> 'freeze_id')::uuid,
  '75000000-0000-4000-8000-000000000001'::uuid, 'the same freeze again (a lost answer) changes nothing'
);
select is(
  (public.unfreeze_subscription('75000000-0000-4000-8000-000000000001') ->> 'end_date')::date,
  app.plan_end_date((select d from today_is) - 10, 'month', 1),
  'unfrozen the day it started: the end date is back where it was'
);
select ok(not app.is_frozen('72000000-0000-4000-8000-000000000001', (select d from today_is)), 'and it isn''t frozen');
select throws_ok(
  $$ select public.unfreeze_subscription('75000000-0000-4000-8000-000000000001') $$,
  '23514', 'not_frozen', 'a freeze that is over is not ended again'
);
select throws_ok(
  $$ select public.freeze_subscription(gen_random_uuid(), '72000000-0000-4000-8000-000000000001',
       (select d from today_is), 11) $$,
  '23514', 'freeze_too_long', 'no more days than the plan allows'
);
select throws_ok(
  $$ select public.freeze_subscription(gen_random_uuid(), '72000000-0000-4000-8000-000000000001',
       (select d from today_is) - 1, 2) $$,
  '22023', 'invalid_freeze_dates', 'not from yesterday'
);
select throws_ok(
  $$ select public.freeze_subscription(gen_random_uuid(), '72000000-0000-4000-8000-000000000003',
       (select d from today_is), 2) $$,
  '23514', 'cannot_freeze', 'a plan of visits has no end date to move'
);
-- A freeze planned for later is taken back whole.
select public.freeze_subscription('75000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000005',
  (select d from today_is) + 3, 4);
select is(
  (public.unfreeze_subscription('75000000-0000-4000-8000-000000000003') ->> 'end_date')::date,
  app.plan_end_date((select d from today_is), 'month', 3),
  'a freeze that hasn''t started is taken back, days and all'
);
select is(
  (public.subscription_change_preview('72000000-0000-4000-8000-000000000005') ->> 'freeze_days_used')::integer,
  0, 'and uses none of the freeze days'
);
select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok(
  $$ select public.freeze_subscription(gen_random_uuid(), '72000000-0000-4000-8000-000000000001',
       (select d from today_is), 2) $$,
  '42501', 'permission_denied', 'a trainer freezes nothing'
);

-- Changing the plan -----------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('manager_a'));
select is(
  (public.subscription_change_preview('72000000-0000-4000-8000-000000000001') ->> 'worth')::numeric,
  (select worth from s1_worth), 'the preview shows what the days left are worth'
);
select is(
  public.change_plan('72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000011',
    '73000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000002', tests.branch('B901'), 81000)
    -> 'credit',
  to_jsonb((select worth from s1_worth)),
  'an upgrade: what the paid month has left comes off the three months'
);
select results_eq(
  $$ select v.discount, v.total, it.discount_reason
       from public.invoices v join public.invoice_items it on it.invoice_id = v.id
      where v.id = '73000000-0000-4000-8000-000000000011' $$,
  $$ select worth::numeric(14,2), (81000 - worth)::numeric(14,2), 'B901-000001'::text from s1_worth $$,
  'the new invoice shows it as a discount from the old invoice'
);
select results_eq(
  $$ select (select status from public.subscriptions where id = '72000000-0000-4000-8000-000000000001'),
            (select replaces_id from public.subscriptions where id = '72000000-0000-4000-8000-000000000011'),
            (select start_date from public.subscriptions where id = '72000000-0000-4000-8000-000000000011') $$,
  $$ select 'replaced'::text, '72000000-0000-4000-8000-000000000001'::uuid, d from today_is $$,
  'the old one is replaced by the new one, from today'
);
select is(
  public.change_plan('72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000012',
    '73000000-0000-4000-8000-000000000012', '71000000-0000-4000-8000-000000000002', tests.branch('B901'), 81000)
    - array['subscription_id', 'invoice_id', 'invoice_number', 'payment_id', 'receipt_number', 'start_date', 'end_date', 'paid', 'change_given'],
  '{"total": 81000.00, "worth": 30000, "forgiven": 30000, "credit": 0}'::jsonb,
  'an unpaid month changed on its first day: what was owed for it is cleared, nothing comes off'
);
select results_eq(
  $$ select credited, due from public.invoice_balances where invoice_id = '73000000-0000-4000-8000-000000000002' $$,
  $$ values (30000::numeric(14,2), 0::numeric(14,2)) $$,
  'the old invoice owes nothing now'
);
select throws_ok(
  $$ select public.change_plan('72000000-0000-4000-8000-000000000005', gen_random_uuid(), gen_random_uuid(),
       '71000000-0000-4000-8000-000000000001', tests.branch('B901'), 30000) $$,
  '23514', 'credit_exceeds_price', 'a paid three months is worth more than a month: cancel with a refund instead'
);
select throws_ok(
  $$ select public.change_plan('72000000-0000-4000-8000-000000000005', gen_random_uuid(), gen_random_uuid(),
       '71000000-0000-4000-8000-000000000002', tests.branch('B901'), 81000) $$,
  '23514', 'same_plan', 'to another plan only'
);
select throws_ok(
  $$ select public.change_plan('72000000-0000-4000-8000-000000000004', gen_random_uuid(), gen_random_uuid(),
       '71000000-0000-4000-8000-000000000002', tests.branch('B901'), 81000) $$,
  '23514', 'cannot_change_plan', 'an unlimited plan has nothing to share out'
);
select throws_ok(
  $$ select public.change_plan('72000000-0000-4000-8000-000000000006', gen_random_uuid(), gen_random_uuid(),
       '71000000-0000-4000-8000-000000000002', tests.branch('B901'), 81000) $$,
  '23514', 'subscription_not_current', 'not one that hasn''t started'
);
select throws_ok(
  $$ select public.change_plan('72000000-0000-4000-8000-000000000001', gen_random_uuid(), gen_random_uuid(),
       '71000000-0000-4000-8000-000000000002', tests.branch('B901'), 81000) $$,
  '23514', 'subscription_not_active', 'nor one that was replaced'
);
select throws_ok(
  $$ select public.change_plan('72000000-0000-4000-8000-000000000005', gen_random_uuid(), gen_random_uuid(),
       '71000000-0000-4000-8000-000000000003', tests.branch('B901'), 20000) $$,
  '23514', 'price_changed', 'at the price the screen showed'
);
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.change_plan('72000000-0000-4000-8000-000000000005', gen_random_uuid(), gen_random_uuid(),
       '71000000-0000-4000-8000-000000000003', tests.branch('B901'), 24000) $$,
  '42501', 'permission_denied', 'a receptionist changes no plan'
);
select tests.authenticate_as(tests.staff('manager_a'));
-- Frozen: unfreeze first.
select public.freeze_subscription('75000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000011',
  (select d from today_is), 2);
select throws_ok(
  $$ select public.change_plan('72000000-0000-4000-8000-000000000011', gen_random_uuid(), gen_random_uuid(),
       '71000000-0000-4000-8000-000000000003', tests.branch('B901'), 24000) $$,
  '23514', 'subscription_frozen', 'a frozen subscription changes no plan'
);
select public.unfreeze_subscription('75000000-0000-4000-8000-000000000004');

-- Transferring -------------------------------------------------------------------------------------------------

select is(
  (public.transfer_subscription('72000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000015',
     '70000000-0000-4000-8000-000000000001', 'براکەی') ->> 'end_date')::date,
  app.plan_end_date((select d from today_is), 'month', 3),
  'three months go to another member, to the same end'
);
select results_eq(
  $$ select member_id, transferred_from_id, name_ckb, max_freeze_days from public.subscriptions where id = '72000000-0000-4000-8000-000000000015' $$,
  $$ values ('70000000-0000-4000-8000-000000000001'::uuid, '72000000-0000-4000-8000-000000000005'::uuid, 'سێ مانگ'::text, 15) $$,
  'as the same plan, with the freeze days left'
);
select is((select status from public.subscriptions where id = '72000000-0000-4000-8000-000000000005'), 'transferred',
  'the first member''s is transferred');
select is((select count(*)::integer from public.invoice_items where subscription_id = '72000000-0000-4000-8000-000000000015'),
  0, 'and the invoice stays with them');
select throws_ok(
  $$ select public.transfer_subscription('72000000-0000-4000-8000-000000000003', gen_random_uuid(),
       '70000000-0000-4000-8000-000000000003', 'هۆکار') $$,
  '23514', 'same_member', 'not to the same member'
);
select throws_ok(
  $$ select public.transfer_subscription('72000000-0000-4000-8000-000000000003', gen_random_uuid(),
       '70000000-0000-4000-8000-000000000001', null) $$,
  '22023', 'reason_required', 'with a reason'
);

-- Cancelling ------------------------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.cancel_subscription('72000000-0000-4000-8000-000000000003', 'نەخۆش کەوت',
       '{"id": "74000000-0000-4000-8000-000000000031", "amount": 24001, "method": "cash"}', tests.branch('B901')) $$,
  '23514', 'refund_too_large', 'no more back than was paid for what is left'
);
select is(
  public.cancel_subscription('72000000-0000-4000-8000-000000000003', 'نەخۆش کەوت',
    '{"id": "74000000-0000-4000-8000-000000000031", "amount": 24000, "method": "cash"}', tests.branch('B901'))
    - 'receipt_number',
  '{"worth": 24000, "forgiven": 0, "left_over": 24000, "refunded": 24000.00}'::jsonb,
  'twelve unused visits, paid: all of it given back'
);
select results_eq(
  $$ select status, status_reason from public.subscriptions where id = '72000000-0000-4000-8000-000000000003' $$,
  $$ values ('cancelled'::text, 'نەخۆش کەوت'::text) $$,
  'the subscription is cancelled, with the reason'
);
select results_eq(
  $$ select paid, refunded, due from public.invoice_balances where invoice_id = '73000000-0000-4000-8000-000000000003' $$,
  $$ values (24000::numeric(14,2), 24000::numeric(14,2), 0::numeric(14,2)) $$,
  'its invoice shows the money back and owes nothing'
);
select is(
  public.cancel_subscription('72000000-0000-4000-8000-000000000007', 'ڕۆیشت') ->> 'left_over',
  '0', 'an unpaid month cancelled after ten days: its unused part clears what is owed for it'
);
select is(
  (select due from public.invoice_balances where invoice_id = '73000000-0000-4000-8000-000000000007'),
  (select 30000 - worth from s1_worth)::numeric(14,2), 'the ten days used are still owed'
);
select throws_ok(
  $$ select public.cancel_subscription('72000000-0000-4000-8000-000000000007', 'دووبارە') $$,
  '23514', 'subscription_not_active', 'once'
);
select throws_ok(
  $$ select public.cancel_subscription('72000000-0000-4000-8000-000000000006', null) $$,
  '22023', 'reason_required', 'with a reason'
);
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.cancel_subscription('72000000-0000-4000-8000-000000000006', 'هۆکار') $$,
  '42501', 'permission_denied', 'a receptionist cancels nothing'
);

-- Other gyms, read-only gyms and the audit log ----------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select throws_ok(
  $$ select public.freeze_subscription(gen_random_uuid(), '72000000-0000-4000-8000-000000000015',
       (select d from today_is), 2) $$,
  'P0002', 'subscription_not_found', 'another gym freezes none of them'
);
select is((select count(*)::integer from public.subscription_freezes), 0, 'and sees no freezes');

select tests.clear_authentication();
select ok(
  exists (
    select 1 from public.audit_logs
     where table_name = 'subscriptions' and row_id = '72000000-0000-4000-8000-000000000005' and action = 'update'
       and actor_id = tests.staff('manager_a') and new_values ->> 'status' = 'transferred'
  ),
  'the audit log records who transferred a subscription'
);
update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.freeze_subscription(gen_random_uuid(), '72000000-0000-4000-8000-000000000015',
       (select d from today_is), 2) $$,
  '42501', 'gym_read_only', 'a read-only gym freezes nothing'
);

select * from finish();
rollback;
