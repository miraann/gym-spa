-- created_by/updated_by come from the session, never from the uploaded row (offline uploads run
-- under their author's session). created_at may come from the device, but never lies in the future.
begin;
select plan(7);
select tests.create_fixture();

select tests.authenticate_as(tests.staff('admin'));
insert into public.branches (code, name_ckb, created_by, created_at)
values ('B910', 'لقی یەک', tests.staff('owner'), now() + interval '1 day');
insert into public.branches (code, name_ckb, created_at)
values ('B911', 'لقی دوو', '2026-01-01T08:00:00Z');

select is((select created_by from public.branches where code = 'B910'), tests.staff('admin'),
  'created_by is the signed-in staff member, whatever the row says');
select is((select updated_by from public.branches where code = 'B910'), tests.staff('admin'),
  'a new row is last updated by its creator');
select ok((select created_at <= now() from public.branches where code = 'B910'),
  'created_at is never in the future');
select is((select created_at from public.branches where code = 'B911'), '2026-01-01T08:00:00Z'::timestamptz,
  'a row made offline keeps the time it was made');

select tests.authenticate_as(tests.staff('owner'));
update public.branches
   set phone = '0770 000 0003', created_by = tests.staff('reception_a'), created_at = now() - interval '1 year'
 where code = 'B911';
select is((select updated_by from public.branches where code = 'B911'), tests.staff('owner'),
  'updated_by is whoever made the last change');
select results_eq(
  $$ select created_by, created_at from public.branches where code = 'B911' $$,
  $$ values (tests.staff('admin'), '2026-01-01T08:00:00Z'::timestamptz) $$,
  'created_by and created_at never change'
);

-- Server code without a staff session (e.g. the bootstrap script) may say who it acts for.
select tests.clear_authentication();
insert into public.branches (gym_id, code, name_ckb, created_by) values (tests.gym('gym-a'), 'B912', 'لقی سێ', tests.staff('owner'));
select is((select created_by from public.branches where code = 'B912'), tests.staff('owner'),
  'system changes keep the given created_by');

select * from finish();
rollback;
