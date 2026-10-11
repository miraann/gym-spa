-- The Auth hook (spec §2.6, step MT-3, migration 20261010100700). Supabase Auth calls it before
-- every token it issues. It must refuse ONLY a staff member of a locked gym and return everything
-- else unchanged, never raising, because it runs for every login of every gym and of Click Group.
begin;
select plan(26);
select tests.create_fixture();
select tests.create_platform_admin('ali@clickgroup.example');
select tests.create_auth_user('stranger');

-- What Supabase Auth sends: the user, the claims of the token it is about to issue, and how they
-- logged in.
create temporary table events (name text primary key, event jsonb);
insert into events (name, event)
select name, jsonb_build_object(
         'user_id', user_id,
         'claims', jsonb_build_object('sub', user_id, 'role', 'authenticated', 'aal', 'aal1',
                                      'email', 'x@example.com', 'session_id', gen_random_uuid()),
         'authentication_method', 'password')
  from (values
    ('owner_a', tests.staff('owner')),
    ('reception_a', tests.staff('reception_a')),
    ('former_a', tests.staff('former_a')),
    ('owner_b', tests.staff('owner', 'pgtap-b')),
    ('platform_admin', tests.platform_admin('ali@clickgroup.example')),
    ('no_staff_row', tests.auth_user_id('stranger')),
    ('unknown', 'f0000000-0000-4000-8000-0000000000ff'::uuid)
  ) as e (name, user_id);

create function pg_temp.hook(name text) returns jsonb language sql as $$
  select auth_hooks.custom_access_token((select e.event from events e where e.name = hook.name))
$$;
create function pg_temp.refused() returns jsonb language sql as $$
  select '{"error": {"http_code": 403, "message": "gym_locked"}}'::jsonb
$$;

-- Who may call it ---------------------------------------------------------------------------------

select ok(has_function_privilege('supabase_auth_admin', 'auth_hooks.custom_access_token(jsonb)', 'execute'),
  'Supabase Auth can call it');
select ok(
  not has_function_privilege('anon', 'auth_hooks.custom_access_token(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'auth_hooks.custom_access_token(jsonb)', 'execute')
    and not has_function_privilege('service_role', 'auth_hooks.custom_access_token(jsonb)', 'execute')
    and not has_schema_privilege('authenticated', 'auth_hooks', 'usage')
    and not has_schema_privilege('anon', 'auth_hooks', 'usage'),
  'nobody else can'
);

-- An active gym: everyone's claims stay as they are ---------------------------------------------

select is(pg_temp.hook('owner_a'), (select event from events where name = 'owner_a'),
  'staff of an active gym get their token unchanged');
select is(pg_temp.hook('platform_admin'), (select event from events where name = 'platform_admin'),
  'a platform admin gets their token unchanged');
select is(pg_temp.hook('no_staff_row'), (select event from events where name = 'no_staff_row'),
  'a user without a staff account gets it unchanged');
select is(pg_temp.hook('unknown'), (select event from events where name = 'unknown'),
  'so does an id nobody has');
select is(pg_temp.hook('former_a'), (select event from events where name = 'former_a'),
  'a deactivated staff member of an active gym too (Auth''s ban stops them, not the hook)');

-- Read-only is not locked ----------------------------------------------------------------------------

update public.gyms set suspended_at = now() where code = 'pgtap-a';
select is(pg_temp.hook('owner_a'), (select event from events where name = 'owner_a'),
  'staff of a suspended (read-only) gym still log in');
update public.gyms set suspended_at = null, paid_until = now() - interval '40 days' where code = 'pgtap-a';
select is(pg_temp.hook('reception_a'), (select event from events where name = 'reception_a'),
  'and of a gym whose subscription ran out');
update public.gyms set paid_until = null where code = 'pgtap-a';

-- A locked gym ----------------------------------------------------------------------------------

update public.gyms set locked_at = now() where code = 'pgtap-a';
select is(pg_temp.hook('owner_a'), pg_temp.refused(), 'the Owner of a locked gym gets no token');
select is(pg_temp.hook('reception_a'), pg_temp.refused(), 'nor does any other staff member');
select is(pg_temp.hook('former_a'), pg_temp.refused(), 'nor a deactivated one');
select is(
  auth_hooks.custom_access_token(jsonb_build_object('user_id', upper(tests.staff('owner')::text), 'claims', '{}'::jsonb)),
  pg_temp.refused(), 'the id written in capitals is still the same staff member'
);
select is(pg_temp.hook('owner_b'), (select event from events where name = 'owner_b'),
  'another gym''s staff are not affected');
select is(pg_temp.hook('platform_admin'), (select event from events where name = 'platform_admin'),
  'neither is Click Group');
select is(pg_temp.hook('no_staff_row'), (select event from events where name = 'no_staff_row'),
  'nor a user without a staff account');

update public.gyms set locked_at = null, deleted_at = now() where code = 'pgtap-a';
select is(pg_temp.hook('owner_a'), pg_temp.refused(), 'a closed gym counts as locked');
update public.gyms set deleted_at = null where code = 'pgtap-a';
select is(pg_temp.hook('owner_a'), (select event from events where name = 'owner_a'),
  'reactivated, its staff get tokens again');

-- Supabase Auth calling it for real (as its own role, at a login and a refresh) is tested with the
-- local Auth server in packages/seller-admin (pnpm test:int).

-- Malformed input: returned as it came, never an error -------------------------------------------

select is(auth_hooks.custom_access_token(null), null, 'nothing');
select is(auth_hooks.custom_access_token('{}'), '{}'::jsonb, 'an empty event');
select is(auth_hooks.custom_access_token('{"user_id": "not-a-uuid", "claims": {}}'),
  '{"user_id": "not-a-uuid", "claims": {}}'::jsonb, 'a user id that is no uuid');
select is(auth_hooks.custom_access_token('{"user_id": 42}'), '{"user_id": 42}'::jsonb, 'a user id that is a number');
select is(
  auth_hooks.custom_access_token(jsonb_build_object('claims', jsonb_build_object('sub', tests.staff('owner')))),
  jsonb_build_object('claims', jsonb_build_object('sub', tests.staff('owner'))),
  'no user id, even with a locked gym''s staff member in the claims'
);
select is(
  auth_hooks.custom_access_token(jsonb_build_object('user_id', tests.staff('owner', 'pgtap-b'), 'claims', 'odd')),
  jsonb_build_object('user_id', tests.staff('owner', 'pgtap-b'), 'claims', 'odd'),
  'claims of an unexpected kind'
);
select is(auth_hooks.custom_access_token('[1, 2]'), '[1, 2]'::jsonb, 'a list instead of an event');
select is(auth_hooks.custom_access_token('"text"'), '"text"'::jsonb, 'text instead of an event');

select * from finish();
rollback;
