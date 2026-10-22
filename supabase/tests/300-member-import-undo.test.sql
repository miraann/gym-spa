-- Taking an import back (step 2j, migration 20261023110000): undo_member_import() archives every
-- member an import added, all or nothing, with a reason, and ends their cards; the preview counts
-- what it would do, members changed since the import included; the history lists the imports.
begin;
select plan(26);
select tests.create_fixture();

-- Two imports by the Owner: three members (one with a card, one with health info), then two more.
select tests.authenticate_as(tests.staff('owner'));
select public.import_members('30000000-0000-4000-8000-0000000000a1', 'ئەندامان.xlsx', jsonb_build_array(
  jsonb_build_object('row', 2, 'id', '30000000-0000-4000-8000-000000000001', 'branch_id', tests.branch('B901'),
    'full_name', 'ئارام کەریم', 'gender', 'male', 'phone', '+9647503000001',
    'card_id', '30000000-0000-4000-8000-0000000000c1', 'card_uid', '04E0000000EE01'),
  jsonb_build_object('row', 3, 'id', '30000000-0000-4000-8000-000000000002', 'branch_id', tests.branch('B901'),
    'full_name', 'شیلان عەلی', 'gender', 'female', 'phone', '+9647503000002', 'medical_notes', 'ئازاری پشت'),
  jsonb_build_object('row', 4, 'id', '30000000-0000-4000-8000-000000000003', 'branch_id', tests.branch('B902'),
    'full_name', 'هێمن جەلال', 'gender', 'male', 'phone', '+9647503000003')));
select public.import_members('30000000-0000-4000-8000-0000000000a2', 'دووەم.csv', jsonb_build_array(
  jsonb_build_object('row', 2, 'id', '30000000-0000-4000-8000-000000000004', 'branch_id', tests.branch('B901'),
    'full_name', 'ڤیان سەردار', 'gender', 'female', 'phone', '+9647503000004',
    'card_id', '30000000-0000-4000-8000-0000000000c4', 'card_uid', '04E0000000EE04'),
  jsonb_build_object('row', 3, 'id', '30000000-0000-4000-8000-000000000005', 'branch_id', tests.branch('B901'),
    'full_name', 'کاروان ئیبراهیم', 'gender', 'male', 'phone', '+9647503000005')));

-- A member added by hand, not by an import.
select tests.clear_authentication();
insert into public.members (id, gym_id, branch_id, full_name, gender, phone) values
  ('30000000-0000-4000-8000-000000000009', tests.gym('pgtap-a'), tests.branch('B901'), 'ئەندامی دەستی', 'male',
   '+9647503000009');

-- The first import was an hour ago (in one test transaction now() never moves): its rows get that
-- time, as the row stamps wrote it then.
alter table public.member_imports disable trigger user;
alter table public.members disable trigger user;
alter table public.member_health disable trigger user;
alter table public.nfc_cards disable trigger user;
update public.member_imports set created_at = now() - interval '1 hour', updated_at = now() - interval '1 hour'
 where id = '30000000-0000-4000-8000-0000000000a1';
update public.members set updated_at = now() - interval '1 hour'
 where import_id = '30000000-0000-4000-8000-0000000000a1';
update public.member_health set updated_at = now() - interval '1 hour'
 where id = '30000000-0000-4000-8000-000000000002';
update public.nfc_cards set updated_at = now() - interval '1 hour'
 where id = '30000000-0000-4000-8000-0000000000c1';
alter table public.member_imports enable trigger user;
alter table public.members enable trigger user;
alter table public.member_health enable trigger user;
alter table public.nfc_cards enable trigger user;

-- Since then: ئارام's address was changed, and هێمن was archived by hand.
select tests.authenticate_as(tests.staff('owner'));
update public.members set address = 'هەولێر' where id = '30000000-0000-4000-8000-000000000001';
select public.set_member_status('30000000-0000-4000-8000-000000000003', 'archived', 'ڕۆیشت');

-- The preview ---------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select * from public.member_import_undo_preview('30000000-0000-4000-8000-0000000000a1') $$,
  '42501', 'permission_denied', 'taking an import back needs members.delete'
);
select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select * from public.member_import_undo_preview('30000000-0000-4000-8000-0000000000a1') $$,
  $$ values (2, 1, 1, 1) $$,
  'the preview counts the members to archive, those archived already, those changed since, and their cards'
);
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select throws_ok(
  $$ select * from public.member_import_undo_preview('30000000-0000-4000-8000-0000000000a1') $$,
  'P0002', 'import_not_found', 'another gym''s import doesn''t exist for its staff'
);

-- Who may, and with what ------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a1', 'فایلی هەڵە') $$,
  '42501', 'permission_denied', 'a receptionist can''t take an import back'
);
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a1', null) $$,
  '23514', 'reason_required', 'it needs a reason'
);
select throws_ok(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a1', '') $$,
  '23514', 'reason_required', 'not an empty one'
);
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select throws_ok(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a1', 'فایلی هەڵە') $$,
  'P0002', 'import_not_found', 'and another gym can''t take it back'
);

-- All or nothing ----------------------------------------------------------------------------------
-- A refusal while archiving the second member of the second import (played by a trigger).

select tests.clear_authentication();
create function tests.refuse_karwan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = '30000000-0000-4000-8000-000000000005' and new.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'test_refusal';
  end if;
  return new;
end
$$;
create trigger test_refusal before update on public.members for each row
  execute function tests.refuse_karwan();

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a2', 'فایلی هەڵە') $$,
  'P0001', 'test_refusal', 'when one member can''t be archived'
);
select results_eq(
  $$ select m.status, c.status from public.members m
       left join public.nfc_cards c on c.member_id = m.id
      where m.import_id = '30000000-0000-4000-8000-0000000000a2' order by m.id $$,
  $$ values ('active'::text, 'active'::text), ('active', null) $$,
  'nobody is archived and no card ends'
);
select is(
  (select undone_at from public.member_imports where id = '30000000-0000-4000-8000-0000000000a2'),
  null,
  'and the import isn''t marked as taken back'
);
select tests.clear_authentication();
drop trigger test_refusal on public.members;

-- Taking the first import back ---------------------------------------------------------------------

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a1', 'فایلی هەڵە') $$,
  $$ values (2, 1, 1, 1) $$,
  'a branch manager takes the first import back: two members archived, one already was'
);
select results_eq(
  $$ select id, status, status_reason, status_changed_by from public.members
      where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
                   '30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000009')
      order by id $$,
  $$ values ('30000000-0000-4000-8000-000000000001'::uuid, 'archived'::text, 'فایلی هەڵە'::text, tests.staff('manager_a')),
            ('30000000-0000-4000-8000-000000000002', 'archived', 'فایلی هەڵە', tests.staff('manager_a')),
            ('30000000-0000-4000-8000-000000000003', 'archived', 'ڕۆیشت', tests.staff('owner')),
            ('30000000-0000-4000-8000-000000000009', 'active', null, null) $$,
  'its members are archived with the reason (also the one changed since); others are left alone'
);
select results_eq(
  $$ select status, end_reason, ended_by from public.nfc_cards where id = '30000000-0000-4000-8000-0000000000c1' $$,
  $$ values ('ended'::text, 'member_archived'::text, tests.staff('manager_a')) $$,
  'their card ends'
);
select is(
  (select count(*)::integer from public.members where id in ('30000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003')),
  3,
  'nobody is deleted'
);
select results_eq(
  $$ select undone_by, undo_reason, undone_at is not null from public.member_imports
      where id = '30000000-0000-4000-8000-0000000000a1' $$,
  $$ values (tests.staff('manager_a'), 'فایلی هەڵە'::text, true) $$,
  'the import records who took it back, when and why'
);
select tests.clear_authentication();
select is(
  (select count(*)::integer from public.audit_logs
    where table_name = 'member_imports' and action = 'update' and actor_id = tests.staff('manager_a')
      and row_id = '30000000-0000-4000-8000-0000000000a1'),
  1,
  'the audit log records it'
);
select is(app.member_import_action(), null, 'and the mark is gone again');
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a1', 'دووبارە') $$,
  '23514', 'import_undone', 'an import is taken back once'
);
select tests.authenticate_as(tests.staff('owner'));
select throws_ok(
  $$ update public.member_imports set undone_at = null, undo_reason = null
      where id = '30000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'staff can''t change an import record themselves'
);

-- The history ----------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select * from public.member_import_history() $$,
  '42501', 'permission_denied', 'the history needs members.import or members.delete'
);
select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select file_name, member_count, card_count, created_by_name, undone_by_name, undo_reason
       from public.member_import_history() $$,
  $$ values ('دووەم.csv'::text, 2, 1, (select full_name from public.staff_users where id = tests.staff('owner')),
             null::text, null::text),
            ('ئەندامان.xlsx', 3, 1, (select full_name from public.staff_users where id = tests.staff('owner')),
             (select full_name from public.staff_users where id = tests.staff('manager_a')), 'فایلی هەڵە') $$,
  'the history lists the gym''s imports, newest first, with who imported and who took one back'
);
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is(
  (select count(*)::integer from public.member_import_history()),
  0,
  'another gym sees none of them'
);

-- A read-only gym takes nothing back -----------------------------------------------------------

select tests.clear_authentication();
update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a2', 'فایلی هەڵە') $$,
  '42501', 'gym_read_only', 'a read-only gym takes no import back'
);
select tests.clear_authentication();
update public.gyms set suspended_at = null where id = tests.gym('pgtap-a');

-- The second import, nothing changed since ---------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select results_eq(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a2', 'تاقیکردنەوە') $$,
  $$ values (2, 0, 0, 1) $$,
  'the Owner takes the second import back'
);

-- 5,000 members within the cloud's statement timeout (8 s for staff), each with a card ----------

create temporary table big_import as
select jsonb_agg(jsonb_build_object(
         'row', i + 2,
         'id', gen_random_uuid(),
         'branch_id', tests.branch('B901'),
         'full_name', 'ئەندامی ' || i,
         'gender', case when i % 2 = 0 then 'male' else 'female' end,
         'phone', '+9647' || lpad((610000000 + i)::text, 9, '0'),
         'card_id', gen_random_uuid(),
         'card_uid', '06' || upper(lpad(to_hex(4000000 + i), 12, '0'))
       )) as rows
  from generate_series(0, 4999) i;
grant select on big_import to authenticated;
select public.import_members('30000000-0000-4000-8000-0000000000a3', 'big.xlsx', (select rows from big_import));

set local statement_timeout = '8s';
select results_eq(
  $$ select * from public.undo_member_import('30000000-0000-4000-8000-0000000000a3', 'فایلی هەڵە') $$,
  $$ values (5000, 0, 0, 5000) $$,
  '5,000 members are archived and their cards ended in one call within 8 s'
);
set local statement_timeout = 0;
select is(
  (select count(*)::integer from public.nfc_cards c join public.members m on m.id = c.member_id
    where m.import_id = '30000000-0000-4000-8000-0000000000a3' and c.status = 'active'),
  0,
  'no card of theirs works'
);

select * from finish();
rollback;
