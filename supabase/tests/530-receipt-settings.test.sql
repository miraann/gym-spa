-- Step 10d: the receipt's bottom line per language and the usual dollar rate, checked like every
-- setting and written with settings.edit.
begin;
select plan(9);
select tests.create_fixture();

select ok(app.is_valid_setting('payments.usd_rate', '1480'), 'a dollar rate in whole dinars');
select ok(app.is_valid_setting('payments.usd_rate', '0'), 'or none');
select ok(not app.is_valid_setting('payments.usd_rate', '1480.5'), 'not a fraction');
select ok(not app.is_valid_setting('payments.usd_rate', '"1480"'), 'and a number, not text');
select ok(app.is_valid_setting('receipts.footer_ckb', '"سوپاس بۆ هاتنت"'), 'a footer line');
select ok(not app.is_valid_setting('receipts.footer_en', to_jsonb(repeat('x', 201))), 'of at most 200 characters');
select ok(not app.is_valid_setting('receipts.footer_ar', '""'), 'never empty (removed instead)');

select tests.authenticate_as(tests.staff('owner'));
select lives_ok($$ insert into public.settings (key, value) values ('receipts.footer_ckb', '"سوپاس"'), ('payments.usd_rate', '1480') $$,
  'the Owner sets them for the gym');
select tests.authenticate_as(tests.staff('reception_a'));
select is(tests.error_code($$ insert into public.settings (key, value) values ('receipts.footer_en', '"Thanks"') $$),
  '42501', 'reception doesn''t (settings.edit)');

select * from finish();
rollback;
