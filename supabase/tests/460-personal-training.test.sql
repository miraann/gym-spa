-- Step 7c: personal training. PT packages, selling one with its trainer, the session log (done and
-- no-show both use a session), sessions left, voiding, an expired or voided package, the trainers'
-- report, and who may do what.
begin;
select plan(24);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('46000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create temporary table days as select (now() at time zone 'Asia/Baghdad')::date as today;
grant select on days to authenticated;

select tests.authenticate_as(tests.staff('owner'));
select public.save_staff_profile(tests.staff('trainer_ab'), 'commission', p_pt_percent => 25, p_class_fee => 3000,
  p_teaches => true);
select public.create_member(p_id => pg_temp.id(1), p_branch_id => tests.branch('B901'), p_full_name => 'ئارام',
  p_gender => 'male', p_phone => '+9647504600001');

-- Packages and selling -----------------------------------------------------------------------------------

select is((public.save_pt_package(pg_temp.id(2), 'دە دانیشتن', 10, 200000, p_valid_days => 60)).session_count, 10,
  'the Owner adds a PT package');
select throws_ok($$ select public.save_pt_package(gen_random_uuid(), 'پاکێج', 0, 1000) $$,
  '22023', 'invalid_pt_package', 'at least one session');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.save_pt_package(gen_random_uuid(), 'پاکێج', 5, 1000) $$,
  '42501', 'permission_denied', 'reception doesn''t change PT packages (pt.manage)');
select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.sell_pt_package(gen_random_uuid(), gen_random_uuid(), pg_temp.id(2), pg_temp.id(1),
  tests.staff('trainer_ab'), tests.branch('B901')) $$,
  '42501', 'permission_denied', 'a trainer doesn''t take money (payments.create)');
select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select public.sell_pt_package(gen_random_uuid(), gen_random_uuid(), pg_temp.id(2), pg_temp.id(1),
  tests.staff('reception_a'), tests.branch('B901')) $$,
  'P0002', 'trainer_not_found', 'the trainer is someone who teaches');
select is((public.sell_pt_package(pg_temp.id(3), pg_temp.id(4), pg_temp.id(2), pg_temp.id(1), tests.staff('trainer_ab'),
  tests.branch('B901')) ->> 'total')::numeric, 200000.00, 'the Owner sells it with the trainer');
select is((select kind || ' ' || description_ckb from public.invoice_items where invoice_id = pg_temp.id(4)),
  'other دە دانیشتن', 'on one invoice');
select is((select expires_on from public.member_pt_packages where id = pg_temp.id(3)), (select today + 59 from days),
  'valid for 60 days');
select is(public.sell_pt_package(pg_temp.id(3), pg_temp.id(4), pg_temp.id(2), pg_temp.id(1), tests.staff('trainer_ab'),
  tests.branch('B901')) ->> 'invoice_id', pg_temp.id(4)::text, 'sending it again returns what was saved');

-- The log -------------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('trainer_ab'));
select is((public.log_pt_session(pg_temp.id(11), pg_temp.id(3), tests.branch('B901'), 'done', p_note => 'قاچ') ->> 'sessions_left')::integer,
  9, 'the trainer logs a session');
select is((select earning from public.pt_sessions where id = pg_temp.id(11)), 5000.00,
  'and earns 25% of the package price per session');
select is((public.log_pt_session(pg_temp.id(12), pg_temp.id(3), tests.branch('B901'), 'no_show') ->> 'sessions_left')::integer,
  8, 'a no-show uses a session too');
select is((public.log_pt_session(pg_temp.id(12), pg_temp.id(3), tests.branch('B901'), 'no_show') ->> 'sessions_left')::integer,
  8, 'sending it again changes nothing');
select throws_ok($$ select public.log_pt_session(gen_random_uuid(), pg_temp.id(3), tests.branch('B901'), 'done',
  now() - interval '8 days') $$,
  '22023', 'invalid_pt_session', 'a session is logged within 7 days');
select public.log_pt_session(gen_random_uuid(), pg_temp.id(3), tests.branch('B901'), 'done') from generate_series(1, 8);
select throws_ok($$ select public.log_pt_session(gen_random_uuid(), pg_temp.id(3), tests.branch('B901'), 'done') $$,
  '23514', 'no_sessions_left', 'not more than the package has');
select throws_ok($$ select public.void_pt_session(pg_temp.id(12), 'هەڵە') $$,
  '42501', 'permission_denied', 'a trainer voids nothing (pt.manage)');
select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select public.void_pt_session(pg_temp.id(12), null) $$, '22023', 'reason_required', 'voiding needs a reason');
select public.void_pt_session(pg_temp.id(12), 'هات، هەڵە تۆمار کرا');
select is((select public.sessions_left(m) from public.member_pt_packages m where m.id = pg_temp.id(3)), 1,
  'a voided session is given back');

-- The report --------------------------------------------------------------------------------------------

select results_eq($$ select pt_sessions, pt_earning, classes from public.trainer_report(tests.branch('B901'), (select today from days), (select today from days))
                     where staff_id = tests.staff('trainer_ab') $$,
  $$ values (9, 45000.00::numeric, 0) $$, 'the report counts the trainer''s sessions and earnings');
select tests.authenticate_as(tests.staff('manager_a'));
select is((select count(*)::integer from public.trainer_report(tests.branch('B901'), (select today from days), (select today from days))),
  1, 'a branch manager reads it (hr.view)');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select * from public.trainer_report(tests.branch('B901'), current_date, current_date) $$,
  '42501', 'permission_denied', 'reception doesn''t (pay)');
select is((select count(*)::integer from public.pt_sessions where voided_at is null), 9, 'but sees the sessions (members.view)');

-- A voided invoice ends the package.
select tests.authenticate_as(tests.staff('owner'));
select public.void_invoice(pg_temp.id(4), 'هەڵە');
select throws_ok($$ select public.log_pt_session(gen_random_uuid(), pg_temp.id(3), tests.branch('B901'), 'done') $$,
  '23514', 'pt_package_not_usable', 'its sessions can''t be used any more');
select throws_ok($$ insert into public.pt_sessions (id, branch_id, member_pt_package_id, member_id, trainer_id, status)
                    values (gen_random_uuid(), tests.branch('B901'), pg_temp.id(3), pg_temp.id(1), tests.staff('trainer_ab'), 'done') $$,
  '42501', null, 'nobody writes the log directly');

select * from finish();
rollback;
