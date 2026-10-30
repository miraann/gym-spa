-- Step 5d: daily lockers not given back are released every night at the time the gym sets (default
-- 03:00 Baghdad), by pg_cron on the cloud. The setting, the release time of a branch, what is
-- released and what isn't (a later locker, a rented one, a read-only gym), and who may run it.
begin;
select plan(25);
select tests.create_fixture();

-- The setting ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ insert into public.settings (branch_id, key, value) values (null, 'lockers.night_release_minute', '1440') $$,
  '23514', null, 'the release time is a minute of the day (0 to 1439)');
select lives_ok($$ insert into public.settings (branch_id, key, value) values (tests.branch('B902'), 'lockers.night_release_minute', '1380') $$,
  'a branch may release at 23:00 instead');

-- The most recent release time (the job runs without a login) -------------------------------------------
select tests.clear_authentication();

select is(app.last_night_release(tests.gym('pgtap-a'), tests.branch('B901'), '2026-01-10 02:59+03'),
  '2026-01-09 03:00+03'::timestamptz, 'by default 03:00 Baghdad: before it, yesterday''s');
select is(app.last_night_release(tests.gym('pgtap-a'), tests.branch('B901'), '2026-01-10 03:00+03'),
  '2026-01-10 03:00+03'::timestamptz, 'from 03:00 on, today''s');
select is(app.last_night_release(tests.gym('pgtap-a'), tests.branch('B901'), '2026-01-09 22:30Z'),
  '2026-01-09 03:00+03'::timestamptz, 'in Baghdad time (01:30 on the 10th), whatever the UTC date');
select is(app.last_night_release(tests.gym('pgtap-a'), tests.branch('B902'), '2026-01-10 23:10+03'),
  '2026-01-10 23:00+03'::timestamptz, 'the branch''s own time');
select is(app.last_night_release(tests.gym('pgtap-b'), tests.branch('B902', 'pgtap-b'), '2026-01-10 23:10+03'),
  '2026-01-10 03:00+03'::timestamptz, 'is not another gym''s');
select tests.authenticate_as(tests.staff('owner'));
insert into public.settings (branch_id, key, value) values (null, 'lockers.night_release_minute', '60');
select tests.clear_authentication();
select is(app.last_night_release(tests.gym('pgtap-a'), tests.branch('B901'), '2026-01-10 02:00+03'),
  '2026-01-10 01:00+03'::timestamptz, 'the gym''s time applies to branches without their own');
delete from public.settings where key = 'lockers.night_release_minute' and branch_id is null;
select tests.authenticate_as(tests.staff('owner'));

-- Lockers given on 9 January ------------------------------------------------------------------------------

-- Men 1 to 4 in B901, man 5 in B902.
select public.create_member(p_id => ('97700000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  p_branch_id => tests.branch(case n when 5 then 'B902' else 'B901' end), p_full_name => 'ئەندامی ' || n,
  p_gender => 'male', p_phone => '+96475092000' || lpad(n::text, 2, '0'))
  from generate_series(1, 5) as g (n);
select public.add_lockers(tests.branch('B901'), 'men', 'daily', '', 1, 3);
select public.add_lockers(tests.branch('B901'), 'men', 'rented', 'R', 1, 1);
select public.add_lockers(tests.branch('B902'), 'men', 'daily', '', 1, 1);
insert into public.settings (branch_id, key, value) values (null, 'lockers.rent_month_price', '20000');

create function pg_temp.locker(branch_code text, locker_number text) returns uuid language sql as $$
  select id from public.lockers where number = locker_number and branch_id = tests.branch(branch_code)
$$;
create function pg_temp.holder(n integer) returns uuid language sql as $$
  select ('97800000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

select public.give_locker(pg_temp.holder(1), pg_temp.locker('B901', '1'), '97700000-0000-4000-8000-000000000001');
select public.give_locker(pg_temp.holder(2), pg_temp.locker('B901', '2'), '97700000-0000-4000-8000-000000000002');
select public.give_locker(pg_temp.holder(3), pg_temp.locker('B901', '3'), '97700000-0000-4000-8000-000000000003');
select public.rent_locker(pg_temp.holder(4), gen_random_uuid(), pg_temp.locker('B901', 'R1'),
  '97700000-0000-4000-8000-000000000004', (now() at time zone 'Asia/Baghdad')::date, 1, 'کرێی دۆڵاب');
select public.give_locker(pg_temp.holder(5), pg_temp.locker('B902', '1'), '97700000-0000-4000-8000-000000000005');

-- Moved back to 9 January with the triggers off: 1 at 18:00, 2 at 23:30, 3 on the 10th at 03:02 (after
-- that night's release), the rental and B902's locker at 22:00.
select tests.clear_authentication();
alter table public.locker_assignments disable trigger user;
update public.locker_assignments a
   set assigned_at = t.at, starts_on = case a.kind when 'daily' then (t.at at time zone 'Asia/Baghdad')::date else a.starts_on end
  from (values (pg_temp.holder(1), '2026-01-09 18:00+03'::timestamptz), (pg_temp.holder(2), '2026-01-09 23:30+03'),
               (pg_temp.holder(3), '2026-01-10 03:02+03'), (pg_temp.holder(4), '2026-01-09 22:00+03'),
               (pg_temp.holder(5), '2026-01-09 22:00+03')) as t (id, at)
 where a.id = t.id;
alter table public.locker_assignments enable trigger user;

create function pg_temp.open_holders() returns uuid[] language sql as $$
  select coalesce(array_agg(id order by id), '{}') from public.locker_assignments
   where id in (select pg_temp.holder(n) from generate_series(1, 5) as g (n)) and released_at is null
$$;

-- The night release ---------------------------------------------------------------------------------------

select is(app.release_daily_lockers_at_night('2026-01-09 23:10+03'), 1, 'at 23:10 on the 9th only B902 has released');
select is(pg_temp.open_holders(), array[pg_temp.holder(1), pg_temp.holder(2), pg_temp.holder(3), pg_temp.holder(4)],
  'its locker given at 22:00');

update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select is(app.release_daily_lockers_at_night('2026-01-10 03:04+03'), 0, 'a read-only gym''s lockers stay as they are');
update public.gyms set suspended_at = null where id = tests.gym('pgtap-a');

select is(app.release_daily_lockers_at_night('2026-01-10 03:04+03'), 2, 'at 03:04 on the 10th, B901''s night has come');
select is(pg_temp.open_holders(), array[pg_temp.holder(3), pg_temp.holder(4)],
  'the lockers given on the 9th are released');
select is((select release_reason from public.locker_assignments where id = pg_temp.holder(2)), 'end_of_day',
  'as not given back by the end of the day');
select ok((select released_by is null from public.locker_assignments where id = pg_temp.holder(2)),
  'by nobody (the app shows it as automatic)');
select is((select released_at from public.locker_assignments where id = pg_temp.holder(2)), '2026-01-10 03:04+03'::timestamptz,
  'when the job ran');
select is((select count(*)::integer from public.audit_logs
             where table_name = 'locker_assignments' and row_id = pg_temp.holder(2)::text and action = 'update' and actor_id is null), 1,
  'and the audit log has it, with no staff member');
select is(app.release_daily_lockers_at_night('2026-01-10 03:09+03'), 0, 'running again changes nothing');
select is(pg_temp.open_holders(), array[pg_temp.holder(3), pg_temp.holder(4)],
  'a locker given after the release waits for the next night, and a rental is never released');

-- The manual button still works and lets staff release the locker they see as overdue.
select tests.authenticate_as(tests.staff('reception_a'));
select lives_ok($$ select public.release_locker(pg_temp.holder(3)) $$, 'releasing by hand still works');

-- Who may run it ----------------------------------------------------------------------------------------------

select throws_ok($$ select app.release_daily_lockers_at_night() $$, '42501', null, 'staff can''t run the night release');
select throws_ok($$ select app.last_night_release(tests.gym('pgtap-a'), tests.branch('B901'), now()) $$, '42501', null,
  'nor read a release time that way');
select tests.authenticate_as_anon();
select throws_ok($$ select app.release_daily_lockers_at_night() $$, '42501', null, 'nor can anyone without a login');
select tests.clear_authentication();

-- The schedule ------------------------------------------------------------------------------------------------

-- Without pg_cron (the offline server) the migration skips the job, and gym-server runs it instead.
select case when tests.has_pg_cron()
  then is((select schedule from tests.cron_job('release-daily-lockers')), '*/5 * * * *',
    'the cloud runs it every 5 minutes')
  else skip('no pg_cron here: the offline server runs it itself', 1) end;
select case when tests.has_pg_cron()
  then is((select command from tests.cron_job('release-daily-lockers')),
    'select app.release_daily_lockers_at_night()', 'with the current time')
  else skip('no pg_cron here: the offline server runs it itself', 1) end;

select * from finish();
rollback;
