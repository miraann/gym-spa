-- Step 2d: NFC cards. app.normalize_card_uid(), assign_card(), replace_card(), end_card(),
-- block_card(), unblock_card(), find_card(), the guard, archiving, two saves at the same moment,
-- other gyms and read-only gyms.
begin;
select plan(73);
select tests.create_fixture();

select tests.create_role('بێ ئەندامان', array['dashboard.view']);
select tests.create_staff('no_members_a', (select id::text from public.roles where name_ckb = 'بێ ئەندامان'), array['B901']);
select tests.create_role('تەنها ئەرشیفکردن', array['members.view', 'members.delete']);
select tests.create_staff('archive_a', (select id::text from public.roles where name_ckb = 'تەنها ئەرشیفکردن'), array['B901']);

select tests.authenticate_as(tests.staff('reception_a'));
select public.create_member(p_id => '30000000-0000-4000-8000-000000000001', p_branch_id => tests.branch('B901'),
  p_full_name => 'ئارام کەریم', p_gender => 'male', p_phone => '+9647501230001');
select public.create_member(p_id => '30000000-0000-4000-8000-000000000002', p_branch_id => tests.branch('B901'),
  p_full_name => 'ژیلا عەلی', p_gender => 'female', p_phone => '+9647501230002');
select public.create_member(p_id => '30000000-0000-4000-8000-000000000003', p_branch_id => tests.branch('B901'),
  p_full_name => 'هێمن سەلیم', p_gender => 'male', p_phone => '+9647501230003');
select public.create_member(p_id => '30000000-0000-4000-8000-000000000004', p_branch_id => tests.branch('B901'),
  p_full_name => 'شیلان ئەحمەد', p_gender => 'female', p_phone => '+9647501230004');
select public.create_member(p_id => '30000000-0000-4000-8000-000000000006', p_branch_id => tests.branch('B901'),
  p_full_name => 'چیا عومەر', p_gender => 'male', p_phone => '+9647501230006');
select public.create_member(p_id => '30000000-0000-4000-8000-000000000007', p_branch_id => tests.branch('B901'),
  p_full_name => 'ڕێباز جەلال', p_gender => 'male', p_phone => '+9647501230007');
select public.create_member(p_id => '30000000-0000-4000-8000-000000000008', p_branch_id => tests.branch('B901'),
  p_full_name => 'نازدار قادر', p_gender => 'female', p_phone => '+9647501230008');
select tests.authenticate_as(tests.staff('reception_a', 'pgtap-b'));
select public.create_member(p_id => '30000000-0000-4000-8000-0000000000b1', p_branch_id => tests.branch('B901', 'pgtap-b'),
  p_full_name => 'گۆران حەسەن', p_gender => 'male', p_phone => '+9647501230001');

-- Reading UIDs ------------------------------------------------------------------------------------
-- The UIDs readers give, and what is stored. packages/core/src/cards.test.ts runs the same list
-- through normalizeCardUid(), so the app and the database read cards alike: one case per line.

create temporary table uid_cases (raw text, reversed boolean, expected text);
insert into uid_cases (raw, reversed, expected) values
  ('04A23BC15D6E80', false, '04A23BC15D6E80'),
  ('04:a2:3b:c1:5d:6e:80', false, '04A23BC15D6E80'),
  ('04 A2 3B C1 5D 6E 80', false, '04A23BC15D6E80'),
  ('04-A2-3B-C1-5D-6E-80', false, '04A23BC15D6E80'),
  ('  04a23bc15d6e80  ', false, '04A23BC15D6E80'),
  ('04A2 3BC1:5D6E-80', false, '04A23BC15D6E80'),
  ('80:6E:5D:C1:3B:A2:04', true, '04A23BC15D6E80'),
  ('806e5dc13ba204', true, '04A23BC15D6E80'),
  ('DEADBEEF', false, 'DEADBEEF'),
  ('de:ad:be:ef', false, 'DEADBEEF'),
  ('efbeadde', true, 'DEADBEEF'),
  ('0102030405060708090A', false, '0102030405060708090A'),
  ('0a:09:08:07:06:05:04:03:02:01', true, '0102030405060708090A'),
  ('3735928559', false, 'DEADBEEF'),
  ('3735928559', true, 'EFBEADDE'),
  ('4022250974', true, 'DEADBEEF'),
  ('0000000255', false, '000000FF'),
  ('0000000255', true, 'FF000000'),
  ('٣٧٣٥٩٢٨٥٥٩', false, 'DEADBEEF'),
  ('۳۷۳۵۹۲۸۵۵۹', false, 'DEADBEEF'),
  ('12345678', false, '12345678'),
  ('4294967295', false, null),
  ('4294967296', false, null),
  ('9999999999', false, null),
  ('0000000000', false, null),
  ('00000000', false, null),
  ('00:00:00:00:00:00:00', false, null),
  ('FFFFFFFFFFFFFF', false, null),
  ('04A23BC15D6E', false, null),
  ('04A23BC15D6E8', false, null),
  ('04A23BC15D6E80AA', false, null),
  ('123456789', false, null),
  ('12:34:56:78:90', false, null),
  ('3735 928 559', false, null),
  ('04_A2_3B_C1', false, null),
  ('0x04A23BC1', false, null),
  ('04A23BC1G5D6E8', false, null),
  ('04A23BCﬀ', false, null),
  ('', false, null),
  ('   ', false, null);
grant select on uid_cases to authenticated;

select is_empty(
  $$ select raw, reversed, expected, app.normalize_card_uid(raw, reversed) as got from uid_cases
      where app.normalize_card_uid(raw, reversed) is distinct from expected $$,
  'app.normalize_card_uid() reads every shared case like the app: hex with or without separators, 10 digits, either byte order'
);
select is(app.normalize_card_uid(E'\t04A23BC15D6E80\r\n'), '04A23BC15D6E80',
  'the line end a keyboard-type reader types after the UID is ignored');

-- assign_card() ----------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select results_eq(
  $$ select uid, status, member_id, created_by = tests.staff('reception_a'), replaces_id is null
       from public.assign_card('c0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '04:a2:3b:c1:5d:6e:80') $$,
  $$ values ('04A23BC15D6E80'::text, 'active'::text, '30000000-0000-4000-8000-000000000001'::uuid, true, true) $$,
  'a receptionist gives a member a card; its UID is stored normalized'
);
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '04A23BC15D6E80') $$,
  '23505', 'card_exists', 'saving the same card again says it exists (a retry after a lost answer)'
);
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '04 A2 3B C1 5D 6E 80') $$,
  '23505', 'card_in_use', 'a member''s card can''t be given to another member, however its UID is written'
);
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'DEADBEEF') $$,
  '23505', 'member_has_card', 'a member has one working card at a time (it is replaced instead)'
);
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '04A23BC15D6E') $$,
  '22023', 'invalid_card_uid', 'a UID is 4, 7 or 10 bytes'
);
select results_eq(
  $$ insert into public.nfc_cards (id, member_id, uid, status, end_reason, ended_at, created_at)
     values ('c0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'DEADBEEF', 'ended', 'lost', now(), '2020-01-01')
     returning status, end_reason, ended_at, created_at = now() $$,
  $$ values ('active'::text, null::text, null::timestamptz, true) $$,
  'a card given straight through the API starts active and given now, whatever the row says'
);
select is(
  tests.error_code($$ insert into public.nfc_cards (id, member_id, uid)
                      values ('c0000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'cafebabe') $$),
  '23514', 'the table keeps normalized UIDs only'
);
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-0000000000b1', 'CAFEBABE') $$,
  'P0002', 'member_not_found', 'another gym''s member can''t be given a card'
);

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'CAFEBABE') $$,
  '42501', 'permission_denied', 'giving a card needs cards.manage'
);

select tests.authenticate_as(tests.staff('manager_a'));
select public.set_member_status('30000000-0000-4000-8000-000000000004', 'archived', 'ڕۆیشت');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004', 'CAFEBABE') $$,
  '42501', 'member_archived', 'an archived member gets no card'
);

-- The unique indexes decide, for server code too.
select tests.clear_authentication();
select is(
  tests.error_code($$ insert into public.nfc_cards (id, gym_id, member_id, uid)
                      values ('c0000000-0000-4000-8000-000000000009', tests.gym('pgtap-a'), '30000000-0000-4000-8000-000000000003', '04A23BC15D6E80') $$),
  '23505', 'not even server code can make a UID active twice in a gym'
);
select is(
  tests.error_code($$ insert into public.nfc_cards (id, gym_id, member_id, uid)
                      values ('c0000000-0000-4000-8000-000000000009', tests.gym('pgtap-a'), '30000000-0000-4000-8000-000000000001', 'CAFEBABE') $$),
  '23505', 'nor give a member two working cards'
);

-- find_card() ------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('trainer_ab'));
select results_eq(
  $$ select id, member_id, status from public.find_card('04-a2-3b-c1-5d-6e-80') $$,
  $$ values ('c0000000-0000-4000-8000-000000000001'::uuid, '30000000-0000-4000-8000-000000000001'::uuid, 'active'::text) $$,
  'staff with members.view find whose card a UID is, however it is written'
);
select is_empty($$ select * from public.find_card('CAFEBABE') $$, 'a card the gym never gave out finds nothing');
select throws_ok($$ select * from public.find_card('not a card') $$, '22023', 'invalid_card_uid',
  'and what isn''t a UID is refused');

select tests.authenticate_as(tests.staff('no_members_a'));
select throws_ok($$ select * from public.find_card('04A23BC15D6E80') $$, '42501', 'permission_denied',
  'finding a card needs members.view');

-- replace_card() ---------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select results_eq(
  $$ select uid, status, replaces_id
       from public.replace_card('c0000000-0000-4000-8000-000000000001', 'lost', 'c0000000-0000-4000-8000-000000000011', '04112233445501') $$,
  $$ values ('04112233445501'::text, 'active'::text, 'c0000000-0000-4000-8000-000000000001'::uuid) $$,
  'a lost card is replaced in one step: the member gets the new card'
);
select results_eq(
  $$ select status, end_reason, ended_by = tests.staff('reception_a'), ended_at = now()
       from public.nfc_cards where id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values ('ended'::text, 'lost'::text, true, true) $$,
  'and the lost card stops working at once'
);
select throws_ok(
  $$ select public.replace_card('c0000000-0000-4000-8000-000000000001', 'damaged') $$,
  '23514', 'card_not_active', 'a card that no longer works isn''t replaced again'
);
select throws_ok(
  $$ select public.replace_card('c0000000-0000-4000-8000-000000000011', 'damaged', 'c0000000-0000-4000-8000-000000000012', '04 11 22 33 44 55 01') $$,
  '22023', 'same_card', 'the new card can''t be the old one'
);
select throws_ok(
  $$ select public.replace_card('c0000000-0000-4000-8000-000000000011', 'stolen', 'c0000000-0000-4000-8000-000000000012', '04112233445502') $$,
  '42501', 'permission_denied', 'a receptionist can''t report a card stolen: that blocks it (cards.blacklist)'
);
select throws_ok(
  $$ select public.replace_card('c0000000-0000-4000-8000-000000000011', 'broken') $$,
  '22023', 'invalid_request', 'a card is replaced because it was lost, damaged or stolen'
);
select throws_ok(
  $$ select public.replace_card('c0000000-0000-4000-8000-000000000011', 'lost', 'c0000000-0000-4000-8000-000000000012', null) $$,
  '22023', 'invalid_request', 'a new card needs its id and its UID'
);
select throws_ok(
  $$ select public.replace_card('c0000000-0000-4000-8000-000000000011', 'lost', 'c0000000-0000-4000-8000-000000000012', 'DEADBEEF') $$,
  '23505', 'card_in_use', 'the new card can''t be someone else''s'
);
select is(
  (select status from public.nfc_cards where id = 'c0000000-0000-4000-8000-000000000011'), 'active',
  'all or nothing: when the new card can''t be given, the old one keeps working'
);
select results_eq(
  $$ select id, status, end_reason from public.replace_card('c0000000-0000-4000-8000-000000000011', 'damaged') $$,
  $$ values ('c0000000-0000-4000-8000-000000000011'::uuid, 'ended'::text, 'damaged'::text) $$,
  'a damaged card can be ended before the new one is there; replace_card() then returns the old one'
);
select is_empty(
  $$ select id from public.nfc_cards where member_id = '30000000-0000-4000-8000-000000000001' and status = 'active' $$,
  'and the member has no working card until they get one'
);
select lives_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000001', '04112233445503') $$,
  'then they can be given one'
);
select results_eq(
  $$ select member_id, status from public.assign_card('c0000000-0000-4000-8000-000000000014', '30000000-0000-4000-8000-000000000003', '04A23BC15D6E80') $$,
  $$ values ('30000000-0000-4000-8000-000000000003'::uuid, 'active'::text) $$,
  'a lost card that turns up can be given out again'
);

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select uid, replaces_id
       from public.replace_card('c0000000-0000-4000-8000-000000000013', 'stolen', 'c0000000-0000-4000-8000-000000000015', '04112233445504') $$,
  $$ values ('04112233445504'::text, 'c0000000-0000-4000-8000-000000000013'::uuid) $$,
  'a manager reports a card stolen and gives the new one'
);
select results_eq(
  $$ select status, end_reason, blocked_by = tests.staff('manager_a'), block_reason is null
       from public.nfc_cards where id = 'c0000000-0000-4000-8000-000000000013' $$,
  $$ values ('blocked'::text, 'stolen'::text, true, true) $$,
  'a stolen card is blocked'
);

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000016', '30000000-0000-4000-8000-000000000006', '04112233445503') $$,
  '23505', 'card_blocked', 'nobody can be given a stolen card'
);
select results_eq(
  $$ select member_id, status, end_reason from public.find_card('04112233445503') $$,
  $$ values ('30000000-0000-4000-8000-000000000001'::uuid, 'blocked'::text, 'stolen'::text) $$,
  'find_card() says a card was reported stolen, and whose it was'
);

-- end_card() --------------------------------------------------------------------------------------

select results_eq(
  $$ select status, end_reason, ended_by = tests.staff('reception_a') from public.end_card('c0000000-0000-4000-8000-000000000002') $$,
  $$ values ('ended'::text, 'returned'::text, true) $$,
  'a member gives their card back (returned)'
);
select throws_ok(
  $$ select public.end_card('c0000000-0000-4000-8000-000000000002') $$,
  '23514', 'card_not_active', 'only once'
);
select results_eq(
  $$ select member_id from public.assign_card('c0000000-0000-4000-8000-000000000017', '30000000-0000-4000-8000-000000000006', 'deadbeef') $$,
  $$ values ('30000000-0000-4000-8000-000000000006'::uuid) $$,
  'a returned card can be given to someone else'
);
select results_eq(
  $$ select id from public.find_card('DEADBEEF') $$,
  $$ values ('c0000000-0000-4000-8000-000000000017'::uuid) $$,
  'find_card() gives whoever has the card now, not its history'
);

-- block_card() and unblock_card() ------------------------------------------------------------------

select throws_ok(
  $$ select public.block_card('c0000000-0000-4000-8000-000000000017', 'کارتەکە کۆپی کراوە') $$,
  '42501', 'permission_denied', 'a receptionist can''t block a card (cards.blacklist)'
);

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.block_card('c0000000-0000-4000-8000-000000000017', ' ') $$,
  '23514', 'reason_required', 'blocking a card needs a reason'
);
select results_eq(
  $$ select status, end_reason, block_reason, blocked_by = tests.staff('manager_a')
       from public.block_card('c0000000-0000-4000-8000-000000000017', 'کارتەکە کۆپی کراوە') $$,
  $$ values ('blocked'::text, 'blocked'::text, 'کارتەکە کۆپی کراوە'::text, true) $$,
  'a manager blocks a working card: it stops working, and the reason is kept'
);
select throws_ok(
  $$ select public.block_card('c0000000-0000-4000-8000-000000000017', 'دووبارە') $$,
  '23514', 'card_blocked', 'a blocked card isn''t blocked again'
);
select throws_ok(
  $$ select public.block_card('c0000000-0000-4000-8000-000000000002', 'کارتەکە کۆپی کراوە') $$,
  '23514', 'card_reassigned', 'a card that was given to someone afterwards is blocked from there'
);
select results_eq(
  $$ select status, end_reason, block_reason from public.block_card('c0000000-0000-4000-8000-000000000011', 'لەلای کەسێکی تر بینرا') $$,
  $$ values ('blocked'::text, 'damaged'::text, 'لەلای کەسێکی تر بینرا'::text) $$,
  'a manager can block a card that no longer works; why it ended stays'
);

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.unblock_card('c0000000-0000-4000-8000-000000000011') $$,
  '42501', 'permission_denied', 'a receptionist can''t unblock one either'
);

select tests.authenticate_as(tests.staff('manager_a'));
select results_eq(
  $$ select status, unblocked_by = tests.staff('manager_a'), block_reason, end_reason
       from public.unblock_card('c0000000-0000-4000-8000-000000000011') $$,
  $$ values ('ended'::text, true, 'لەلای کەسێکی تر بینرا'::text, 'damaged'::text) $$,
  'unblocking frees the card; the block stays in its history'
);
select throws_ok(
  $$ select public.unblock_card('c0000000-0000-4000-8000-000000000011') $$,
  '23514', 'card_not_blocked', 'a card that isn''t blocked isn''t unblocked'
);

select tests.authenticate_as(tests.staff('reception_a'));
select lives_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000018', '30000000-0000-4000-8000-000000000002', '04112233445501') $$,
  'an unblocked card can be given again'
);

-- Two saves at the same moment ---------------------------------------------------------------------
-- Two staff members save at once, and both find everything free. A real race can't run inside one
-- test transaction, so a test-only trigger plays the first save at exactly that moment: after the
-- second save's checks, just before its own row is written. (Really, the second write waits for
-- the first transaction to commit and then fails on the same unique index.)

select tests.clear_authentication();
create function tests.save_rival_card()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.nfc_cards (id, member_id, uid)
  values (gen_random_uuid(), coalesce(nullif(tg_argv[0], '')::uuid, new.member_id), coalesce(nullif(tg_argv[1], ''), new.uid));
  return new;
end
$$;
grant execute on function tests.save_rival_card() to authenticated;
create trigger race_same_card before insert on public.nfc_cards for each row
  when (new.id = 'c0000000-0000-4000-8000-0000000000f2')
  execute function tests.save_rival_card('30000000-0000-4000-8000-000000000008', '');
create trigger race_same_member before insert on public.nfc_cards for each row
  when (new.id = 'c0000000-0000-4000-8000-0000000000f4')
  execute function tests.save_rival_card('', '04AABBCCDDEE03');

select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-0000000000f2', '30000000-0000-4000-8000-000000000007', '04AABBCCDDEE01') $$,
  '23505', 'card_in_use', 'one card given to two members at the same moment: the second save is refused'
);
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-0000000000f4', '30000000-0000-4000-8000-000000000007', '04AABBCCDDEE02') $$,
  '23505', 'member_has_card', 'one member given two cards at the same moment: the second save is refused'
);

select public.assign_card('c0000000-0000-4000-8000-0000000000f5', '30000000-0000-4000-8000-000000000008', '04AABBCCDDEE04');
select public.end_card('c0000000-0000-4000-8000-0000000000f5');
select tests.clear_authentication();
create trigger race_block before update on public.nfc_cards for each row
  when (old.id = 'c0000000-0000-4000-8000-0000000000f5')
  execute function tests.save_rival_card('30000000-0000-4000-8000-000000000007', '');

select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.block_card('c0000000-0000-4000-8000-0000000000f5', 'کارتەکە کۆپی کراوە') $$,
  '23514', 'card_reassigned', 'a card blocked while it is given to someone at the same moment: the block is refused'
);
select is(
  (select count(*)::integer from public.nfc_cards where uid like '04AABBCCDDEE%' and status <> 'ended'), 0,
  'a refused save leaves nothing behind'
);

select tests.clear_authentication();
drop trigger race_same_card on public.nfc_cards;
drop trigger race_same_member on public.nfc_cards;
drop trigger race_block on public.nfc_cards;

-- Archiving a member ends their card -----------------------------------------------------------------

select tests.authenticate_as(tests.staff('archive_a'));
select public.set_member_status('30000000-0000-4000-8000-000000000003', 'archived', 'گواستییەوە بۆ شارێکی تر');
select results_eq(
  $$ select status, end_reason, ended_by = tests.staff('archive_a')
       from public.nfc_cards where id = 'c0000000-0000-4000-8000-000000000014' $$,
  $$ values ('ended'::text, 'member_archived'::text, true) $$,
  'archiving a member ends their card, even by staff without cards.manage'
);
select public.set_member_status('30000000-0000-4000-8000-000000000006', 'archived', 'ڕۆیشت');
select is(
  (select status from public.nfc_cards where id = 'c0000000-0000-4000-8000-000000000017'), 'blocked',
  'a blocked card stays blocked when its member is archived'
);

select tests.authenticate_as(tests.staff('reception_a'));
select lives_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000019', '30000000-0000-4000-8000-000000000008', '04A23BC15D6E80') $$,
  'an archived member''s card can be given to someone else'
);
select throws_ok(
  $$ update public.nfc_cards set status = 'ended', end_reason = 'member_archived' where id = 'c0000000-0000-4000-8000-000000000019' $$,
  '42501', 'invalid_card_change', 'only archiving the member ends a card as member_archived'
);

-- Through the API, the guard keeps the steps ---------------------------------------------------------

select throws_ok(
  $$ update public.nfc_cards set status = 'active', end_reason = null, ended_at = null
      where id = 'c0000000-0000-4000-8000-000000000011' $$,
  '42501', 'invalid_card_change', 'a card that ended never works again (it is given again instead)'
);
select throws_ok(
  $$ update public.nfc_cards set uid = '04112233445599' where id = 'c0000000-0000-4000-8000-000000000019' $$,
  '42501', 'invalid_card_change', 'a card''s UID never changes'
);
select throws_ok(
  $$ update public.nfc_cards set ended_at = '2020-01-01' where id = 'c0000000-0000-4000-8000-000000000002' $$,
  '42501', 'invalid_card_change', 'nor does its history'
);
select throws_ok(
  $$ update public.nfc_cards set status = 'blocked', end_reason = 'blocked', block_reason = 'کۆپی کراوە'
      where id = 'c0000000-0000-4000-8000-000000000018' $$,
  '42501', 'permission_denied', 'blocking needs cards.blacklist through the API too'
);
select results_eq(
  $$ update public.nfc_cards set status = 'ended', end_reason = 'returned', ended_at = '2020-01-01', ended_by = tests.staff('owner')
      where id = 'c0000000-0000-4000-8000-000000000019'
     returning end_reason, ended_at = now(), ended_by = tests.staff('reception_a') $$,
  $$ values ('returned'::text, true, true) $$,
  'the server writes when a card ended and who ended it, whatever the row says'
);
select is(
  tests.error_code($$ delete from public.nfc_cards where id = 'c0000000-0000-4000-8000-000000000019' $$),
  '42501', 'cards are never deleted'
);

select tests.clear_authentication();
select ok(
  exists (
    select 1 from public.audit_logs
     where table_name = 'nfc_cards' and row_id = 'c0000000-0000-4000-8000-000000000002' and action = 'update'
       and actor_id = tests.staff('reception_a') and new_values ->> 'end_reason' = 'returned'
  ),
  'the audit log records who ended a card and why'
);

-- Other gyms -----------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a', 'pgtap-b'));
select results_eq(
  $$ select uid, gym_id = tests.gym('pgtap-b')
       from public.assign_card('c0000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', '04A23BC15D6E80') $$,
  $$ values ('04A23BC15D6E80'::text, true) $$,
  'another gym can give out a card with the same UID: UIDs are unique per gym'
);
select is(tests.visible_rows('nfc_cards', tests.gym('pgtap-a')), 0, 'gym B''s staff see none of gym A''s cards');
select results_eq(
  $$ select id from public.find_card('04A23BC15D6E80') $$,
  $$ values ('c0000000-0000-4000-8000-0000000000b1'::uuid) $$,
  'find_card() looks in the staff member''s own gym only'
);

create temporary table other_gym_calls (statement text not null);
grant select on other_gym_calls to authenticated;
insert into other_gym_calls (statement) values
  ($$ select public.end_card('c0000000-0000-4000-8000-000000000018') $$),
  ($$ select public.replace_card('c0000000-0000-4000-8000-000000000018', 'lost') $$),
  ($$ select public.block_card('c0000000-0000-4000-8000-000000000018', 'کۆپی کراوە') $$),
  ($$ select public.unblock_card('c0000000-0000-4000-8000-000000000017') $$);
select tests.authenticate_as(tests.staff('owner', 'pgtap-b'));
select is_empty(
  $$ select statement from other_gym_calls where tests.error_code(statement) is distinct from 'P0002' $$,
  'gym B''s Owner can''t end, replace, block or unblock gym A''s cards (card_not_found)'
);

select tests.authenticate_as_service_role();
select is(
  tests.error_code($$ insert into public.nfc_cards (id, gym_id, member_id, uid)
                      values ('c0000000-0000-4000-8000-0000000000b2', tests.gym('pgtap-a'), '30000000-0000-4000-8000-0000000000b1', 'CAFEBABE') $$),
  '23503', 'not even server code can give a card to another gym''s member'
);

-- A read-only gym --------------------------------------------------------------------------------------

select tests.clear_authentication();
update public.gyms set suspended_at = now() where id = tests.gym('pgtap-a');
select tests.authenticate_as(tests.staff('manager_a'));
select throws_ok(
  $$ select public.assign_card('c0000000-0000-4000-8000-000000000020', '30000000-0000-4000-8000-000000000008', 'CAFEBABE') $$,
  '42501', 'gym_read_only', 'a read-only gym gives out no cards'
);
select throws_ok(
  $$ select public.end_card('c0000000-0000-4000-8000-000000000018') $$,
  '42501', 'gym_read_only', 'ends none'
);
select throws_ok(
  $$ select public.block_card('c0000000-0000-4000-8000-000000000018', 'کۆپی کراوە') $$,
  '42501', 'gym_read_only', 'and blocks none'
);
select results_eq(
  $$ select id from public.find_card('04112233445501') $$,
  $$ values ('c0000000-0000-4000-8000-000000000018'::uuid) $$,
  'but its staff still look cards up'
);

select * from finish();
rollback;
