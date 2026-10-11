-- The seller panel's gyms (spec §2.6, step MT-3, migration 20261010100600): a gym is created with
-- its first Owner in one transaction, and its subscription end, limits, name and state change only
-- through seller functions, each one logged.
begin;
select plan(53);
select tests.create_fixture();
select tests.create_platform_admin('ali@clickgroup.example');

-- Creating a gym ----------------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_prepare_create_gym('New Gym', 'boss') $$,
  '23514', 'invalid_gym_code', 'a gym code is lowercase Latin letters, digits and hyphens');
select throws_ok($$ select public.seller_prepare_create_gym('admin', 'boss') $$,
  '23514', 'reserved_gym_code', 'reserved codes are refused');
select throws_ok($$ select public.seller_prepare_create_gym('pgtap-a', 'boss') $$,
  '23505', 'gym_code_taken', 'a code that is taken is refused');
select throws_ok($$ select public.seller_prepare_create_gym('new-gym', 'Boss') $$,
  '22023', 'invalid_username', 'the Owner''s username is checked too');
select lives_ok($$ select public.seller_prepare_create_gym('new-gym', 'boss') $$,
  'a new code and a valid username are accepted');

-- The Owner's login, as the seller-admin function makes it next.
select tests.clear_authentication();
insert into auth.users (id, email, aud, role, raw_app_meta_data) values
  ('b0000000-0000-4000-8000-000000000001', 'boss@new-gym.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   '{"gym_id": "c0000000-0000-4000-8000-000000000001"}'),
  ('b0000000-0000-4000-8000-000000000002', 'boss@other-gym.staff.gym-spa.invalid', 'authenticated', 'authenticated',
   '{"gym_id": "c0000000-0000-4000-8000-000000000002"}');

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok(
  $$ select public.seller_create_gym('c0000000-0000-4000-8000-000000000001', 'new-gym', ' ', 'لقی سەرەکی',
       'b0000000-0000-4000-8000-000000000001', 'boss', 'خاوەنی نوێ') $$,
  '22023', 'invalid_request', 'a gym needs a Kurdish name'
);
select throws_ok(
  $$ select public.seller_create_gym('c0000000-0000-4000-8000-000000000001', 'new-gym', 'جیمی نوێ', 'لقی سەرەکی',
       'b0000000-0000-4000-8000-000000000001', 'boss', 'خاوەنی نوێ', p_owner_phone => 'not a phone') $$,
  '22023', 'invalid_request', 'the Owner''s phone is checked'
);
select lives_ok(
  $$ select public.seller_create_gym('c0000000-0000-4000-8000-000000000001', 'new-gym', 'جیمی نوێ', 'لقی سەرەکی',
       'b0000000-0000-4000-8000-000000000001', 'boss', 'خاوەنی نوێ', '2026-12-31 21:00:00+00', 'New Gym', null,
       '0750 123 4567') $$,
  'a platform admin creates a gym with its first Owner'
);
select is(current_setting('app.platform_write', true), 'off', 'the platform write flag is off again afterwards');
select ok(not app.is_system_context(), 'so the platform admin''s session is no system context');

select tests.clear_authentication();
select results_eq(
  $$ select code, name_ckb, name_en, edition, paid_until, created_by from public.gyms
      where id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values ('new-gym'::text, 'جیمی نوێ'::text, 'New Gym'::text, 'online'::text,
             '2026-12-31 21:00:00+00'::timestamptz, tests.platform_admin('ali@clickgroup.example')) $$,
  'the gym is made online, with its subscription end, by the platform admin'
);
select is(
  (select count(*)::integer from public.roles where gym_id = 'c0000000-0000-4000-8000-000000000001'),
  (select count(*)::integer from app.role_templates),
  'with its own copy of the built-in roles'
);
select results_eq(
  $$ select code, name_ckb from public.branches where gym_id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values ('B1'::text, 'لقی سەرەکی'::text) $$,
  'and its first branch, B1'
);
select results_eq(
  $$ select s.username, s.full_name, s.phone, r.key, s.all_branches, s.is_active, s.must_change_password, s.created_by
       from public.staff_users s join public.roles r on r.id = s.role_id
      where s.gym_id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values ('boss'::text, 'خاوەنی نوێ'::text, '0750 123 4567'::text, 'owner'::text, true, true, true,
             tests.platform_admin('ali@clickgroup.example')) $$,
  'and its Owner, with every branch, who must choose their own password'
);
select ok(
  exists (select 1 from public.audit_logs
           where gym_id = 'c0000000-0000-4000-8000-000000000001' and table_name = 'staff_users'
             and actor_id = tests.platform_admin('ali@clickgroup.example')),
  'the gym''s own audit log records the platform admin as the author'
);
select results_eq(
  $$ select actor_id, details ->> 'code', details ->> 'owner_username' from platform.audit_logs
      where action = 'gym_created' and gym_id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values (tests.platform_admin('ali@clickgroup.example'), 'new-gym'::text, 'boss'::text) $$,
  'creating a gym is in the seller log'
);

select tests.authenticate_as(tests.staff('boss', 'new-gym'));
select results_eq(
  $$ select code, access, suspended from public.my_gym() $$,
  $$ values ('new-gym'::text, 'active'::text, false) $$,
  'the new Owner works in the new gym'
);

-- All or nothing: a login without the new gym's address, so the Owner fails.
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok(
  $$ select public.seller_create_gym('c0000000-0000-4000-8000-000000000003', 'third-gym', 'جیمی سێیەم', 'لقی سەرەکی',
       'b0000000-0000-4000-8000-000000000002', 'boss', 'خاوەن') $$,
  '23514', 'staff_login_mismatch', 'the Owner''s login must have the new gym''s address'
);
select tests.clear_authentication();
select is_empty(
  $$ select 1 from public.gyms where code = 'third-gym' or id = 'c0000000-0000-4000-8000-000000000003'
     union all
     select 1 from platform.audit_logs where gym_id = 'c0000000-0000-4000-8000-000000000003' $$,
  'when its Owner fails, the gym is never made (the seller-admin function then deletes the login)'
);
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok(
  $$ select public.seller_create_gym('c0000000-0000-4000-8000-000000000004', 'new-gym', 'جیمی دووبارە', 'لقی سەرەکی',
       'b0000000-0000-4000-8000-000000000002', 'boss', 'خاوەن') $$,
  '23505', 'gym_code_taken', 'a code is never used twice'
);
select throws_ok(
  $$ select public.seller_create_gym('c0000000-0000-4000-8000-000000000004', 'seller', 'جیم', 'لقی سەرەکی',
       'b0000000-0000-4000-8000-000000000002', 'boss', 'خاوەن') $$,
  '23514', 'reserved_gym_code', 'and reserved codes never'
);

-- Subscription end, grace and read-only ---------------------------------------------------------

select lives_ok(
  $$ select public.seller_set_paid_until(tests.gym('pgtap-a'), now() - interval '10 days') $$,
  'a platform admin sets when the subscription ended'
);
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'grace', 'for 30 days after it, the gym is in grace');
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select lives_ok($$ select public.seller_set_paid_until(tests.gym('pgtap-a'), now() - interval '31 days') $$, 'later');
select tests.authenticate_as(tests.staff('owner'));
select results_eq($$ select access, suspended from public.my_gym() $$, $$ values ('read_only'::text, false) $$,
  'then it is read-only, and not suspended');
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select lives_ok($$ select public.seller_set_paid_until(tests.gym('pgtap-a'), null) $$, 'no end date');
select lives_ok($$ select public.seller_set_paid_until(tests.gym('pgtap-a'), null) $$, 'the same date again changes nothing');
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'active', 'without an end date the gym is active');

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_set_paid_until('c0000000-0000-4000-8000-0000000000ff', null) $$,
  '22023', 'gym_not_found', 'an unknown gym is refused');
select tests.clear_authentication();
select public.create_gym('far-away', 'جیمی دوور', 'لقی سەرەکی', p_edition => 'offline');
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_set_paid_until(tests.gym('far-away'), now()) $$,
  '22023', 'offline_gym', 'an offline gym follows its license, not the panel');

-- Suspend, lock, reactivate ------------------------------------------------------------------------

select lives_ok($$ select public.seller_suspend_gym(tests.gym('pgtap-a')) $$, 'suspending needs no reason');
select lives_ok($$ select public.seller_suspend_gym(tests.gym('pgtap-a'), 'دووبارە') $$, 'suspending again changes nothing');
select tests.authenticate_as(tests.staff('owner'));
select results_eq($$ select access, suspended from public.my_gym() $$, $$ values ('read_only'::text, true) $$,
  'a suspended gym is read-only, and says it is suspended');
select is((select count(*)::integer from public.branches), 3, 'its staff still see their data');

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_lock_gym(tests.gym('pgtap-a'), null) $$,
  '22023', 'reason_required', 'locking needs a reason');
select throws_ok($$ select public.seller_lock_gym(tests.gym('pgtap-a'), '  ') $$,
  '22023', 'reason_required', 'a real one');
select lives_ok($$ select public.seller_lock_gym(tests.gym('pgtap-a'), 'هەژماری دزراو') $$, 'with a reason it locks');
select tests.authenticate_as(tests.staff('owner'));
select is((select access from public.my_gym()), 'locked', 'the gym''s staff are told it is locked');
select is((select count(*)::integer from public.branches), 0, 'and see nothing any more');

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select results_eq(
  $$ select access, state_reason from public.seller_gyms(tests.gym('pgtap-a')) $$,
  $$ values ('locked'::text, 'هەژماری دزراو'::text) $$,
  'the panel shows the gym locked, with the reason'
);
select lives_ok($$ select public.seller_reactivate_gym(tests.gym('pgtap-a'), 'کێشەکە چارەسەر کرا') $$, 'reactivating');
select tests.authenticate_as(tests.staff('owner'));
select results_eq($$ select access, suspended from public.my_gym() $$, $$ values ('active'::text, false) $$,
  'ends both the lock and the suspension');

select tests.clear_authentication();
select results_eq(
  $$ select action, reason, details from platform.audit_logs
      where gym_id = tests.gym('pgtap-a') and action in ('gym_suspended', 'gym_locked', 'gym_reactivated')
      order by action $$,
  $$ values ('gym_locked'::text, 'هەژماری دزراو'::text, '{}'::jsonb),
            ('gym_reactivated'::text, 'کێشەکە چارەسەر کرا'::text, '{"was_locked": true, "was_suspended": true}'::jsonb),
            ('gym_suspended'::text, null::text, '{}'::jsonb) $$,
  'each state change is logged once, with its reason'
);
select is(
  (select count(*)::integer from platform.audit_logs where gym_id = tests.gym('pgtap-a') and action = 'gym_paid_until_set'),
  3, 'each new subscription end is logged, and repeating one isn''t'
);

-- Limits and name -------------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_set_limits(tests.gym('pgtap-a'), 0, null) $$,
  '22023', 'invalid_limit', 'a limit is at least 1');
select lives_ok($$ select public.seller_set_limits(tests.gym('pgtap-a'), 3, 2) $$, 'limits are set');
select throws_ok($$ select public.seller_rename_gym(tests.gym('pgtap-a'), ' ', null, null) $$,
  '22023', 'invalid_request', 'a gym keeps a Kurdish name');
select lives_ok($$ select public.seller_rename_gym(tests.gym('pgtap-a'), 'جیمی ئەی', 'Gym A', null) $$, 'the name is fixed');
select tests.clear_authentication();
select results_eq(
  $$ select code, name_ckb, name_en, max_branches, max_devices from public.gyms where id = tests.gym('pgtap-a') $$,
  $$ values ('pgtap-a'::text, 'جیمی ئەی'::text, 'Gym A'::text, 3, 2) $$,
  'the code never changes'
);
select results_eq(
  $$ select details -> 'new' from platform.audit_logs where gym_id = tests.gym('pgtap-a') and action = 'gym_limits_set' $$,
  $$ values ('{"max_branches": 3, "max_devices": 2}'::jsonb) $$,
  'limits are logged with their old and new values'
);

-- Usage counts --------------------------------------------------------------------------------

insert into public.devices (id, gym_id, branch_id, code, name, platform)
values ('d0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), tests.branch('B901'), 'D01', 'پێشوازی', 'windows');
insert into public.device_status (device_id, gym_id, last_seen_at)
values ('d0000000-0000-4000-8000-0000000000a1', tests.gym('pgtap-a'), '2026-10-09 08:00:00+00');
update auth.users set last_sign_in_at = '2026-10-09 09:00:00+00' where id = tests.staff('reception_a');

create temporary table every_gym as select code from public.gyms;
grant select on every_gym to authenticated;

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select results_eq(
  $$ select active_branches, active_staff, active_devices, last_login_at, last_device_seen_at
       from public.seller_gyms(tests.gym('pgtap-a')) $$,
  $$ values (3, 6, 1, '2026-10-09 09:00:00+00'::timestamptz, '2026-10-09 08:00:00+00'::timestamptz) $$,
  'usage is counts and dates only'
);
select set_eq(
  $$ select code from public.seller_gyms() $$,
  $$ select code from every_gym $$,
  'seller_gyms() lists every gym'
);
select is(
  (select count(*)::integer from public.seller_audit_log(tests.gym('pgtap-a'))),
  (select count(*)::integer from public.seller_audit_log() where gym_id = tests.gym('pgtap-a')),
  'the seller log can be read for one gym'
);

select * from finish();
rollback;
