-- Step 2a: members and their health info. create_member(), update_member(), set_member_status(),
-- find_member_duplicates(), search_members(), member numbers, and the rules the app shares
-- (normalized search, member phones, tags).
begin;
select plan(85);
select tests.create_fixture();

select tests.create_staff('accountant_a', 'accountant', array['B901']);
select tests.create_staff('cashier_a', 'cashier', array['B901']);
select tests.create_staff('spa_a', 'spa_therapist', array['B901']);
select tests.create_role('بێ ئەندامان', array['dashboard.view']);
select tests.create_staff('no_members_a', (select id::text from public.roles where name_ckb = 'بێ ئەندامان'), array['B901']);
select tests.create_role('تەنها زیادکردن', array['members.create']);
select tests.create_staff('create_only_a', (select id::text from public.roles where name_ckb = 'تەنها زیادکردن'), array['B901']);
select tests.create_branch('B903');
update public.branches set is_active = false where code = 'B903' and gym_id = tests.gym('pgtap-a');

-- create_member() --------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select results_eq(
  $$ select member_number, status, gym_id = tests.gym('pgtap-a'), created_by = tests.staff('reception_a')
       from public.create_member(
         p_id => '10000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
         p_full_name => 'ئارام کەریم محەمەد', p_gender => 'male', p_phone => '+9647501234567') $$,
  $$ values (1, 'active'::text, true, true) $$,
  'a receptionist adds a member: the gym''s first member gets number 1 and starts active'
);
select results_eq(
  $$ select member_number, has_health_notes, phone is null
       from public.create_member(
         p_id => '10000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
         p_full_name => 'ڕۆژان کەریم', p_gender => 'female',
         p_emergency_contact_name => 'کەریم محەمەد', p_emergency_phone => '+9647701234567',
         p_birth_date => '2015-03-01', p_blood_type => 'O+', p_medical_notes => 'نەخۆشیی شەکرە',
         p_injuries => 'ئازاری ئەژنۆ') $$,
  $$ values (2, true, true) $$,
  'the next member gets the next number; a member without a phone of their own has their emergency contact''s, and health info written while creating sets has_health_notes'
);
select is(tests.visible_rows('member_health', tests.gym('pgtap-a')), 0,
  'staff without members.medical.view can''t read health info, not even what they just wrote');
select is(
  app.has_transaction_mark('create_member', '10000000-0000-4000-8000-000000000001')
    or app.has_transaction_mark('create_member', '10000000-0000-4000-8000-000000000002'),
  false,
  'create_member() removes its mark again');
select results_eq(
  $$ insert into public.members (id, branch_id, full_name, gender, phone, member_number)
     values ('10000000-0000-4000-8000-000000000003', tests.branch('B901'), 'هانا عومەر', 'female', '+9647501230003', 999)
     returning member_number $$,
  $$ values (3) $$,
  'the server gives the number, whatever the row says'
);
select results_eq(
  $$ insert into public.members (id, branch_id, full_name, gender, phone, status, status_reason, has_health_notes)
     values ('10000000-0000-4000-8000-000000000004', tests.branch('B901'), 'دانا سەلیم', 'male', '+9647501230004', 'banned', 'تاقیکردنەوە', true)
     returning status, status_reason, has_health_notes $$,
  $$ values ('active'::text, null::text, false) $$,
  'a new member always starts active, without health notes'
);
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
       p_full_name => 'ئارام کەریم محەمەد', p_gender => 'male', p_phone => '+9647501239999') $$,
  '23505', 'member_exists', 'saving the same member again says it exists (a retry after a lost answer)'
);
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501234567') $$,
  '23505', 'phone_in_use', 'two members of a gym never share a phone number'
);
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male') $$,
  '23514', 'contact_phone_required', 'a member needs a phone of their own or an emergency contact''s'
);
select is(
  tests.error_code($$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+96412345678') $$),
  '23514', 'an Iraqi phone must be a mobile'
);
select is(
  tests.error_code($$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '07501234568') $$),
  '23514', 'phones are stored as +964..., never as typed'
);
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009',
       p_birth_date => ((now() at time zone 'Asia/Baghdad')::date + 1)) $$,
  '23514', 'invalid_birth_date', 'no birth date in the future'
);
select is(
  tests.error_code($$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009',
       p_tags => array['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']) $$),
  '23514', 'at most 10 tags'
);
select is(
  tests.error_code($$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009', p_tags => array['قوتابی', 'قوتابی']) $$),
  '23514', 'no tag twice'
);
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B902'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009') $$,
  '42501', 'no_branch_access', 'a member joins in one of the receptionist''s own branches'
);
select is(
  tests.error_code($$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009', p_blood_type => 'X') $$),
  '23514', 'wrong health info refuses the whole member (all or nothing)'
);

select tests.authenticate_as(tests.staff('owner'));
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B903'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009') $$,
  '23514', 'branch_inactive', 'members join in active branches only'
);

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009') $$,
  '42501', 'permission_denied', 'a trainer can''t add members'
);
select tests.authenticate_as(tests.staff('create_only_a'));
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009') $$,
  '42501', 'permission_denied', 'adding a member needs members.view too (create_member returns them)'
);

select tests.authenticate_as(tests.staff('reception_a', 'pgtap-b'));
select results_eq(
  $$ select member_number from public.create_member(
       p_id => '20000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901', 'pgtap-b'),
       p_full_name => 'سارا عەلی', p_gender => 'female', p_phone => '+9647501234567') $$,
  $$ values (1) $$,
  'member numbers and phone numbers are per gym'
);

-- A failed save gives its number back: the next member of gym A gets 5.
select tests.authenticate_as(tests.staff('reception_a'));
select results_eq(
  $$ select member_number from public.create_member(
       p_id => '10000000-0000-4000-8000-000000000005', p_branch_id => tests.branch('B901'),
       p_full_name => 'گۆران ڕەشید', p_gender => 'male', p_phone => '+9647801000001',
       p_tags => array['قوتابی']) $$,
  $$ values (5) $$,
  'failed saves leave no gaps in the numbers'
);
select lives_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000006', p_branch_id => tests.branch('B901'),
       p_full_name => 'شیلان ئەحمەد حەسەن', p_gender => 'female', p_phone => '+9647801000002');
     select public.create_member(p_id => '10000000-0000-4000-8000-000000000007', p_branch_id => tests.branch('B901'),
       p_full_name => 'ژیلا مستەفا', p_gender => 'female', p_phone => '+9647801000003') $$,
  'more members for the searches below'
);

-- Who reads members ------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.members where id = '10000000-0000-4000-8000-000000000001'), 1,
  'members belong to the whole gym: staff of another branch see them too');
select tests.authenticate_as(tests.staff('cashier_a'));
select is(tests.visible_rows('members', tests.gym('pgtap-a')), 7, 'a cashier sees every member of the gym');
select tests.authenticate_as(tests.staff('spa_a'));
select is(tests.visible_rows('members', tests.gym('pgtap-a')), 7, 'so does a spa therapist');
select tests.authenticate_as(tests.staff('no_members_a'));
select is(tests.visible_rows('members', tests.gym('pgtap-a')), 0, 'without members.view: no members');
select tests.authenticate_as(tests.staff('former_a'));
select is(tests.visible_rows('members', tests.gym('pgtap-a')), 0, 'a deactivated staff member sees no members');

-- Health info ------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('trainer_ab'));
select results_eq(
  $$ select blood_type, medical_notes, injuries from public.member_health where id = '10000000-0000-4000-8000-000000000002' $$,
  $$ values ('O+'::text, 'نەخۆشیی شەکرە'::text, 'ئازاری ئەژنۆ'::text) $$,
  'a trainer (members.medical.view) reads health info'
);
select is(tests.rows_changed($$ update public.member_health set injuries = null where id = '10000000-0000-4000-8000-000000000002' $$), 0,
  'but can''t change it (no members.edit)');

select tests.authenticate_as(tests.staff('reception_a'));
select is(
  tests.error_code($$ insert into public.member_health (id, injuries) values ('10000000-0000-4000-8000-000000000001', 'ئازاری پشت') $$),
  '42501', 'members.create writes health info only while creating the member'
);
select is(tests.rows_changed($$ update public.member_health set injuries = null where id = '10000000-0000-4000-8000-000000000002' $$), 0,
  'a receptionist can''t change health info');
select throws_ok(
  $$ select public.update_member(p_id => '10000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
       p_full_name => 'ڕۆژان کەریم', p_gender => 'female', p_emergency_phone => '+9647701234567',
       p_save_health => true) $$,
  '42501', 'permission_denied', 'nor through update_member()'
);

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select has_health_notes from public.update_member(
       p_id => '10000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
       p_full_name => 'ڕۆژان کەریم', p_gender => 'female', p_emergency_contact_name => 'کەریم محەمەد',
       p_emergency_phone => '+9647701234567', p_birth_date => '2015-03-01',
       p_save_health => true, p_blood_type => 'O+') $$,
  $$ values (false) $$,
  'a branch manager clears the notes; only the blood type is left, so no health notes'
);
select results_eq(
  $$ select has_health_notes from public.update_member(
       p_id => '10000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
       p_full_name => 'ئارام کەریم محەمەد', p_gender => 'male', p_phone => '+9647501234567',
       p_save_health => true, p_injuries => 'ئازاری شان') $$,
  $$ values (true) $$,
  'and adds health info to a member who had none'
);
select throws_ok(
  $$ update public.members set has_health_notes = false where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501', 'read_only_column', 'has_health_notes only follows member_health'
);

select tests.clear_authentication();
select is_empty(
  $$ select 1 from public.audit_logs
      where table_name = 'member_health'
        and (coalesce(old_values::text, '') || coalesce(new_values::text, '')) ~ '(نەخۆشیی|ئازاری|"O\+")' $$,
  'the audit log never keeps health info'
);
select ok(
  exists (select 1 from public.audit_logs
           where table_name = 'member_health' and row_id = '10000000-0000-4000-8000-000000000002'
             and action = 'update' and actor_id = tests.staff('manager_a')
             and new_values ->> 'injuries' = 'redacted' and 'injuries' = any (changed_columns)),
  'it records who changed which health field, and when'
);

-- update_member() --------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select results_eq(
  $$ select full_name, phone, birth_date, tags, updated_by = tests.staff('reception_a')
       from public.update_member(
         p_id => '10000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
         p_full_name => 'ئارام کەریم عومەر', p_gender => 'male', p_phone => '+9647501234599',
         p_birth_date => '1990-05-20', p_tags => array['قوتابی']) $$,
  $$ values ('ئارام کەریم عومەر'::text, '+9647501234599'::text, '1990-05-20'::date, array['قوتابی'], true) $$,
  'a receptionist changes a member''s profile (last write wins)'
);
select results_eq(
  $$ select member_number, status from public.members where id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values (1, 'active'::text) $$,
  'the number and the status stay'
);
select throws_ok(
  $$ update public.members set member_number = 50 where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501', 'read_only_column', 'a member number never changes'
);
select throws_ok(
  $$ select public.update_member(p_id => '10000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B902'),
       p_full_name => 'ئارام کەریم عومەر', p_gender => 'male', p_phone => '+9647501234599') $$,
  '42501', 'no_branch_access', 'the home branch can only become one of the receptionist''s branches'
);
select throws_ok(
  $$ select public.update_member(p_id => '10000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
       p_full_name => 'ئارام کەریم عومەر', p_gender => 'male', p_phone => '+9647801000001') $$,
  '23505', 'phone_in_use', 'nor take another member''s phone'
);
select throws_ok(
  $$ select public.update_member(p_id => '10000000-0000-4000-8000-0000000000ff', p_branch_id => tests.branch('B901'),
       p_full_name => 'کەس', p_gender => 'male', p_phone => '+9647801000099') $$,
  'P0002', 'member_not_found', 'an unknown member is not found'
);

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok(
  $$ select public.update_member(p_id => '10000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
       p_full_name => 'ناوی تر', p_gender => 'male', p_phone => '+9647501234599') $$,
  '42501', 'permission_denied', 'a trainer can''t change members'
);
select is(tests.rows_changed($$ update public.members set full_name = 'ناوی تر' where id = '10000000-0000-4000-8000-000000000001' $$), 0,
  'not even directly');

-- set_member_status() ----------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.set_member_status('10000000-0000-4000-8000-000000000001', 'suspended', 'تاقیکردنەوە') $$,
  '42501', 'permission_denied', 'a receptionist can''t suspend a member (members.delete)'
);
select throws_ok(
  $$ update public.members set status = 'banned', status_reason = 'تاقیکردنەوە' where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501', 'permission_denied', 'not even directly'
);

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.set_member_status('10000000-0000-4000-8000-000000000001', 'suspended') $$,
  '23514', 'reason_required', 'suspending needs a reason'
);
select results_eq(
  $$ select status, status_reason, status_changed_by = tests.staff('manager_a'), status_changed_at is not null
       from public.set_member_status('10000000-0000-4000-8000-000000000001', 'suspended', 'پێشێلکردنی یاساکانی جیم') $$,
  $$ values ('suspended'::text, 'پێشێلکردنی یاساکانی جیم'::text, true, true) $$,
  'a branch manager suspends a member, with the reason, who and when'
);
update public.members set status_changed_at = '2000-01-01', status_changed_by = null
 where id = '10000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select status_changed_at > '2000-01-01', status_changed_by = tests.staff('manager_a')
       from public.members where id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values (true, true) $$,
  'who changed the status, and when, can''t be rewritten'
);
select is(
  tests.error_code($$ select public.set_member_status('10000000-0000-4000-8000-000000000001', 'expired', 'تاقیکردنەوە') $$),
  '23514', 'expired and frozen are never stored: they come from the subscriptions'
);
select lives_ok(
  $$ select public.set_member_status('10000000-0000-4000-8000-000000000007', 'archived', 'گواستییەوە بۆ شارێکی تر') $$,
  'a member is archived, never deleted'
);
select throws_ok(
  $$ select public.update_member(p_id => '10000000-0000-4000-8000-000000000007', p_branch_id => tests.branch('B901'),
       p_full_name => 'ژیلا مستەفا', p_gender => 'female', p_phone => '+9647801000033') $$,
  '42501', 'member_archived', 'an archived member can''t be changed'
);
select throws_ok(
  $$ insert into public.member_health (id, injuries) values ('10000000-0000-4000-8000-000000000007', 'ئازاری پشت') $$,
  '42501', 'member_archived', 'nor their health info'
);
select is(tests.rows_changed('delete from public.members'), 0, 'nobody deletes members');

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'ژیلا مستەفا', p_gender => 'female', p_phone => '+9647801000003') $$,
  '23505', 'phone_in_use', 'an archived member keeps their phone: they are restored, not added again'
);

-- find_member_duplicates() -----------------------------------------------------------------------

select results_eq(
  $$ select id, match from public.find_member_duplicates(p_phone => '+9647801000001') $$,
  $$ values ('10000000-0000-4000-8000-000000000005'::uuid, 'phone'::text) $$,
  'the same phone number'
);
select results_eq(
  $$ select id, match from public.find_member_duplicates(p_full_name => 'كوران  رەشيد') $$,
  $$ values ('10000000-0000-4000-8000-000000000005'::uuid, 'same_name'::text) $$,
  'the same name typed on an Arabic keyboard'
);
select results_eq(
  $$ select id, match from public.find_member_duplicates(p_full_name => 'شیلان ئەحمەد') $$,
  $$ values ('10000000-0000-4000-8000-000000000006'::uuid, 'similar_name'::text) $$,
  'the same first two words'
);
select results_eq(
  $$ select id, match, status from public.find_member_duplicates(p_full_name => 'ژیلا مستفا') $$,
  $$ values ('10000000-0000-4000-8000-000000000007'::uuid, 'similar_name'::text, 'archived'::text) $$,
  'a name one letter apart, archived members included'
);
select is_empty(
  $$ select * from public.find_member_duplicates(p_full_name => 'هێمن جەلال', p_phone => '+9647801000099') $$,
  'different names and phones are no duplicates'
);
select is_empty(
  $$ select * from public.find_member_duplicates('گۆران ڕەشید', '+9647801000001', '10000000-0000-4000-8000-000000000005') $$,
  'a member is never their own duplicate (editing)'
);
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is_empty(
  $$ select * from public.find_member_duplicates('گۆران ڕەشید', '+9647801000001') $$,
  'another gym''s members are never duplicates'
);

-- search_members() -------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is((select id from public.search_members('كوران') limit 1), '10000000-0000-4000-8000-000000000005'::uuid,
  'a Kurdish name typed on an Arabic keyboard is found');
select is_empty(
  $$ select q from unnest(array['0780 100 0001', '+964 780 100 0001', '٠٧٨٠١٠٠٠٠٠١', '7801000001']) as q
      where (select id from public.search_members(q) limit 1) is distinct from '10000000-0000-4000-8000-000000000005' $$,
  'a phone number is found however it is typed'
);
select is_empty(
  $$ select q from unnest(array['5', '000005', '٥']) as q
      where (select id from public.search_members(q) limit 1) is distinct from '10000000-0000-4000-8000-000000000005' $$,
  'the member with that number comes first, before names that sort earlier and phones with that digit'
);
select is((select id from public.search_members('ئارام کەریم عومەر') limit 1), '10000000-0000-4000-8000-000000000001'::uuid,
  'the search follows name changes');
select is((select id from public.search_members('0770 123 4567') limit 1), '10000000-0000-4000-8000-000000000002'::uuid,
  'a member without a phone of their own is found by their emergency contact''s');
select is_empty($$ select * from public.search_members('ژیلا مستەفا') $$, 'archived members are left out');
select is((select id from public.search_members('ژیلا مستەفا', p_include_archived => true) limit 1),
  '10000000-0000-4000-8000-000000000007'::uuid, 'unless asked for');
select is_empty($$ select * from public.search_members('   ') $$, 'an empty search finds nothing');
select is((select count(*)::integer from public.search_members('کەریم', 1)), 1, 'the limit applies');

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select results_eq(
  $$ select id from public.search_members('0750 123 4567') $$,
  $$ values ('20000000-0000-4000-8000-000000000001'::uuid) $$,
  'a search only finds the staff member''s own gym''s members'
);
select tests.authenticate_as(tests.staff('no_members_a'));
select is_empty($$ select * from public.search_members('کەریم') $$, 'and nothing without members.view');

-- Read-only and locked gyms ----------------------------------------------------------------------

select tests.clear_authentication();
update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.create_member(p_id => '10000000-0000-4000-8000-000000000009', p_branch_id => tests.branch('B901'),
       p_full_name => 'شوان ڕەشید', p_gender => 'male', p_phone => '+9647501230009') $$,
  '42501', 'gym_read_only', 'a read-only gym adds no members'
);
select throws_ok(
  $$ select public.update_member(p_id => '10000000-0000-4000-8000-000000000005', p_branch_id => tests.branch('B901'),
       p_full_name => 'گۆران ڕەشید', p_gender => 'male', p_phone => '+9647801000001') $$,
  '42501', 'gym_read_only', 'and changes none'
);
select is(tests.visible_rows('members', tests.gym('pgtap-a')), 7, 'but its staff still see them');
select tests.clear_authentication();
update public.gyms set suspended_at = null, locked_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('reception_a'));
select is(tests.visible_rows('members', tests.gym('pgtap-a')), 0, 'a locked gym''s staff see no members');
select tests.clear_authentication();
update public.gyms set locked_at = null where id = tests.gym('pgtap-a');

-- Restoring --------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select status, status_reason from public.set_member_status('10000000-0000-4000-8000-000000000001', 'active') $$,
  $$ values ('active'::text, null::text) $$,
  'a branch manager makes a member active again (no reason needed)'
);
select results_eq(
  $$ select status from public.set_member_status('10000000-0000-4000-8000-000000000007', 'active') $$,
  $$ values ('active'::text) $$,
  'and restores an archived member'
);

select tests.clear_authentication();
select ok(
  exists (select 1 from public.audit_logs
           where table_name = 'members' and row_id = '10000000-0000-4000-8000-000000000001'
             and action = 'update' and actor_id = tests.staff('reception_a') and 'full_name' = any (changed_columns)),
  'member changes go into the audit log with who made them'
);

-- The rules the app shares (packages/core) -------------------------------------------------------

select results_eq(
  $$ select app.normalize_search_text(t) from unnest(array[
       'ڕێباز كەريم', 'كوران', 'جـيمُ', 'ون‌بوو', 'Gym ٢٠٢٦', '۰۷۵۰', E'  ئارام \t  کەریم ', 'هەڤاڵ']) with ordinality as x (t, n)
      order by n $$,
  $$ values ('ریباز کەریم'::text), ('کوران'), ('جیم'), ('ونبوو'), ('gym 2026'), ('0750'), ('ئارام کەریم'), ('ەەفال') $$,
  'app.normalize_search_text() normalizes like normalizeSearchText()'
);
select results_eq(
  $$ select app.member_search_needle(q) from unnest(array['0750 123 4567', '+964 750-123', '٠٠٠١٢٣', '  ڕێباز  كەريم ', '   ']) with ordinality as x (q, n)
      order by n $$,
  $$ values ('07501234567'::text), ('964750123'), ('000123'), ('ریباز کەریم'), ('') $$,
  'app.member_search_needle() is memberSearchNeedle()'
);
select is_empty(
  $$ select p from unnest(array['+9647501234567', '+905321234567', null]) as p where not app.is_valid_member_phone(p) $$,
  'stored Iraqi mobiles and foreign numbers are valid phones'
);
select is_empty(
  $$ select p from unnest(array['+96412345678', '07501234567', '+964 750 123 4567', '+0123456789', '+1234567', '+1234567890123456']) as p
      where app.is_valid_member_phone(p) $$,
  'other forms are not'
);

select * from finish();
rollback;
