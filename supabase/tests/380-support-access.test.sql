-- MT-4: support access. A gym lets Click Group in for a while (support.grant), every staff member
-- sees it, the seller reads only through the support functions while it runs, every read leaves a
-- row the gym sees, health information never goes out, and offline gyms can't grant it at all.
begin;
select plan(29);
select tests.create_fixture();
select tests.create_platform_admin('ali@clickgroup.example');

insert into public.members (id, gym_id, branch_id, full_name, gender, phone) values
  ('38000000-0000-4000-8000-000000000001', tests.gym('pgtap-a'), tests.branch('B901'), 'ئارام کەریم', 'male', '+9647503800001'),
  ('38000000-0000-4000-8000-000000000002', tests.gym('pgtap-a'), tests.branch('B902'), 'شیلان عەلی', 'female', '+9647503800002'),
  ('38000000-0000-4000-8000-000000000003', tests.gym('pgtap-b'), tests.branch('B901', 'pgtap-b'), 'هێمن جەلال', 'male', '+9647503800003');
insert into public.member_health (id, gym_id, injuries) values
  ('38000000-0000-4000-8000-000000000001', tests.gym('pgtap-a'), 'ئازاری ئەژنۆ');

-- Before any grant: the seller sees nothing --------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select is((select count(*)::integer from public.seller_support_gyms()), 0, 'no gym lets Click Group in at first');
select throws_ok($$ select public.seller_support_members(tests.gym('pgtap-a')) $$,
  '42501', 'support_not_granted', 'without a grant the seller reads no member');
select is((select count(*)::integer from public.members), 0, 'and business tables give the seller nothing');

-- Granting ----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.grant_support_access(gen_random_uuid(), 24, 'کێشەی پسوولە') $$,
  '42501', 'permission_denied', 'a receptionist can''t let Click Group in');
select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select public.grant_support_access(gen_random_uuid(), 0, 'کێشەی پسوولە') $$,
  '22023', 'invalid_request', 'at least an hour');
select throws_ok($$ select public.grant_support_access(gen_random_uuid(), 169, 'کێشەی پسوولە') $$,
  '22023', 'invalid_request', 'at most a week');
select throws_ok($$ select public.grant_support_access(gen_random_uuid(), 24, null) $$,
  '22023', 'reason_required', 'with a reason');
select is(
  (public.grant_support_access('38100000-0000-4000-8000-000000000001', 24, 'کێشەی پسوولە') ->> 'id'),
  '38100000-0000-4000-8000-000000000001', 'the Owner lets Click Group in for a day'
);
select ok(
  (select ends_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
     from public.support_grants where id = '38100000-0000-4000-8000-000000000001'),
  'until a day from now'
);
select is(
  (public.grant_support_access('38100000-0000-4000-8000-000000000001', 24, 'کێشەی پسوولە') ->> 'id'),
  '38100000-0000-4000-8000-000000000001', 'the same id again returns the same grant'
);
select throws_ok($$ select public.grant_support_access(gen_random_uuid(), 2, 'دووبارە') $$,
  '23514', 'support_already_granted', 'one grant runs at a time');
select is(tests.error_code($$ insert into public.support_grants (id, reason, ends_at)
    values (gen_random_uuid(), 'x', now() + interval '2 hours') $$),
  '42501', 'staff never write grants themselves');
select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.support_grants), 1, 'every staff member sees the grant (the notice)');
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is((select count(*)::integer from public.support_grants), 0, 'another gym doesn''t');

-- The seller reads, and every read is written down ----------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal1');
select throws_ok($$ select public.seller_support_members(tests.gym('pgtap-a')) $$,
  '42501', 'mfa_required', 'only after two-step login');
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select is((select code from public.seller_support_gyms()), 'pgtap-a', 'the seller sees which gym let them in');
select is(jsonb_array_length(public.seller_support_members(tests.gym('pgtap-a'))), 2, 'and reads its members');
select is(
  public.seller_support_members(tests.gym('pgtap-a'), 'شیلان') -> 0 ->> 'full_name',
  'شیلان عەلی', 'found by name'
);
create temporary table one_member as
  select public.seller_support_member(tests.gym('pgtap-a'), '38000000-0000-4000-8000-000000000001') as m;
grant select on one_member to authenticated;
select is((select m -> 'member' ->> 'full_name' from one_member), 'ئارام کەریم', 'and one member');
select ok(
  (select not (m::text like '%ئازاری ئەژنۆ%') and not (m -> 'member' ? 'photo') from one_member),
  'without their health information or photo'
);
select throws_ok(
  $$ select public.seller_support_member(tests.gym('pgtap-a'), '38000000-0000-4000-8000-000000000003') $$,
  'P0002', 'member_not_found', 'another gym''s member is not found through this gym''s grant'
);
select throws_ok($$ select public.seller_support_members(tests.gym('pgtap-b')) $$,
  '42501', 'support_not_granted', 'nor read through a gym that didn''t let Click Group in');
select is((select count(*)::integer from public.seller_support_reads(tests.gym('pgtap-a'))), 3,
  'every read is written down');

select tests.authenticate_as(tests.staff('owner'));
select results_eq(
  $$ select what, admin_email from public.support_reads order by read_at, what $$,
  $$ values ('member', 'ali@clickgroup.example'), ('members', 'ali@clickgroup.example'), ('members', 'ali@clickgroup.example') $$,
  'the Owner sees exactly what Click Group read, and who'
);
select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.support_reads), 0, 'staff without support.grant don''t');

-- Ending it, also in a read-only gym ---------------------------------------------------------------------

select tests.clear_authentication();
update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('owner'));
select lives_ok($$ select public.revoke_support_access('38100000-0000-4000-8000-000000000001') $$,
  'the Owner ends it early, even while the gym is read-only');
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select throws_ok($$ select public.seller_support_members(tests.gym('pgtap-a')) $$,
  '42501', 'support_not_granted', 'and the seller reads nothing more');
select tests.authenticate_as(tests.staff('owner'));
select lives_ok($$ select public.grant_support_access(gen_random_uuid(), 2, 'یارمەتی بۆ چالاککردنەوە') $$,
  'a read-only gym can still let Click Group in');

-- Offline gyms ---------------------------------------------------------------------------------------------

select tests.clear_authentication();
select public.create_gym('pgtap-off', 'جیمی بێ ئینتەرنێت', 'لقی یەکەم', null, null, 'offline');
select tests.create_staff('owner_off', 'owner', all_branches => true, gym_code => 'pgtap-off');
select tests.authenticate_as(tests.staff('owner_off', 'pgtap-off'));
select throws_ok($$ select public.grant_support_access(gen_random_uuid(), 24, 'کێشە') $$,
  '23514', 'support_offline', 'an offline gym''s data never reaches Click Group');

select * from finish();
rollback;
