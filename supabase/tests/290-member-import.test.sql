-- Importing members (step 2j, migration 20261023100000): duplicate names as the app compares them,
-- the preview's check against existing members, and import_members(): all or nothing, the same rules
-- as one new member, a transaction mark nobody else can make, and 5,000 rows within the cloud's
-- statement timeout.
begin;
select plan(41);
select tests.create_fixture();

-- Names: the cases app.member_names_match() and memberNamesMatch() in packages/core share
-- (packages/core/src/member-import.test.ts reads this list).
create temporary table name_cases (a text, b text, expected text);
insert into name_cases (a, b, expected) values
  ('ڕێباز عومەر', 'ريباز عمر ئەحمەد', 'similar_name'),
  ('ئارام کەریم محەمەد', 'ئارام كەريم محەمەد', 'same_name'),
  ('بێستون قادر', 'بێستونقادر', 'same_name'),
  ('شیلان عەلی حەسەن', 'شیلان عەلی', 'similar_name'),
  ('هێمن جەلال', 'هەمن جەلال', 'similar_name'),
  ('ئارام کەریم', 'شیلان عەلی', null),
  ('دیلان کاروان ئیبراهیم', 'کاروان ئیبراهیم', null),
  ('Daban Hiwa', 'daban hiwa', 'same_name'),
  ('Daban Hiwa', 'Daban Hewa', 'similar_name'),
  ('ئا', 'ئا', null),
  ('ئارام', 'ئاڕام', 'same_name'),
  ('گۆران حەمە سەعید', 'گوران حمە سعید', 'similar_name'),
  ('سەروەر حەمە', 'سەرۆک حەمە', null),
  ('محەمەد ئەحمەد', 'محمد احمد', 'similar_name'),
  ('ئیبراهیم کەریم', 'ابراهيم كريم', 'similar_name'),
  ('سۆران ڕەشید', 'سوران رشيد', 'similar_name'),
  ('هاوڕێ', 'هاوڕێ ئەحمەد', null),
  ('کاروان ئیبراهیم', 'پەیمان ئازاد', null);
grant select on name_cases to authenticated;

select is_empty(
  $$ select a, b, expected, app.member_names_match(a, b) as got from name_cases
      where app.member_names_match(a, b) is distinct from expected
         or app.member_names_match(b, a) is distinct from expected $$,
  'app.member_names_match() gives every shared case, both ways round'
);

-- The details of a refused import.
create function tests.import_refusal(statement text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  detail text;
begin
  execute statement;
  return null;
exception
  when others then
    get stacked diagnostics detail = pg_exception_detail;
    return detail::jsonb;
end
$$;

-- Members and cards the checks find --------------------------------------------------------------

insert into public.members (id, gym_id, branch_id, full_name, gender, phone) values
  ('29000000-0000-4000-8000-000000000001', tests.gym('pgtap-a'), tests.branch('B901'), 'ڕێباز عومەر', 'male', '+9647502900001'),
  ('29000000-0000-4000-8000-000000000002', tests.gym('pgtap-a'), tests.branch('B901'), 'لانا کەمال', 'female', '+9647502900002');
select tests.create_branch('B903');
update public.branches set is_active = false where id = tests.branch('B903');
select tests.create_role('هێنانی ئەندامان', array['members.import', 'members.create', 'members.view']);
select tests.create_staff('importer_a', (select id::text from public.roles where name_ckb = 'هێنانی ئەندامان'), array['B901']);

select tests.authenticate_as(tests.staff('owner'));
select public.assign_card('29000000-0000-4000-8000-0000000000c1', '29000000-0000-4000-8000-000000000002', '04A0000000AA01');
select public.assign_card('29000000-0000-4000-8000-0000000000c2', '29000000-0000-4000-8000-000000000001', '04B0000000BB02');
select public.replace_card('29000000-0000-4000-8000-0000000000c2', 'stolen');

-- check_member_import() ---------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select * from public.check_member_import('[]') $$,
  '42501', 'permission_denied', 'checking an import needs members.import'
);

select tests.authenticate_as(tests.staff('owner'));
select results_eq(
  $$ select "row", match, member_id from public.check_member_import(jsonb_build_array(
       jsonb_build_object('row', 2, 'full_name', 'کەسێکی نوێ', 'phone', '+9647502900001'),
       jsonb_build_object('row', 3, 'full_name', 'کەسێکی تر', 'card', '04A0000000AA01'),
       jsonb_build_object('row', 4, 'full_name', 'کەسی سێیەم', 'card', '04B0000000BB02'),
       jsonb_build_object('row', 5, 'full_name', 'ريباز عمر ئەحمەد', 'phone', '+9647502900099'),
       jsonb_build_object('row', 6, 'full_name', 'پەیمان ئازاد', 'phone', '+9647502900098', 'card', '04C0000000CC03')
     )) $$,
  $$ values (2, 'phone'::text, '29000000-0000-4000-8000-000000000001'::uuid),
            (3, 'card_active', '29000000-0000-4000-8000-000000000002'),
            (4, 'card_blocked', '29000000-0000-4000-8000-000000000001'),
            (5, 'similar_name', '29000000-0000-4000-8000-000000000001') $$,
  'the check finds a member''s phone, a card someone has, a blocked card and a similar name'
);

-- The check's name rule is app.member_names_match(): every case, against members of gym B.
select tests.clear_authentication();
insert into public.members (id, gym_id, branch_id, full_name, gender, phone)
select gen_random_uuid(), tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), a.name, 'male',
       '+96475029' || lpad(row_number() over (order by a.name)::text, 5, '0')
  from (select distinct n.a as name from name_cases n) a;
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select results_eq(
  $$ with wanted as (select b, row_number() over (order by b)::integer as r from (select distinct b from name_cases) x)
     select c.match, m.full_name, w.b
       from public.check_member_import((select jsonb_agg(jsonb_build_object('row', w.r, 'full_name', w.b)) from wanted w)) c
       join wanted w on w.r = c."row"
       join public.members m on m.id = c.member_id
      order by 1, 2, 3 $$,
  $$ select app.member_names_match(n.b, m.full_name), m.full_name, n.b
       from (select distinct b from name_cases) n
       cross join public.members m
      where app.member_names_match(n.b, m.full_name) is not null
      order by 1, 2, 3 $$,
  'the check finds exactly the names app.member_names_match() says may be the same person'
);

-- import_members(): who may ------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.import_members(gen_random_uuid(), 'members.xlsx', jsonb_build_array(jsonb_build_object(
       'row', 2, 'id', gen_random_uuid(), 'branch_id', tests.branch('B901'), 'full_name', 'ئەندام', 'gender', 'male',
       'phone', '+9647502900200'))) $$,
  '42501', 'permission_denied', 'importing needs members.import'
);

select tests.authenticate_as(tests.staff('importer_a'));
select throws_ok(
  $$ select public.import_members(gen_random_uuid(), 'members.xlsx', jsonb_build_array(jsonb_build_object(
       'row', 2, 'id', gen_random_uuid(), 'branch_id', tests.branch('B901'), 'full_name', 'ئەندام', 'gender', 'male',
       'phone', '+9647502900201', 'card_id', gen_random_uuid(), 'card_uid', '04E0000000EE05'))) $$,
  '42501', 'permission_denied', 'giving cards in an import needs cards.manage'
);

-- All or nothing: every refused row at once, and nothing saved ------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is(
  tests.import_refusal($$ select public.import_members('29000000-0000-4000-8000-0000000000e1', 'members.xlsx', jsonb_build_array(
    jsonb_build_object('row', 2, 'id', '29000000-0000-4000-8000-000000000102', 'branch_id', tests.branch('B901'),
      'full_name', 'کەسێکی نوێ', 'gender', 'male', 'phone', '+9647502900001'),
    jsonb_build_object('row', 3, 'id', '29000000-0000-4000-8000-000000000103', 'branch_id', tests.branch('B901'),
      'full_name', 'ئەندامی سێ', 'gender', 'male', 'phone', '+9647502900050'),
    jsonb_build_object('row', 4, 'id', '29000000-0000-4000-8000-000000000104', 'branch_id', tests.branch('B901'),
      'full_name', 'ئەندامی چوار', 'gender', 'female', 'phone', '+9647502900050'),
    jsonb_build_object('row', 5, 'id', '29000000-0000-4000-8000-000000000105', 'branch_id', tests.branch('B901'),
      'full_name', 'ئەندامی پێنج', 'gender', 'x', 'phone', '+9647502900051'),
    jsonb_build_object('row', 6, 'id', '29000000-0000-4000-8000-000000000106', 'branch_id', tests.branch('B901'),
      'full_name', 'ئەندامی شەش', 'gender', 'male', 'phone', '+9647502900052',
      'card_id', '29000000-0000-4000-8000-0000000000c6', 'card_uid', '04A0000000AA01'),
    jsonb_build_object('row', 7, 'id', '29000000-0000-4000-8000-000000000107', 'branch_id', tests.branch('B901', 'pgtap-b'),
      'full_name', 'ئەندامی حەوت', 'gender', 'male', 'phone', '+9647502900053'),
    jsonb_build_object('row', 8, 'id', '29000000-0000-4000-8000-000000000108', 'branch_id', tests.branch('B903'),
      'full_name', 'ئەندامی هەشت', 'gender', 'male', 'phone', '+9647502900054'),
    jsonb_build_object('row', 9, 'id', '29000000-0000-4000-8000-000000000109', 'branch_id', tests.branch('B901'),
      'full_name', 'ئەندامی نۆ', 'gender', 'male', 'phone', '+9647502900055',
      'card_id', '29000000-0000-4000-8000-0000000000c9', 'card_uid', '04C0000000CC03'),
    jsonb_build_object('row', 10, 'id', '29000000-0000-4000-8000-000000000110', 'branch_id', tests.branch('B901'),
      'full_name', 'ئەندامی دە', 'gender', 'male', 'phone', '+9647502900056',
      'card_id', '29000000-0000-4000-8000-0000000000ca', 'card_uid', '04C0000000CC03'),
    jsonb_build_object('row', 11, 'id', '29000000-0000-4000-8000-000000000111', 'branch_id', tests.branch('B901'),
      'full_name', 'ئەندامی یازدە', 'gender', 'male', 'phone', '+9647502900057', 'birth_date', '2999-01-01')
  )) $$),
  '[{"row": 2, "key": "phone_in_use"}, {"row": 4, "key": "phone_repeated"}, {"row": 5, "key": "invalid_row"},
    {"row": 6, "key": "card_in_use"}, {"row": 7, "key": "no_branch_access"}, {"row": 8, "key": "branch_inactive"},
    {"row": 10, "key": "card_repeated"}, {"row": 11, "key": "invalid_row"}]'::jsonb,
  'an import with refused rows lists every one of them, with its reason'
);
select is(
  (select count(*)::integer from public.members where full_name like 'ئەندامی %' or full_name = 'کەسێکی نوێ'),
  0,
  'and saves none of its rows, not even the good ones'
);

-- A real import ---------------------------------------------------------------------------------

select lives_ok(
  $$ select public.import_members('29000000-0000-4000-8000-0000000000e2', 'ئەندامان.xlsx', jsonb_build_array(
       jsonb_build_object('row', 2, 'id', '29000000-0000-4000-8000-000000000202', 'branch_id', tests.branch('B901'),
         'full_name', 'نەوزاد ئەحمەد', 'gender', 'male', 'phone', '+9647502900101', 'birth_date', '1990-05-05',
         'joined_on', '2024-03-01', 'blood_type', 'A+', 'medical_notes', 'ئازاری ئەژنۆ',
         'card_id', '29000000-0000-4000-8000-0000000000d2', 'card_uid', '04D0000000DD04',
         'kept', jsonb_build_object('oldNumber', '7', 'subscriptionType', 'مانگانە', 'subscriptionEnd', '2026-11-01')),
       jsonb_build_object('row', 3, 'id', '29000000-0000-4000-8000-000000000203', 'branch_id', tests.branch('B901'),
         'full_name', 'دیلان نەوزاد', 'gender', 'female', 'emergency_contact_name', 'نەوزاد',
         'emergency_phone', '+9647502900101', 'kept', jsonb_build_object('oldNumber', '8')),
       jsonb_build_object('row', 4, 'id', '29000000-0000-4000-8000-000000000204', 'branch_id', tests.branch('B902'),
         'full_name', 'سارا جەمال', 'gender', 'female', 'phone', '+905321234567')
     )) $$,
  'the Owner imports three members, one with health info, a card and kept columns'
);
select results_eq(
  $$ select full_name, member_number, status, (created_at at time zone 'Asia/Baghdad')::date
       from public.members where id in ('29000000-0000-4000-8000-000000000202',
         '29000000-0000-4000-8000-000000000203', '29000000-0000-4000-8000-000000000204')
      order by member_number $$,
  $$ values ('نەوزاد ئەحمەد'::text, 3, 'active'::text, date '2024-03-01'),
            ('دیلان نەوزاد', 4, 'active', (now() at time zone 'Asia/Baghdad')::date),
            ('سارا جەمال', 5, 'active', (now() at time zone 'Asia/Baghdad')::date) $$,
  'the members get the gym''s next numbers in the file''s order, and the registration date when given'
);
select results_eq(
  $$ select h.blood_type, h.medical_notes, m.has_health_notes from public.member_health h
       join public.members m on m.id = h.id where h.id = '29000000-0000-4000-8000-000000000202' $$,
  $$ values ('A+'::text, 'ئازاری ئەژنۆ'::text, true) $$,
  'their health info is saved, and the member shows that there are health notes'
);
select results_eq(
  $$ select uid, status from public.nfc_cards where member_id = '29000000-0000-4000-8000-000000000202' $$,
  $$ values ('04D0000000DD04'::text, 'active'::text) $$,
  'their card works'
);
select results_eq(
  $$ select file_name, member_count, card_count, kept -> '29000000-0000-4000-8000-000000000202' ->> 'oldNumber',
            kept -> '29000000-0000-4000-8000-000000000203' ->> 'oldNumber', created_by
       from public.member_imports where id = '29000000-0000-4000-8000-0000000000e2' $$,
  $$ values ('ئەندامان.xlsx'::text, 3, 1, '7'::text, '8'::text, tests.staff('owner')) $$,
  'the import is recorded, with the columns kept for later per member'
);
select is(
  (select count(*)::integer from public.members where import_id = '29000000-0000-4000-8000-0000000000e2'),
  3,
  'each member records the import that added it'
);
select is(
  (select count(*)::integer from public.audit_logs
    where table_name = 'members' and action = 'insert' and actor_id = tests.staff('owner')
      and row_id in ('29000000-0000-4000-8000-000000000202', '29000000-0000-4000-8000-000000000203',
                     '29000000-0000-4000-8000-000000000204')),
  3,
  'the audit log records each new member and who imported it'
);
select is(
  (select (public.import_members('29000000-0000-4000-8000-0000000000e2', 'ئەندامان.xlsx', '[]')).member_count),
  3,
  'the same import again (a retry after a lost answer) returns the saved import'
);
select is(
  (select count(*)::integer from public.members where full_name in ('نەوزاد ئەحمەد', 'دیلان نەوزاد', 'سارا جەمال')),
  3,
  'and adds nobody twice'
);

-- Health info without members.medical.view, as when adding one member -----------------------------

select tests.authenticate_as(tests.staff('importer_a'));
select lives_ok(
  $$ select public.import_members(gen_random_uuid(), 'members.csv', jsonb_build_array(jsonb_build_object(
       'row', 2, 'id', '29000000-0000-4000-8000-000000000302', 'branch_id', tests.branch('B901'),
       'full_name', 'هەڵاڵە سەردار', 'gender', 'female', 'phone', '+9647502900301', 'blood_type', 'O-',
       'medical_notes', 'نەخۆشیی شەکرە'))) $$,
  'staff who may import but not read health info can still import it'
);
select is(
  (select count(*)::integer from public.member_health where id = '29000000-0000-4000-8000-000000000302'),
  0,
  'and can''t read it afterwards'
);
select tests.clear_authentication();
select is(
  (select blood_type from public.member_health where id = '29000000-0000-4000-8000-000000000302'),
  'O-',
  'it was saved'
);

-- Only import_members() writes an import ----------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select throws_ok(
  $$ insert into public.member_imports (id, file_name, member_count, kept)
     values (gen_random_uuid(), 'fake.xlsx', 1, jsonb_build_object('29000000-0000-4000-8000-000000000001', jsonb_build_object('oldNumber', '1'))) $$,
  '42501', 'permission_denied', 'nobody adds an import record by hand (it would show old numbers on profiles)'
);
select throws_ok(
  $$ select app.reserve_member_numbers(tests.gym('pgtap-a'), 10) $$,
  '42501', null, 'member numbers are reserved only by import_members()'
);
select is(
  (select count(*)::integer from public.member_imports
    where id not in ('29000000-0000-4000-8000-0000000000e2')),
  1,
  'staff who may see members see the gym''s imports'
);

-- Only import_members() marks its transaction ----------------------------------------------------
-- The member triggers skip their checks only while app.member_import_marks has a row for the
-- transaction. A session with SQL (app users have none: they reach the database through the Data
-- API only) tries the old setting, the marks table and other ways in, and every check still runs.

select tests.clear_authentication();
select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'app' and table_name = 'member_import_marks'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')),
  0,
  'no API role has any right on the import marks'
);

select tests.authenticate_as(tests.staff('importer_a'));
select set_config('app.importing_members', '29000000-0000-4000-8000-0000000000e2', true);
select is(app.is_importing(), false, 'a setting doesn''t mark the transaction');
select throws_ok(
  $$ insert into app.member_import_marks (xact, import_id)
     values (pg_current_xact_id(), '29000000-0000-4000-8000-0000000000e2') $$,
  '42501', null, 'and staff can''t write a mark themselves'
);
select lives_ok(
  $$ insert into public.members (id, gym_id, branch_id, member_number, full_name, gender, phone,
       has_health_notes, import_id)
     values ('29000000-0000-4000-8000-000000000501', tests.gym('pgtap-a'), tests.branch('B901'), 99999,
       'ئەندامی دەستی', 'female', '+9647502900501', true, '29000000-0000-4000-8000-0000000000e2') $$,
  'a member added directly with the old setting is saved as any new member'
);
select results_eq(
  $$ select member_number <> 99999, has_health_notes, import_id from public.members
      where id = '29000000-0000-4000-8000-000000000501' $$,
  $$ values (true, false, null::uuid) $$,
  'with the server''s number, no health flag and no import'
);
select throws_ok(
  $$ insert into public.member_health (id, gym_id, medical_notes)
     values ('29000000-0000-4000-8000-000000000001', tests.gym('pgtap-a'), 'نووسراوی دەستی') $$,
  '42501', 'permission_denied', 'health info for an existing member is still refused'
);

select tests.authenticate_as(tests.staff('owner'));
select set_config('app.importing_members', '29000000-0000-4000-8000-0000000000e2', true);
select throws_ok(
  $$ insert into public.members (id, gym_id, branch_id, full_name, gender, phone)
     values (gen_random_uuid(), tests.gym('pgtap-a'), tests.branch('B903'), 'ئەندامی لقی داخراو', 'male',
       '+9647502900502') $$,
  '23514', 'branch_inactive', 'a member in an inactive branch is still refused'
);
select throws_ok(
  $$ update public.members set import_id = '29000000-0000-4000-8000-0000000000e2'
      where id = '29000000-0000-4000-8000-000000000001' $$,
  '42501', 'read_only_column', 'a member can''t be tied to an import afterwards'
);
select throws_ok(
  $$ insert into public.member_imports (id, file_name, member_count)
     values ('29000000-0000-4000-8000-0000000000e3', 'fake.xlsx', 1) $$,
  '42501', 'permission_denied', 'nor can an import be recorded by hand'
);
select set_config('app.importing_members', '', true);

select lives_ok(
  $$ select public.import_members(gen_random_uuid(), 'one.csv', jsonb_build_array(jsonb_build_object(
       'row', 2, 'id', '29000000-0000-4000-8000-000000000503', 'branch_id', tests.branch('B901'),
       'full_name', 'ئاسۆ کامەران', 'gender', 'male', 'phone', '+9647502900503'))) $$,
  'an import earlier in the transaction'
);
select is(app.is_importing(), false, 'removes its mark before it returns');
select throws_ok(
  $$ insert into public.members (id, gym_id, branch_id, full_name, gender, phone)
     values (gen_random_uuid(), tests.gym('pgtap-a'), tests.branch('B903'), 'ئەندامی دوای هێنان', 'male',
       '+9647502900504') $$,
  '23514', 'branch_inactive', 'so whatever comes after it is checked again'
);

-- import_members() sees every gym (security definer), and still compares with the caller's only.
select tests.clear_authentication();
insert into public.members (id, gym_id, branch_id, full_name, gender, phone) values
  ('29000000-0000-4000-8000-000000000601', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'),
   'شوان کەریم', 'male', '+9647502900601');
select tests.authenticate_as(tests.staff('owner'));
select lives_ok(
  $$ select public.import_members(gen_random_uuid(), 'two.csv', jsonb_build_array(jsonb_build_object(
       'row', 2, 'id', gen_random_uuid(), 'branch_id', tests.branch('B901'),
       'full_name', 'شوان کەریم', 'gender', 'male', 'phone', '+9647502900601'))) $$,
  'another gym''s member with the same phone doesn''t stop an import'
);
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select throws_ok(
  $$ select public.import_members('29000000-0000-4000-8000-0000000000e2', 'ئەندامان.xlsx', jsonb_build_array(
       jsonb_build_object('row', 2, 'id', gen_random_uuid(), 'branch_id', tests.branch('B901', 'pgtap-b'),
         'full_name', 'ئەندامی جیمی دووەم', 'gender', 'male', 'phone', '+9647502900602'))) $$,
  '23505', 'import_refused', 'and another gym''s import is never returned for the same id'
);

-- A read-only gym imports nothing -----------------------------------------------------------------

select tests.clear_authentication();
update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('owner'));
select throws_ok(
  $$ select public.import_members(gen_random_uuid(), 'members.xlsx', jsonb_build_array(jsonb_build_object(
       'row', 2, 'id', gen_random_uuid(), 'branch_id', tests.branch('B901'), 'full_name', 'ئەندامی نوێ', 'gender', 'male',
       'phone', '+9647502900401'))) $$,
  '42501', 'gym_read_only', 'a read-only gym imports nothing'
);
select set_config('app.importing_members', gen_random_uuid()::text, true);
select throws_ok(
  $$ insert into public.members (id, gym_id, branch_id, full_name, gender, phone)
     values (gen_random_uuid(), tests.gym('pgtap-a'), tests.branch('B901'), 'ئەندامی نوێ', 'male',
       '+9647502900402') $$,
  '42501', 'gym_read_only', 'nor adds a member directly with the old setting'
);
select set_config('app.importing_members', '', true);
select tests.clear_authentication();
update public.gyms set suspended_at = null where id = tests.gym('pgtap-a');

-- 5,000 rows within the cloud's statement timeout (8 s for staff), each with a card and health info
-- (the slowest kind of row).

create temporary table big_import as
select jsonb_agg(jsonb_build_object(
         'row', i + 2,
         'id', gen_random_uuid(),
         'branch_id', tests.branch('B901'),
         'full_name', (array['ئارام','شیلان','هێمن','ڤیان','کاروان','دیلان','سۆران','بەناز','گۆران','نیگار'])[1 + i % 10]
                      || ' ' || (array['کەریم','عەلی','عومەر','جەلال','سەردار','ئیبراهیم','ڕەشید','فاروق','حەمە','ئەنوەر'])[1 + (i / 10) % 10]
                      || ' ' || (array['محەمەد','ئەحمەد','حەسەن','قادر','کەمال'])[1 + (i / 100) % 5] || ' ' || i,
         'gender', case when i % 2 = 0 then 'male' else 'female' end,
         'phone', '+9647' || lpad((600000000 + i)::text, 9, '0'),
         'birth_date', (date '1980-01-01' + (i % 9000)),
         'joined_on', (date '2023-01-01' + (i % 600)),
         'blood_type', 'B+',
         'medical_notes', 'ئازاری پشت',
         'card_id', gen_random_uuid(),
         'card_uid', '05' || upper(lpad(to_hex(3000000 + i), 12, '0')),
         'kept', jsonb_build_object('oldNumber', (i + 1)::text)
       )) as rows
  from generate_series(0, 4999) i;
grant select on big_import to authenticated;

select tests.authenticate_as(tests.staff('owner'));
set local statement_timeout = '8s';
select lives_ok(
  $$ select public.import_members(gen_random_uuid(), 'big.xlsx', (select rows from big_import)) $$,
  '5,000 rows, each with a card and health info, are imported in one call within 8 s'
);
set local statement_timeout = 0;
select is(
  (select count(*)::integer from public.members where phone like '+96476%'),
  5000,
  'all 5,000 of them'
);

select * from finish();
rollback;
