-- Appearance: the gym's look in settings (brand color, corners, logo) and each staff member's own
-- look on staff_users (spec §6.1).
begin;
select plan(33);
select tests.create_fixture();
select tests.create_auth_user('new_a');

-- A small but real file of each type, as base64 the way the app sends it.
create temporary table logos (name text primary key, value jsonb) on commit drop;
insert into logos values
  ('png', jsonb_build_object('type', 'image/png', 'data', encode('\x89504e470d0a1a0a0000000d49484452'::bytea, 'base64'))),
  ('jpeg', jsonb_build_object('type', 'image/jpeg', 'data', encode('\xffd8ffe000104a464946'::bytea, 'base64'))),
  ('webp', jsonb_build_object('type', 'image/webp', 'data', encode('\x524946460000000057454250565038'::bytea, 'base64'))),
  -- Exactly 300 KB, and one byte more. Postgres wraps base64 lines; the app sends one line.
  ('largest', jsonb_build_object('type', 'image/png', 'data', replace(
    encode('\x89504e470d0a1a0a'::bytea || convert_to(repeat('a', 307200 - 8), 'UTF8'), 'base64'), chr(10), ''))),
  ('too_large', jsonb_build_object('type', 'image/png', 'data', replace(
    encode('\x89504e470d0a1a0a'::bytea || convert_to(repeat('a', 307200 - 7), 'UTF8'), 'base64'), chr(10), '')));
grant select on logos to authenticated;

-- The rules
select ok(app.is_valid_setting('appearance.brand_color', '"indigo"'), 'a preset is a valid brand color');
select ok(app.is_valid_setting('appearance.brand_color', '"#2563eb"'), 'a custom #rrggbb is a valid brand color');
select ok(not app.is_valid_setting('appearance.brand_color', '"#2563EB"'), 'custom colors are lowercase');
select ok(not app.is_valid_setting('appearance.brand_color', '"red"'), 'unknown color names are refused');
select ok(not app.is_valid_setting('appearance.brand_color', '"#fff"'), 'short hex is refused');
select ok(not app.is_valid_setting('appearance.brand_color', '277'), 'numbers are refused');
select ok(app.is_valid_setting('appearance.corner_style', '"sharp"'), 'sharp is a corner style');
select ok(not app.is_valid_setting('appearance.corner_style', '"round"'), 'unknown corner styles are refused');

select ok(app.is_valid_setting('appearance.logo', (select value from logos where name = 'png')), 'a PNG logo is valid');
select ok(app.is_valid_setting('appearance.logo', (select value from logos where name = 'jpeg')), 'a JPEG logo is valid');
select ok(app.is_valid_setting('appearance.logo', (select value from logos where name = 'webp')), 'a WebP logo is valid');
select ok(app.is_valid_setting('appearance.logo', (select value from logos where name = 'largest')), 'a logo of exactly 300 KB is valid');
select ok(not app.is_valid_setting('appearance.logo', (select value from logos where name = 'too_large')), 'a logo over 300 KB is refused');
select ok(not app.is_valid_setting('appearance.logo',
  jsonb_build_object('type', 'image/svg+xml', 'data', encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg"/>', 'UTF8'), 'base64'))),
  'SVG logos are refused');
select ok(not app.is_valid_setting('appearance.logo',
  jsonb_build_object('type', 'image/png', 'data', (select value ->> 'data' from logos where name = 'jpeg'))),
  'a file whose bytes are not the type it claims is refused');
select ok(not app.is_valid_setting('appearance.logo', '{"type": "image/png", "data": "not base64!"}'), 'broken base64 is refused');
select ok(not app.is_valid_setting('appearance.logo', '{"type": "image/png", "data": ""}'), 'an empty logo is refused');
select ok(not app.is_valid_setting('appearance.logo',
  (select value || '{"url": "https://example.com/x.png"}' from logos where name = 'png')),
  'a logo with extra fields is refused');

-- Who saves the gym's look
select tests.authenticate_as(tests.staff('owner'));
select lives_ok(
  $$ insert into public.settings (key, value) values ('appearance.brand_color', '"blue"'), ('appearance.corner_style', '"medium"') $$,
  'staff with settings.edit and all branches save the gym''s look'
);
select throws_ok(
  $$ insert into public.settings (branch_id, key, value) values (tests.branch('B901'), 'appearance.corner_style', '"sharp"') $$,
  '23514', null, 'a branch cannot have its own look'
);
select lives_ok(
  $$ insert into public.settings (key, value) select 'appearance.logo', value from logos where name = 'png' $$,
  'the gym''s logo is saved in settings'
);
select is(
  (select new_values -> 'value' from public.audit_logs
    where table_name = 'settings' and new_values ->> 'key' = 'appearance.logo' and occurred_at = now()),
  '{"type": "image/png", "bytes": 16}'::jsonb,
  'the audit log keeps the logo''s type and size, not the picture'
);

select tests.authenticate_as(tests.staff('manager_a'));
select is(
  tests.row_count($$ update public.settings set value = '"purple"' where key = 'appearance.brand_color' $$),
  0, 'settings.edit without all branches cannot change the gym''s look'
);
select tests.authenticate_as(tests.staff('reception_a'));
select set_eq(
  $$ select value #>> '{}' from public.settings where key in ('appearance.brand_color', 'appearance.corner_style') $$,
  array['blue', 'medium'], 'every staff member reads the gym''s look'
);
select throws_ok(
  $$ insert into public.settings (key, value) values ('appearance.brand_color', '"gray"') $$,
  '42501', null, 'staff without settings.edit cannot save the gym''s look'
);

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is_empty($$ select 1 from public.settings where key like 'appearance.%' $$, 'another gym cannot read the look');

select tests.authenticate_as_service_role();
update public.gyms set suspended_at = now() where code = 'pgtap-a';
select tests.authenticate_as(tests.staff('owner'));
select throws_ok(
  $$ update public.settings set value = '"gray"' where key = 'appearance.brand_color' $$,
  '42501', 'gym_read_only', 'a read-only gym cannot change its look'
);
select tests.authenticate_as_service_role();
update public.gyms set suspended_at = null where code = 'pgtap-a';

-- Each staff member's own look
select tests.authenticate_as(tests.staff('reception_a'));
select is(
  tests.row_count($$ update public.staff_users set theme_preference = 'dark', text_size = 'large' where username = 'reception_a' $$),
  1, 'staff choose their own light/dark and text size'
);
select throws_ok(
  $$ update public.staff_users set text_size = 'huge' where username = 'reception_a' $$,
  '23514', null, 'unknown text sizes are refused'
);
select throws_ok(
  $$ update public.staff_users set theme_preference = 'sepia' where username = 'reception_a' $$,
  '23514', null, 'unknown themes are refused'
);

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ update public.staff_users set text_size = 'normal' where username = 'reception_a' $$,
  '42501', 'own_preference_only', 'a manager cannot change the look of staff they manage'
);
select lives_ok(
  $$ insert into public.staff_users (id, username, full_name, role_id, theme_preference, text_size)
     values (tests.auth_user_id('new_a'), 'new_a', 'کارمەندی نوێ', tests.role('receptionist'), 'dark', 'large') $$,
  'a manager can add staff'
);
select tests.authenticate_as_service_role();
select is(
  (select array[theme_preference, text_size] from public.staff_users where username = 'new_a'),
  array[null, null]::text[],
  'new staff start without a look of their own, whatever the manager sent'
);

select * from finish();
rollback;
