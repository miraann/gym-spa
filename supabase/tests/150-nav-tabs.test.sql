-- staff_users.nav_tabs: each staff member's own 4 tabs on the phone's bottom tab bar.
begin;
select plan(13);
select tests.create_fixture();
select tests.create_auth_user('new_a');

-- The rule itself
select ok(app.is_valid_nav_tabs(array['home', 'members', 'checkin', 'cashRegister']), '4 different pages are valid tabs');
select ok(not app.is_valid_nav_tabs(array['home', 'members', 'checkin']), 'fewer than 4 tabs are refused');
select ok(not app.is_valid_nav_tabs(array['home', 'members', 'checkin', 'reports', 'staff']), 'more than 4 tabs are refused');
select ok(not app.is_valid_nav_tabs(array['home', 'home', 'checkin', 'reports']), 'the same page twice is refused');
select ok(not app.is_valid_nav_tabs(array['home', 'members', 'checkin', 'nowhere']), 'unknown pages are refused');
select ok(not app.is_valid_nav_tabs(array['home', 'members', 'checkin', null]), 'an empty tab is refused');
select ok(not app.is_valid_nav_tabs(array[array['home', 'members'], array['checkin', 'reports']]), 'a nested list is refused');

-- Who changes them
select tests.authenticate_as(tests.staff('reception_a'));
select is(
  tests.row_count($$ update public.staff_users set nav_tabs = array['home', 'checkin', 'members', 'lockers']
                     where username = 'reception_a' $$),
  1, 'staff can choose their own tabs'
);
select throws_ok(
  $$ update public.staff_users set nav_tabs = array['home', 'members'] where username = 'reception_a' $$,
  '23514', null, 'the database refuses invalid tabs'
);
select is(
  tests.row_count($$ update public.staff_users set nav_tabs = null where username = 'reception_a' $$),
  1, 'staff can go back to their role''s tabs'
);

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ update public.staff_users set nav_tabs = array['home', 'members', 'reports', 'staff'] where username = 'reception_a' $$,
  '42501', 'own_preference_only', 'a manager cannot change the tabs of staff they manage'
);

select lives_ok(
  $$ insert into public.staff_users (id, username, full_name, role_id, nav_tabs)
     values (tests.auth_user_id('new_a'), 'new_a', 'کارمەندی نوێ', tests.role('receptionist'),
             array['home', 'members', 'reports', 'staff']) $$,
  'a manager can add staff'
);
select tests.authenticate_as_service_role();
select is((select nav_tabs from public.staff_users where username = 'new_a'), null,
  'new staff start with their role''s tabs, whatever the manager sent');

select * from finish();
rollback;
