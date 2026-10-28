-- Step 7a: staff HR. Pay terms (who may see and change them), the trainers list, staff cards (a UID
-- is a member's or a staff member's, never both), clocking in and out by card and by hand, voiding,
-- and shifts that never overlap.
begin;
select plan(36);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('44000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- Profiles ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is((public.save_staff_profile(tests.staff('trainer_ab'), 'fixed', p_monthly_salary => 750000, p_class_fee => 5000,
  p_pt_percent => 20, p_teaches => true)).salary_type, 'fixed', 'the Owner sets a trainer''s pay terms');
select is((public.save_staff_profile(tests.staff('reception_a'), 'hourly', p_hourly_rate => 4000)).hourly_rate, 4000.00,
  'and a receptionist''s hourly rate');
select throws_ok($$ select public.save_staff_profile(tests.staff('reception_b'), 'fixed') $$,
  '22023', 'invalid_staff_profile', 'a fixed salary needs its amount');
select throws_ok($$ select public.save_staff_profile(tests.staff('owner'), 'fixed', p_monthly_salary => 1) $$,
  '42501', 'permission_denied', 'nobody sets their own pay');
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok($$ select public.save_staff_profile(tests.staff('reception_a'), 'hourly', p_hourly_rate => 9000) $$,
  '42501', 'permission_denied', 'a branch manager reads pay terms but changes none (hr.manage)');
select is((select count(*)::integer from public.staff_profiles), 2, 'and sees those of their branch''s staff');
select tests.authenticate_as(tests.staff('reception_a'));
select is((select array_agg(salary_type) from public.staff_profiles), array['hourly'], 'a receptionist sees only their own');
select is((select array_agg(id) from public.trainers()), array[tests.staff('trainer_ab')],
  'and the trainers by name, for booking classes');
select is((select count(*)::integer from public.trainers(tests.branch('B902'))), 1, 'also those of one branch');

-- Cards -----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => pg_temp.id(1), p_branch_id => tests.branch('B901'), p_full_name => 'ئارام',
  p_gender => 'male', p_phone => '+9647504400001');
select is((public.give_staff_card(pg_temp.id(11), tests.staff('trainer_ab'), 'de:ad:be:ef')).uid, 'DEADBEEF',
  'the Owner gives the trainer a card');
select is((public.give_staff_card(pg_temp.id(11), tests.staff('trainer_ab'), 'DEADBEEF')).id, pg_temp.id(11),
  'sending it again returns it');
select throws_ok($$ select public.assign_card(gen_random_uuid(), pg_temp.id(1), 'DEADBEEF') $$,
  '23505', 'card_in_use', 'a member can''t be given a staff card');
select public.assign_card(pg_temp.id(12), pg_temp.id(1), '04A23BC15D6E80');
select throws_ok($$ select public.give_staff_card(gen_random_uuid(), tests.staff('reception_a'), '04A23BC15D6E80') $$,
  '23505', 'card_in_use', 'nor a staff member a member''s card');
select public.give_staff_card(pg_temp.id(13), tests.staff('trainer_ab'), 'CAFEBABE');
select is((select end_reason from public.staff_cards where id = pg_temp.id(11)), 'replaced',
  'a new card ends the old one as replaced');
select public.give_staff_card(pg_temp.id(14), tests.staff('reception_a'), '11223344');

-- Clocking --------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.staff_clock_by_card('CAFEBABE', tests.branch('B901')) ->> 'result', 'in', 'the trainer''s card clocks them in');
select is(public.staff_clock_by_card('CAFEBABE', tests.branch('B901')) ->> 'result', 'already',
  'a second scan within 2 minutes changes nothing');
select tests.clear_authentication();
alter table public.staff_clock disable trigger user;
update public.staff_clock set clocked_in_at = clocked_in_at - interval '3 hours' where staff_id = tests.staff('trainer_ab');
alter table public.staff_clock enable trigger user;
select tests.authenticate_as(tests.staff('reception_a'));
select is(public.staff_clock_by_card('CAFEBABE', tests.branch('B901')) ->> 'result', 'out', 'later, it clocks them out');
select throws_ok($$ select public.staff_clock_by_card('04A23BC15D6E80', tests.branch('B901')) $$,
  'P0002', 'card_not_staff', 'a member''s card is not a staff card');
select throws_ok($$ select public.staff_clock_by_card('DEADBEEF', tests.branch('B901')) $$,
  'P0002', 'card_not_staff', 'nor is a replaced card');
select tests.authenticate_as(tests.staff('reception_b'));
select throws_ok($$ select public.staff_clock_by_card('11223344', tests.branch('B902')) $$,
  '23514', 'staff_wrong_branch', 'staff clock in only in a branch they work in');
select is((select count(*)::integer from public.staff_clock), 0, 'reception of another branch sees nobody else''s clock');
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.staff_clock), 1, 'a trainer sees their own');

select tests.authenticate_as(tests.staff('owner'));
select is(public.staff_clock_manual(tests.staff('reception_a'), tests.branch('B901'), true, now() - interval '1 hour', 'لە بیری چوو') ->> 'result',
  'in', 'the Owner clocks a receptionist in by hand, with a note');
select throws_ok($$ select public.staff_clock_manual(tests.staff('reception_a'), tests.branch('B901'), true, now(), 'دووبارە') $$,
  '23505', 'already_clocked_in', 'not twice');
select throws_ok($$ select public.staff_clock_manual(tests.staff('reception_a'), tests.branch('B901'), false, now() - interval '2 hours', 'هەڵە') $$,
  '22023', 'invalid_request', 'nor out before in');
select is(public.staff_clock_manual(tests.staff('reception_a'), tests.branch('B901'), false, now(), 'ڕۆیشت') ->> 'result',
  'out', 'and out');
select throws_ok($$ select public.void_staff_clock((select id from public.staff_clock where staff_id = tests.staff('reception_a')), null) $$,
  '22023', 'reason_required', 'voiding needs a reason');
select lives_ok($$ select public.void_staff_clock((select id from public.staff_clock where staff_id = tests.staff('reception_a')), 'هەڵە بوو') $$,
  'a mistaken record is voided');
select throws_ok($$ insert into public.staff_clock (id, branch_id, staff_id, method) values (gen_random_uuid(), tests.branch('B901'), tests.staff('owner'), 'manual') $$,
  '42501', null, 'nobody writes the clock directly');
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok($$ select public.staff_clock_manual(tests.staff('reception_a'), tests.branch('B901'), true, now(), 'x') $$,
  '42501', 'permission_denied', 'a branch manager doesn''t clock people by hand (hr.manage)');

-- Shifts ----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is((public.save_staff_shift(pg_temp.id(21), tests.staff('reception_a'), tests.branch('B901'),
  date_trunc('day', now()) + interval '1 day 8 hours', date_trunc('day', now()) + interval '1 day 16 hours')).staff_id,
  tests.staff('reception_a'), 'the Owner plans a shift');
select throws_ok($$ select public.save_staff_shift(gen_random_uuid(), tests.staff('reception_a'), tests.branch('B901'),
  date_trunc('day', now()) + interval '1 day 15 hours', date_trunc('day', now()) + interval '1 day 20 hours') $$,
  '23P01', 'shift_overlaps', 'one person''s shifts never overlap');
select throws_ok($$ select public.save_staff_shift(gen_random_uuid(), tests.staff('reception_a'), tests.branch('B901'),
  date_trunc('day', now()) + interval '2 days', date_trunc('day', now()) + interval '2 days 17 hours') $$,
  '22023', 'invalid_shift', 'a shift is at most 16 hours');
select public.remove_staff_shift(pg_temp.id(21));
select lives_ok($$ select public.save_staff_shift(gen_random_uuid(), tests.staff('reception_a'), tests.branch('B901'),
  date_trunc('day', now()) + interval '1 day 15 hours', date_trunc('day', now()) + interval '1 day 20 hours') $$,
  'a removed shift frees its time');
select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.staff_shifts where deleted_at is null), 1, 'a receptionist sees their own shifts');
select throws_ok($$ select public.save_staff_shift(gen_random_uuid(), tests.staff('reception_a'), tests.branch('B901'), now(), now() + interval '1 hour') $$,
  '42501', 'permission_denied', 'and plans none');

select * from finish();
rollback;
