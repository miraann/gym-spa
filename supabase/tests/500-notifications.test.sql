-- Phase 9, step 9a: message templates, the reminders the job collects (membership ending in 7, 3
-- and 1 days, ended, installment due, debt, welcome, birthday), never twice and never for the
-- walk-in customer or a guest, working through them, the "opened in WhatsApp" log with the
-- emergency contact's number, the bell's notifications, and who may do what.
begin;
select plan(49);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('50000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'Asia/Baghdad')::date
$$;
-- The reminders of a day: kind and member, in order.
create function pg_temp.kinds(p_day date) returns table (kind text, member_id uuid) language sql as $$
  select r.kind, r.member_id from public.reminders r where r.remind_on = p_day order by r.kind, r.member_id
$$;

-- Members: 1 with a month, 2 with a month and the next one already sold, 3 owing a whole month,
-- 4 paying in an installment, 5 with no phone of their own and a birthday today, a guest, and the
-- walk-in customer.
select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => pg_temp.id(n), p_branch_id => tests.branch('B901'), p_full_name => 'Ø¦Û•Ù†Ø¯Ø§Ù…ÛŒ ' || n,
  p_gender => 'male', p_phone => '+96475050000' || lpad(n::text, 2, '0'))
  from generate_series(1, 4) as g (n);
select public.create_member(p_id => pg_temp.id(5), p_branch_id => tests.branch('B901'), p_full_name => 'Ø´ÛŒÙ„Ø§Ù†',
  p_gender => 'female', p_emergency_contact_name => 'Ø¯Ø§ÛŒÚ©ÛŒ', p_emergency_phone => '+9647505000099',
  p_birth_date => (pg_temp.today() - interval '30 years')::date, p_preferred_language => 'ar');
select public.save_plan(p_id => pg_temp.id(10), p_name_ckb => 'Ù…Ø§Ù†Ú¯Ø§Ù†Û•', p_name_en => 'Monthly', p_kind => 'time',
  p_price => 0, p_duration_unit => 'month', p_duration_count => 1);
select public.save_plan(p_id => pg_temp.id(11), p_name_ckb => 'Ù…Ø§Ù†Ú¯Ø§Ù†Û•ÛŒ ØªØ§ÛŒØ¨Û•Øª', p_kind => 'time',
  p_price => 30000, p_duration_unit => 'month', p_duration_count => 1);
select public.sell_subscription(pg_temp.id(20), pg_temp.id(30), pg_temp.id(1), pg_temp.id(10), tests.branch('B901'), pg_temp.today(), 0);
select public.sell_subscription(pg_temp.id(21), pg_temp.id(31), pg_temp.id(2), pg_temp.id(10), tests.branch('B901'), pg_temp.today(), 0);
create temporary table month_end as select end_date as d from public.subscriptions where id = pg_temp.id(20);
grant select on month_end to authenticated;
select public.sell_subscription(pg_temp.id(22), pg_temp.id(32), pg_temp.id(2), pg_temp.id(10), tests.branch('B901'),
  (select d + 1 from month_end), 0);
select public.sell_subscription(pg_temp.id(23), pg_temp.id(33), pg_temp.id(3), pg_temp.id(11), tests.branch('B901'), pg_temp.today(), 30000);
select public.sell_subscription(pg_temp.id(24), pg_temp.id(34), pg_temp.id(4), pg_temp.id(11), tests.branch('B901'), pg_temp.today(), 30000,
  p_installments => jsonb_build_array(jsonb_build_object('id', pg_temp.id(40), 'due_date', pg_temp.today() + 20, 'amount', 30000)));
select public.save_product(pg_temp.id(12), 'Ø¦Ø§Ùˆ', 500, p_low_stock_level => 5);
select public.receive_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(12), 6);
select public.sell_products(gen_random_uuid(), tests.branch('B901'),
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.id(12), 'quantity', 1, 'price', 500)),
  jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 500), null);
select tests.clear_authentication();
insert into public.members (id, gym_id, branch_id, full_name, gender, phone, is_guest)
values (pg_temp.id(6), tests.gym('pgtap-a'), tests.branch('B901'), 'Ù…ÛŒÙˆØ§Ù†', 'female', '+9647505000006', true);

-- Templates ---------------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select ok(app.has_permission('notifications.send'), 'the Receptionist now sends reminders');
select throws_ok($$ select public.save_message_template('welcome', 'Ø³ÚµØ§Ùˆ {name}', null, null) $$,
  '42501', 'permission_denied', 'but doesn''t edit the templates (notifications.templates.manage)');
select tests.authenticate_as(tests.staff('owner'));
select is((public.save_message_template('welcome', E'Ø³ÚµØ§Ùˆ {name}ØŒ\nØ¨Û•Ø®ÛŽØ±Ø¨ÛŽÛŒØª Ø¨Û† {gym}', null, null)).key, 'welcome',
  'the Owner writes the gym''s welcome, with a line break');
select is((public.save_message_template('welcome', 'Ø¨Û•Ø®ÛŽØ±Ø¨ÛŽÛŒØª {name}', null, 'Ø£Ù‡Ù„Ø§Ù‹ {name}')).body_ar, 'Ø£Ù‡Ù„Ø§Ù‹ {name}',
  'and changes it, in another language too');
select is((select count(*)::integer from public.message_templates), 1, 'one row per template');
select throws_ok($$ select public.save_message_template('newsletter', 'x', null, null) $$,
  '22023', 'invalid_template', 'only the nine templates');
select throws_ok($$ select public.save_message_template('debt', E'x\u0007', null, null) $$,
  '22023', 'invalid_template', 'no control characters');
select tests.authenticate_as(tests.staff('reception_a'));
select is((select body_ckb from public.message_templates where key = 'welcome'), 'Ø¨Û•Ø®ÛŽØ±Ø¨ÛŽÛŒØª {name}',
  'reception reads it to fill messages');
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.message_templates), 0, 'a trainer doesn''t');

-- Collecting --------------------------------------------------------------------------------------------------

select tests.clear_authentication();
select is(app.collect_reminders(tests.gym('pgtap-a')), 7, 'today: five welcomes, a birthday and a debt');
select results_eq($$ select * from pg_temp.kinds(pg_temp.today()) $$,
  $$ values ('birthday', pg_temp.id(5)), ('debt', pg_temp.id(3)),
            ('welcome', pg_temp.id(1)), ('welcome', pg_temp.id(2)), ('welcome', pg_temp.id(3)), ('welcome', pg_temp.id(4)), ('welcome', pg_temp.id(5)) $$,
  'birthday, debt and welcomes; no guest, no walk-in customer');
select is(app.collect_reminders(tests.gym('pgtap-a')), 0, 'running again adds nothing');
select is((select details from public.reminders where kind = 'debt'), '{"amount": 30000.00}'::jsonb,
  'the debt reminder keeps the amount owed');
select is(app.collect_reminders(tests.gym('pgtap-a'), pg_temp.today() + 1), 0,
  'the next day nothing: no welcome, and no debt reminder within the week');

select app.collect_reminders(tests.gym('pgtap-a'), pg_temp.today() + 7);
select is((select count(*)::integer from public.reminders where kind = 'debt' and remind_on = pg_temp.today() + 7), 1,
  'a week later the debt is reminded again');
select app.collect_reminders(tests.gym('pgtap-a'), pg_temp.today() + 17);
select results_eq($$ select member_id, subject_id, details ->> 'amount' from public.reminders where kind = 'installment_due' $$,
  $$ values (pg_temp.id(4), pg_temp.id(40), '30000.00') $$, 'three days before the installment is due');
select is((select count(*)::integer from public.reminders r, month_end where r.kind like 'expiring%' and r.remind_on < month_end.d - 7), 0,
  'nobody''s membership ends soon yet');

select app.collect_reminders(tests.gym('pgtap-a'), d - 7) from month_end;
select is((select array_agg(r.member_id order by r.member_id) from public.reminders r, month_end where r.remind_on = month_end.d - 7 and r.kind = 'expiring_7'),
  array[pg_temp.id(1), pg_temp.id(3), pg_temp.id(4)], 'seven days before the end; not member 2, who renewed');
select results_eq($$ select r.member_id, r.subject_id, r.details from public.reminders r, month_end
                     where r.remind_on = month_end.d - 7 and r.kind = 'expiring_7' and r.member_id = pg_temp.id(1) $$,
  $$ select pg_temp.id(1), pg_temp.id(20),
            jsonb_build_object('plan', jsonb_build_object('ckb', 'Ù…Ø§Ù†Ú¯Ø§Ù†Û•', 'en', 'Monthly', 'ar', null), 'end_date', d, 'days', 7)
       from month_end $$,
  'with the plan and the date');
select app.collect_reminders(tests.gym('pgtap-a'), d - 3) from month_end;
select app.collect_reminders(tests.gym('pgtap-a'), d - 1) from month_end;
select is((select array_agg(r.kind order by r.remind_on) from public.reminders r where r.kind like 'expiring%' and r.member_id = pg_temp.id(1)),
  array['expiring_7', 'expiring_3', 'expiring_1'], 'then three days and one day before');
select app.collect_reminders(tests.gym('pgtap-a'), d + 1) from month_end;
select is((select array_agg(r.member_id order by r.member_id) from public.reminders r, month_end where r.kind = 'expired' and r.remind_on = month_end.d + 1),
  array[pg_temp.id(1), pg_temp.id(3), pg_temp.id(4)], 'and the day after it ended, only for whoever has nothing after it');

-- The bell.
select results_eq($$ select kind, details ->> 'count' from public.staff_notifications where notify_on = pg_temp.today() and kind = 'reminders_ready' $$,
  $$ values ('reminders_ready', '7') $$, 'the branch''s reminders of today are on the bell');
select results_eq($$ select details ->> 'quantity', details ->> 'level' from public.staff_notifications where kind = 'low_stock' and notify_on = pg_temp.today() $$,
  $$ values ('5', '5') $$, 'and the water at its low-stock level');

-- Working through the list ------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select ok((select count(*) from public.reminders where remind_on = pg_temp.today()) = 7, 'reception sees the branch''s reminders');
create temporary table welcome_1 as
  select id from public.reminders where kind = 'welcome' and member_id = pg_temp.id(1) and remind_on = pg_temp.today();
grant select on welcome_1 to authenticated;
select ok((public.set_reminder_done((select id from welcome_1), true)).done_at is not null, 'and marks one done');
select is((public.set_reminder_done((select id from welcome_1), false)).done_at, null, 'or not done again');
select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.reminders), 0, 'reception of another branch sees none');
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is((select count(*)::integer from public.reminders), 0, 'nor another gym');
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.reminders), 0, 'nor does a trainer');
select throws_ok($$ select public.set_reminder_done((select id from welcome_1), true) $$,
  '42501', 'permission_denied', 'who can''t mark them (notifications.send)');
select throws_ok($$ select public.refresh_reminders() $$, '42501', 'permission_denied', 'nor collect them');

-- Opened in WhatsApp ---------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.refresh_reminders(), 0, 'the reminders page collects today''s again: nothing new');
select throws_ok($$ select public.record_message_opened(gen_random_uuid(), tests.branch('B901'), pg_temp.id(1), '+9647505000002', 'ckb', 'Ø³ÚµØ§Ùˆ') $$,
  '23514', 'wrong_phone', 'only the member''s own number');
select results_eq($$ select channel, status, to_emergency_contact, template_key, reminder_id from public.record_message_opened(
    pg_temp.id(50), tests.branch('B901'), pg_temp.id(1), '+9647505000001', 'ckb', E'Ø³ÚµØ§Ùˆ Ø¦Û•Ù†Ø¯Ø§Ù…ÛŒ 1ØŒ\nØ¨Û•Ø®ÛŽØ±Ø¨ÛŽÛŒØª',
    'welcome', (select id from welcome_1)) $$,
  $$ values ('whatsapp_link', 'opened', false, 'welcome', (select id from welcome_1)) $$,
  'opening WhatsApp is written down as opened, not sent');
select is((public.record_message_opened(pg_temp.id(50), tests.branch('B901'), pg_temp.id(1), '+9647505000001', 'ckb', 'x')).body,
  E'Ø³ÚµØ§Ùˆ Ø¦Û•Ù†Ø¯Ø§Ù…ÛŒ 1ØŒ\nØ¨Û•Ø®ÛŽØ±Ø¨ÛŽÛŒØª', 'the same id again returns what was saved');
select throws_ok($$ select public.record_message_opened(gen_random_uuid(), tests.branch('B901'), pg_temp.id(5), '+9647505000005', 'ar', 'Ù…Ø±Ø­Ø¨Ø§') $$,
  '23514', 'wrong_phone', 'a member without a phone has no number of their own');
select is((public.record_message_opened(gen_random_uuid(), tests.branch('B901'), pg_temp.id(5), '+9647505000099', 'ar', 'Ù…Ø±Ø­Ø¨Ø§', 'birthday')).to_emergency_contact,
  true, 'so the emergency contact''s number is used, and marked');
select throws_ok($$ select public.record_message_opened(gen_random_uuid(), tests.branch('B901'), pg_temp.id(2), '+9647505000002', 'ckb', 'x',
    p_reminder_id => (select id from welcome_1)) $$,
  'P0002', 'reminder_not_found', 'a reminder is its own member''s');
select throws_ok($$ select public.record_message_opened(gen_random_uuid(), tests.branch('B902'), pg_temp.id(1), '+9647505000001', 'ckb', 'x') $$,
  '42501', 'no_branch_access', 'only in the staff member''s branches');
select throws_ok($$ select public.record_message_opened(gen_random_uuid(), tests.branch('B901'), public.walk_in_member_id(), '+10000000000', 'ckb', 'x') $$,
  'P0002', 'member_not_found', 'never the walk-in customer');
select is((select count(*)::integer from public.member_messages), 2, 'reception sees the log');
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.member_messages), 0, 'a trainer doesn''t');

-- What a message written now says.
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.member_message_details(pg_temp.id(1)) - 'plan',
  (select jsonb_build_object('end_date', d, 'days', d - pg_temp.today()) from month_end),
  'a message written now knows the membership''s end');
select is(public.member_message_details(pg_temp.id(3)) ->> 'amount', '30000.00', 'and what is owed');

-- The bell ----------------------------------------------------------------------------------------------------

select is((select count(*)::integer from public.staff_notifications where notify_on = pg_temp.today()), 1,
  'reception''s bell has the reminders, not the stock');
select is(public.mark_notifications_read(array(select id from public.staff_notifications where notify_on = pg_temp.today())), 1, 'marking it read');
select is(public.mark_notifications_read(array(select id from public.staff_notifications where notify_on = pg_temp.today())), 0, 'once');
select tests.authenticate_as(tests.staff('manager_a'));
select is(public.mark_notifications_read(array(select id from public.staff_notifications where kind = 'low_stock' and notify_on = pg_temp.today())), 1,
  'the manager reads the low stock');
select is((select count(*)::integer from public.staff_notification_reads), 1, 'each sees only their own reads');

select * from finish();
rollback;
