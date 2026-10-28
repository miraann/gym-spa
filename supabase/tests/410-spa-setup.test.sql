-- Step 6a: the spa's setup. Services (gym-wide), rooms and therapists (per branch) with their
-- services and weekly hours, guest profiles, the spa settings, and who may do what.
begin;
select plan(44);
select tests.create_fixture();
select tests.create_staff('therapist_a', 'spa_therapist', array['B901']);
select tests.create_platform_admin('ali@clickgroup.example');

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('41000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- Services ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is((public.save_spa_service(pg_temp.id(1), 'مەساژی تەواوی لەش', 'massage', 60, 30000)).duration_minutes, 60,
  'the Owner adds a massage of 60 minutes');
select is((public.save_spa_service(pg_temp.id(2), 'ساونا', 'sauna', 30, 10000, p_cleanup_minutes => 10,
  p_needs_therapist => false)).needs_therapist, false, 'and a sauna without a therapist');
select is((public.save_spa_service(pg_temp.id(1), 'مەساژی تەواوی لەش', 'massage', 60, 35000, p_gender => 'female')).price,
  35000.00, 'a service is changed by saving it again');
select throws_ok($$ select public.save_spa_service(gen_random_uuid(), 'مەساژ', 'massage', 500, 1000) $$,
  '22023', 'invalid_spa_service', 'at most 480 minutes');
select throws_ok($$ select public.save_spa_service(gen_random_uuid(), 'مەساژ', 'massage', 60, 1000.5) $$,
  '22023', 'invalid_spa_service', 'whole dinars');
select throws_ok($$ select public.save_spa_service(gen_random_uuid(), 'مەساژ', 'yoga', 60, 1000) $$,
  '22023', 'invalid_spa_service', 'one of the kinds');
select throws_ok($$ insert into public.spa_services (id, name_ckb, kind, duration_minutes, price)
                    values (gen_random_uuid(), 'مەساژ', 'massage', 60, 1000) $$,
  '42501', null, 'nobody writes services directly');

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select public.save_spa_service(pg_temp.id(9), 'مەساژ', 'massage', 30, 5000);
select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select public.save_spa_service(pg_temp.id(9), 'مەساژ', 'massage', 30, 1) $$,
  '42501', 'permission_denied', 'another gym''s service can''t be changed');

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.save_spa_service(gen_random_uuid(), 'مەساژ', 'massage', 60, 1000) $$,
  '42501', 'permission_denied', 'reception can''t change services (spa.manage)');
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.spa_services), 2, 'everyone in the gym sees its services, and only them');

-- Rooms ---------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('manager_a'));
select is((public.save_spa_room(pg_temp.id(11), tests.branch('B901'), 'ژووری ١', 'massage')).capacity, 1,
  'a branch manager adds a massage room for one');
select is((public.save_spa_room(pg_temp.id(12), tests.branch('B901'), 'ساونا', 'sauna', 6)).capacity, 6,
  'and a sauna for six');
select throws_ok($$ select public.save_spa_room(gen_random_uuid(), tests.branch('B901'), 'ژووری ١', 'massage') $$,
  '23505', 'spa_room_name_taken', 'a name is used once in a branch');
select throws_ok($$ select public.save_spa_room(gen_random_uuid(), tests.branch('B901'), 'ژووری ٢', 'massage', 25) $$,
  '22023', 'invalid_spa_room', 'at most 20 places');
select throws_ok($$ select public.save_spa_room(gen_random_uuid(), tests.branch('B902'), 'ژووری ٢', 'massage') $$,
  '42501', 'no_branch_access', 'only in their own branches');
select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select public.save_spa_room(pg_temp.id(11), tests.branch('B902'), 'ژووری ١', 'massage') $$,
  '42501', 'permission_denied', 'a room never moves to another branch');
select is((public.save_spa_room(pg_temp.id(11), tests.branch('B901'), 'ژووری ١', 'massage', p_is_active => false)).is_active,
  false, 'it is made inactive instead of removed');

select tests.authenticate_as(tests.staff('reception_b'));
select is((select count(*)::integer from public.spa_rooms), 0, 'reception sees only their branches'' rooms');
select tests.authenticate_as(tests.staff('trainer_ab'));
select is((select count(*)::integer from public.spa_rooms), 0, 'a trainer sees no rooms (spa.view)');
select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.spa_rooms), 2, 'reception of the branch sees them');

-- Therapists ----------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('manager_a'));
select is((public.save_spa_therapist(pg_temp.id(21), tests.branch('B901'), 'ڕۆژان عەلی', 'female',
  array[pg_temp.id(1), pg_temp.id(2)],
  '[{"weekday": 1, "from": "09:00", "until": "13:00"}, {"weekday": 1, "from": "16:00", "until": "24:00"},
    {"weekday": 3, "from": "10:00", "until": "18:00"}]', p_phone => '+9647504100001',
  p_staff_user_id => tests.staff('therapist_a'), p_commission_percent => 12.5)).commission_percent,
  12.50, 'a therapist is added with a commission');
select is((select count(*)::integer from public.spa_therapist_hours where therapist_id = pg_temp.id(21)), 3,
  'with their working hours, until midnight too');
select is((select count(*)::integer from public.spa_therapist_services where therapist_id = pg_temp.id(21)), 2,
  'and the services they do');
create temporary table first_hours as select id from public.spa_therapist_hours where therapist_id = pg_temp.id(21);
grant select on first_hours to authenticated;
select public.save_spa_therapist(pg_temp.id(21), tests.branch('B901'), 'ڕۆژان عەلی', 'female', array[pg_temp.id(1)],
  '[{"weekday": 1, "from": "09:00", "until": "13:00"}, {"weekday": 1, "from": "16:00", "until": "24:00"},
    {"weekday": 3, "from": "10:00", "until": "18:00"}]', p_phone => '+9647504100001',
  p_staff_user_id => tests.staff('therapist_a'), p_commission_percent => 12.5);
select is((select array_agg(service_id) from public.spa_therapist_services where therapist_id = pg_temp.id(21)),
  array[pg_temp.id(1)], 'saving again with fewer services takes the others away');
select set_eq($$ select id from public.spa_therapist_hours where therapist_id = pg_temp.id(21) $$,
  $$ select id from first_hours $$, 'and the same hours stay as they are');

select throws_ok($$ select public.save_spa_therapist(gen_random_uuid(), tests.branch('B901'), 'دانا', 'male', '{}',
  '[{"weekday": 2, "from": "09:00", "until": "13:00"}, {"weekday": 2, "from": "12:00", "until": "15:00"}]') $$,
  '22023', 'invalid_hours', 'windows of one day don''t overlap');
select throws_ok($$ select public.save_spa_therapist(gen_random_uuid(), tests.branch('B901'), 'دانا', 'male', '{}',
  '[{"weekday": 8, "from": "09:00", "until": "13:00"}]') $$,
  '22023', 'invalid_hours', 'a weekday is 1 to 7');
select throws_ok($$ select public.save_spa_therapist(gen_random_uuid(), tests.branch('B901'), 'دانا', 'male', '{}',
  '[{"weekday": 2, "from": "9am", "until": "13:00"}]') $$,
  '22023', 'invalid_hours', 'a time is HH:MM');
select throws_ok($$ select public.save_spa_therapist(gen_random_uuid(), tests.branch('B901'), 'دانا', 'male',
  array[pg_temp.id(9)], '[]') $$,
  'P0002', 'spa_service_not_found', 'another gym''s service isn''t theirs to do');
select throws_ok($$ select public.save_spa_therapist(gen_random_uuid(), tests.branch('B901'), 'دانا', 'male', '{}', '[]',
  p_staff_user_id => tests.staff('owner', 'pgtap-b')) $$,
  'P0002', 'staff_not_found', 'nor another gym''s staff login');
select throws_ok($$ select public.save_spa_therapist(gen_random_uuid(), tests.branch('B901'), 'دانا', 'male', '{}', '[]',
  p_staff_user_id => tests.staff('therapist_a')) $$,
  '23505', 'staff_already_therapist', 'one therapist per staff login');
select throws_ok($$ select public.save_spa_therapist(pg_temp.id(21), tests.branch('B902'), 'ڕۆژان عەلی', 'female', '{}', '[]') $$,
  '42501', 'no_branch_access', 'a branch manager can''t move a therapist to another branch');

select tests.authenticate_as(tests.staff('therapist_a'));
select is((select full_name from public.spa_therapists), 'ڕۆژان عەلی', 'a therapist sees the therapists of their branch');
select throws_ok($$ select public.save_spa_therapist(gen_random_uuid(), tests.branch('B901'), 'دانا', 'male', '{}', '[]') $$,
  '42501', 'permission_denied', 'but changes none (spa.manage)');

-- Guests --------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is((public.create_guest(pg_temp.id(31), tests.branch('B901'), 'میوانی سپا', 'female', '+9647504100031')).is_guest,
  true, 'reception adds a guest');
select ok((select member_number > 0 from public.members where id = pg_temp.id(31)), 'who has a number like everyone');
select throws_ok($$ select public.create_guest(gen_random_uuid(), tests.branch('B901'), 'میوان', 'female', '+9647504100031') $$,
  '23505', 'phone_in_use', 'a phone already in the gym belongs to that person');
select throws_ok($$ select public.create_guest(gen_random_uuid(), tests.branch('B901'), 'میوان', 'female', null) $$,
  '22023', 'invalid_guest', 'a guest has a phone');
select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select public.create_guest(gen_random_uuid(), tests.branch('B901'), 'میوان', 'male', '+9647504100032') $$,
  '42501', 'permission_denied', 'adding a guest needs spa.book');

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => pg_temp.id(32), p_branch_id => tests.branch('B901'), p_full_name => 'ئەندام',
  p_gender => 'male', p_phone => '+9647504100033');
select throws_ok($$ update public.members set is_guest = true where id = pg_temp.id(32) $$,
  '42501', 'read_only_column', 'a member is never made a guest');
select is((public.make_guest_member(pg_temp.id(31))).is_guest, false, 'the Owner makes the guest a member');

select tests.clear_authentication();
insert into public.members (id, gym_id, branch_id, full_name, gender, phone, is_guest)
values (pg_temp.id(33), tests.gym('pgtap-a'), tests.branch('B901'), 'میوان', 'male', '+9647504100034', true);
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select is((select members from public.seller_member_counts(tests.gym('pgtap-a'))), 2,
  'the seller''s member counts leave guests out');

-- Settings ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select lives_ok($$ insert into public.settings (branch_id, key, value) values (null, 'spa.slot_minutes', '30') $$,
  'the calendar''s step is a setting');
select throws_ok($$ insert into public.settings (branch_id, key, value) values (null, 'spa.calendar_until_hour', '25') $$,
  '23514', null, 'and its hours are hours');

select * from finish();
rollback;
