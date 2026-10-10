-- The gyms table, gym codes, create_gym(), and what is unique per gym rather than globally.
begin;
select plan(30);
select tests.create_fixture();

-- Who reads and writes gyms ---------------------------------------------------------------------

select tests.authenticate_as_anon();
select throws_ok('select * from public.gyms', '42501', 'permission denied for table gyms',
  'anonymous visitors cannot read gyms');
select throws_ok($$ select public.my_gym() $$, '42501', 'permission denied for function my_gym',
  'anonymous visitors cannot ask for a gym');

select tests.authenticate_as(tests.staff('reception_a'));
select results_eq('select code from public.gyms', $$ values ('pgtap-a'::text) $$, 'staff read only their own gym');

select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ update public.gyms set paid_until = null $$, '42501', 'permission denied for table gyms',
  'not even the Owner changes the gym''s own record (Click Group does)');
select throws_ok($$ insert into public.gyms (code, name_ckb) values ('my-gym', 'جیم') $$, '42501',
  'permission denied for table gyms', 'staff cannot add gyms');
select throws_ok($$ select public.create_gym('my-gym', 'جیم', 'لقی یەکەم') $$, '42501',
  'permission denied for function create_gym', 'staff cannot create gyms');

select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select id from public.gyms', 'deactivated staff read no gym');
select is_empty('select id from public.my_gym()', 'deactivated staff get no gym from my_gym()');

-- Gym codes: part of every login, so valid, never reserved, never changed --------------------------

select tests.clear_authentication();
select is_empty(
  $$ select c from unnest(array['ab', 'Gym-a', '1gym', '-gym', 'gym-', 'gym--a', 'gym_a', 'gym a', 'abcdefghijklmnopqrstu']) as c
      where tests.error_code(format('select public.create_gym(%L, %L, %L)', c, 'جیم', 'لقی یەکەم')) is distinct from '23514' $$,
  'invalid gym codes are refused (3 to 20 of a-z 0-9, single hyphens, starting with a letter)'
);
select throws_ok($$ select public.create_gym('Gym-A', 'جیم', 'لقی یەکەم') $$, '23514', 'invalid_gym_code',
  'an invalid code gets a key the app can translate');
select is_empty(
  $$ select c from unnest(array['admin', 'seller', 'support', 'api', 'www', 'app', 'login', 'clickgroup', 'gym-spa', 'test', 'root', 'system']) as c
      where tests.error_code(format('select public.create_gym(%L, %L, %L)', c, 'جیم', 'لقی یەکەم')) is distinct from '23514' $$,
  'every reserved gym code is refused'
);
select throws_ok($$ select public.create_gym('seller', 'جیم', 'لقی یەکەم') $$, '23514', 'reserved_gym_code',
  'a reserved code gets its own key');
select throws_ok($$ insert into public.gyms (code, name_ckb) values ('support', 'جیم') $$, '23514',
  'new row for relation "gyms" violates check constraint "gyms_code_not_reserved"',
  'the table itself refuses reserved codes, whoever writes');
select throws_ok($$ select public.create_gym('pgtap-a', 'جیم', 'لقی یەکەم') $$, '23505', 'gym_code_taken',
  'two gyms never share a code');
select throws_ok($$ update public.gyms set code = 'gym-z' where code = 'pgtap-a' $$, '42501', 'read_only_column',
  'a gym code never changes, not even for server code');
select throws_ok($$ update public.gyms set edition = 'offline' where code = 'pgtap-a' $$, '42501', 'read_only_column',
  'a gym never changes edition');

-- create_gym() --------------------------------------------------------------------------------

select tests.authenticate_as_service_role();
select lives_ok(
  $$ select public.create_gym('pgtap-new', 'جیمی هەولێر', 'لقی سەرەکی', 'Hawler Fit', null, 'offline', 'a0000000-0000-4000-8000-0000000000f1') $$,
  'server code creates a gym'
);
select tests.clear_authentication();
select results_eq(
  $$ select id, edition from public.gyms where code = 'pgtap-new' $$,
  $$ values ('a0000000-0000-4000-8000-0000000000f1'::uuid, 'offline'::text) $$,
  'a gym can be created with a given id (the offline server uses its license''s)'
);
select set_eq(
  $$ select key, name_ckb, name_en, name_ar from public.roles where gym_id = tests.gym('pgtap-new') $$,
  $$ select key, name_ckb, name_en, name_ar from app.role_templates $$,
  'a new gym gets the built-in roles'
);
select set_eq(
  $$ select r.key, rp.permission_key from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where rp.gym_id = tests.gym('pgtap-new') $$,
  $$ select role_key, permission_key from app.role_template_permissions $$,
  'a new gym''s built-in roles get their permissions'
);
select results_eq(
  $$ select code, name_ckb from public.branches where gym_id = tests.gym('pgtap-new') $$,
  $$ values ('B1'::text, 'لقی سەرەکی'::text) $$,
  'a new gym gets its first branch, B1'
);
select ok(
  (select bool_and(is_system) from public.roles where gym_id = tests.gym('pgtap-new')),
  'the copied roles are built-in roles'
);

-- The Owner ---------------------------------------------------------------------------------------

insert into public.permissions (key, module, sort_order) values ('test.new_permission', 'test', 9999);
select tests.authenticate_as(tests.staff('owner'));
select ok(app.has_permission('test.new_permission'), 'the Owner gets permissions added later automatically');
select tests.authenticate_as(tests.staff('admin'));
select ok(not app.has_permission('test.new_permission'), 'other roles get new permissions only when given');

-- Unique per gym, not globally ------------------------------------------------------------------

select tests.clear_authentication();
select is(
  (select count(*)::integer from public.branches where code = 'B901' and gym_id in (tests.gym('pgtap-a'), tests.gym('pgtap-b'))), 2,
  'two gyms can each have a branch B901 (the fixture made them)'
);
select throws_ok(
  $$ insert into public.branches (gym_id, code, name_ckb) values (tests.gym('pgtap-a'), 'B901', 'لقی دووەم') $$,
  '23505', 'duplicate key value violates unique constraint "branches_gym_id_code_key"',
  'branch codes are unique within a gym'
);
select is((select count(*)::integer from public.staff_users where username = 'owner'), 2,
  'two gyms can each have a staff member called owner (the fixture made them)');
-- Auth already refuses a second user with the same email, so this rule is checked in the catalog.
select col_is_unique('public', 'staff_users', array['gym_id', 'username'], 'usernames are unique within a gym');

-- gym_id fills itself in --------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('admin'));
insert into public.settings (key, value) values ('security.idle_lock_minutes', '12');
select tests.clear_authentication();
select is(
  (select gym_id from public.settings where key = 'security.idle_lock_minutes' and value = '12'),
  tests.gym('pgtap-a'),
  'a row added by staff belongs to their gym without the app sending it'
);
select is(
  (select gym_id from public.audit_logs where table_name = 'gyms' and row_id = tests.gym('pgtap-b')::text and action = 'insert'),
  tests.gym('pgtap-b'),
  'the audit log records which gym a change belongs to'
);

select * from finish();
rollback;
