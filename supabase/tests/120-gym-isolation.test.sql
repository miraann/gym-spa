-- Gyms are isolated (spec §2.6): no gym can read, add, change or delete another gym's rows, in any
-- table. The table list comes from the catalog (every table with gym_id), so new tables are covered
-- as soon as they exist; inserts need a case per table, and a test fails when one is missing.
begin;
select plan(29);
select tests.create_fixture();

-- Rows in every gym table of both gyms: settings, a device and its report, a PIN.
insert into public.settings (gym_id, branch_id, key, value) values
  (tests.gym('pgtap-a'), null, 'security.idle_lock_minutes', '15'),
  (tests.gym('pgtap-a'), tests.branch('B901'), 'security.idle_lock_minutes', '5'),
  (tests.gym('pgtap-b'), null, 'security.idle_lock_minutes', '20'),
  (tests.gym('pgtap-b'), null, 'security.pin_max_attempts', '3'),
  (tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'security.idle_lock_minutes', '5');
insert into public.devices (id, gym_id, branch_id, code, name, platform) values
  ('d0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), tests.branch('B901'), 'D01', 'کۆمپیوتەری پێشوازی', 'windows'),
  ('d0000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'D01', 'کۆمپیوتەری پێشوازی', 'windows');
insert into public.device_status (device_id, gym_id, last_seen_at, app_version) values
  ('d0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), now(), '0.1.0'),
  ('d0000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), now(), '0.1.0');
insert into public.staff_pins (staff_id, gym_id, pin_hash) values
  (tests.staff('reception_a'), tests.gym('pgtap-a'), extensions.crypt('482915', extensions.gen_salt('bf', 4))),
  (tests.staff('reception_a', 'pgtap-b'), tests.gym('pgtap-b'), extensions.crypt('482915', extensions.gen_salt('bf', 4)));
select tests.create_auth_user('new_b', 'pgtap-b');
insert into public.members (id, gym_id, branch_id, full_name, gender, phone) values
  ('e0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), tests.branch('B901'), 'ئارام کەریم', 'male', '+9647501234567'),
  ('e0000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'ئارام کەریم', 'male', '+9647501234567'),
  -- Without health info: what the cases below try to add it to.
  ('e0000000-0000-4000-8000-0000000000b2', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'شیلان عەلی', 'female', '+9647501234568');
insert into public.member_health (id, gym_id, injuries) values
  ('e0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), 'ئازاری ئەژنۆ'),
  ('e0000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), 'ئازاری ئەژنۆ');
insert into public.member_photos (id, gym_id, photo_type, photo, thumbnail_type, thumbnail) values
  ('e0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), 'image/jpeg', '/9j/4AAQSkZJRg==', 'image/jpeg', '/9j/4AAQSkZJRg=='),
  ('e0000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), 'image/jpeg', '/9j/4AAQSkZJRg==', 'image/jpeg', '/9j/4AAQSkZJRg==');
-- The same card UID in both gyms: UIDs are unique per gym.
insert into public.nfc_cards (id, gym_id, member_id, uid) values
  ('e0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a1', '04A23BC15D6E80'),
  ('e0000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1', '04A23BC15D6E80');
-- An import in each gym (only server code and import_members() add them).
insert into public.member_imports (id, gym_id, file_name, member_count) values
  ('e0000000-0000-4000-8000-0000000000a9', tests.gym('pgtap-a'), 'members.xlsx', 1),
  ('e0000000-0000-4000-8000-0000000000b9', tests.gym('pgtap-b'), 'members.xlsx', 1);
-- A plan in each gym, for one branch.
insert into public.plans (id, gym_id, name_ckb, kind, price, all_branches) values
  ('e0000000-0000-4000-8000-0000000000a3', tests.gym('pgtap-a'), 'VIP', 'unlimited', 0, false),
  ('e0000000-0000-4000-8000-0000000000b3', tests.gym('pgtap-b'), 'VIP', 'unlimited', 0, false);
insert into public.plan_branches (gym_id, plan_id, branch_id) values
  (tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a3', tests.branch('B901')),
  (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b3', tests.branch('B901', 'pgtap-b'));
-- A sale in each gym: the subscription, its invoice and item, a payment and an installment.
insert into public.subscriptions (id, gym_id, member_id, plan_id, branch_id, name_ckb, kind, price, gender,
                                  max_freeze_days, start_date) values
  ('e0000000-0000-4000-8000-0000000000a4', tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a1',
   'e0000000-0000-4000-8000-0000000000a3', tests.branch('B901'), 'VIP', 'unlimited', 0, 'any', 0, current_date),
  ('e0000000-0000-4000-8000-0000000000b4', tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
   'e0000000-0000-4000-8000-0000000000b3', tests.branch('B901', 'pgtap-b'), 'VIP', 'unlimited', 0, 'any', 0, current_date);
insert into public.invoices (id, gym_id, branch_id, member_id, number, subtotal, discount, total) values
  ('e0000000-0000-4000-8000-0000000000a5', tests.gym('pgtap-a'), tests.branch('B901'), 'e0000000-0000-4000-8000-0000000000a1',
   'B901-000001', 1000, 0, 1000),
  ('e0000000-0000-4000-8000-0000000000b5', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
   'B901-000001', 1000, 0, 1000);
insert into public.invoice_items (id, gym_id, invoice_id, kind, subscription_id, description_ckb, unit_price, total) values
  ('e0000000-0000-4000-8000-0000000000a6', tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a5', 'subscription',
   'e0000000-0000-4000-8000-0000000000a4', 'VIP', 1000, 1000),
  ('e0000000-0000-4000-8000-0000000000b6', tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b5', 'subscription',
   'e0000000-0000-4000-8000-0000000000b4', 'VIP', 1000, 1000);
insert into public.payments (id, gym_id, branch_id, member_id, invoice_id, number, method, amount) values
  ('e0000000-0000-4000-8000-0000000000a7', tests.gym('pgtap-a'), tests.branch('B901'), 'e0000000-0000-4000-8000-0000000000a1',
   'e0000000-0000-4000-8000-0000000000a5', 'B901-R000001', 'cash', 500),
  ('e0000000-0000-4000-8000-0000000000b7', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
   'e0000000-0000-4000-8000-0000000000b5', 'B901-R000001', 'cash', 500);
insert into public.installments (id, gym_id, invoice_id, due_date, amount) values
  ('e0000000-0000-4000-8000-0000000000a8', tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a5', current_date + 30, 500),
  ('e0000000-0000-4000-8000-0000000000b8', tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b5', current_date + 30, 500);
insert into public.subscription_freezes (id, gym_id, subscription_id, start_date, end_date) values
  ('e0000000-0000-4000-8000-0000000000ab', tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a4', current_date + 1, current_date + 3),
  ('e0000000-0000-4000-8000-0000000000bb', tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b4', current_date + 1, current_date + 3);
insert into public.invoice_credits (id, gym_id, invoice_id, subscription_id, kind, amount) values
  ('e0000000-0000-4000-8000-0000000000aa', tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a5',
   'e0000000-0000-4000-8000-0000000000a4', 'cancellation', 100),
  ('e0000000-0000-4000-8000-0000000000ba', tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b5',
   'e0000000-0000-4000-8000-0000000000b4', 'cancellation', 100);
insert into public.attendance (id, gym_id, branch_id, member_id, subscription_id, method, card_id) values
  ('e0000000-0000-4000-8000-0000000000ac', tests.gym('pgtap-a'), tests.branch('B901'), 'e0000000-0000-4000-8000-0000000000a1',
   'e0000000-0000-4000-8000-0000000000a4', 'card', 'e0000000-0000-4000-8000-0000000000a1'),
  ('e0000000-0000-4000-8000-0000000000bc', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
   'e0000000-0000-4000-8000-0000000000b4', 'card', 'e0000000-0000-4000-8000-0000000000b1');
insert into public.support_grants (id, gym_id, reason, ends_at) values
  ('e0000000-0000-4000-8000-0000000000ad', tests.gym('pgtap-a'), 'تاقیکردنەوە', now() + interval '2 hours'),
  ('e0000000-0000-4000-8000-0000000000bd', tests.gym('pgtap-b'), 'تاقیکردنەوە', now() + interval '2 hours');
insert into public.support_reads (gym_id, grant_id, admin_id, what) values
  (tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000ad', gen_random_uuid(), 'members'),
  (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000bd', gen_random_uuid(), 'members');

insert into public.lockers (id, gym_id, branch_id, number, zone, kind) values
  ('e0000000-0000-4000-8000-0000000000ae', tests.gym('pgtap-a'), tests.branch('B901'), '1', 'mixed', 'daily'),
  ('e0000000-0000-4000-8000-0000000000be', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), '1', 'mixed', 'daily');
insert into public.locker_assignments (id, gym_id, branch_id, locker_id, member_id, kind, starts_on) values
  ('e0000000-0000-4000-8000-0000000000af', tests.gym('pgtap-a'), tests.branch('B901'), 'e0000000-0000-4000-8000-0000000000ae',
   'e0000000-0000-4000-8000-0000000000a1', 'daily', current_date),
  ('e0000000-0000-4000-8000-0000000000bf', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000be',
   'e0000000-0000-4000-8000-0000000000b1', 'daily', current_date);
-- The spa's setup in both gyms.
insert into public.spa_services (id, gym_id, name_ckb, kind, duration_minutes, price) values
  ('e0000000-0000-4000-8000-0000000000a5', tests.gym('pgtap-a'), 'مەساژ', 'massage', 60, 30000),
  ('e0000000-0000-4000-8000-0000000000b5', tests.gym('pgtap-b'), 'مەساژ', 'massage', 60, 30000);
insert into public.spa_rooms (id, gym_id, branch_id, name_ckb, kind) values
  ('e0000000-0000-4000-8000-0000000000a6', tests.gym('pgtap-a'), tests.branch('B901'), 'ژووری ١', 'massage'),
  ('e0000000-0000-4000-8000-0000000000b6', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'ژووری ١', 'massage');
insert into public.spa_therapists (id, gym_id, branch_id, full_name, gender) values
  ('e0000000-0000-4000-8000-0000000000a7', tests.gym('pgtap-a'), tests.branch('B901'), 'ڕۆژان', 'female'),
  ('e0000000-0000-4000-8000-0000000000b7', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'ڕۆژان', 'female');
insert into public.spa_therapist_services (gym_id, therapist_id, service_id) values
  (tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a7', 'e0000000-0000-4000-8000-0000000000a5'),
  (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b7', 'e0000000-0000-4000-8000-0000000000b5');
insert into public.spa_therapist_hours (gym_id, therapist_id, weekday, starts_at, ends_at) values
  (tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a7', 1, '09:00', '17:00'),
  (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b7', 1, '09:00', '17:00');
insert into public.spa_packages (id, gym_id, name_ckb, service_id, session_count, price) values
  ('f0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), 'پاکێج', 'e0000000-0000-4000-8000-0000000000a5', 5, 0),
  ('f0000000-0000-4000-8000-0000000000b1', tests.gym('pgtap-b'), 'پاکێج', 'e0000000-0000-4000-8000-0000000000b5', 5, 0);
insert into public.member_spa_packages (id, gym_id, branch_id, member_id, package_id, service_id, name_ckb, session_count,
                                        price, starts_on, invoice_id) values
  ('f0000000-0000-4000-8000-0000000000a2', tests.gym('pgtap-a'), tests.branch('B901'), 'e0000000-0000-4000-8000-0000000000a1',
   'f0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a5', 'پاکێج', 5, 0, current_date,
   'e0000000-0000-4000-8000-0000000000a5'),
  ('f0000000-0000-4000-8000-0000000000b2', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
   'f0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b5', 'پاکێج', 5, 0, current_date,
   'e0000000-0000-4000-8000-0000000000b5');
insert into public.plan_spa_sessions (gym_id, plan_id, service_id, session_count) values
  (tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a3', 'e0000000-0000-4000-8000-0000000000a5', 2),
  (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b5', 2);
insert into public.subscription_spa_sessions (gym_id, subscription_id, service_id, session_count) values
  (tests.gym('pgtap-a'), 'e0000000-0000-4000-8000-0000000000a4', 'e0000000-0000-4000-8000-0000000000a5', 2),
  (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b4', 'e0000000-0000-4000-8000-0000000000b5', 2);
insert into public.spa_bookings (id, gym_id, branch_id, member_id, service_id, room_id, place, name_ckb, price, starts_at,
                                 ends_at, room_free_at, paid_with) values
  ('f0000000-0000-4000-8000-0000000000a3', tests.gym('pgtap-a'), tests.branch('B901'), 'e0000000-0000-4000-8000-0000000000a1',
   'e0000000-0000-4000-8000-0000000000a5', 'e0000000-0000-4000-8000-0000000000a6', 1, 'مەساژ', 0,
   now() + interval '1 day', now() + interval '25 hours', now() + interval '25 hours', 'pay'),
  ('f0000000-0000-4000-8000-0000000000b3', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
   'e0000000-0000-4000-8000-0000000000b5', 'e0000000-0000-4000-8000-0000000000b6', 1, 'مەساژ', 0,
   now() + interval '1 day', now() + interval '25 hours', now() + interval '25 hours', 'pay');

select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.total_rows(('public.' || t)::regclass, 'pgtap-a') = 0
         or tests.total_rows(('public.' || t)::regclass, 'pgtap-b') = 0 $$,
  'every gym table has rows in both gyms, so the checks below test something'
);
select isnt(tests.staff('owner'), tests.staff('owner', 'pgtap-b'),
  'the same username in two gyms is two different people');

-- Ways to add a row to gym B, one or more per table. Gym A's Owner (every permission, all
-- branches) tries each of them below.
create temporary table insert_cases (table_name text not null, statement text not null);
grant select on insert_cases to authenticated;
insert into insert_cases (table_name, statement) values
  -- Naming gym B.
  ('branches', $$ insert into public.branches (gym_id, code, name_ckb) values (tests.gym('pgtap-b'), 'B950', 'لقی نوێ') $$),
  ('roles', $$ insert into public.roles (gym_id, name_ckb) values (tests.gym('pgtap-b'), 'ڕۆڵی نوێ') $$),
  ('role_permissions', $$ insert into public.role_permissions (gym_id, role_id, permission_key)
                          values (tests.gym('pgtap-b'), tests.role('trainer', 'pgtap-b'), 'payments.view') $$),
  ('staff_users', $$ insert into public.staff_users (gym_id, id, username, full_name, role_id)
                     values (tests.gym('pgtap-b'), tests.auth_user_id('new_b', 'pgtap-b'), 'new_b', 'کارمەندی نوێ', tests.role('receptionist', 'pgtap-b')) $$),
  ('staff_branches', $$ insert into public.staff_branches (gym_id, staff_id, branch_id)
                        values (tests.gym('pgtap-b'), tests.staff('reception_b', 'pgtap-b'), tests.branch('B901', 'pgtap-b')) $$),
  ('staff_branch_access', $$ insert into public.staff_branch_access (gym_id, staff_id, branch_id)
                             values (tests.gym('pgtap-b'), tests.staff('reception_b', 'pgtap-b'), tests.branch('B901', 'pgtap-b')) $$),
  ('staff_pins', $$ insert into public.staff_pins (gym_id, staff_id, pin_hash)
                    values (tests.gym('pgtap-b'), tests.staff('manager_a', 'pgtap-b'), '$2a$04$abc') $$),
  ('devices', $$ select public.register_device('d0000000-0000-4000-8000-0000000000c1', tests.branch('B901', 'pgtap-b'), 'ئامێر', 'web') $$),
  ('devices', $$ insert into public.devices (gym_id, id, branch_id, code, name, platform)
                 values (tests.gym('pgtap-b'), 'd0000000-0000-4000-8000-0000000000c2', tests.branch('B901', 'pgtap-b'), 'D50', 'ئامێر', 'web') $$),
  ('device_status', $$ select public.device_heartbeat('d0000000-0000-4000-8000-0000000000b1', '0.2.0') $$),
  ('device_status', $$ insert into public.device_status (gym_id, device_id, last_seen_at)
                       values (tests.gym('pgtap-b'), 'd0000000-0000-4000-8000-0000000000b1', now()) $$),
  ('settings', $$ insert into public.settings (gym_id, key, value) values (tests.gym('pgtap-b'), 'security.pin_max_attempts', '4') $$),
  ('audit_logs', $$ insert into public.audit_logs (gym_id, table_name, row_id, action) values (tests.gym('pgtap-b'), 'branches', 'x', 'insert') $$),
  ('members', $$ insert into public.members (gym_id, id, branch_id, full_name, gender, phone)
                 values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000c1', tests.branch('B901', 'pgtap-b'), 'ئەندام', 'male', '+9647501230001') $$),
  ('members', $$ select public.create_member(p_id => 'e0000000-0000-4000-8000-0000000000c2', p_branch_id => tests.branch('B901', 'pgtap-b'),
                   p_full_name => 'ئەندام', p_gender => 'male', p_phone => '+9647501230002') $$),
  ('member_health', $$ insert into public.member_health (gym_id, id, injuries)
                       values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b2', 'ئازاری پشت') $$),
  ('member_photos', $$ insert into public.member_photos (gym_id, id, photo_type, photo, thumbnail_type, thumbnail)
                       values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b2', 'image/jpeg', '/9j/4AAQSkZJRg==', 'image/jpeg', '/9j/4AAQSkZJRg==') $$),
  ('member_photos', $$ select public.set_member_photo('e0000000-0000-4000-8000-0000000000b2', 'image/jpeg', '/9j/4AAQSkZJRg==', 'image/jpeg', '/9j/4AAQSkZJRg==') $$),
  ('nfc_cards', $$ insert into public.nfc_cards (gym_id, id, member_id, uid)
                   values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000c5', 'e0000000-0000-4000-8000-0000000000b2', 'DEADBEEF') $$),
  ('nfc_cards', $$ select public.assign_card('e0000000-0000-4000-8000-0000000000c6', 'e0000000-0000-4000-8000-0000000000b2', 'DEADBEEF') $$),
  ('member_imports', $$ insert into public.member_imports (gym_id, id, file_name, member_count)
                        values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000d1', 'members.xlsx', 1) $$),
  ('plans', $$ insert into public.plans (gym_id, id, name_ckb, kind, price)
               values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000c8', 'پلان', 'unlimited', 0) $$),
  ('plans', $$ select public.save_plan(p_id => 'e0000000-0000-4000-8000-0000000000b3', p_name_ckb => 'پلان',
                 p_kind => 'unlimited', p_price => 0) $$),
  ('plan_branches', $$ insert into public.plan_branches (gym_id, plan_id, branch_id)
                       values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b3', tests.branch('B902', 'pgtap-b')) $$),
  -- Money rows only the server writes: no client role may add one, in any gym.
  ('subscriptions', $$ insert into public.subscriptions (gym_id, id, member_id, plan_id, branch_id, name_ckb, kind, price, gender, max_freeze_days, start_date)
                       values (tests.gym('pgtap-b'), gen_random_uuid(), 'e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b3',
                               tests.branch('B901', 'pgtap-b'), 'VIP', 'unlimited', 0, 'any', 0, current_date) $$),
  ('subscriptions', $$ select public.sell_subscription(gen_random_uuid(), gen_random_uuid(), 'e0000000-0000-4000-8000-0000000000b1',
                         'e0000000-0000-4000-8000-0000000000b3', tests.branch('B901', 'pgtap-b'), current_date, 0) $$),
  ('invoices', $$ insert into public.invoices (gym_id, id, branch_id, member_id, number, subtotal, total)
                  values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1', 'B901-000002', 0, 0) $$),
  ('invoice_items', $$ insert into public.invoice_items (gym_id, invoice_id, kind, description_ckb, unit_price, total)
                       values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b5', 'other', 'هیتر', 0, 0) $$),
  ('payments', $$ insert into public.payments (gym_id, id, branch_id, member_id, invoice_id, number, method, amount)
                  values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
                          'e0000000-0000-4000-8000-0000000000b5', 'B901-R000002', 'cash', 100) $$),
  ('subscription_freezes', $$ insert into public.subscription_freezes (gym_id, id, subscription_id, start_date, end_date)
                              values (tests.gym('pgtap-b'), gen_random_uuid(), 'e0000000-0000-4000-8000-0000000000b4',
                                      current_date + 5, current_date + 6) $$),
  ('subscription_freezes', $$ select public.freeze_subscription(gen_random_uuid(), 'e0000000-0000-4000-8000-0000000000b4',
                                current_date + 5, 2) $$),
  ('invoice_credits', $$ insert into public.invoice_credits (gym_id, invoice_id, subscription_id, kind, amount)
                         values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b5',
                                 'e0000000-0000-4000-8000-0000000000b4', 'cancellation', 100) $$),
  ('installments', $$ insert into public.installments (gym_id, id, invoice_id, due_date, amount)
                      values (tests.gym('pgtap-b'), gen_random_uuid(), 'e0000000-0000-4000-8000-0000000000b5', current_date + 60, 100) $$),
  ('attendance', $$ insert into public.attendance (gym_id, id, branch_id, member_id, subscription_id, method)
                    values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'),
                            'e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b4', 'manual') $$),
  ('attendance', $$ select public.check_in(gen_random_uuid(), tests.branch('B901', 'pgtap-b'),
                      p_member_id => 'e0000000-0000-4000-8000-0000000000b1') $$),
  ('attendance', $$ select public.check_in(gen_random_uuid(), tests.branch('B901'),
                      p_member_id => 'e0000000-0000-4000-8000-0000000000b1') $$),
  ('support_grants', $$ insert into public.support_grants (gym_id, id, reason, ends_at)
                        values (tests.gym('pgtap-b'), gen_random_uuid(), 'x', now() + interval '2 hours') $$),
  ('support_grants', $$ select public.revoke_support_access('e0000000-0000-4000-8000-0000000000bd') $$),
  ('support_reads', $$ insert into public.support_reads (gym_id, grant_id, admin_id, what)
                       values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000bd', gen_random_uuid(), 'members') $$),
  ('lockers', $$ insert into public.lockers (gym_id, id, branch_id, number, zone, kind)
                 values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'), '99', 'mixed', 'daily') $$),
  ('lockers', $$ select public.add_lockers(tests.branch('B901', 'pgtap-b'), 'mixed', 'daily', '', 50, 51) $$),
  ('locker_assignments', $$ insert into public.locker_assignments (gym_id, id, branch_id, locker_id, member_id, kind, starts_on)
                            values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'),
                                    'e0000000-0000-4000-8000-0000000000be', 'e0000000-0000-4000-8000-0000000000b2', 'daily', current_date) $$),
  ('locker_assignments', $$ select public.give_locker(gen_random_uuid(), 'e0000000-0000-4000-8000-0000000000be',
                              'e0000000-0000-4000-8000-0000000000b2') $$),
  ('spa_services', $$ insert into public.spa_services (gym_id, id, name_ckb, kind, duration_minutes, price)
                      values (tests.gym('pgtap-b'), gen_random_uuid(), 'مەساژ', 'massage', 60, 1) $$),
  ('spa_services', $$ select public.save_spa_service('e0000000-0000-4000-8000-0000000000b5', 'مەساژ', 'massage', 60, 1) $$),
  ('spa_rooms', $$ insert into public.spa_rooms (gym_id, id, branch_id, name_ckb, kind)
                   values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'ژووری ٩', 'massage') $$),
  ('spa_rooms', $$ select public.save_spa_room(gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'ژووری ٩', 'massage') $$),
  ('spa_therapists', $$ insert into public.spa_therapists (gym_id, id, branch_id, full_name, gender)
                        values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'دانا', 'male') $$),
  ('spa_therapists', $$ select public.save_spa_therapist(gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'دانا', 'male', '{}', '[]') $$),
  ('spa_therapists', $$ select public.save_spa_therapist('e0000000-0000-4000-8000-0000000000b7', tests.branch('B901'), 'دانا', 'male', '{}', '[]') $$),
  ('spa_therapist_services', $$ insert into public.spa_therapist_services (gym_id, therapist_id, service_id)
                                values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b7', 'e0000000-0000-4000-8000-0000000000b5') $$),
  ('spa_therapist_services', $$ select public.save_spa_therapist('e0000000-0000-4000-8000-0000000000a7', tests.branch('B901'), 'ڕۆژان', 'female',
                                  array['e0000000-0000-4000-8000-0000000000b5'::uuid], '[]') $$),
  ('spa_therapist_hours', $$ insert into public.spa_therapist_hours (gym_id, therapist_id, weekday, starts_at, ends_at)
                             values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b7', 2, '09:00', '17:00') $$),
  ('spa_packages', $$ insert into public.spa_packages (gym_id, id, name_ckb, service_id, session_count, price)
                      values (tests.gym('pgtap-b'), gen_random_uuid(), 'پاکێج', 'e0000000-0000-4000-8000-0000000000b5', 5, 0) $$),
  ('spa_packages', $$ select public.save_spa_package('f0000000-0000-4000-8000-0000000000b1', 'پاکێج', 'e0000000-0000-4000-8000-0000000000b5', 5, 0) $$),
  ('member_spa_packages', $$ insert into public.member_spa_packages (gym_id, id, branch_id, member_id, package_id, service_id, name_ckb,
                                session_count, price, starts_on, invoice_id)
                             values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
                                     'f0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b5', 'پاکێج', 5, 0,
                                     current_date, 'e0000000-0000-4000-8000-0000000000b5') $$),
  ('member_spa_packages', $$ select public.sell_spa_package(gen_random_uuid(), gen_random_uuid(), 'f0000000-0000-4000-8000-0000000000b1',
                               'e0000000-0000-4000-8000-0000000000b1', tests.branch('B901', 'pgtap-b')) $$),
  ('plan_spa_sessions', $$ insert into public.plan_spa_sessions (gym_id, plan_id, service_id, session_count)
                           values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b5', 3) $$),
  ('plan_spa_sessions', $$ select public.set_plan_spa_sessions('e0000000-0000-4000-8000-0000000000b3', '[]') $$),
  ('subscription_spa_sessions', $$ insert into public.subscription_spa_sessions (gym_id, subscription_id, service_id, session_count)
                                   values (tests.gym('pgtap-b'), 'e0000000-0000-4000-8000-0000000000b4', 'e0000000-0000-4000-8000-0000000000b5', 3) $$),
  ('spa_bookings', $$ insert into public.spa_bookings (gym_id, id, branch_id, member_id, service_id, room_id, place, name_ckb, price,
                         starts_at, ends_at, room_free_at, paid_with)
                      values (tests.gym('pgtap-b'), gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
                              'e0000000-0000-4000-8000-0000000000b5', 'e0000000-0000-4000-8000-0000000000b6', 2, 'مەساژ', 0,
                              now() + interval '2 days', now() + interval '49 hours', now() + interval '49 hours', 'pay') $$),
  ('spa_bookings', $$ select public.book_spa(gen_random_uuid(), tests.branch('B901', 'pgtap-b'), 'e0000000-0000-4000-8000-0000000000b1',
                       'e0000000-0000-4000-8000-0000000000b5', now() + interval '2 days', 'e0000000-0000-4000-8000-0000000000b6') $$),
  ('spa_bookings', $$ select public.set_spa_booking_status('f0000000-0000-4000-8000-0000000000b3', 'cancelled') $$),
  -- Their own gym (gym_id left to fill itself in), pointing at gym B's rows.
  ('role_permissions', $$ insert into public.role_permissions (role_id, permission_key) values (tests.role('trainer', 'pgtap-b'), 'payments.view') $$),
  ('staff_users', $$ insert into public.staff_users (id, username, full_name, role_id)
                     values (tests.auth_user_id('new_b', 'pgtap-b'), 'new_b', 'کارمەندی نوێ', tests.role('receptionist', 'pgtap-b')) $$),
  ('staff_branches', $$ insert into public.staff_branches (staff_id, branch_id) values (tests.staff('reception_b', 'pgtap-b'), tests.branch('B901')) $$),
  ('staff_branches', $$ insert into public.staff_branches (staff_id, branch_id) values (tests.staff('reception_b'), tests.branch('B901', 'pgtap-b')) $$),
  ('settings', $$ insert into public.settings (branch_id, key, value) values (tests.branch('B902', 'pgtap-b'), 'security.pin_max_attempts', '4') $$),
  ('members', $$ insert into public.members (id, branch_id, full_name, gender, phone)
                 values ('e0000000-0000-4000-8000-0000000000c3', tests.branch('B901', 'pgtap-b'), 'ئەندام', 'male', '+9647501230003') $$),
  ('member_health', $$ insert into public.member_health (id, injuries) values ('e0000000-0000-4000-8000-0000000000b2', 'ئازاری پشت') $$),
  ('member_photos', $$ insert into public.member_photos (id, photo_type, photo, thumbnail_type, thumbnail)
                       values ('e0000000-0000-4000-8000-0000000000b2', 'image/jpeg', '/9j/4AAQSkZJRg==', 'image/jpeg', '/9j/4AAQSkZJRg==') $$),
  ('nfc_cards', $$ insert into public.nfc_cards (id, member_id, uid) values ('e0000000-0000-4000-8000-0000000000c7', 'e0000000-0000-4000-8000-0000000000b2', 'DEADBEEF') $$),
  ('plan_branches', $$ insert into public.plan_branches (plan_id, branch_id) values ('e0000000-0000-4000-8000-0000000000b3', tests.branch('B902')) $$),
  ('plan_branches', $$ insert into public.plan_branches (plan_id, branch_id) values ('e0000000-0000-4000-8000-0000000000a3', tests.branch('B902', 'pgtap-b')) $$);

select is_empty(
  $$ select t from tests.gym_tables() t where t not in (select c.table_name from insert_cases c) $$,
  'every gym table has a case that tries to add a row to another gym (add one for each new table)'
);

-- Gym A's Owner against gym B ------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is_empty(
  $$ select t from tests.gym_tables() t where tests.visible_rows(t, tests.gym('pgtap-b')) > 0 $$,
  'gym A''s Owner sees no row of gym B, in any table'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('update public.%I set gym_id = gym_id where gym_id = %L', t, tests.gym('pgtap-b'))) > 0 $$,
  'gym A''s Owner changes no row of gym B'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('delete from public.%I where gym_id = %L', t, tests.gym('pgtap-b'))) > 0 $$,
  'gym A''s Owner deletes no row of gym B'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('update public.%I set gym_id = %L where gym_id = %L', t, tests.gym('pgtap-b'), tests.gym('pgtap-a'))) > 0 $$,
  'gym A''s Owner can''t move any of gym A''s rows into gym B'
);
-- Refused: no permission, a link to another gym's row, or (P0002) that row isn't even visible.
select is_empty(
  $$ select c.table_name, c.statement from insert_cases c
      where coalesce(tests.error_code(c.statement), 'worked') not in ('42501', '23503', 'P0002') $$,
  'gym A''s Owner can add nothing to gym B, in any table'
);

-- The access rules themselves.
select set_eq('select * from app.accessible_branch_ids()', $$ select * from tests.all_ids('public.branches') $$,
  'all branches means all branches of the Owner''s own gym');
select ok(not app.has_branch_access(tests.branch('B901', 'pgtap-b')), 'no access to another gym''s branch');
select ok(not app.can_view_staff(tests.staff('reception_a', 'pgtap-b')), 'nobody sees another gym''s staff');
select ok(not app.can_manage_staff(tests.staff('reception_a', 'pgtap-b')), 'nobody manages another gym''s staff');
select ok(not app.covers_role(tests.role('trainer', 'pgtap-b')), 'another gym''s roles are never covered');
select ok(not app.can_grant_role(tests.role('trainer', 'pgtap-b')), 'nobody gives another gym''s role');
select is((select code from public.my_gym()), 'pgtap-a', 'my_gym() is the staff member''s own gym');

-- RPCs across gyms.
select throws_ok($$ select public.reset_staff_pin(tests.staff('reception_a', 'pgtap-b')) $$,
  '42501', 'cannot_manage_staff', 'nobody resets the PIN of another gym''s staff');

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_on_device('482915', 'd0000000-0000-4000-8000-0000000000b1') ->> 'result', 'device_not_registered',
  'a PIN never opens another gym''s device');
select is(public.unlock_on_device('000001', 'd0000000-0000-4000-8000-0000000000a1') ->> 'tries_left', '4',
  'gym B''s PIN setting (3 tries) does not apply in gym A (5 tries)');
select tests.authenticate_as(tests.staff('reception_a', 'pgtap-b'));
select is(public.unlock_on_device('000001', 'd0000000-0000-4000-8000-0000000000b1') ->> 'tries_left', '2',
  'gym B''s PIN setting applies in gym B');

-- Gym B's Owner against gym A ------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is_empty(
  $$ select t from tests.gym_tables() t where tests.visible_rows(t, tests.gym('pgtap-a')) > 0 $$,
  'gym B''s Owner sees no row of gym A, in any table'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('update public.%I set gym_id = gym_id where gym_id = %L', t, tests.gym('pgtap-a'))) > 0 $$,
  'gym B''s Owner changes no row of gym A'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('delete from public.%I where gym_id = %L', t, tests.gym('pgtap-a'))) > 0 $$,
  'gym B''s Owner deletes no row of gym A'
);

-- Even server code can't link two gyms' rows (composite foreign keys) --------------------------

select tests.authenticate_as_service_role();
select is(
  tests.error_code($$ insert into public.staff_branches (gym_id, staff_id, branch_id)
                      values (tests.gym('pgtap-a'), tests.staff('reception_a'), tests.branch('B902', 'pgtap-b')) $$),
  '23503', 'a staff member can''t get a branch of another gym'
);
select is(
  tests.error_code($$ update public.staff_users set role_id = tests.role('admin', 'pgtap-b') where id = tests.staff('reception_a') $$),
  '23503', 'a staff member can''t get a role of another gym'
);
select is(
  tests.error_code($$ insert into public.role_permissions (gym_id, role_id, permission_key)
                      values (tests.gym('pgtap-a'), tests.role('trainer', 'pgtap-b'), 'payments.view') $$),
  '23503', 'a gym''s permissions can''t be added to another gym''s role'
);
select is(
  tests.error_code($$ insert into public.devices (id, gym_id, branch_id, code, name, platform)
                      values ('d0000000-0000-4000-8000-0000000000c3', tests.gym('pgtap-a'), tests.branch('B901', 'pgtap-b'), 'D60', 'ئامێر', 'web') $$),
  '23503', 'a device can''t be in another gym''s branch'
);
select is(
  tests.error_code($$ insert into public.members (id, gym_id, branch_id, full_name, gender, phone)
                      values ('e0000000-0000-4000-8000-0000000000c4', tests.gym('pgtap-a'), tests.branch('B901', 'pgtap-b'), 'ئەندام', 'male', '+9647501230004') $$),
  '23503', 'a member can''t join another gym''s branch'
);
select is(
  tests.error_code($$ insert into public.member_health (id, gym_id, injuries)
                      values ('e0000000-0000-4000-8000-0000000000b2', tests.gym('pgtap-a'), 'ئازاری پشت') $$),
  '23503', 'health info can''t belong to another gym''s member'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.error_code(format('update public.%I set gym_id = %L where gym_id = %L', t, tests.gym('pgtap-b'), tests.gym('pgtap-a')))
            is distinct from '42501' $$,
  'not even server code can move a row to another gym, in any table'
);

select * from finish();
rollback;
