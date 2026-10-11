-- Platform admins (spec §2.6, step MT-3, migration 20261010100500): their accounts, the rule that
-- one login is never both staff and platform admin, recovery codes, the scripts' functions and the
-- seller log. Which functions refuse whom is checked for every seller function at once in
-- 200-platform-isolation.
begin;
select plan(66);
select tests.create_fixture();

select tests.create_platform_admin('ali@clickgroup.example');
select tests.create_platform_admin('sara@clickgroup.example');
select tests.create_platform_admin('former@clickgroup.example', is_active => false);

-- Codes the tests receive, kept for the checks below.
create temporary table codes (owner text not null, code text not null);
grant select, insert on codes to authenticated;

-- One login is never both ------------------------------------------------------------------------

select throws_ok(
  $$ insert into platform.admins (user_id, full_name) values (tests.staff('owner'), 'خاوەن') $$,
  '23514', 'staff_cannot_be_platform_admin',
  'a staff member never becomes a platform admin'
);
select tests.create_auth_user('loose');
select throws_ok(
  $$ insert into platform.admins (user_id, full_name) values (tests.auth_user_id('loose'), 'کەسێک') $$,
  '23514', 'staff_cannot_be_platform_admin',
  'a staff login address never becomes a platform admin, even without a staff account'
);

-- The other direction on its own: past the first trigger, a platform admin's login still can't
-- get a staff account, not even from server code.
alter table platform.admins disable trigger guard;
insert into platform.admins (user_id, full_name, must_change_password) values (tests.auth_user_id('loose'), 'کەسێک', false);
alter table platform.admins enable trigger guard;
select throws_ok(
  $$ insert into public.staff_users (id, gym_id, username, full_name, role_id)
     values (tests.auth_user_id('loose'), tests.gym('pgtap-a'), 'loose', 'کەسێک', tests.role('receptionist')) $$,
  '23514', 'platform_admin_cannot_be_staff',
  'a platform admin''s login never becomes a staff member, even for server code'
);
delete from platform.admins where user_id = tests.auth_user_id('loose');

-- The signed-in admin ------------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal1');
select results_eq(
  $$ select email, full_name, aal2, has_two_step, recovery_codes_left, active_admins from public.seller_me() $$,
  $$ values ('ali@clickgroup.example'::text, 'بەڕێوەبەری ali'::text, false, true, 0, 2) $$,
  'seller_me() answers before the second login step, so the login flow knows what comes next'
);
select throws_ok(
  $$ select * from public.seller_admins() $$,
  '42501', 'mfa_required',
  'before the second step nothing else works'
);

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select is((select aal2 from public.seller_me()), true, 'after the second step the session is aal2');
select results_eq(
  $$ select email, is_active from public.seller_admins() $$,
  $$ values ('ali@clickgroup.example'::text, true), ('sara@clickgroup.example'::text, true),
            ('former@clickgroup.example'::text, false) $$,
  'seller_admins() lists every platform admin, active ones first'
);

-- A password someone else chose.
select tests.clear_authentication();
update platform.admins set must_change_password = true where user_id = tests.platform_admin('sara@clickgroup.example');
select tests.authenticate_with_aal(tests.platform_admin('sara@clickgroup.example'), 'aal2');
select throws_ok(
  $$ select * from public.seller_admins() $$,
  '42501', 'password_change_required',
  'an admin with a password someone else chose must choose their own first'
);
select is((select must_change_password from public.seller_me()), true, 'seller_me() tells the panel so');
select tests.clear_authentication();
update auth.users set encrypted_password = extensions.crypt('her-own-password', extensions.gen_salt('bf', 4))
 where id = tests.platform_admin('sara@clickgroup.example');
select is(
  (select must_change_password from platform.admins where user_id = tests.platform_admin('sara@clickgroup.example')),
  false,
  'changing their own password clears it'
);

-- Adding a platform admin ---------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_prepare_add_admin('Ali.New@ClickGroup.example') $$,
  '22023', 'invalid_email', 'addresses are lowercase (Auth keeps them so)');
select throws_ok($$ select public.seller_prepare_add_admin('boss@pgtap-a.staff.gym-spa.invalid') $$,
  '22023', 'invalid_email', 'a staff login address is never a platform admin''s');
select throws_ok($$ select public.seller_prepare_add_admin('not-an-address') $$,
  '22023', 'invalid_email', 'a platform admin needs a real email address');
select throws_ok($$ select public.seller_prepare_add_admin('sara@clickgroup.example') $$,
  '23505', 'email_taken', 'an address that already has an account is refused');
select lives_ok($$ select public.seller_prepare_add_admin('newcomer@clickgroup.example') $$,
  'a new address is accepted');

-- The login the seller-admin function makes next.
select tests.clear_authentication();
insert into auth.users (id, email, aud, role, raw_app_meta_data)
values ('a0000000-0000-4000-8000-000000000001', 'newcomer@clickgroup.example', 'authenticated', 'authenticated',
        '{"platform_admin": true}');

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_add_admin('a0000000-0000-4000-8000-000000000001', ' ') $$,
  '22023', 'invalid_request', 'a platform admin needs a real name');
select lives_ok($$ select public.seller_add_admin('a0000000-0000-4000-8000-000000000001', 'هاوکاری نوێ') $$,
  'a platform admin adds another one');
select throws_ok($$ select public.seller_add_admin(tests.staff('owner'), 'خاوەن') $$,
  '23514', 'staff_cannot_be_platform_admin', 'the panel can''t make a staff member a platform admin');

select tests.clear_authentication();
select results_eq(
  $$ select must_change_password, is_active, created_by from platform.admins
      where user_id = 'a0000000-0000-4000-8000-000000000001' $$,
  $$ values (true, true, tests.platform_admin('ali@clickgroup.example')) $$,
  'a new platform admin must choose their own password, and the row says who added them'
);
select results_eq(
  $$ select actor_id, actor_email, target_admin_id, details ->> 'email' from platform.audit_logs
      where action = 'admin_created' $$,
  $$ values (tests.platform_admin('ali@clickgroup.example'), 'ali@clickgroup.example'::text,
             'a0000000-0000-4000-8000-000000000001'::uuid, 'newcomer@clickgroup.example'::text) $$,
  'adding a platform admin is logged with who did it'
);

-- Changes to another platform admin --------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok(
  $$ select * from public.seller_prepare_admin_change(tests.platform_admin('ali@clickgroup.example'), 'reset_password') $$,
  '42501', 'cannot_change_own_admin', 'nobody changes their own account here'
);
select throws_ok(
  $$ select * from public.seller_prepare_admin_change(tests.staff('owner'), 'deactivate') $$,
  '22023', 'admin_not_found', 'a staff member is no platform admin'
);
select throws_ok(
  $$ select * from public.seller_prepare_admin_change(tests.platform_admin('sara@clickgroup.example'), 'delete') $$,
  '22023', 'invalid_request', 'only deactivate, reactivate, reset_two_step and reset_password exist'
);
select results_eq(
  $$ select email, is_active from public.seller_prepare_admin_change(tests.platform_admin('sara@clickgroup.example'), 'reset_two_step') $$,
  $$ values ('sara@clickgroup.example'::text, true) $$,
  'the check returns the address the Auth change needs'
);

select throws_ok(
  $$ select public.seller_set_admin_active(tests.platform_admin('ali@clickgroup.example'), false) $$,
  '42501', 'cannot_change_own_admin', 'nobody deactivates themself'
);
select lives_ok(
  $$ select public.seller_set_admin_active(tests.platform_admin('sara@clickgroup.example'), false) $$,
  'a platform admin deactivates another one'
);
select tests.authenticate_with_aal(tests.platform_admin('sara@clickgroup.example'), 'aal2');
select throws_ok($$ select * from public.seller_me() $$, '42501', 'not_platform_admin',
  'a deactivated platform admin loses all access at once');

-- The last active one.
select tests.clear_authentication();
update platform.admins set is_active = false where user_id = 'a0000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ update platform.admins set is_active = false where user_id = tests.platform_admin('ali@clickgroup.example') $$,
  '42501', 'last_platform_admin',
  'the last active platform admin can never be deactivated, not even by server code'
);

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select lives_ok(
  $$ select public.seller_set_admin_active(tests.platform_admin('sara@clickgroup.example'), true) $$,
  'and reactivates them'
);

-- Two-step and password resets, after the Auth change.
select tests.clear_authentication();
insert into platform.recovery_codes (admin_id, code_hash)
values (tests.platform_admin('sara@clickgroup.example'), app.recovery_code_hash('aaaa-bbbb-cccc-dddd'));
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select lives_ok(
  $$ select public.seller_record_admin_change(tests.platform_admin('sara@clickgroup.example'), 'reset_two_step') $$,
  'a two-step reset is recorded'
);
select lives_ok(
  $$ select public.seller_record_admin_change(tests.platform_admin('sara@clickgroup.example'), 'reset_password') $$,
  'a password reset is recorded'
);
select throws_ok(
  $$ select public.seller_record_admin_change(tests.platform_admin('sara@clickgroup.example'), 'deactivate') $$,
  '22023', 'invalid_request', 'deactivating has its own function'
);
select tests.clear_authentication();
select is(
  (select count(*)::integer from platform.recovery_codes where admin_id = tests.platform_admin('sara@clickgroup.example')),
  0, 'a two-step reset voids the admin''s recovery codes'
);
select is(
  (select must_change_password from platform.admins where user_id = tests.platform_admin('sara@clickgroup.example')),
  true, 'after a password reset they choose their own again'
);
select set_eq(
  $$ select action from platform.audit_logs
      where target_admin_id = tests.platform_admin('sara@clickgroup.example')
        and actor_id = tests.platform_admin('ali@clickgroup.example') $$,
  array['admin_deactivated', 'admin_reactivated', 'admin_two_step_reset', 'admin_password_reset'],
  'every change to another platform admin is logged with who made it'
);

-- Recovery codes -------------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
insert into codes select 'ali-1', c from public.seller_new_recovery_codes() c;
select tests.clear_authentication();
select is((select count(distinct code)::integer from codes where owner = 'ali-1'), 10, 'a set is ten different codes');
select is_empty(
  $$ select code from codes where code !~ '^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$' $$,
  'written xxxx-xxxx-xxxx-xxxx, with no look-alike characters'
);
select set_eq(
  $$ select code_hash from platform.recovery_codes where admin_id = tests.platform_admin('ali@clickgroup.example') $$,
  $$ select extensions.digest(replace(code, '-', ''), 'sha256') from codes where owner = 'ali-1' $$,
  'only the SHA-256 of each code is stored'
);

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
insert into codes select 'ali-2', c from public.seller_new_recovery_codes() c;
select tests.clear_authentication();
select set_eq(
  $$ select code_hash from platform.recovery_codes where admin_id = tests.platform_admin('ali@clickgroup.example') $$,
  $$ select extensions.digest(replace(code, '-', ''), 'sha256') from codes where owner = 'ali-2' $$,
  'a new set replaces the old one'
);

-- Using one: after the password, before the second step (the device is lost).
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal1');
select is(
  public.seller_use_recovery_code((select code from codes where owner = 'ali-2' order by code limit 1)) ->> 'result',
  'ok', 'a recovery code works after the password alone'
);
select is(
  public.seller_use_recovery_code((select code from codes where owner = 'ali-2' order by code limit 1)) ->> 'result',
  'wrong_code', 'each code works once'
);
select is(
  public.seller_use_recovery_code(
    (select upper(replace(code, '-', ' ')) from codes where owner = 'ali-2' order by code offset 1 limit 1)) ->> 'result',
  'ok', 'capitals and spaces typed with a code don''t matter'
);
select is(
  public.seller_use_recovery_code((select code from codes where owner = 'ali-1' limit 1)) ->> 'result',
  'wrong_code', 'a code from a replaced set no longer works'
);
select tests.clear_authentication();
select is(
  (select count(*)::integer from platform.recovery_codes
    where admin_id = tests.platform_admin('ali@clickgroup.example') and used_at is null),
  8, 'used codes are marked used'
);
select results_eq(
  $$ select action, count(*)::integer from platform.audit_logs
      where actor_id = tests.platform_admin('ali@clickgroup.example') and action like 'recovery_code%'
      group by action order by action $$,
  $$ values ('recovery_code_rejected'::text, 2), ('recovery_code_used'::text, 2), ('recovery_codes_created'::text, 2) $$,
  'every new set and every try, right or wrong, is logged'
);

-- Too many wrong codes.
insert into platform.recovery_codes (admin_id, code_hash)
values (tests.platform_admin('sara@clickgroup.example'), app.recovery_code_hash('kkkk-mmmm-nnnn-pppp'));
select tests.authenticate_with_aal(tests.platform_admin('sara@clickgroup.example'), 'aal1');
select is_empty(
  $$ select n from generate_series(1, 5) n where public.seller_use_recovery_code('wrong-' || n) ->> 'result' <> 'wrong_code' $$,
  'five wrong codes'
);
select is(
  public.seller_use_recovery_code('kkkk-mmmm-nnnn-pppp') ->> 'result', 'too_many_attempts',
  'after 5 wrong codes in 15 minutes, even the right one is refused'
);
select tests.clear_authentication();
select is(
  (select used_at from platform.recovery_codes where admin_id = tests.platform_admin('sara@clickgroup.example')),
  null, 'and stays unused'
);
select is(
  (select count(*)::integer from platform.audit_logs
    where actor_id = tests.platform_admin('sara@clickgroup.example') and details ->> 'blocked' = 'true'),
  1, 'the refused try is logged too'
);
alter table platform.audit_logs disable trigger append_only;
update platform.audit_logs set occurred_at = now() - interval '16 minutes'
 where actor_id = tests.platform_admin('sara@clickgroup.example');
alter table platform.audit_logs enable trigger append_only;
select tests.authenticate_with_aal(tests.platform_admin('sara@clickgroup.example'), 'aal1');
select is(
  public.seller_use_recovery_code('kkkk-mmmm-nnnn-pppp') ->> 'result', 'ok',
  '15 minutes later the right code works again'
);

select tests.authenticate_with_aal(tests.platform_admin('former@clickgroup.example'), 'aal1');
select throws_ok($$ select public.seller_use_recovery_code('kkkk-mmmm-nnnn-pppp') $$, '42501', 'not_platform_admin',
  'a deactivated platform admin can''t use recovery codes');

-- Scripts with the secret key ---------------------------------------------------------------------

select tests.clear_authentication();
insert into auth.users (id, email, aud, role)
values ('a0000000-0000-4000-8000-000000000002', 'boss@clickgroup.example', 'authenticated', 'authenticated');

select tests.authenticate_as_service_role();
select lives_ok(
  $$ select public.platform_script_add_admin('a0000000-0000-4000-8000-000000000002', 'بەڕێوەبەری یەکەم') $$,
  'the bootstrap script adds a platform admin'
);
select results_eq(
  $$ select user_id, is_active from public.platform_script_find_admin('boss@clickgroup.example') $$,
  $$ values ('a0000000-0000-4000-8000-000000000002'::uuid, true) $$,
  'scripts find a platform admin by address'
);
select is_empty(
  $$ select * from public.platform_script_find_admin('owner@pgtap-a.staff.gym-spa.invalid') $$,
  'a staff login is no platform admin to the scripts either'
);
select lives_ok(
  $$ select public.platform_script_record(tests.platform_admin('sara@clickgroup.example'), 'reset_two_step') $$,
  'the last-resort script records a two-step reset'
);
select throws_ok(
  $$ select public.platform_script_record(tests.staff('owner'), 'reset_two_step') $$,
  '22023', 'admin_not_found', 'scripts reset only platform admins'
);
select tests.clear_authentication();
select results_eq(
  $$ select action, actor_id, details ->> 'by' from platform.audit_logs
      where target_admin_id = 'a0000000-0000-4000-8000-000000000002' $$,
  $$ values ('admin_created'::text, null::uuid, 'script'::text) $$,
  'a script''s change is logged without an actor'
);
select is(
  (select count(*)::integer from platform.audit_logs
    where target_admin_id = tests.platform_admin('sara@clickgroup.example')
      and action = 'admin_two_step_reset' and actor_id is null),
  1, 'the last-resort reset is logged too'
);

-- Platform admin logins left behind -----------------------------------------------------------------
-- Only a login the seller-admin function made for an admin (app_metadata.platform_admin) that was
-- never added, without a staff account, older than 2 minutes, may be deleted to free its address.

insert into auth.users (id, email, aud, role, raw_app_meta_data, created_at) values
  ('a0000000-0000-4000-8000-000000000010', 'lost@clickgroup.example', 'authenticated', 'authenticated',
   '{"platform_admin": true}', now() - interval '3 minutes'),
  ('a0000000-0000-4000-8000-000000000011', 'fresh@clickgroup.example', 'authenticated', 'authenticated',
   '{"platform_admin": true}', now() - interval '1 minute'),
  ('a0000000-0000-4000-8000-000000000012', 'someone@clickgroup.example', 'authenticated', 'authenticated',
   '{}', now() - interval '1 day');
update auth.users set raw_app_meta_data = '{"platform_admin": true}', created_at = now() - interval '1 day'
 where id in (tests.platform_admin('ali@clickgroup.example'), tests.staff('reception_a'));

select tests.authenticate_as_service_role();
select is(public.platform_admin_orphan('lost@clickgroup.example'), 'a0000000-0000-4000-8000-000000000010'::uuid,
  'a login made for an admin who was never added, older than 2 minutes, is left behind');
select is(public.platform_admin_orphan('fresh@clickgroup.example'), null,
  'never one made less than 2 minutes ago (its add may still be running)');
select is(public.platform_admin_orphan('someone@clickgroup.example'), null,
  'never one the seller panel didn''t make');
select is(public.platform_admin_orphan('ali@clickgroup.example'), null, 'never a platform admin');
select is(public.platform_admin_orphan('reception_a@pgtap-a.staff.gym-spa.invalid'), null, 'never a staff member');

-- The seller log ------------------------------------------------------------------------------------

select tests.clear_authentication();
select throws_ok($$ update platform.audit_logs set reason = 'changed' $$, '42501', 'audit_log_append_only',
  'the seller log can''t be changed');
select throws_ok($$ delete from platform.audit_logs $$, '42501', 'audit_log_append_only',
  'or deleted');

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select is((select count(*)::integer from public.seller_audit_log(p_limit => 3)), 3, 'the log comes in pages');

select * from finish();
rollback;
