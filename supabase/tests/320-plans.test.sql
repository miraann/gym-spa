-- Step 3b: plans. save_plan(), the four kinds and their rules, who may change plans and for which
-- branches, plans never deleted, read-only gyms and other gyms.
begin;
select plan(44);
select tests.create_fixture();

select tests.create_role('پلانی لقێک', array['plans.manage']);
select tests.create_staff('plans_a', (select id::text from public.roles where name_ckb = 'پلانی لقێک'), array['B901']);

-- End dates -------------------------------------------------------------------------------------------
-- packages/core/src/plans.test.ts runs the same list through planEndDate(): one case per line.

create temporary table end_date_cases (start date, unit text, count integer, expected date);
insert into end_date_cases (start, unit, count, expected) values
  ('2026-10-24', 'month', 1, '2026-11-23'),
  ('2026-10-01', 'month', 1, '2026-10-31'),
  ('2026-01-28', 'month', 1, '2026-02-27'),
  ('2026-01-29', 'month', 1, '2026-02-28'),
  ('2026-01-31', 'month', 1, '2026-02-28'),
  ('2028-01-31', 'month', 1, '2028-02-29'),
  ('2026-03-31', 'month', 1, '2026-04-30'),
  ('2026-11-30', 'month', 3, '2027-02-28'),
  ('2026-08-31', 'month', 6, '2027-02-28'),
  ('2026-10-24', 'month', 12, '2027-10-23'),
  ('2028-02-29', 'month', 12, '2029-02-28'),
  ('2026-12-15', 'month', 120, '2036-12-14'),
  ('2026-10-24', 'day', 1, '2026-10-24'),
  ('2026-10-24', 'day', 30, '2026-11-22'),
  ('2026-12-31', 'day', 2, '2027-01-01'),
  ('2028-02-28', 'day', 2, '2028-02-29'),
  ('2026-01-01', 'day', 365, '2026-12-31');
select is_empty(
  $$ select * from end_date_cases where app.plan_end_date(start, unit, count) is distinct from expected $$,
  'a plan ends the day before the same date n months later (or that month''s last day), or n - 1 days after it starts'
);

-- Adding plans ------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select lives_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانە', p_kind => 'time',
       p_price => 35000, p_duration_unit => 'month', p_duration_count => 1, p_max_freeze_days => 7) $$,
  'the Owner adds a monthly plan'
);
select results_eq(
  $$ select kind, duration_unit, duration_count, visit_count, price, gender, all_branches, max_freeze_days, is_active
       from public.plans where id = '40000000-0000-4000-8000-000000000001' $$,
  $$ values ('time'::text, 'month'::text, 1, null::integer, 35000::numeric(14,2), 'any'::text, true, 7, true) $$,
  'it is saved for every branch, for anyone, and on sale'
);
select is(
  (select created_by from public.plans where id = '40000000-0000-4000-8000-000000000001'),
  tests.staff('owner'), 'the server writes who added it'
);
select lives_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000002', p_name_ckb => '١٢ جار', p_kind => 'visits',
       p_price => 30000, p_visit_count => 12, p_daily_visit_limit => 1::smallint) $$,
  'a plan of 12 visits'
);
select lives_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000003', p_name_ckb => '٢٠ جار لە دوو مانگدا',
       p_kind => 'hybrid', p_price => 60000, p_duration_unit => 'month', p_duration_count => 2, p_visit_count => 20,
       p_gender => 'female', p_allowed_days => array[1, 3, 5]::smallint[],
       p_allowed_from => '08:00', p_allowed_until => '12:00', p_branch_ids => array[tests.branch('B902')]) $$,
  'a hybrid plan for women, three mornings a week, in one branch'
);
select set_eq(
  $$ select branch_id from public.plan_branches where plan_id = '40000000-0000-4000-8000-000000000003' $$,
  $$ values (tests.branch('B902')) $$,
  'its branch is listed'
);
select lives_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000004', p_name_ckb => 'VIP', p_kind => 'unlimited',
       p_price => 0) $$,
  'an unlimited plan, free'
);

-- The rules of each kind ------------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time', p_price => 1000) $$,
  '23514', null, 'a time plan needs a duration'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'visits',
       p_price => 1000, p_visit_count => 10, p_duration_unit => 'day', p_duration_count => 30) $$,
  '23514', null, 'a visits plan has no duration (that is hybrid)'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'hybrid',
       p_price => 1000, p_duration_unit => 'month', p_duration_count => 1) $$,
  '23514', null, 'a hybrid plan needs visits too'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'unlimited',
       p_price => 1000, p_visit_count => 5) $$,
  '23514', null, 'an unlimited plan has no visit count'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
       p_price => 1000, p_duration_unit => 'month') $$,
  '23514', null, 'a duration has a unit and a count'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
       p_price => 1000, p_duration_unit => 'month', p_duration_count => 121) $$,
  '23514', null, 'at most 10 years'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
       p_price => 1500.5, p_duration_unit => 'day', p_duration_count => 1) $$,
  '23514', null, 'prices are whole dinars'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
       p_price => -1, p_duration_unit => 'day', p_duration_count => 1) $$,
  '23514', null, 'and never below zero'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'visits',
       p_price => 1000, p_visit_count => 10, p_max_freeze_days => 5) $$,
  '23514', null, 'a plan without an end date can''t be frozen'
);
select is(
  (select array_agg(tests.error_code(format(
     $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
          p_price => 1000, p_duration_unit => 'day', p_duration_count => 1, p_allowed_days => %L::smallint[]) $$, days))
     order by days)
     from unnest(array['{}', '{0}', '{8}', '{2,1}', '{1,1}', '{1,2,3,4,5,6,7}', '{1,NULL}']) as d (days)),
  array_fill('23514'::text, array[7]),
  'days are 1 to 7, each once and in order, not none and not all seven'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
       p_price => 1000, p_duration_unit => 'day', p_duration_count => 1, p_allowed_from => '14:00', p_allowed_until => '10:00') $$,
  '23514', null, 'a time window doesn''t run past midnight'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
       p_price => 1000, p_duration_unit => 'day', p_duration_count => 1, p_allowed_from => '14:00') $$,
  '23514', null, 'and has a start and an end'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
       p_price => 1000, p_duration_unit => 'day', p_duration_count => 1, p_branch_ids => array[]::uuid[]) $$,
  '23514', 'branch_required', 'a plan for some branches lists at least one'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000010', p_name_ckb => 'هەڵە', p_kind => 'time',
       p_price => 1000, p_duration_unit => 'day', p_duration_count => 1, p_branch_ids => array[tests.branch('B901', 'pgtap-b')]) $$,
  'P0002', 'branch_not_found', 'and only branches of the gym'
);
select throws_ok(
  $$ insert into public.plan_branches (plan_id, branch_id) values ('40000000-0000-4000-8000-000000000001', tests.branch('B901')) $$,
  '23514', 'plan_all_branches', 'a plan for all branches lists none'
);

-- Changing plans --------------------------------------------------------------------------------------

select lives_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000003', p_name_ckb => '٢٠ جار لە دوو مانگدا',
       p_kind => 'hybrid', p_price => 65000, p_duration_unit => 'month', p_duration_count => 2, p_visit_count => 20,
       p_gender => 'female', p_branch_ids => array[tests.branch('B901'), tests.branch('B902')]) $$,
  'the Owner changes the price, the days and the branches'
);
select results_eq(
  $$ select price, allowed_days, allowed_from from public.plans where id = '40000000-0000-4000-8000-000000000003' $$,
  $$ values (65000::numeric(14,2), null::smallint[], null::time) $$,
  'every field is what was saved last'
);
select set_eq(
  $$ select branch_id from public.plan_branches where plan_id = '40000000-0000-4000-8000-000000000003' $$,
  $$ values (tests.branch('B901')), (tests.branch('B902')) $$,
  'and both branches are listed'
);
select lives_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000002', p_name_ckb => '١٢ جار', p_kind => 'visits',
       p_price => 30000, p_visit_count => 12, p_daily_visit_limit => 1::smallint, p_is_active => false) $$,
  'a plan is taken off sale'
);
select is((select is_active from public.plans where id = '40000000-0000-4000-8000-000000000002'), false,
  'it is inactive');
select is(
  tests.error_code($$ delete from public.plans where id = '40000000-0000-4000-8000-000000000002' $$),
  '42501', 'plans are never deleted'
);

-- Who may ----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.plans), 4, 'everyone in the gym sees the plans');
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000020', p_name_ckb => 'نوێ', p_kind => 'unlimited', p_price => 0) $$,
  '42501', 'permission_denied', 'a receptionist adds no plan'
);
select is(
  tests.rows_changed($$ update public.plans set price = 1000 where id = '40000000-0000-4000-8000-000000000001' $$),
  0, 'nor changes one'
);

-- plans.manage in one branch: only plans that work in that branch alone.
select tests.authenticate_as(tests.staff('plans_a'));
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000020', p_name_ckb => 'نوێ', p_kind => 'unlimited', p_price => 0) $$,
  '42501', 'no_branch_access', 'a plan for every branch needs access to every branch'
);
select lives_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000021', p_name_ckb => 'لقی یەک', p_kind => 'time',
       p_price => 25000, p_duration_unit => 'month', p_duration_count => 1, p_branch_ids => array[tests.branch('B901')]) $$,
  'a plan for their own branch'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000021', p_name_ckb => 'لقی یەک', p_kind => 'time',
       p_price => 25000, p_duration_unit => 'month', p_duration_count => 1,
       p_branch_ids => array[tests.branch('B901'), tests.branch('B902')]) $$,
  'P0002', 'branch_not_found', 'not for a branch they can''t reach (they don''t even see it)'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000003', p_name_ckb => '٢٠ جار لە دوو مانگدا',
       p_kind => 'hybrid', p_price => 1000, p_duration_unit => 'month', p_duration_count => 2, p_visit_count => 20,
       p_branch_ids => array[tests.branch('B901')]) $$,
  '42501', 'no_branch_access', 'nor a plan that also works in such a branch'
);
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000001', p_name_ckb => 'مانگانە', p_kind => 'time',
       p_price => 1000, p_duration_unit => 'month', p_duration_count => 1, p_branch_ids => array[tests.branch('B901')]) $$,
  '42501', 'no_branch_access', 'nor a plan for every branch'
);

select tests.authenticate_as(tests.staff('owner'));
select lives_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000021', p_name_ckb => 'لقی یەک', p_kind => 'time',
       p_price => 25000, p_duration_unit => 'month', p_duration_count => 1) $$,
  'the Owner makes a branch''s plan one for every branch'
);
select is(
  (select count(*)::integer from public.plan_branches where plan_id = '40000000-0000-4000-8000-000000000021'),
  0, 'its list is gone'
);

select tests.clear_authentication();
select ok(
  exists (
    select 1 from public.audit_logs
     where table_name = 'plans' and row_id = '40000000-0000-4000-8000-000000000003' and action = 'update'
       and actor_id = tests.staff('owner') and new_values ->> 'price' = '65000.00'
  ),
  'the audit log records who changed a price'
);

-- A read-only gym and other gyms -------------------------------------------------------------------

update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('owner'));
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000030', p_name_ckb => 'نوێ', p_kind => 'unlimited', p_price => 0) $$,
  '42501', 'gym_read_only', 'a read-only gym adds no plans'
);
select is((select count(*)::integer from public.plans), 5, 'but still sees them');

select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is((select count(*)::integer from public.plans), 0, 'another gym sees none of them');
select throws_ok(
  $$ select public.save_plan(p_id => '40000000-0000-4000-8000-000000000001', p_name_ckb => 'دزی', p_kind => 'unlimited', p_price => 0) $$,
  '42501', null, 'and can''t take one over by its id'
);

select * from finish();
rollback;
