-- MT-5: offline licenses, the cloud half. An offline gym's bare record, licenses and activations
-- issued in two steps (prepare, then issue with a code whose payload must equal the fields),
-- revoking and deactivating as records with a reason, one active server PC per gym, the log, and
-- app.normalize_machine_code() with the cases packages/core runs too. Postgres can't check an
-- Ed25519 signature, so the codes here carry real payloads and a dummy signature. Staff and
-- everyone else are refused by every seller function in 200-platform-isolation.
begin;
select plan(47);
select tests.create_fixture();
select tests.create_platform_admin('ali@clickgroup.example');

-- Machine codes: the same cases as normalizeMachineCode() in packages/core (it reads this list) ---

create temporary table machine_code_cases (raw text, expected text);
insert into machine_code_cases (raw, expected) values
  ('0V5Q1BD4TS11N9TC9402', '0V5Q1BD4TS11N9TC9402'),
  ('0V5Q-1BD4-TS11-N9TC-9402', '0V5Q1BD4TS11N9TC9402'),
  ('0v5q-1bd4-ts11-n9tc-9402', '0V5Q1BD4TS11N9TC9402'),
  (' 0V5Q 1BD4 TS11 N9TC 9402 ', '0V5Q1BD4TS11N9TC9402'),
  ('OV5Q-IBD4-TSlL-N9TC-94O2', '0V5Q1BD4TS11N9TC9402'),
  ('٠V5Q-١BD٤-TS١١-N٩TC-٩٤٠٢', '0V5Q1BD4TS11N9TC9402'),
  ('۰V5Q-۱BD۴-TS۱۱-N۹TC-۹۴۰۲', '0V5Q1BD4TS11N9TC9402'),
  ('DGX21S5Z03FHX48R11YP', 'DGX21S5Z03FHX48R11YP'),
  ('dgx2-1s5z-03fh-x48r-11yp', 'DGX21S5Z03FHX48R11YP'),
  ('0V5Q1BD4TS11N9TC9403', null),
  ('1V5Q1BD4TS11N9TC9402', null),
  ('V05Q1BD4TS11N9TC9402', null),
  ('0V5Q1BD4TS11N9TC940', null),
  ('0V5Q1BD4TS11N9TC94020', null),
  ('0U5Q1BD4TS11N9TC9402', null),
  ('0V5Q_1BD4_TS11_N9TC_9402', null),
  ('DGX21S5Z03FHX48R11YQ', null),
  ('', null),
  ('    ', null);
grant select on machine_code_cases to authenticated;

select is_empty(
  $$ select raw, expected, app.normalize_machine_code(raw) as got from machine_code_cases
      where app.normalize_machine_code(raw) is distinct from expected $$,
  'app.normalize_machine_code() reads every shared case like the app: typing forgiven, typos and swaps caught'
);
select is(app.normalize_machine_code(null), null, 'no code, no machine code');

-- Codes with real payloads and a dummy signature ----------------------------------------------------

create function pg_temp.code(prefix text, payload jsonb)
returns text
language sql
immutable
as $$
  select prefix || '.'
      || rtrim(translate(replace(encode(convert_to(payload::text, 'UTF8'), 'base64'), E'\n', ''), '+/', '-_'), '=')
      || '.' || repeat('A', 86)
$$;

create function pg_temp.license_payload(
  license_id uuid, gym_id uuid, gym_code text, gym_name text, type text, max_branches integer,
  issued_on date, valid_until date
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'v', 1, 'lid', license_id, 'kid', 'test-pgtap', 'gid', gym_id, 'gc', gym_code, 'gn', gym_name,
    't', type, 'mb', max_branches, 'md', null, 'f', '[]'::jsonb,
    'iat', to_char(issued_on, 'YYYY-MM-DD'),
    case when type = 'yearly' then 'exp' else 'upd' end, to_char(valid_until, 'YYYY-MM-DD'))
$$;

select is(
  app.license_code_payload(pg_temp.code('GSL1', '{"v":1,"gn":"جیم"}'), 'GSL1'),
  '{"v":1,"gn":"جیم"}'::jsonb, 'a code''s payload reads back, Kurdish included'
);
select is(app.license_code_payload(pg_temp.code('GSA1', '{"v":1}'), 'GSL1'), null,
  'an activation code is no license code');
select is(app.license_code_payload('GSL1.!!!.' || repeat('A', 86), 'GSL1'), null, 'nor is junk');

-- An offline gym's record ---------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_create_offline_gym(gen_random_uuid(), 'admin', 'جیمی ئۆفلاین') $$,
  '23514', 'reserved_gym_code', 'an offline gym''s code follows the same rules');
select throws_ok($$ select public.seller_create_offline_gym(gen_random_uuid(), 'pgtap-a', 'جیمی ئۆفلاین') $$,
  '23505', 'gym_code_taken', 'and is never reused');
select lives_ok(
  $$ select public.seller_create_offline_gym('55000000-0000-4000-8000-000000000001', 'pgtap-off', 'جیمی ئۆفلاین') $$,
  'a platform admin makes an offline gym''s record'
);
select is(
  (select row(g.edition, g.name_ckb, g.access)::text from public.seller_gyms('55000000-0000-4000-8000-000000000001') g),
  row('offline', 'جیمی ئۆفلاین', 'active')::text,
  'an offline gym, in the seller''s list'
);
select is(
  (select count(*)::integer from public.branches b where b.gym_id = '55000000-0000-4000-8000-000000000001')
  + (select count(*)::integer from public.roles r where r.gym_id = '55000000-0000-4000-8000-000000000001'),
  0, 'with no branch and no roles: those live on its own server PC'
);
select is(
  (select l.details ->> 'edition' from public.seller_audit_log('55000000-0000-4000-8000-000000000001') l
    where l.action = 'gym_created'),
  'offline', 'the seller log says an offline gym was made'
);
select lives_ok(
  $$ select public.seller_rename_gym('55000000-0000-4000-8000-000000000001', 'جیمی ناوخۆ', null, null) $$,
  'its name can be corrected (the next license carries it)'
);
select throws_ok(
  $$ select public.seller_set_paid_until('55000000-0000-4000-8000-000000000001', now()) $$,
  '22023', 'offline_gym', 'but it has no subscription: it follows its license'
);

-- Licenses ------------------------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.seller_prepare_license(tests.gym('pgtap-a'), 'yearly', null, null, app.baghdad_today() + 365) $$,
  '22023', 'online_gym', 'an online gym has no license'
);
select throws_ok(
  $$ select * from public.seller_prepare_license(gen_random_uuid(), 'yearly', null, null, app.baghdad_today() + 365) $$,
  '22023', 'gym_not_found', 'nor does a gym that doesn''t exist'
);
select throws_ok(
  $$ select * from public.seller_prepare_license('55000000-0000-4000-8000-000000000001', 'monthly', null, null, app.baghdad_today() + 30) $$,
  '22023', 'invalid_request', 'a license is yearly or perpetual'
);
select throws_ok(
  $$ select * from public.seller_prepare_license('55000000-0000-4000-8000-000000000001', 'yearly', 0, null, app.baghdad_today() + 365) $$,
  '22023', 'invalid_request', 'a limit is at least 1'
);
select throws_ok(
  $$ select * from public.seller_prepare_license('55000000-0000-4000-8000-000000000001', 'yearly', null, null, app.baghdad_today()) $$,
  '22023', 'invalid_license_date', 'a yearly license ends after today'
);
select throws_ok(
  $$ select * from public.seller_prepare_license('55000000-0000-4000-8000-000000000001', 'yearly', null, null, (app.baghdad_today() + interval '24 months' + interval '1 day')::date) $$,
  '22023', 'invalid_license_date', 'and within 2 years'
);
select lives_ok(
  $$ select * from public.seller_prepare_license('55000000-0000-4000-8000-000000000001', 'perpetual', null, null, (app.baghdad_today() + interval '60 months')::date) $$,
  'perpetual updates may run 5 years'
);
select results_eq(
  $$ select gym_code, gym_name, issued_on from public.seller_prepare_license('55000000-0000-4000-8000-000000000001', 'yearly', 2, null, app.baghdad_today() + 365) $$,
  $$ values ('pgtap-off', 'جیمی ناوخۆ', app.baghdad_today()) $$,
  'prepare answers what the code will carry: the gym''s code, its name now, and today'
);

select throws_ok(
  format($$ select public.seller_issue_license('55100000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001', 'yearly', 2, null, app.baghdad_today(),
      app.baghdad_today() + 365, 'test-pgtap', %L) $$,
    pg_temp.code('GSL1', pg_temp.license_payload('55100000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001', 'pgtap-off', 'جیمی ناوخۆ', 'yearly', 3,
      app.baghdad_today(), app.baghdad_today() + 365))),
  '22023', 'license_code_mismatch', 'a code that carries other fields (3 branches, not 2) is never stored'
);
select throws_ok(
  format($$ select public.seller_issue_license('55100000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001', 'yearly', 2, null, app.baghdad_today() - 2,
      app.baghdad_today() + 365, 'test-pgtap', %L) $$,
    pg_temp.code('GSL1', pg_temp.license_payload('55100000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001', 'pgtap-off', 'جیمی ناوخۆ', 'yearly', 2,
      app.baghdad_today() - 2, app.baghdad_today() + 365))),
  '22023', 'invalid_request', 'a license is issued today (or yesterday, across midnight), never earlier'
);
select lives_ok(
  format($$ select public.seller_issue_license('55100000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001', 'yearly', 2, null, app.baghdad_today(),
      app.baghdad_today() + 365, 'test-pgtap', %L) $$,
    pg_temp.code('GSL1', pg_temp.license_payload('55100000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001', 'pgtap-off', 'جیمی ناوخۆ', 'yearly', 2,
      app.baghdad_today(), app.baghdad_today() + 365))),
  'a code with exactly the fields is stored'
);
select results_eq(
  $$ select type, max_branches, max_devices, expires_on, updates_until, created_by_email, revoked_at
       from public.seller_licenses('55000000-0000-4000-8000-000000000001') $$,
  $$ values ('yearly', 2, null::integer, app.baghdad_today() + 365, null::date, 'ali@clickgroup.example', null::timestamptz) $$,
  'the seller sees the license with who issued it'
);
select throws_ok(
  format($$ select public.seller_issue_license('55100000-0000-4000-8000-000000000002',
      '55000000-0000-4000-8000-000000000001', 'yearly', 2, null, app.baghdad_today(),
      app.baghdad_today() + 365, 'test-pgtap', %L) $$,
    pg_temp.code('GSL1', pg_temp.license_payload('55100000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001', 'pgtap-off', 'جیمی ناوخۆ', 'yearly', 2,
      app.baghdad_today(), app.baghdad_today() + 365))),
  '22023', 'license_code_mismatch', 'a code is stored only under its own license id'
);
select is(
  (select count(*)::integer from public.seller_audit_log('55000000-0000-4000-8000-000000000001') l
    where l.action = 'license_issued'
      and l.details ->> 'license_id' = '55100000-0000-4000-8000-000000000001'
      and l.actor_email = 'ali@clickgroup.example'),
  1, 'the seller log shows the license issued, by whom'
);

-- The server PC --------------------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.seller_prepare_activation('55000000-0000-4000-8000-000000000001', '0V5Q-1BD4-TS11-N9TC-9403') $$,
  '22023', 'invalid_machine_code', 'a mistyped machine code is caught before anything is signed'
);
select results_eq(
  $$ select machine_code, issued_on from public.seller_prepare_activation('55000000-0000-4000-8000-000000000001', 'ov5q-ibd4-ts11-n9tc-9402') $$,
  $$ values ('0V5Q1BD4TS11N9TC9402', app.baghdad_today()) $$,
  'prepare answers the machine code as it will be signed'
);
select lives_ok(
  format($$ select public.seller_issue_activation('55200000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001', '0V5Q1BD4TS11N9TC9402', app.baghdad_today(), 'test-pgtap', %L) $$,
    pg_temp.code('GSA1', jsonb_build_object('v', 1, 'aid', '55200000-0000-4000-8000-000000000001',
      'kid', 'test-pgtap', 'gid', '55000000-0000-4000-8000-000000000001', 'mc', '0V5Q1BD4TS11N9TC9402',
      'iat', to_char(app.baghdad_today(), 'YYYY-MM-DD')))),
  'the server PC is activated'
);
select results_eq(
  $$ select license_id, machine_code, created_by_email, deactivated_at
       from public.seller_activations('55000000-0000-4000-8000-000000000001') $$,
  $$ values ('55100000-0000-4000-8000-000000000001'::uuid, '0V5Q1BD4TS11N9TC9402', 'ali@clickgroup.example', null::timestamptz) $$,
  'with the license it was made from, and who made it'
);
select throws_ok(
  $$ select * from public.seller_prepare_activation('55000000-0000-4000-8000-000000000001', 'DGX21S5Z03FHX48R11YP') $$,
  '23505', 'already_activated', 'one server PC at a time'
);
select throws_ok(
  $$ select public.seller_deactivate_activation('55200000-0000-4000-8000-000000000001', null) $$,
  '22023', 'reason_required', 'deactivating needs a reason'
);
select lives_ok(
  $$ select public.seller_deactivate_activation('55200000-0000-4000-8000-000000000001', 'کۆمپیوتەری نوێ') $$,
  'the old PC is deactivated (a record: the PC itself can''t be reached)'
);
select lives_ok(
  $$ select public.seller_deactivate_activation('55200000-0000-4000-8000-000000000001', 'دووبارە') $$,
  'deactivating again changes nothing'
);
select lives_ok(
  format($$ select public.seller_issue_activation('55200000-0000-4000-8000-000000000002',
      '55000000-0000-4000-8000-000000000001', 'DGX21S5Z03FHX48R11YP', app.baghdad_today(), 'test-pgtap', %L) $$,
    pg_temp.code('GSA1', jsonb_build_object('v', 1, 'aid', '55200000-0000-4000-8000-000000000002',
      'kid', 'test-pgtap', 'gid', '55000000-0000-4000-8000-000000000001', 'mc', 'DGX21S5Z03FHX48R11YP',
      'iat', to_char(app.baghdad_today(), 'YYYY-MM-DD')))),
  'then the new PC is activated'
);
select is(
  (select deactivate_reason from public.seller_activations('55000000-0000-4000-8000-000000000001')
    where id = '55200000-0000-4000-8000-000000000001'),
  'کۆمپیوتەری نوێ', 'the first reason stays'
);

-- Revoking --------------------------------------------------------------------------------------------

select throws_ok(
  $$ select public.seller_revoke_license('55100000-0000-4000-8000-000000000001', null) $$,
  '22023', 'reason_required', 'revoking needs a reason'
);
select throws_ok(
  $$ select public.seller_revoke_license(gen_random_uuid(), 'هەڵە') $$,
  '22023', 'license_not_found', 'and a license'
);
select lives_ok(
  $$ select public.seller_revoke_license('55100000-0000-4000-8000-000000000001', 'هەڵەی بەروار') $$,
  'a license is revoked'
);
select is(
  (select row(revoked_by_email, revoke_reason)::text from public.seller_licenses('55000000-0000-4000-8000-000000000001')),
  row('ali@clickgroup.example', 'هەڵەی بەروار')::text, 'kept, with who revoked it and why'
);
select is(
  (select l.reason from public.seller_audit_log('55000000-0000-4000-8000-000000000001') l
    where l.action = 'license_revoked'),
  'هەڵەی بەروار', 'and logged'
);
select lives_ok(
  $$ select public.seller_deactivate_activation('55200000-0000-4000-8000-000000000002', 'تاقیکردنەوە') $$,
  'with the PC deactivated too'
);
select throws_ok(
  $$ select * from public.seller_prepare_activation('55000000-0000-4000-8000-000000000001', 'DGX21S5Z03FHX48R11YP') $$,
  '22023', 'no_license', 'a gym with no license that isn''t revoked can''t activate a PC'
);

-- The tables themselves -------------------------------------------------------------------------------

select tests.clear_authentication();
select throws_ok(
  $$ update platform.licenses set code = 'GSL1.e30.' || repeat('A', 86) $$,
  '42501', 'read_only_column', 'a stored code never changes, not even for the server'
);
select throws_ok(
  $$ delete from platform.license_events $$,
  '42501', 'audit_log_append_only', 'the license log is append-only'
);
select throws_ok(
  $$ insert into platform.activations (id, gym_id, license_id, kid, machine_code, issued_on, code, created_by)
     values (gen_random_uuid(), '55000000-0000-4000-8000-000000000001', '55100000-0000-4000-8000-000000000001',
       'test-pgtap', '0V5Q1BD4TS11N9TC9403', current_date, 'GSA1.e30.' || repeat('B', 86), gen_random_uuid()) $$,
  '23514', null, 'the table itself refuses a machine code whose check doesn''t match'
);

select * from finish();
rollback;
