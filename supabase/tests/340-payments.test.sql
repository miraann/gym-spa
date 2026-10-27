-- Step 3e: payments and debts. pay_invoice() (dinars, dollars with change, installments oldest
-- first), void_payment() and void_invoice() (the same day, payments.void, a reason),
-- refund_invoice() (payments.refund, at most what was paid in, never more owed), charge_member()
-- (the card replacement fee), member_debts, who may, other branches and gyms, read-only gyms.
begin;
select plan(47);
select tests.create_fixture();

-- Two members; a monthly plan sold on credit in two installments, and one paid in full.
select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => '60000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
  p_full_name => 'ئارام کەریم', p_gender => 'male', p_phone => '+9647506000001');
select public.create_member(p_id => '60000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
  p_full_name => 'شیلان عەلی', p_gender => 'female', p_phone => '+9647506000002');
select public.create_member(p_id => '60000000-0000-4000-8000-000000000003', p_branch_id => tests.branch('B901'),
  p_full_name => 'ڤیان سەردار', p_gender => 'female', p_phone => '+9647506000003');
select public.set_member_status('60000000-0000-4000-8000-000000000003', 'archived', 'ڕۆیشت');
select public.save_plan(p_id => '61000000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانە', p_kind => 'time',
  p_price => 35000, p_duration_unit => 'month', p_duration_count => 1);

select tests.authenticate_as(tests.staff('reception_a'));
select public.sell_subscription('62000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (now() at time zone 'Asia/Baghdad')::date, 35000,
  p_installments => jsonb_build_array(
    jsonb_build_object('id', '64000000-0000-4000-8000-000000000001', 'due_date', (now() at time zone 'Asia/Baghdad')::date + 30, 'amount', 17500),
    jsonb_build_object('id', '64000000-0000-4000-8000-000000000002', 'due_date', (now() at time zone 'Asia/Baghdad')::date + 60, 'amount', 17500)));
select public.sell_subscription('62000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000001', tests.branch('B901'),
  (now() at time zone 'Asia/Baghdad')::date, 35000,
  p_payment => '{"id": "65000000-0000-4000-8000-000000000002", "method": "cash", "amount": 35000}');

-- Paying ---------------------------------------------------------------------------------------------------

select is(
  public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B901'),
    '{"id": "65000000-0000-4000-8000-000000000011", "method": "cash", "amount": 10000}') - 'payment_id',
  '{"receipt_number": "B901-R000002", "kind": "payment", "amount": 10000, "change_given": 0, "due": 25000.00}'::jsonb,
  'a receptionist takes 10,000 of what is owed'
);
select results_eq(
  $$ select amount, paid from public.installment_balances where invoice_id = '63000000-0000-4000-8000-000000000001' order by due_date $$,
  $$ values (17500::numeric(14,2), 10000::numeric(14,2)), (17500::numeric(14,2), 0::numeric(14,2)) $$,
  'it pays the first installment first'
);
select is(
  public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B901'),
    '{"id": "65000000-0000-4000-8000-000000000011", "method": "cash", "amount": 10000}') ->> 'receipt_number',
  'B901-R000002', 'the same payment again (a lost answer) returns what was saved'
);
select is((select count(*)::integer from public.payments where invoice_id = '63000000-0000-4000-8000-000000000001'), 1,
  'and saves nothing twice');
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B901'),
       '{"id": "65000000-0000-4000-8000-000000000012", "method": "cash", "amount": 30000}') $$,
  '23514', 'payment_too_large', 'no more than is owed'
);
select is(
  public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B901'),
    '{"id": "65000000-0000-4000-8000-000000000013", "method": "cash", "currency": "USD", "foreign_amount": 20, "exchange_rate": 1310}')
    - 'payment_id' - 'receipt_number',
  '{"kind": "payment", "amount": 25000.00, "change_given": 1200.00, "due": 0.00}'::jsonb,
  'twenty dollars pay the 25,000 left, with 1,200 dinars given back'
);
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B901'),
       '{"id": "65000000-0000-4000-8000-000000000014", "method": "cash", "amount": 1000}') $$,
  '23514', 'nothing_owed', 'a paid invoice takes no more'
);
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B902'),
       '{"id": "65000000-0000-4000-8000-000000000014", "method": "cash", "amount": 1000}') $$,
  '23514', 'nothing_owed', 'the invoice is checked before the branch'
);
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000099', tests.branch('B901'),
       '{"id": "65000000-0000-4000-8000-000000000014", "method": "cash", "amount": 1000}') $$,
  'P0002', 'invoice_not_found', 'only an invoice that exists'
);
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B901'),
       '{"id": "x", "method": "cash", "amount": 1000}') $$,
  '22023', 'invalid_payment', 'a payment''s id is an id'
);

-- Voids ------------------------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.void_payment('65000000-0000-4000-8000-000000000013', 'هەڵە بوو') $$,
  '42501', 'permission_denied', 'a receptionist voids nothing'
);
select tests.authenticate_as(tests.staff('manager_a'));
select is(
  public.void_payment('65000000-0000-4000-8000-000000000013', 'دۆلارەکان ساختە بوون') ->> 'due',
  '25000.00', 'a manager voids today''s dollar payment: 25,000 is owed again'
);
select results_eq(
  $$ select void_reason, voided_by from public.payments where id = '65000000-0000-4000-8000-000000000013' $$,
  $$ values ('دۆلارەکان ساختە بوون'::text, tests.staff('manager_a')) $$,
  'the payment keeps who voided it and why'
);
select throws_ok(
  $$ select public.void_payment('65000000-0000-4000-8000-000000000013', 'دووبارە') $$,
  '23514', 'already_voided', 'once'
);
select throws_ok(
  $$ select public.void_payment('65000000-0000-4000-8000-000000000011', null) $$,
  '22023', 'reason_required', 'with a reason'
);
-- Yesterday's payment (rows can't change their time, so the triggers are off for the test).
select tests.clear_authentication();
alter table public.payments disable trigger user;
update public.payments set created_at = now() - interval '1 day' where id = '65000000-0000-4000-8000-000000000011';
alter table public.payments enable trigger user;
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.void_payment('65000000-0000-4000-8000-000000000011', 'هەڵە بوو') $$,
  '23514', 'void_too_late', 'only on the day it was taken'
);

select lives_ok(
  $$ select public.void_invoice('63000000-0000-4000-8000-000000000002', 'ئەندامی هەڵە هەڵبژێردرا') $$,
  'a manager voids today''s invoice'
);
select results_eq(
  $$ select (select voided_at is not null from public.invoices where id = '63000000-0000-4000-8000-000000000002'),
            (select bool_and(voided_at is not null) from public.payments where invoice_id = '63000000-0000-4000-8000-000000000002'),
            (select status from public.subscriptions where id = '62000000-0000-4000-8000-000000000002'),
            (select due from public.invoice_balances where invoice_id = '63000000-0000-4000-8000-000000000002') $$,
  $$ values (true, true, 'voided'::text, 0::numeric(14,2)) $$,
  'with its payments and its subscription; nothing is owed'
);
select throws_ok(
  $$ select public.void_invoice('63000000-0000-4000-8000-000000000002', 'دووبارە') $$,
  '23514', 'already_voided', 'an invoice is voided once'
);
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000002', tests.branch('B901'),
       '{"id": "65000000-0000-4000-8000-000000000015", "method": "cash", "amount": 1000}') $$,
  '23514', 'invoice_voided', 'and takes no payment'
);

-- Refunds -----------------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.refund_invoice('66000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001',
       tests.branch('B901'), 5000, 'cash', 'نەخۆش کەوت') $$,
  '42501', 'permission_denied', 'a receptionist gives no money back'
);
select tests.authenticate_as(tests.staff('manager_a'));
select is(
  public.refund_invoice('66000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001',
    tests.branch('B901'), 4000, 'cash', 'نەخۆش کەوت') - 'payment_id',
  '{"receipt_number": "B901-R000004", "kind": "refund", "amount": 4000, "change_given": 0, "due": 25000.00}'::jsonb,
  'a manager gives 4,000 back, with a receipt; what is owed stays 25,000'
);
select results_eq(
  $$ select paid, refunded, due from public.invoice_balances where invoice_id = '63000000-0000-4000-8000-000000000001' $$,
  $$ values (10000::numeric(14,2), 4000::numeric(14,2), 25000::numeric(14,2)) $$,
  'the invoice shows what was paid in and given back'
);
select throws_ok(
  $$ select public.refund_invoice(gen_random_uuid(), '63000000-0000-4000-8000-000000000001',
       tests.branch('B901'), 6001, 'cash', 'زیاتر') $$,
  '23514', 'refund_too_large', 'no more than was paid in and not given back'
);
select throws_ok(
  $$ select public.refund_invoice(gen_random_uuid(), '63000000-0000-4000-8000-000000000001',
       tests.branch('B901'), 1000, 'cheque', 'هۆکار') $$,
  '22023', 'invalid_refund', 'by a method there is'
);
select throws_ok(
  $$ select public.refund_invoice(gen_random_uuid(), '63000000-0000-4000-8000-000000000001',
       tests.branch('B901'), 1000, 'cash', null) $$,
  '22023', 'reason_required', 'with a reason'
);
select throws_ok(
  $$ select public.refund_invoice(gen_random_uuid(), '63000000-0000-4000-8000-000000000002',
       tests.branch('B901'), 1000, 'cash', 'هۆکار') $$,
  '23514', 'invoice_voided', 'nothing is given back on a voided invoice'
);
select is(
  public.refund_invoice('66000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001',
    tests.branch('B901'), 4000, 'cash', 'نەخۆش کەوت') ->> 'receipt_number',
  'B901-R000004', 'the same refund again returns what was saved'
);

-- Charges -------------------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(
  public.charge_member('63000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002', tests.branch('B901'),
    'card_replacement', 'کارتی نوێ لە جیاتی کارتی ونبوو', 5000,
    '{"id": "65000000-0000-4000-8000-000000000021", "method": "cash", "amount": 5000}') - 'invoice_id',
  '{"invoice_number": "B901-000003", "total": 5000.00, "receipt_number": "B901-R000005", "paid": 5000, "change_given": 0}'::jsonb,
  'the card replacement fee, paid at once'
);
select results_eq(
  $$ select kind, description_ckb, total from public.invoice_items where invoice_id = '63000000-0000-4000-8000-000000000003' $$,
  $$ values ('card_replacement'::text, 'کارتی نوێ لە جیاتی کارتی ونبوو'::text, 5000::numeric(14,2)) $$,
  'is an item of its own kind'
);
select lives_ok(
  $$ select public.charge_member('63000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000002',
       tests.branch('B901'), 'other', 'خاولی', 3000) $$,
  'another charge, owed for now'
);
select throws_ok(
  $$ select public.charge_member(gen_random_uuid(), '60000000-0000-4000-8000-000000000002', tests.branch('B901'),
       'locker', 'دۆڵاب', 3000) $$,
  '22023', 'invalid_charge', 'lockers come with their own phase'
);
select throws_ok(
  $$ select public.charge_member(gen_random_uuid(), '60000000-0000-4000-8000-000000000002', tests.branch('B901'),
       'other', 'خاولی', 2500.5) $$,
  '22023', 'invalid_charge', 'charges are whole dinars'
);
select throws_ok(
  $$ select public.charge_member(gen_random_uuid(), '60000000-0000-4000-8000-000000000003', tests.branch('B901'),
       'other', 'خاولی', 3000) $$,
  '42501', 'member_archived', 'an archived member is charged nothing'
);
select throws_ok(
  $$ select public.charge_member(gen_random_uuid(), '60000000-0000-4000-8000-000000000002', tests.branch('B902'),
       'other', 'خاولی', 3000) $$,
  '42501', 'no_branch_access', 'only in their own branches'
);
select throws_ok(
  $$ select public.charge_member(gen_random_uuid(), '60000000-0000-4000-8000-000000000002', tests.branch('B901'),
       'other', 'خاولی', 3000, '{"id": "65000000-0000-4000-8000-000000000099", "method": "cash", "amount": 4000}') $$,
  '23514', 'payment_too_large', 'and paid no more than the charge'
);

-- Debts ---------------------------------------------------------------------------------------------------------

select results_eq(
  $$ select member_id, due, owed_now, next_due_date, invoice_count from public.member_debts order by member_id $$,
  $$ values ('60000000-0000-4000-8000-000000000001'::uuid, 25000::numeric(14,2), 0::numeric(14,2),
             (now() at time zone 'Asia/Baghdad')::date + 30, 1),
            ('60000000-0000-4000-8000-000000000002'::uuid, 3000::numeric(14,2), 3000::numeric(14,2), null::date, 1) $$,
  'who owes what: the installments are not due yet, the towel is'
);
select is((select full_name from public.member_debts where member_id = '60000000-0000-4000-8000-000000000002'),
  'شیلان عەلی', 'with the member''s name');

-- Who sees, and other branches and gyms ----------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.member_debts), 0, 'staff of another branch see no debts of this one');
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B902'),
       '{"id": "65000000-0000-4000-8000-000000000031", "method": "cash", "amount": 1000}') $$,
  'P0002', 'invoice_not_found', 'and can''t pay its invoices'
);
select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B901'),
       '{"id": "65000000-0000-4000-8000-000000000031", "method": "cash", "amount": 1000}') $$,
  '42501', 'permission_denied', 'a trainer takes no money'
);
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is((select count(*)::integer from public.member_debts), 0, 'another gym sees none of it');
select throws_ok(
  $$ select public.void_invoice('63000000-0000-4000-8000-000000000001', 'دزی') $$,
  'P0002', 'invoice_not_found', 'nor voids it'
);
select throws_ok(
  $$ select public.void_payment('65000000-0000-4000-8000-000000000011', 'دزی') $$,
  'P0002', 'payment_not_found', 'nor its payments'
);

select tests.clear_authentication();
select ok(
  exists (
    select 1 from public.audit_logs
     where table_name = 'invoices' and row_id = '63000000-0000-4000-8000-000000000002' and action = 'update'
       and actor_id = tests.staff('manager_a') and new_values ->> 'void_reason' = 'ئەندامی هەڵە هەڵبژێردرا'
  ),
  'the audit log records who voided an invoice and why'
);

update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.pay_invoice('63000000-0000-4000-8000-000000000001', tests.branch('B901'),
       '{"id": "65000000-0000-4000-8000-000000000041", "method": "cash", "amount": 1000}') $$,
  '42501', 'gym_read_only', 'a read-only gym takes no payments'
);
select is((select due from public.member_debts where member_id = '60000000-0000-4000-8000-000000000001'),
  25000::numeric(14,2), 'but its debts are still seen');

select * from finish();
rollback;
