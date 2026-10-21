-- Step 2c: member photos. Kept in Postgres (member_photos), checked again by the database, never in
-- the audit log; members.photo_updated_at follows them.
begin;
select plan(26);
select tests.create_fixture();

-- The smallest files with the right first bytes: what the database checks.
create temporary table pics as select
  '/9j/4AAQSkZJRg=='::text as jpeg,
  'UklGRgAAAABXRUJQ'::text as webp,
  'iVBORw0KGgo='::text as png,
  replace(encode('\xffd8ff'::bytea || decode(repeat('00', 153600), 'hex'), 'base64'), E'\n', '') as big_jpeg,
  replace(encode('\xffd8ff'::bytea || decode(repeat('00', 12288), 'hex'), 'base64'), E'\n', '') as big_thumb;
grant select on pics to authenticated;

select tests.authenticate_as(tests.staff('reception_a'));
select public.create_member(p_id => '20000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
  p_full_name => 'ئارام کەریم', p_gender => 'male', p_phone => '+9647501230001');
select public.create_member(p_id => '20000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
  p_full_name => 'ژیلا عەلی', p_gender => 'female', p_phone => '+9647501230002');

-- Adding and replacing ----------------------------------------------------------------------------

create temporary table saved as
  select public.set_member_photo('20000000-0000-4000-8000-000000000001', 'image/webp', webp, 'image/webp', webp) as at from pics;
select is(
  (select photo_updated_at from public.members where id = '20000000-0000-4000-8000-000000000001'),
  (select at from saved),
  'a receptionist adds a photo; the member says when'
);
select is(
  (select photo_type || ' ' || photo from public.member_photos where id = '20000000-0000-4000-8000-000000000001'),
  'image/webp UklGRgAAAABXRUJQ', 'the photo is kept as sent'
);
select lives_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000001', 'image/jpeg', jpeg, 'image/jpeg', jpeg) from pics $$,
  'and replaces it'
);
select is(
  (select count(*)::integer from public.member_photos where id = '20000000-0000-4000-8000-000000000001'), 1,
  'still one photo per member'
);
select is(
  (select photo_type from public.member_photos where id = '20000000-0000-4000-8000-000000000001'), 'image/jpeg',
  'the new one'
);
select is(
  (select photo_updated_at from public.members where id = '20000000-0000-4000-8000-000000000001'),
  (select updated_at from public.member_photos where id = '20000000-0000-4000-8000-000000000001'),
  'photo_updated_at follows the replacement'
);
select is(
  (select photo_updated_at from public.members where id = '20000000-0000-4000-8000-000000000002'), null,
  'a member without a photo has none'
);

-- What the database refuses ---------------------------------------------------------------------

select throws_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000002', 'image/png', png, 'image/jpeg', jpeg) from pics $$,
  '22023', 'invalid_photo', 'only JPEG or WebP'
);
select throws_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000002', 'image/webp', jpeg, 'image/jpeg', jpeg) from pics $$,
  '22023', 'invalid_photo', 'the file''s own bytes decide the type, not the name given'
);
select throws_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000002', 'image/jpeg', big_jpeg, 'image/jpeg', jpeg) from pics $$,
  '22023', 'invalid_photo', 'a photo is at most 150 KB'
);
select throws_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000002', 'image/jpeg', jpeg, 'image/jpeg', big_thumb) from pics $$,
  '22023', 'invalid_photo', 'a thumbnail is at most 12 KB'
);
select throws_ok(
  $$ insert into public.member_photos (id, photo_type, photo, thumbnail_type, thumbnail)
     select '20000000-0000-4000-8000-000000000002', 'image/jpeg', png, 'image/jpeg', jpeg from pics $$,
  '23514', null, 'the table checks it too, without the function'
);
select throws_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000002', 'image/jpeg', 'not base64!', 'image/jpeg', jpeg) from pics $$,
  '22023', 'invalid_photo', 'and refuses anything that isn''t base64'
);

-- photo_updated_at follows member_photos only ----------------------------------------------------

select throws_ok(
  $$ update public.members set photo_updated_at = now() where id = '20000000-0000-4000-8000-000000000002' $$,
  '42501', 'read_only_column', 'staff can''t set photo_updated_at themselves'
);
insert into public.members (id, branch_id, full_name, gender, phone, photo_updated_at)
values ('20000000-0000-4000-8000-000000000003', tests.branch('B901'), 'هێمن سەلیم', 'male', '+9647501230003', now());
select is(
  (select photo_updated_at from public.members where id = '20000000-0000-4000-8000-000000000003'),
  null, 'a new member starts without a photo, whatever the row says'
);

-- The audit log -----------------------------------------------------------------------------------

select tests.clear_authentication();
select is(
  (select array_agg(distinct new_values ->> 'photo') from public.audit_logs
    where table_name = 'member_photos' and row_id = '20000000-0000-4000-8000-000000000001'),
  array['redacted'], 'the log records who and when, never the picture'
);

-- Who can ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('trainer_ab'));
select is(
  (select count(*)::integer from public.member_photos), 1, 'staff with members.view see photos'
);
select throws_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000002', 'image/jpeg', jpeg, 'image/jpeg', jpeg) from pics $$,
  '42501', 'permission_denied', 'adding one needs members.edit'
);
select throws_ok(
  $$ select public.remove_member_photo('20000000-0000-4000-8000-000000000001') $$,
  '42501', 'permission_denied', 'and so does removing one'
);

select tests.clear_authentication();
select tests.create_role('بێ ئەندامان', array['dashboard.view']);
select tests.create_staff('no_members_a', (select id::text from public.roles where name_ckb = 'بێ ئەندامان'), array['B901']);
select tests.authenticate_as(tests.staff('no_members_a'));
select is_empty('select id from public.member_photos', 'without members.view, no photos');

select tests.authenticate_as(tests.staff('reception_a', 'pgtap-b'));
select throws_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000002', 'image/jpeg', jpeg, 'image/jpeg', jpeg) from pics $$,
  'P0002', 'member_not_found', 'another gym''s member can''t get a photo'
);

-- Archived members and read-only gyms -----------------------------------------------------------

select tests.authenticate_as(tests.staff('manager_a'));
select public.set_member_status('20000000-0000-4000-8000-000000000001', 'archived', 'ڕۆیشت');
select throws_ok(
  $$ select public.remove_member_photo('20000000-0000-4000-8000-000000000001') $$,
  '42501', 'member_archived', 'an archived member''s photo stays until they are restored'
);
select public.set_member_status('20000000-0000-4000-8000-000000000001', 'active');

-- Removing --------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select public.remove_member_photo('20000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer from public.member_photos where id = '20000000-0000-4000-8000-000000000001'), 0,
  'a removed photo is deleted, not kept'
);
select is(
  (select photo_updated_at from public.members where id = '20000000-0000-4000-8000-000000000001'), null,
  'and the member has no photo any more'
);
select lives_ok(
  $$ select public.remove_member_photo('20000000-0000-4000-8000-000000000001') $$,
  'removing a photo that isn''t there is fine'
);

select tests.clear_authentication();
update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.set_member_photo('20000000-0000-4000-8000-000000000002', 'image/jpeg', jpeg, 'image/jpeg', jpeg) from pics $$,
  '42501', 'gym_read_only', 'a read-only gym adds no photos'
);

select * from finish();
rollback;
