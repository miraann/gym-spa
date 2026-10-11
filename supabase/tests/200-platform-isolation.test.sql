-- Gyms and Click Group are kept apart (spec §2.6, step MT-3):
--   * gym staff never reach the platform tables or any seller function, not even an Owner who set
--     up two-step login on their own;
--   * a platform admin needs two-step login (aal2) for every seller function but the two the login
--     flow needs;
--   * platform admins never read or change a gym's business data: not in any table, not through
--     the gym's own functions.
-- The function and table lists come from the catalog, so new seller functions and new gym tables
-- are covered as soon as they exist.
begin;
select plan(20);
select tests.create_fixture();
select tests.create_platform_admin('ali@clickgroup.example');
select tests.create_platform_admin('former@clickgroup.example', is_active => false);
-- Supabase Auth lets any user set up TOTP; a staff member who did is still no platform admin.
select tests.add_two_step(tests.staff('owner'));

create temporary table seller_functions as
  select p.oid::regprocedure as fn, p.proname::text as name
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'seller\_%';
grant select on seller_functions to authenticated, service_role;

-- The catalog -------------------------------------------------------------------------------------

select ok((select count(*) from seller_functions) >= 19, 'there are seller functions to check');
select is_empty(
  $$ select fn from seller_functions f join pg_proc p on p.oid = f.fn
      where not p.prosecdef or not has_function_privilege('authenticated', p.oid, 'execute') $$,
  'every seller function is security definer, for signed-in users (it checks who they are itself)'
);
select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname like 'platform\_%'
        and (has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('anon', p.oid, 'execute')
          or not has_function_privilege('service_role', p.oid, 'execute')) $$,
  'only the secret key (scripts, the seller-admin function) runs the platform_* functions'
);

-- Gym staff ----------------------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.staff('owner'), 'aal2');
select is_empty(
  $$ select * from (select name, tests.call_with_nulls(fn) as answer from seller_functions) s
      where answer is distinct from 'not_platform_admin' $$,
  'a gym''s Owner, even with two-step login, is refused by every seller function'
);
select is_empty(
  $$ select c.relname from pg_class c
      where c.relnamespace = 'platform'::regnamespace and c.relkind = 'r'
        and tests.error_code(format('select 1 from platform.%I', c.relname)) is distinct from '42501' $$,
  'and can''t read any platform table'
);

select tests.authenticate_as(tests.staff('reception_a'));
select is_empty(
  $$ select * from (select name, tests.call_with_nulls(fn) as answer from seller_functions) s
      where answer is distinct from 'not_platform_admin' $$,
  'neither can any other staff member'
);

-- Others -----------------------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('former@clickgroup.example'), 'aal2');
select is_empty(
  $$ select * from (select name, tests.call_with_nulls(fn) as answer from seller_functions) s
      where answer is distinct from 'not_platform_admin' $$,
  'a deactivated platform admin is refused by every seller function'
);

select tests.authenticate_as_service_role();
select is_empty(
  $$ select * from (select name, tests.call_with_nulls(fn) as answer from seller_functions) s
      where answer is distinct from 'not_platform_admin' and answer not like 'permission denied for function %' $$,
  'the secret key alone is no platform admin either'
);

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal1');
select is_empty(
  $$ select * from (select name, tests.call_with_nulls(fn) as answer from seller_functions) s
      where name not in ('seller_me', 'seller_use_recovery_code') and answer is distinct from 'mfa_required' $$,
  'before the second login step, a platform admin can use no seller function except the login flow''s two'
);
select is_empty(
  $$ select c.relname from pg_class c
      where c.relnamespace = 'platform'::regnamespace and c.relkind = 'r'
        and tests.error_code(format('select 1 from platform.%I', c.relname)) is distinct from '42501' $$,
  'platform admins read the platform tables only through the seller functions'
);

-- A platform admin and the gyms' data ------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.visible_rows(t, tests.gym('pgtap-a')) > 0 or tests.visible_rows(t, tests.gym('pgtap-b')) > 0 $$,
  'a platform admin sees no row of any gym, in any table'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('update public.%I set gym_id = gym_id', t)) > 0 $$,
  'changes none'
);
select is_empty(
  $$ select t from tests.gym_tables() t
      where tests.rows_changed(format('delete from public.%I', t)) > 0 $$,
  'deletes none'
);
select is(
  tests.error_code($$ insert into public.branches (gym_id, code, name_ckb) values (tests.gym('pgtap-a'), 'B990', 'لق') $$),
  '42501', 'adds none'
);
select is((select count(*)::integer from public.gyms), 0,
  'and reads the gyms only through seller_gyms() (their record and counts)');
select is_empty($$ select * from public.my_gym() $$, 'the gym''s own functions have nothing for them');
select throws_ok(
  $$ select * from public.staff_admin_prepare_create('someone', tests.role('receptionist'), true, '{}') $$,
  '42501', 'permission_denied', 'and they can''t manage a gym''s staff'
);

-- The platform write flag (app.is_system_context) ---------------------------------------------------
-- Only seller_create_gym sets it. Set by hand, it means nothing for gym staff or for a platform
-- admin before the second step, and RLS still applies to everyone.

select set_config('app.platform_write', 'on', true);
select tests.authenticate_as(tests.staff('owner'));
select ok(not app.is_system_context(), 'the platform write flag means nothing for gym staff');
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal1');
select ok(not app.is_system_context(), 'nor for a platform admin before the second step');
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select is(
  tests.error_code($$ insert into public.branches (gym_id, code, name_ckb) values (tests.gym('pgtap-a'), 'B990', 'لق') $$),
  '42501', 'and with it a platform admin still can''t write a gym''s tables directly (RLS)'
);

select * from finish();
rollback;
