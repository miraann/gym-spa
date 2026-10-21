-- Step 2b: member_tags(), and a gym's counters going with the gym.
begin;
select plan(5);
select tests.create_fixture();

select tests.authenticate_as(tests.staff('reception_a'));
select public.create_member(p_id => '10000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
  p_full_name => 'ئارام کەریم', p_gender => 'male', p_phone => '+9647501230001', p_tags => array['قوتابی', 'خێزان']);
select public.create_member(p_id => '10000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
  p_full_name => 'ژیلا عەلی', p_gender => 'female', p_phone => '+9647501230002', p_tags => array['قوتابی']);
select public.create_member(p_id => '10000000-0000-4000-8000-000000000003', p_branch_id => tests.branch('B901'),
  p_full_name => 'هێمن سەلیم', p_gender => 'male', p_phone => '+9647501230003', p_tags => array['کۆن']);
select tests.authenticate_as(tests.staff('manager_a'));
select public.set_member_status('10000000-0000-4000-8000-000000000003', 'archived', 'ڕۆیشت');

select tests.authenticate_as(tests.staff('reception_a'));
select results_eq(
  'select tag, member_count from public.member_tags()',
  $$ values ('قوتابی'::text, 2), ('خێزان', 1) $$,
  'the tags in use, most used first, archived members left out'
);
select tests.authenticate_as(tests.staff('reception_a', 'pgtap-b'));
select is_empty('select * from public.member_tags()', 'another gym''s tags are never shown');
select tests.clear_authentication();
select tests.create_role('بێ ئەندامان', array['dashboard.view']);
select tests.create_staff('no_members_a', (select id::text from public.roles where name_ckb = 'بێ ئەندامان'), array['B901']);
select tests.authenticate_as(tests.staff('no_members_a'));
select is_empty('select * from public.member_tags()', 'nor without members.view');

-- A test gym (the end-to-end tests make and remove them) leaves no counter behind.
select tests.clear_authentication();
select tests.create_gym('pgtap-gone');
insert into public.members (id, gym_id, branch_id, full_name, gender, phone)
values ('30000000-0000-4000-8000-000000000001', tests.gym('pgtap-gone'),
        (select id from public.branches where gym_id = tests.gym('pgtap-gone') and code = 'B1'),
        'ئەندام', 'male', '+9647501230009');
select is((select count(*)::integer from app.gym_counters where gym_id = tests.gym('pgtap-gone')), 1,
  'the gym has a member counter');
delete from public.members where gym_id = tests.gym('pgtap-gone');
delete from public.branches where gym_id = tests.gym('pgtap-gone');
delete from public.role_permissions where gym_id = tests.gym('pgtap-gone');
delete from public.roles where gym_id = tests.gym('pgtap-gone');
select lives_ok($$ delete from public.gyms where code = 'pgtap-gone' $$,
  'removing a gym takes its counters with it');

select * from finish();
rollback;
