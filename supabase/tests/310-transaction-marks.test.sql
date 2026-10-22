-- The marks of create_member() and move_device() (migration 20261024100000): rows in the private
-- table app.transaction_marks, which only those functions write. The settings they used before
-- (app.creating_member, app.moving_device) no longer let anything through.
begin;
select plan(14);
select tests.create_fixture();

insert into public.members (id, gym_id, branch_id, full_name, gender, phone) values
  ('31000000-0000-4000-8000-000000000001', tests.gym('pgtap-a'), tests.branch('B901'), 'ئارام کەریم', 'male', '+9647503100001');
insert into public.devices (id, gym_id, branch_id, code, name, platform, is_active) values
  ('31000000-0000-4000-8000-0000000000d1', tests.gym('pgtap-a'), tests.branch('B901'), 'D01', 'کۆمپیوتەری پێشوازی', 'windows', true);

select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'app' and table_name = 'transaction_marks'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')),
  0,
  'no API role has any right on the transaction marks'
);

-- Adding a member: health info with members.create alone ----------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ insert into app.transaction_marks (xact, action, target)
     values (pg_current_xact_id(), 'create_member', '31000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'staff can''t write a mark themselves'
);
select set_config('app.creating_member', '31000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ insert into public.member_health (id, gym_id, medical_notes)
     values ('31000000-0000-4000-8000-000000000001', tests.gym('pgtap-a'), 'نووسراوی دەستی') $$,
  '42501', 'permission_denied',
  'the old setting no longer lets a receptionist write an existing member''s health info'
);
select set_config('app.creating_member', '', true);

select lives_ok(
  $$ select public.create_member(
       p_id => '31000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
       p_full_name => 'شیلان عەلی', p_gender => 'female', p_phone => '+9647503100002',
       p_medical_notes => 'ئازاری پشت') $$,
  'a receptionist still adds a member with health info through create_member()'
);
select is(
  (select count(*)::integer from public.member_health where id = '31000000-0000-4000-8000-000000000002'),
  0,
  'and can''t read it afterwards'
);
select throws_ok(
  $$ insert into public.member_health (id, gym_id, medical_notes)
     values ('31000000-0000-4000-8000-000000000001', tests.gym('pgtap-a'), 'دوای زیادکردن') $$,
  '42501', 'permission_denied',
  'the mark is gone once create_member() returns'
);
select throws_ok(
  $$ select public.create_member(
       p_id => gen_random_uuid(), p_branch_id => tests.branch('B901'),
       p_full_name => 'هەمان مۆبایل', p_gender => 'male', p_phone => '+9647503100001') $$,
  '23505', 'phone_in_use', 'create_member() still refuses a phone in use in the gym'
);
select throws_ok(
  $$ select public.create_member(
       p_id => gen_random_uuid(), p_branch_id => tests.branch('B902'),
       p_full_name => 'لقی تر', p_gender => 'male', p_phone => '+9647503100003') $$,
  '42501', 'no_branch_access', 'and a branch the staff member can''t access'
);

select tests.clear_authentication();
select is(
  (select medical_notes from public.member_health where id = '31000000-0000-4000-8000-000000000002'),
  'ئازاری پشت',
  'the health info was saved'
);
insert into public.members (id, gym_id, branch_id, full_name, gender, phone) values
  ('31000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'جیمی تر', 'male', '+9647503100009');
select tests.authenticate_as(tests.staff('reception_a'));
select lives_ok(
  $$ select public.create_member(
       p_id => gen_random_uuid(), p_branch_id => tests.branch('B901'),
       p_full_name => 'هاوڕێ جەمال', p_gender => 'male', p_phone => '+9647503100009') $$,
  'another gym''s member with the same phone doesn''t stop it (it sees every gym now)'
);

-- Moving a device ---------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select set_config('app.moving_device', '31000000-0000-4000-8000-0000000000d1', true);
select throws_ok(
  $$ update public.devices set branch_id = tests.branch('B902'), code = 'D09'
      where id = '31000000-0000-4000-8000-0000000000d1' $$,
  '42501', 'read_only_column',
  'the old setting no longer lets a device change branch or code without move_device()'
);
select set_config('app.moving_device', '', true);
select lives_ok(
  $$ select public.move_device('31000000-0000-4000-8000-0000000000d1', tests.branch('B902')) $$,
  'move_device() still moves it'
);
select results_eq(
  $$ select branch_id, code from public.devices where id = '31000000-0000-4000-8000-0000000000d1' $$,
  $$ values (tests.branch('B902'), 'D01'::text) $$,
  'to the new branch, with that branch''s next code'
);
select throws_ok(
  $$ update public.devices set branch_id = tests.branch('B901'), code = 'D09'
      where id = '31000000-0000-4000-8000-0000000000d1' $$,
  '42501', 'read_only_column', 'and its mark is gone once it returns'
);

select * from finish();
rollback;
