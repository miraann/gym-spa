-- Gyms are isolated (spec §2.6): no gym can read, add, change or delete another gym's rows, in any
-- table. The table list comes from the catalog (every table with gym_id), so new tables are covered
-- as soon as they exist; inserts need a case per table, and a test fails when one is missing.
begin;
select plan(27);
select tests.create_fixture();

-- Rows in every gym table of both gyms: settings, a device and its report, a PIN.
insert into public.settings (gym_id, branch_id, key, value) values
  (tests.gym('gym-a'), null, 'security.idle_lock_minutes', '15'),
  (tests.gym('gym-a'), tests.branch('B901'), 'security.idle_lock_minutes', '5'),
  (tests.gym('gym-b'), null, 'security.idle_lock_minutes', '20'),
  (tests.gym('gym-b'), null, 'security.pin_max_attempts', '3'),
  (tests.gym('gym-b'), tests.branch('B901', 'gym-b'), 'security.idle_lock_minutes', '5');
insert into public.devices (id, gym_id, branch_id, code, name, platform) values
  ('d0000000-0000-4000-8000-0000000000a1', tests.gym('gym-a'), tests.branch('B901'), 'D01', 'کۆمپیوتەری پێشوازی', 'windows'),
  ('d0000000-0000-4000-8000-0000000000b1', tests.gym('gym-b'), tests.branch('B901', 'gym-b'), 'D01', 'کۆمپیوتەری پێشوازی', 'windows');
insert into public.device_status (device_id, gym_id, last_seen_at, app_version) values
  ('d0000000-0000-4000-8000-0000000000a1', tests.gym('gym-a'), now(), '0.1.0'),
  ('d0000000-0000-4000-8000-0000000000b1', tests.gym('gym-b'), now(), '0.1.0');
insert into public.staff_pins (staff_id, gym_id, pin_hash) values
  (tests.staff('reception_a'), tests.gym('gym-a'), extensions.crypt('482915', extensions.gen_salt('bf', 4))),
  (tests.staff('reception_a', 'gym-b'), tests.gym('gym-b'), extensions.crypt('482915', extensions.gen_salt('bf', 4)));
select tests.create_auth_user('new_b', 'gym-b');

select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.total_rows(('public.' || t)::regclass, 'gym-a') = 0
         or tests.total_rows(('public.' || t)::regclass, 'gym-b') = 0 $$,
  'every gym table has rows in both gyms, so the checks below test something'
);
select isnt(tests.staff('owner'), tests.staff('owner', 'gym-b'),
  'the same username in two gyms is two different people');

-- Ways to add a row to gym B, one or more per table. Gym A's Owner (every permission, all
-- branches) tries each of them below.
create temporary table insert_cases (table_name text not null, statement text not null);
grant select on insert_cases to authenticated;
insert into insert_cases (table_name, statement) values
  -- Naming gym B.
  ('branches', $$ insert into public.branches (gym_id, code, name_ckb) values (tests.gym('gym-b'), 'B950', 'لقی نوێ') $$),
  ('roles', $$ insert into public.roles (gym_id, name_ckb) values (tests.gym('gym-b'), 'ڕۆڵی نوێ') $$),
  ('role_permissions', $$ insert into public.role_permissions (gym_id, role_id, permission_key)
                          values (tests.gym('gym-b'), tests.role('trainer', 'gym-b'), 'payments.view') $$),
  ('staff_users', $$ insert into public.staff_users (gym_id, id, username, full_name, role_id)
                     values (tests.gym('gym-b'), tests.auth_user_id('new_b', 'gym-b'), 'new_b', 'کارمەندی نوێ', tests.role('receptionist', 'gym-b')) $$),
  ('staff_branches', $$ insert into public.staff_branches (gym_id, staff_id, branch_id)
                        values (tests.gym('gym-b'), tests.staff('reception_b', 'gym-b'), tests.branch('B901', 'gym-b')) $$),
  ('staff_branch_access', $$ insert into public.staff_branch_access (gym_id, staff_id, branch_id)
                             values (tests.gym('gym-b'), tests.staff('reception_b', 'gym-b'), tests.branch('B901', 'gym-b')) $$),
  ('staff_pins', $$ insert into public.staff_pins (gym_id, staff_id, pin_hash)
                    values (tests.gym('gym-b'), tests.staff('manager_a', 'gym-b'), '$2a$04$abc') $$),
  ('devices', $$ select public.register_device('d0000000-0000-4000-8000-0000000000c1', tests.branch('B901', 'gym-b'), 'ئامێر', 'web') $$),
  ('devices', $$ insert into public.devices (gym_id, id, branch_id, code, name, platform)
                 values (tests.gym('gym-b'), 'd0000000-0000-4000-8000-0000000000c2', tests.branch('B901', 'gym-b'), 'D50', 'ئامێر', 'web') $$),
  ('device_status', $$ select public.device_heartbeat('d0000000-0000-4000-8000-0000000000b1', '0.2.0') $$),
  ('device_status', $$ insert into public.device_status (gym_id, device_id, last_seen_at)
                       values (tests.gym('gym-b'), 'd0000000-0000-4000-8000-0000000000b1', now()) $$),
  ('settings', $$ insert into public.settings (gym_id, key, value) values (tests.gym('gym-b'), 'security.pin_max_attempts', '4') $$),
  ('audit_logs', $$ insert into public.audit_logs (gym_id, table_name, row_id, action) values (tests.gym('gym-b'), 'branches', 'x', 'insert') $$),
  -- Their own gym (gym_id left to fill itself in), pointing at gym B's rows.
  ('role_permissions', $$ insert into public.role_permissions (role_id, permission_key) values (tests.role('trainer', 'gym-b'), 'payments.view') $$),
  ('staff_users', $$ insert into public.staff_users (id, username, full_name, role_id)
                     values (tests.auth_user_id('new_b', 'gym-b'), 'new_b', 'کارمەندی نوێ', tests.role('receptionist', 'gym-b')) $$),
  ('staff_branches', $$ insert into public.staff_branches (staff_id, branch_id) values (tests.staff('reception_b', 'gym-b'), tests.branch('B901')) $$),
  ('staff_branches', $$ insert into public.staff_branches (staff_id, branch_id) values (tests.staff('reception_b'), tests.branch('B901', 'gym-b')) $$),
  ('settings', $$ insert into public.settings (branch_id, key, value) values (tests.branch('B902', 'gym-b'), 'security.pin_max_attempts', '4') $$);

select is_empty(
  $$ select t from tests.gym_tables() t where t not in (select c.table_name from insert_cases c) $$,
  'every gym table has a case that tries to add a row to another gym (add one for each new table)'
);

-- Gym A's Owner against gym B ------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is_empty(
  $$ select t from tests.gym_tables() t where tests.visible_rows(t, tests.gym('gym-b')) > 0 $$,
  'gym A''s Owner sees no row of gym B, in any table'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('update public.%I set gym_id = gym_id where gym_id = %L', t, tests.gym('gym-b'))) > 0 $$,
  'gym A''s Owner changes no row of gym B'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('delete from public.%I where gym_id = %L', t, tests.gym('gym-b'))) > 0 $$,
  'gym A''s Owner deletes no row of gym B'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('update public.%I set gym_id = %L where gym_id = %L', t, tests.gym('gym-b'), tests.gym('gym-a'))) > 0 $$,
  'gym A''s Owner can''t move any of gym A''s rows into gym B'
);
select is_empty(
  $$ select c.table_name, c.statement from insert_cases c
      where coalesce(tests.error_code(c.statement), 'worked') not in ('42501', '23503') $$,
  'gym A''s Owner can add nothing to gym B, in any table'
);

-- The access rules themselves.
select set_eq('select * from app.accessible_branch_ids()', $$ select * from tests.all_ids('public.branches') $$,
  'all branches means all branches of the Owner''s own gym');
select ok(not app.has_branch_access(tests.branch('B901', 'gym-b')), 'no access to another gym''s branch');
select ok(not app.can_view_staff(tests.staff('reception_a', 'gym-b')), 'nobody sees another gym''s staff');
select ok(not app.can_manage_staff(tests.staff('reception_a', 'gym-b')), 'nobody manages another gym''s staff');
select ok(not app.covers_role(tests.role('trainer', 'gym-b')), 'another gym''s roles are never covered');
select ok(not app.can_grant_role(tests.role('trainer', 'gym-b')), 'nobody gives another gym''s role');
select is((select code from public.my_gym()), 'gym-a', 'my_gym() is the staff member''s own gym');

-- RPCs across gyms.
select throws_ok($$ select public.reset_staff_pin(tests.staff('reception_a', 'gym-b')) $$,
  '42501', 'cannot_manage_staff', 'nobody resets the PIN of another gym''s staff');

select tests.authenticate_as(tests.staff('reception_a'));
select is(public.unlock_with_pin('482915', tests.branch('B901', 'gym-b')) ->> 'result', 'no_branch_access',
  'a PIN never opens a device in another gym''s branch');
select is(public.unlock_with_pin('000001', tests.branch('B901')) ->> 'tries_left', '4',
  'gym B''s PIN setting (3 tries) does not apply in gym A (5 tries)');
select tests.authenticate_as(tests.staff('reception_a', 'gym-b'));
select is(public.unlock_with_pin('000001', tests.branch('B901', 'gym-b')) ->> 'tries_left', '2',
  'gym B''s PIN setting applies in gym B');

-- Gym B's Owner against gym A ------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner', 'gym-b'));
select is_empty(
  $$ select t from tests.gym_tables() t where tests.visible_rows(t, tests.gym('gym-a')) > 0 $$,
  'gym B''s Owner sees no row of gym A, in any table'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('update public.%I set gym_id = gym_id where gym_id = %L', t, tests.gym('gym-a'))) > 0 $$,
  'gym B''s Owner changes no row of gym A'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('delete from public.%I where gym_id = %L', t, tests.gym('gym-a'))) > 0 $$,
  'gym B''s Owner deletes no row of gym A'
);

-- Even server code can't link two gyms' rows (composite foreign keys) --------------------------

select tests.authenticate_as_service_role();
select is(
  tests.error_code($$ insert into public.staff_branches (gym_id, staff_id, branch_id)
                      values (tests.gym('gym-a'), tests.staff('reception_a'), tests.branch('B902', 'gym-b')) $$),
  '23503', 'a staff member can''t get a branch of another gym'
);
select is(
  tests.error_code($$ update public.staff_users set role_id = tests.role('admin', 'gym-b') where id = tests.staff('reception_a') $$),
  '23503', 'a staff member can''t get a role of another gym'
);
select is(
  tests.error_code($$ insert into public.role_permissions (gym_id, role_id, permission_key)
                      values (tests.gym('gym-a'), tests.role('trainer', 'gym-b'), 'payments.view') $$),
  '23503', 'a gym''s permissions can''t be added to another gym''s role'
);
select is(
  tests.error_code($$ insert into public.devices (id, gym_id, branch_id, code, name, platform)
                      values ('d0000000-0000-4000-8000-0000000000c3', tests.gym('gym-a'), tests.branch('B901', 'gym-b'), 'D60', 'ئامێر', 'web') $$),
  '23503', 'a device can''t be in another gym''s branch'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.error_code(format('update public.%I set gym_id = %L where gym_id = %L', t, tests.gym('gym-b'), tests.gym('gym-a')))
            is distinct from '42501' $$,
  'not even server code can move a row to another gym, in any table'
);

select * from finish();
rollback;
