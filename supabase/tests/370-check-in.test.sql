-- Step 4a: check-in. check_in() by card and by hand, every refusal, the cooldown, daily limits,
-- visits counted and given back, overrides, checking out, occupancy, voiding, and who may do what.
begin;
select plan(59);
select tests.create_fixture();

create temporary table today_is as select (now() at time zone 'Asia/Baghdad')::date as d;
grant select on today_is to authenticated;

-- Plans, members, sales and cards, made by the Owner. Free plans, so nobody owes anything unless
-- the test wants it.
select tests.authenticate_as(tests.staff('owner'));
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانە', p_kind => 'time',
  p_price => 0, p_duration_unit => 'month', p_duration_count => 1, p_max_freeze_days => 10);
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000002', p_name_ckb => 'یەک هاتن', p_kind => 'visits',
  p_price => 0, p_visit_count => 1);
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000003', p_name_ckb => 'لقی دووەم', p_kind => 'unlimited',
  p_price => 0, p_branch_ids => array[tests.branch('B902')]);
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000004', p_name_ckb => 'ڕۆژانی تر', p_kind => 'unlimited',
  p_price => 0, p_allowed_days => (
    select array_agg(d::smallint order by d) from generate_series(1, 7) as g (d)
     where d <> extract(isodow from now() at time zone 'Asia/Baghdad')));
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000005', p_name_ckb => 'کاتی تر', p_kind => 'unlimited',
  p_price => 0,
  p_allowed_from => case when extract(hour from now() at time zone 'Asia/Baghdad') < 12 then time '13:00' else time '01:00' end,
  p_allowed_until => case when extract(hour from now() at time zone 'Asia/Baghdad') < 12 then time '14:00' else time '02:00' end);
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000006', p_name_ckb => 'مانگانەی پارەدار', p_kind => 'time',
  p_price => 30000, p_duration_unit => 'month', p_duration_count => 1);
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000007', p_name_ckb => 'بێ سنوور', p_kind => 'unlimited',
  p_price => 0);
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000008', p_name_ckb => 'پێنج هاتن', p_kind => 'visits',
  p_price => 0, p_visit_count => 5);
select public.save_plan(p_id => '91000000-0000-4000-8000-000000000009', p_name_ckb => 'دە ڕۆژ', p_kind => 'time',
  p_price => 0, p_duration_unit => 'day', p_duration_count => 10);

select public.create_member(p_id => ('90000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  p_branch_id => tests.branch('B901'), p_full_name => 'ئەندامی ' || n, p_gender => 'male',
  p_phone => '+96475090000' || lpad(n::text, 2, '0'))
  from generate_series(1, 14) as g (n);

-- Sells plan p to member m, starting `days` from today.
create temporary table sales (m integer, p integer, days integer);
grant select on sales to authenticated;
insert into sales values (1, 1, 0), (3, 1, 1), (4, 9, -30), (5, 1, -1), (6, 2, 0), (7, 3, 0), (8, 4, 0), (9, 5, 0),
  (10, 6, 0), (11, 7, 0), (11, 1, 0), (12, 1, 0), (13, 1, 0), (14, 8, 0);
select public.sell_subscription(
  ('92000000-0000-4000-8000-00000000' || lpad(m::text, 2, '0') || lpad(p::text, 2, '0'))::uuid,
  ('93000000-0000-4000-8000-00000000' || lpad(m::text, 2, '0') || lpad(p::text, 2, '0'))::uuid,
  ('90000000-0000-4000-8000-0000000000' || lpad(m::text, 2, '0'))::uuid,
  ('91000000-0000-4000-8000-0000000000' || lpad(p::text, 2, '0'))::uuid,
  tests.branch('B901'), (select d from today_is) + days, case p when 6 then 30000 else 0 end)
  from sales order by m, p;
select public.freeze_subscription('94000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000501',
  (select d from today_is), 3);
select public.assign_card(('95000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('90000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '04A1B2C3D4E5' || lpad(n::text, 2, '0'))
  from generate_series(1, 14) as g (n);
select public.block_card('95000000-0000-4000-8000-000000000013', 'ونبووە');
select public.set_member_status('90000000-0000-4000-8000-000000000012', 'suspended', 'پارەی نەداوە');

-- Moves the last visit of member n back by p minutes, as if it was then (triggers off: visits never
-- change otherwise).
create temporary table moves (n integer);
create function pg_temp.move_back(member_n integer, minutes integer) returns void language sql as $$
  alter table public.attendance disable trigger user;
  update public.attendance set checked_in_at = checked_in_at - make_interval(mins => minutes)
   where member_id = ('90000000-0000-4000-8000-0000000000' || lpad(member_n::text, 2, '0'))::uuid;
  alter table public.attendance enable trigger user;
$$;

-- By card --------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
create temporary table first_scan as
  select public.check_in('96000000-0000-4000-8000-000000000001', tests.branch('B901'), p_card_uid => '04:a1:b2:c3:d4:e5:01') as r;
select is((select r ->> 'result' from first_scan), 'allowed', 'a member with a running month comes in, by card');
select is((select r -> 'member' ->> 'full_name' from first_scan), 'ئەندامی 1', 'and the screen gets their name');
select is((select r -> 'subscription' ->> 'name_ckb' from first_scan), 'مانگانە', 'and the subscription used');
select is((select method || ' ' || card_id from public.attendance where id = '96000000-0000-4000-8000-000000000001'),
  'card 95000000-0000-4000-8000-000000000001', 'the visit is stored with its card');
select is(public.check_in('96000000-0000-4000-8000-000000000001', tests.branch('B901'), p_card_uid => '04A1B2C3D4E501') ->> 'attendance_id',
  '96000000-0000-4000-8000-000000000001', 'the same visit id again returns the visit already stored');
select is(public.check_in('96000000-0000-4000-8000-000000000002', tests.branch('B901'), p_card_uid => '04A1B2C3D4E501') ->> 'result',
  'already', 'a second scan within the cooldown is "already in"');
select is((select count(*)::integer from public.attendance where member_id = '90000000-0000-4000-8000-000000000001'),
  1, 'and counts nothing');

select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '0102030405060708090A') ->> 'reason',
  'CARD_INVALID', 'a card nobody has is invalid');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => 'hello') ->> 'reason',
  'CARD_INVALID', 'so is something that is no card number');
create temporary table blocked_scan as
  select public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E513') as r;
select is((select (r ->> 'reason') || ' ' || (r ->> 'card_status') from blocked_scan), 'CARD_BLOCKED blocked',
  'a blocked card is refused');
select is((select r -> 'member' ->> 'full_name' from blocked_scan), 'ئەندامی 13',
  'and says whose it is, so staff can check the face');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E512') ->> 'reason',
  'MEMBER_NOT_ACTIVE', 'a suspended member is refused');

-- Each refusal ---------------------------------------------------------------------------------------

select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E502') ->> 'reason',
  'NO_SUBSCRIPTION', 'a member who never bought anything has no subscription');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E503') ->> 'reason',
  'NOT_STARTED', 'a month that starts tomorrow hasn''t started');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E504') ->> 'reason',
  'PLAN_EXPIRED', 'a plan that ended has expired');
create temporary table frozen_scan as
  select public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E505') as r;
select is((select r ->> 'reason' from frozen_scan), 'PLAN_FROZEN', 'a month frozen today is frozen');
select is((select (r -> 'subscription' ->> 'frozen_until')::date from frozen_scan), (select d + 2 from today_is),
  'and says until when');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E507') ->> 'reason',
  'WRONG_BRANCH', 'a plan for another branch is refused here');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E508') ->> 'reason',
  'WRONG_DAY', 'a plan for other days is refused today');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E509') ->> 'reason',
  'WRONG_TIME', 'a plan for other hours is refused now');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E504') -> 'subscription' ->> 'name_ckb',
  'دە ڕۆژ', 'a refusal names the subscription it is about');

-- Visits: counted, limited per day, given back ---------------------------------------------------------

select tests.clear_authentication();
insert into public.settings (gym_id, key, value)
  select gym_id, 'checkin.cooldown_minutes', '1' from public.branches where id = tests.branch('B901');
select tests.authenticate_as(tests.staff('reception_a'));
create temporary table visit_scan as
  select public.check_in('96000000-0000-4000-8000-000000000006', tests.branch('B901'), p_card_uid => '04A1B2C3D4E506') as r;
select is((select r ->> 'result' from visit_scan), 'warning', 'the last visit of a visits plan lets the member in');
select is((select r -> 'warnings' from visit_scan), '["FEW_VISITS"]'::jsonb, 'with a warning that few are left');
select is((select (r -> 'subscription' ->> 'visits_left')::integer from visit_scan), 0, 'none are left now');
select is((select public.used_visits(s) from public.subscriptions s where s.id = '92000000-0000-4000-8000-000000000602'),
  1, 'the subscription has used one visit');

select tests.clear_authentication();
select pg_temp.move_back(6, 2);
select pg_temp.move_back(14, 0);
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E506') ->> 'reason',
  'NO_VISITS_LEFT', 'after the cooldown, a visits plan with none left is refused');
select is((select public.membership(m) from public.members m where m.id = '90000000-0000-4000-8000-000000000006'),
  'expired', 'and the member no longer has a running membership');
select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select public.transfer_subscription('92000000-0000-4000-8000-000000000602', gen_random_uuid(),
    '90000000-0000-4000-8000-000000000002', 'دیاری') $$,
  '23514', 'no_visits_left', 'a visits plan with none left can''t be transferred');

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E514') ->> 'result',
  'allowed', 'a plan of five visits lets the member in');
select tests.clear_authentication();
select pg_temp.move_back(14, 2);
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E514') ->> 'reason',
  'DAILY_LIMIT', 'but only once a day');

-- Voiding a visit gives it back (attendance.void).
select throws_ok($$ select public.void_visit('96000000-0000-4000-8000-000000000006', 'هەڵە') $$,
  '42501', 'permission_denied', 'a receptionist can''t void a visit');
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok($$ select public.void_visit('96000000-0000-4000-8000-000000000006', null) $$,
  '22023', 'reason_required', 'voiding needs a reason');
select lives_ok($$ select public.void_visit('96000000-0000-4000-8000-000000000006', 'کارتی کەسێکی تر بوو') $$,
  'a manager voids a visit');
select is((select public.used_visits(s) from public.subscriptions s where s.id = '92000000-0000-4000-8000-000000000602'),
  0, 'and the visit is given back');
select is((select public.membership(m) from public.members m where m.id = '90000000-0000-4000-8000-000000000006'),
  'current', 'so the membership runs again');
select throws_ok($$ select public.void_visit('96000000-0000-4000-8000-000000000006', 'دووبارە') $$,
  '23514', 'already_voided', 'a visit is voided once');

-- Which subscription, money owed, birthdays ---------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E511') -> 'subscription' ->> 'name_ckb',
  'مانگانە', 'of two subscriptions, the one that ends first is used');
create temporary table debt_scan as
  select public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E510') as r;
select is((select (r ->> 'result') || ' ' || (r -> 'warnings')::text from debt_scan), 'warning ["DEBT"]',
  'money owed now is a warning by default');
select is((select (r ->> 'owed_now')::numeric from debt_scan), 30000::numeric, 'with what is owed');
select tests.clear_authentication();
insert into public.settings (gym_id, key, value)
  select gym_id, 'checkin.deny_for_debt', '1' from public.branches where id = tests.branch('B901');
select pg_temp.move_back(10, 2);
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E510') ->> 'reason',
  'DEBT', 'a gym may refuse members who owe money');

select tests.clear_authentication();
update public.members set birth_date = (select d - interval '30 years' from today_is)
 where id = '90000000-0000-4000-8000-000000000003';

-- Overrides (checkin.override) -------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E502',
    p_override_note => 'مامۆستای نوێیە') $$,
  '42501', 'permission_denied', 'a receptionist can''t let a refused member in');
select tests.authenticate_as(tests.staff('manager_a'));
create temporary table override_scan as
  select public.check_in('96000000-0000-4000-8000-000000000003', tests.branch('B901'), p_card_uid => '04A1B2C3D4E503',
    p_override_note => 'ئەمڕۆ دەست پێدەکات') as r;
select is((select (r ->> 'result') || ' ' || (r ->> 'overridden') from override_scan), 'warning NOT_STARTED',
  'a manager lets a refused member in, and it says what was passed over');
select ok((select r -> 'warnings' ? 'BIRTHDAY' from override_scan), 'birthdays are a note too');
select is((select override_reason || ' ' || override_note || ' ' || coalesce(subscription_id::text, '-')
             from public.attendance where id = '96000000-0000-4000-8000-000000000003'),
  'NOT_STARTED ئەمڕۆ دەست پێدەکات -', 'the visit keeps the reason and note, and uses no subscription');
select is(public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E513',
    p_override_note => 'دەیناسم') ->> 'reason',
  'CARD_BLOCKED', 'a blocked card is never passed over');

-- By hand (checkin.manual) -------------------------------------------------------------------------------

select is(public.check_in('96000000-0000-4000-8000-000000000011', tests.branch('B901'),
    p_member_id => '90000000-0000-4000-8000-000000000007') ->> 'reason',
  'WRONG_BRANCH', 'members are checked in by hand too');
select tests.authenticate_as(tests.staff('owner'));
select is(public.check_in('96000000-0000-4000-8000-000000000007', tests.branch('B902'),
    p_member_id => '90000000-0000-4000-8000-000000000007') ->> 'result',
  'allowed', 'and come in in the branch their plan is for');
select is((select method || ' ' || coalesce(card_id::text, '-') from public.attendance where id = '96000000-0000-4000-8000-000000000007'),
  'manual -', 'stored as by hand, without a card');

-- Who may ------------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E501') $$,
  '42501', 'permission_denied', 'a trainer can''t check members in');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.check_in(gen_random_uuid(), tests.branch('B902'), p_card_uid => '04A1B2C3D4E501') $$,
  '42501', 'no_branch_access', 'only in their own branches');
select throws_ok($$ select public.check_in(gen_random_uuid(), tests.branch('B901'), p_card_uid => '04A1B2C3D4E501',
    p_member_id => '90000000-0000-4000-8000-000000000001') $$,
  '22023', 'invalid_request', 'a card or a member, not both');
select is(tests.error_code($$ insert into public.attendance (id, branch_id, member_id, method, override_reason, override_note)
    values (gen_random_uuid(), tests.branch('B901'), '90000000-0000-4000-8000-000000000002', 'manual', 'DEBT', 'x') $$),
  '42501', 'staff never write visits themselves');

-- Inside, checking out, occupancy ------------------------------------------------------------------------

select is(public.branch_occupancy(tests.branch('B901')), 5, 'everyone let in today in the branch is inside');
select lives_ok($$ select public.check_out('96000000-0000-4000-8000-000000000001') $$, 'a member is checked out');
select is(public.branch_occupancy(tests.branch('B901')), 4, 'and is no longer inside');
select is((select public.inside(a) from public.attendance a where a.id = '96000000-0000-4000-8000-000000000001'),
  false, 'their visit says so');
select tests.clear_authentication();
select pg_temp.move_back(14, 4 * 60);
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.branch_occupancy(tests.branch('B901')), 3, 'after checkin.visit_hours a visit no longer counts as inside');

-- Who sees visits (attendance.view) ----------------------------------------------------------------------

select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.attendance), 7, 'a trainer sees the gym''s visits');
select tests.clear_authentication();
select tests.create_role('بێ هاتن', array['members.view']);
select tests.create_staff('no_visits_a', (select id::text from public.roles where name_ckb = 'بێ هاتن'), array['B901']);
select tests.authenticate_as(tests.staff('no_visits_a'));
select is((select count(*)::integer from public.attendance), 0, 'without attendance.view nobody sees visits');

select * from finish();
rollback;
