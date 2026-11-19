-- Step D-4g: the bell's "still to send": per day and branch, the reminders not done yet, only
-- in the caller's branches (reminders' RLS), and never for anon.
begin;
select plan(5);
select tests.create_fixture();
-- The scheduled job may have collected other gyms' reminders today (rolled back at the end).
delete from public.member_messages;
delete from public.reminders;

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('51600000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create temporary table days as select (now() at time zone 'Asia/Baghdad')::date as today;
grant select on days to authenticated;

select tests.authenticate_as(tests.staff('owner'));
-- Three new members in branch A: three welcome reminders today.
select public.create_member(p_id => pg_temp.id(n), p_branch_id => tests.branch('B901'), p_full_name => 'ئەندامی ' || n,
  p_gender => 'female', p_phone => '+96475051600' || lpad(n::text, 2, '0'))
  from generate_series(1, 3) as g (n);
select tests.clear_authentication();
select app.collect_reminders(tests.gym('pgtap-a'));

select tests.authenticate_as(tests.staff('reception_a'));
select is((select sum(left_count)::integer from public.bell_reminders_left((select today from days))), 3,
  'three welcomes still to send in branch A');
select public.set_reminder_done(
  (select r.id from public.reminders r where r.member_id = pg_temp.id(1)), true);
select is((select left_count from public.bell_reminders_left((select today from days))
            where branch_id = tests.branch('B901')), 2, 'one sent: two left');
select is((select count(*)::integer from public.bell_reminders_left((select today from days) + 1)), 0,
  'none from tomorrow on');

select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.bell_reminders_left((select today from days))), 0,
  'another branch''s reception sees none of them');

select tests.clear_authentication();
select ok(not has_function_privilege('anon', 'public.bell_reminders_left(date)', 'execute'), 'never for anon');

select * from finish();
rollback;
