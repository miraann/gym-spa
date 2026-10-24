-- Step 3c: selling a subscription. sell_subscription() and its checks, the plan copied onto the
-- subscription, invoice and receipt numbers per branch, discounts by permission, payments in
-- dinars and dollars, installments, balances, who sees money, money rows only the server writes,
-- read-only gyms, other gyms, and taking an import back.
begin;
select plan(66);
select tests.create_fixture();

select tests.create_role('فرۆشتن بە قەرز', array['members.view', 'subscriptions.sell']);
select tests.create_staff('credit_a', (select id::text from public.roles where name_ckb = 'فرۆشتن بە قەرز'), array['B901']);
select tests.create_role('بینینی ئەندامان', array['members.view']);
select tests.create_staff('viewer_a', (select id::text from public.roles where name_ckb = 'بینینی ئەندامان'), array['B901', 'B902']);

-- Members and plans -----------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => '50000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
  p_full_name => 'ئارام کەریم', p_gender => 'male', p_phone => '+9647505000001');
select public.create_member(p_id => '50000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
  p_full_name => 'شیلان عەلی', p_gender => 'female', p_phone => '+9647505000002');
select public.create_member(p_id => '50000000-0000-4000-8000-000000000003', p_branch_id => tests.branch('B901'),
  p_full_name => 'هێمن جەلال', p_gender => 'male', p_phone => '+9647505000003');
select public.set_member_status('50000000-0000-4000-8000-000000000003', 'suspended', 'پارەی نەداوە');
select public.save_plan(p_id => '51000000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانە', p_name_en => 'Monthly',
  p_kind => 'time', p_price => 35000, p_duration_unit => 'month', p_duration_count => 1, p_max_freeze_days => 7);
select public.save_plan(p_id => '51000000-0000-4000-8000-000000000002', p_name_ckb => 'بەیانیانی ئافرەتان', p_kind => 'hybrid',
  p_price => 25000, p_duration_unit => 'month', p_duration_count => 1, p_visit_count => 12, p_gender => 'female',
  p_allowed_days => array[1, 3, 6]::smallint[], p_allowed_from => '08:00', p_allowed_until => '12:00',
  p_branch_ids => array[tests.branch('B902')]);
select public.save_plan(p_id => '51000000-0000-4000-8000-000000000003', p_name_ckb => 'نرخی کۆن', p_kind => 'unlimited',
  p_price => 10000, p_is_active => false);
select public.save_plan(p_id => '51000000-0000-4000-8000-000000000004', p_name_ckb => 'دوانزە جار', p_kind => 'visits',
  p_price => 30000, p_visit_count => 12);
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select public.create_member(p_id => '50000000-0000-4000-8000-0000000000b1', p_branch_id => tests.branch('B901', 'pgtap-b'),
  p_full_name => 'گۆران حەسەن', p_gender => 'male', p_phone => '+9647505000001');

-- Rules shared with the app -------------------------------------------------------------------------------
-- packages/core/src/pricing.test.ts runs the same lists through usdToIqd() and isDiscountAllowed():
-- one case per line.

create temporary table usd_cases (amount numeric, rate numeric, expected numeric);
insert into usd_cases (amount, rate, expected) values
  (10, 1310, 13100),
  (12.35, 1310, 16179),
  (0.01, 1310, 13),
  (0.5, 1, 1),
  (0.03, 150, 5),
  (25.5, 1465.5, 37370),
  (100, 1480.75, 148075),
  (33.33, 1300, 43329),
  (7.77, 1312.34, 10197),
  (999.99, 1500, 1499985);
select is_empty(
  $$ select * from usd_cases where app.usd_to_iqd(amount, rate) is distinct from expected $$,
  'dollars at a rate are whole dinars, rounded half up'
);

create temporary table discount_cases (price numeric, discount numeric, max_percent integer, expected boolean);
insert into discount_cases (price, discount, max_percent, expected) values
  (35000, 3500, 10, true),
  (35000, 3501, 10, false),
  (35000, 0, 0, true),
  (35000, 1, 0, false),
  (35000, 35000, 100, true),
  (35000, 35001, 100, false),
  (0, 0, 10, true),
  (35000, 3500.5, 100, false),
  (35000, -1, 100, false),
  (99999, 9999, 10, true),
  (99999, 10000, 10, false),
  (60000, 30000, 50, true),
  (60000, 15001, 25, false);
select is_empty(
  $$ select * from discount_cases where app.is_discount_allowed(price, discount, max_percent) is distinct from expected $$,
  'a discount is whole dinars, up to the price and the seller''s share'
);

-- A sale paid in full ---------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(
  public.sell_subscription('52000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', tests.branch('B901'),
    (now() at time zone 'Asia/Baghdad')::date, 35000,
    p_payment => '{"id": "54000000-0000-4000-8000-000000000001", "method": "cash", "amount": 35000}') - 'start_date' - 'end_date',
  jsonb_build_object('subscription_id', '52000000-0000-4000-8000-000000000001', 'invoice_id', '53000000-0000-4000-8000-000000000001',
    'invoice_number', 'B901-000001', 'total', 35000.00, 'payment_id', '54000000-0000-4000-8000-000000000001',
    'receipt_number', 'B901-R000001', 'paid', 35000.00),
  'a receptionist sells a monthly plan paid in cash: the branch''s first invoice and receipt'
);
select results_eq(
  $$ select name_ckb, name_en, kind, price, start_date, end_date, max_freeze_days, status, branch_ids, created_by
       from public.subscriptions where id = '52000000-0000-4000-8000-000000000001' $$,
  $$ values ('مانگانە'::text, 'Monthly'::text, 'time'::text, 35000::numeric(14,2), (now() at time zone 'Asia/Baghdad')::date,
             app.plan_end_date((now() at time zone 'Asia/Baghdad')::date, 'month', 1), 7, 'active'::text, null::uuid[],
             tests.staff('reception_a')) $$,
  'the subscription keeps the plan as it was sold, and ends a month later'
);
select results_eq(
  $$ select subtotal, discount, total, branch_id, created_by from public.invoices where id = '53000000-0000-4000-8000-000000000001' $$,
  $$ values (35000::numeric(14,2), 0::numeric(14,2), 35000::numeric(14,2), tests.branch('B901'), tests.staff('reception_a')) $$,
  'its invoice'
);
select results_eq(
  $$ select kind, description_ckb, unit_price, total from public.invoice_items where invoice_id = '53000000-0000-4000-8000-000000000001' $$,
  $$ values ('subscription'::text, 'مانگانە'::text, 35000::numeric(14,2), 35000::numeric(14,2)) $$,
  'with one item'
);
select results_eq(
  $$ select paid, due from public.invoice_balances where invoice_id = '53000000-0000-4000-8000-000000000001' $$,
  $$ values (35000::numeric(14,2), 0::numeric(14,2)) $$,
  'paid in full: nothing owed'
);
select is(
  public.sell_subscription('52000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', tests.branch('B901'),
    (now() at time zone 'Asia/Baghdad')::date, 35000,
    p_payment => '{"id": "54000000-0000-4000-8000-000000000001", "method": "cash", "amount": 35000}') ->> 'invoice_number',
  'B901-000001', 'the same sale sent again (a lost answer) returns what was saved'
);
select is((select count(*)::integer from public.invoices), 1, 'and saves nothing twice');

-- A discount, a part paid now and installments ---------------------------------------------------------------

select is(
  public.sell_subscription('52000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', tests.branch('B901'),
    (now() at time zone 'Asia/Baghdad')::date + 1, 35000, 3500, 'خوێندکارە',
    '{"id": "54000000-0000-4000-8000-000000000002", "method": "fib", "amount": 10000, "reference": "FIB-889911"}',
    jsonb_build_array(
      jsonb_build_object('id', '55000000-0000-4000-8000-000000000001', 'due_date', (now() at time zone 'Asia/Baghdad')::date + 30, 'amount', 10750),
      jsonb_build_object('id', '55000000-0000-4000-8000-000000000002', 'due_date', (now() at time zone 'Asia/Baghdad')::date + 60, 'amount', 10750)))
    ->> 'receipt_number',
  'B901-R000002', 'a sale with 10% off, 10,000 paid by FIB and two installments'
);
select results_eq(
  $$ select subtotal, discount, total from public.invoices where id = '53000000-0000-4000-8000-000000000002' $$,
  $$ values (35000::numeric(14,2), 3500::numeric(14,2), 31500::numeric(14,2)) $$,
  'the invoice shows the discount'
);
select is((select discount_reason from public.invoice_items where invoice_id = '53000000-0000-4000-8000-000000000002'),
  'خوێندکارە', 'and its reason');
select results_eq(
  $$ select method, reference, currency from public.payments where id = '54000000-0000-4000-8000-000000000002' $$,
  $$ values ('fib'::text, 'FIB-889911'::text, 'IQD'::text) $$,
  'the payment keeps its method and reference'
);
select results_eq(
  $$ select paid, due from public.invoice_balances where invoice_id = '53000000-0000-4000-8000-000000000002' $$,
  $$ values (10000::numeric(14,2), 21500::numeric(14,2)) $$,
  '21,500 is owed'
);
select results_eq(
  $$ select amount, paid from public.installment_balances where invoice_id = '53000000-0000-4000-8000-000000000002' order by due_date $$,
  $$ values (10750::numeric(14,2), 0::numeric(14,2)), (10750::numeric(14,2), 0::numeric(14,2)) $$,
  'in two installments, nothing paid of them yet: the 10,000 was the part without one'
);

-- In dollars, and on credit -----------------------------------------------------------------------------------

select is(
  public.sell_subscription('52000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000004', tests.branch('B901'),
    (now() at time zone 'Asia/Baghdad')::date, 30000,
    p_payment => '{"id": "54000000-0000-4000-8000-000000000003", "method": "cash", "currency": "USD", "foreign_amount": 20, "exchange_rate": 1310}')
    ->> 'paid',
  '26200.00', 'twenty dollars at 1,310 count for 26,200 dinars'
);
select results_eq(
  $$ select amount, currency, foreign_amount, exchange_rate from public.payments where id = '54000000-0000-4000-8000-000000000003' $$,
  $$ values (26200::numeric(14,2), 'USD'::text, 20::numeric(14,2), 1310::numeric(10,2)) $$,
  'the payment keeps the dollars and the rate'
);
select is((select end_date from public.subscriptions where id = '52000000-0000-4000-8000-000000000003'), null::date,
  'a plan of visits has no end date');
select is((select due from public.invoice_balances where invoice_id = '53000000-0000-4000-8000-000000000003'),
  3800::numeric(14,2), 'the rest is owed, with no installments');

select tests.authenticate_as(tests.staff('credit_a'));
select lives_ok(
  $$ select public.sell_subscription('52000000-0000-4000-8000-000000000004', '53000000-0000-4000-8000-000000000004',
       '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', tests.branch('B901'),
       (now() at time zone 'Asia/Baghdad')::date, 35000) $$,
  'staff who may sell but not take money sell on credit'
);
select throws_ok(
  $$ select public.sell_subscription('52000000-0000-4000-8000-000000000005', '53000000-0000-4000-8000-000000000005',
       '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', tests.branch('B901'),
       (now() at time zone 'Asia/Baghdad')::date, 35000,
       p_payment => '{"id": "54000000-0000-4000-8000-000000000005", "method": "cash", "amount": 35000}') $$,
  '42501', 'permission_denied', 'but take no payment'
);
select throws_ok(
  $$ select public.sell_subscription('52000000-0000-4000-8000-000000000005', '53000000-0000-4000-8000-000000000005',
       '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', tests.branch('B901'),
       (now() at time zone 'Asia/Baghdad')::date, 35000, 1000, 'هاوڕێ') $$,
  '42501', 'discount_too_large', 'and give no discount without a discount permission'
);

-- What a sale checks ----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok(
  $$ select public.sell_subscription('52000000-0000-4000-8000-000000000010', '53000000-0000-4000-8000-000000000010',
       '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', tests.branch('B901'),
       (now() at time zone 'Asia/Baghdad')::date, 35000) $$,
  '42501', 'permission_denied', 'a trainer sells nothing'
);

select tests.authenticate_as(tests.staff('reception_a'));
create temporary table sale_cases (label text, statement text, errcode text, message text);
grant select on sale_cases to authenticated;
insert into sale_cases values
  ('another branch', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B902'), (now() at time zone 'Asia/Baghdad')::date, 35000) $$,
   '42501', 'no_branch_access'),
  ('another gym''s member', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-0000000000b1',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000) $$,
   'P0002', 'member_not_found'),
  ('a suspended member', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000003',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000) $$,
   '42501', 'member_not_active'),
  ('no such plan', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     gen_random_uuid(), tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000) $$,
   'P0002', 'plan_not_found'),
  ('a plan off sale', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000003', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 10000) $$,
   '23514', 'plan_not_on_sale'),
  ('an old price', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 30000) $$,
   '23514', 'price_changed'),
  ('a women''s plan for a man', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000002', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 25000) $$,
   '23514', 'plan_gender_mismatch'),
  ('a start too long ago', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date - 31, 35000) $$,
   '22023', 'invalid_start_date'),
  ('a start too far ahead', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date + 366, 35000) $$,
   '22023', 'invalid_start_date'),
  ('more than 10% off', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000, 3501, 'هاوڕێ') $$,
   '42501', 'discount_too_large'),
  ('a discount without a reason', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000, 3500) $$,
   '22023', 'reason_required'),
  ('a fraction of a dinar off', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000, 100.5, 'هاوڕێ') $$,
   '22023', 'invalid_discount'),
  ('more than the invoice', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_payment => jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 40000)) $$,
   '23514', 'payment_too_large'),
  ('an unknown method', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_payment => jsonb_build_object('id', gen_random_uuid(), 'method', 'cheque', 'amount', 35000)) $$,
   '22023', 'invalid_payment'),
  ('nothing paid', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_payment => jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 0)) $$,
   '22023', 'invalid_payment'),
  ('a payment without an id', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_payment => jsonb_build_object('id', 'x', 'method', 'cash', 'amount', 35000)) $$,
   '22023', 'invalid_payment'),
  ('dollars with three decimals', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_payment => jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'currency', 'USD', 'foreign_amount', 10.005, 'exchange_rate', 1310)) $$,
   '22023', 'invalid_payment'),
  ('installments that don''t add up', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_installments => jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'due_date', (now() at time zone 'Asia/Baghdad')::date + 30, 'amount', 30000))) $$,
   '23514', 'installments_mismatch'),
  ('an installment due yesterday', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_installments => jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'due_date', (now() at time zone 'Asia/Baghdad')::date - 1, 'amount', 35000))) $$,
   '22023', 'invalid_installments'),
  ('two installments on one day', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_installments => jsonb_build_array(
       jsonb_build_object('id', gen_random_uuid(), 'due_date', (now() at time zone 'Asia/Baghdad')::date + 30, 'amount', 17500),
       jsonb_build_object('id', gen_random_uuid(), 'due_date', (now() at time zone 'Asia/Baghdad')::date + 30, 'amount', 17500))) $$,
   '22023', 'invalid_installments'),
  ('an installment that isn''t a date', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
     '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 35000,
     p_installments => jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'due_date', 'soon', 'amount', 35000))) $$,
   '22023', 'invalid_installments'),
  ('another sale''s id', $$ select public.sell_subscription('52000000-0000-4000-8000-000000000001', gen_random_uuid(),
     '50000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', tests.branch('B901'),
     (now() at time zone 'Asia/Baghdad')::date, 35000) $$,
   '23505', 'sale_exists');
select is_empty(
  $$ select label, tests.error_code(statement) from sale_cases where tests.error_code(statement) is distinct from errcode $$,
  'each refused sale has its error code'
);
-- The keys, one by one.
select throws_ok((select statement from sale_cases where label = 'another branch'), '42501', 'no_branch_access', 'a sale only in their own branches');
select throws_ok((select statement from sale_cases where label = 'another gym''s member'), 'P0002', 'member_not_found', 'only to a member of the gym');
select throws_ok((select statement from sale_cases where label = 'a suspended member'), '42501', 'member_not_active', 'who is active');
select throws_ok((select statement from sale_cases where label = 'no such plan'), 'P0002', 'plan_not_found', 'of a plan of the gym');
select throws_ok((select statement from sale_cases where label = 'a plan off sale'), '23514', 'plan_not_on_sale', 'that is on sale');
select throws_ok((select statement from sale_cases where label = 'an old price'), '23514', 'price_changed', 'at the price the screen showed');
select throws_ok((select statement from sale_cases where label = 'a women''s plan for a man'), '23514', 'plan_gender_mismatch', 'for the member''s gender');
select throws_ok((select statement from sale_cases where label = 'a start too long ago'), '22023', 'invalid_start_date', 'starting at most 30 days ago');
select throws_ok((select statement from sale_cases where label = 'a start too far ahead'), '22023', 'invalid_start_date', 'and at most a year ahead');
select throws_ok((select statement from sale_cases where label = 'more than 10% off'), '42501', 'discount_too_large', 'a receptionist gives at most 10% off');
select throws_ok((select statement from sale_cases where label = 'a discount without a reason'), '22023', 'reason_required', 'with a reason');
select throws_ok((select statement from sale_cases where label = 'a fraction of a dinar off'), '22023', 'invalid_discount', 'in whole dinars');
select throws_ok((select statement from sale_cases where label = 'more than the invoice'), '23514', 'payment_too_large', 'no payment beyond the invoice');
select throws_ok((select statement from sale_cases where label = 'an unknown method'), '22023', 'invalid_payment', 'only the methods there are');
select throws_ok((select statement from sale_cases where label = 'nothing paid'), '22023', 'invalid_payment', 'a payment is more than nothing');
select throws_ok((select statement from sale_cases where label = 'a payment without an id'), '22023', 'invalid_payment', 'and has an id');
select throws_ok((select statement from sale_cases where label = 'dollars with three decimals'), '22023', 'invalid_payment', 'dollars have cents at most');
select throws_ok((select statement from sale_cases where label = 'installments that don''t add up'), '23514', 'installments_mismatch', 'installments add up to what is left');
select throws_ok((select statement from sale_cases where label = 'an installment due yesterday'), '22023', 'invalid_installments', 'are due from today on');
select throws_ok((select statement from sale_cases where label = 'two installments on one day'), '22023', 'invalid_installments', 'each after the one before');
select throws_ok((select statement from sale_cases where label = 'an installment that isn''t a date'), '22023', 'invalid_installments', 'on a real date');
select throws_ok((select statement from sale_cases where label = 'another sale''s id'), '23505', 'sale_exists', 'and a sale''s id is its own');
select is((select count(*)::integer from public.invoices), 4, 'no refused sale left anything behind');

-- A manager may give more off, and each branch counts its own numbers.
select tests.authenticate_as(tests.staff('owner'));
select is(
  public.sell_subscription('52000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000020',
    '50000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', tests.branch('B902'),
    (now() at time zone 'Asia/Baghdad')::date, 25000, 25000, 'خێزانی کارمەند') ->> 'invoice_number',
  'B902-000001', 'the Owner gives a plan away in another branch: that branch''s first invoice'
);
select is((select branch_ids from public.subscriptions where id = '52000000-0000-4000-8000-000000000020'),
  array[tests.branch('B902')], 'the subscription keeps the plan''s branches');
select results_eq(
  $$ select allowed_days, allowed_from, allowed_until, visit_count, gender from public.subscriptions where id = '52000000-0000-4000-8000-000000000020' $$,
  $$ values (array[1, 3, 6]::smallint[], '08:00'::time, '12:00'::time, 12, 'female'::text) $$,
  'and its rules'
);
select throws_ok(
  $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000002',
       '51000000-0000-4000-8000-000000000002', tests.branch('B902'), (now() at time zone 'Asia/Baghdad')::date, 25000,
       p_payment => jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 1000), p_discount => 25000, p_discount_reason => 'بەخۆڕایی') $$,
  '23514', 'payment_too_large', 'nothing can be paid for something free'
);

-- Changing the plan later changes nothing sold.
select public.save_plan(p_id => '51000000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانەی نوێ', p_kind => 'time',
  p_price => 40000, p_duration_unit => 'month', p_duration_count => 1);
select results_eq(
  $$ select name_ckb, price, max_freeze_days from public.subscriptions where id = '52000000-0000-4000-8000-000000000001' $$,
  $$ values ('مانگانە'::text, 35000::numeric(14,2), 7) $$,
  'a sold subscription keeps the old name, price and rules'
);

-- Who sees money, and who writes it ----------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.invoices), 1, 'staff of another branch see only their branch''s invoices');
select is((select count(*)::integer from public.payments), 0, 'and payments');
select is((select count(*)::integer from public.subscriptions), 5, 'but every subscription, like every member');

select tests.authenticate_as(tests.staff('viewer_a'));
select is((select count(*)::integer from public.invoices) + (select count(*)::integer from public.payments)
        + (select count(*)::integer from public.invoice_items) + (select count(*)::integer from public.installments)
        + (select count(*)::integer from public.invoice_balances), 0,
  'without payments.view, no money at all');

select tests.authenticate_as(tests.staff('owner'));
select is(
  tests.error_code($$ insert into public.invoices (id, branch_id, member_id, number, subtotal, total)
                      values (gen_random_uuid(), tests.branch('B901'), '50000000-0000-4000-8000-000000000001', 'B901-000099', 0, 0) $$),
  '42501', 'nobody writes an invoice themselves, not even the Owner'
);
select is(
  tests.error_code($$ update public.payments set amount = 1 where id = '54000000-0000-4000-8000-000000000001' $$),
  '42501', 'nor changes a payment'
);
select is(
  tests.error_code($$ delete from public.subscriptions where id = '52000000-0000-4000-8000-000000000001' $$),
  '42501', 'nor deletes a subscription'
);

select tests.authenticate_as_service_role();
select throws_ok(
  $$ update public.invoices set total = 1 where id = '53000000-0000-4000-8000-000000000001' $$,
  '42501', 'read_only_column', 'even server code can''t change what an invoice says'
);
select throws_ok(
  $$ update public.payments set amount = 1 where id = '54000000-0000-4000-8000-000000000001' $$,
  '42501', 'read_only_column', 'nor what a payment was'
);

select tests.clear_authentication();
select ok(
  exists (
    select 1 from public.audit_logs
     where table_name = 'payments' and row_id = '54000000-0000-4000-8000-000000000002' and action = 'insert'
       and actor_id = tests.staff('reception_a') and new_values ->> 'amount' = '10000.00'
  ),
  'the audit log records who took a payment'
);

-- Taking an import back (spec §4.1) --------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select public.import_members('56000000-0000-4000-8000-0000000000a1', 'ئەندامان.xlsx', jsonb_build_array(
  jsonb_build_object('row', 2, 'id', '56000000-0000-4000-8000-000000000001', 'branch_id', tests.branch('B901'),
    'full_name', 'ڤیان سەردار', 'gender', 'female', 'phone', '+9647505000011'),
  jsonb_build_object('row', 3, 'id', '56000000-0000-4000-8000-000000000002', 'branch_id', tests.branch('B901'),
    'full_name', 'کاروان ئیبراهیم', 'gender', 'male', 'phone', '+9647505000012')));
select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '56000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000001', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 40000);
select tests.clear_authentication();
select results_eq(
  $$ select to_archive, changed from app.member_import_undo_counts('56000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a')) $$,
  $$ values (2, 1) $$,
  'a member who bought something since the import counts as changed'
);

-- A read-only gym and other gyms -----------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is((select count(*)::integer from public.invoices) + (select count(*)::integer from public.subscriptions)
        + (select count(*)::integer from public.payments), 0, 'another gym sees none of it');
select throws_ok(
  $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-0000000000b1',
       '51000000-0000-4000-8000-000000000004', tests.branch('B901', 'pgtap-b'), (now() at time zone 'Asia/Baghdad')::date, 30000) $$,
  'P0002', 'plan_not_found', 'and can''t sell its plans'
);

select tests.clear_authentication();
update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), '50000000-0000-4000-8000-000000000001',
       '51000000-0000-4000-8000-000000000004', tests.branch('B901'), (now() at time zone 'Asia/Baghdad')::date, 30000) $$,
  '42501', 'gym_read_only', 'a read-only gym sells nothing'
);

select * from finish();
rollback;
