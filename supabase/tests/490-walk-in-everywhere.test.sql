-- Step 8g: the walk-in customer is left out everywhere members are listed, counted or served: the
-- list, the search, the duplicate and import checks, the dashboard's count, the seller's counts and
-- support reads, check-in, and every function that takes a member's id; and a walk-in sale's
-- payment is voided only with the whole sale, so it never leaves a debt nobody sees.
begin;
select plan(24);
select tests.create_fixture();
select tests.create_platform_admin('ali@clickgroup.example');

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('49000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- A member, and the walk-in customer made by a first till sale.
select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => pg_temp.id(1), p_branch_id => tests.branch('B901'), p_full_name => 'ئارام',
  p_gender => 'male', p_phone => '+9647504900001');
select public.save_product(pg_temp.id(2), 'ئاو', 500, p_track_stock => false);
select public.sell_products(pg_temp.id(3), tests.branch('B901'),
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.id(2), 'quantity', 1, 'price', 500)),
  jsonb_build_object('id', pg_temp.id(4), 'method', 'cash', 'amount', 500), null);
select tests.clear_authentication();
create temporary table walk_in as select id from public.members where is_walk_in;
grant select on walk_in to authenticated;
select is((select count(*)::integer from walk_in), 1, 'the gym has its walk-in customer');

-- What staff see -----------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select is((select count(*)::integer from public.members where deleted_at is null), 1,
  'the members list holds the member only');
select is((select count(*)::integer from public.members where deleted_at is null and is_guest), 0,
  'and the guests filter nobody');
select is((select count(*)::integer from public.members where deleted_at is null and status = 'active' and not is_guest), 1,
  'the dashboard counts one active member');
select is((select count(*)::integer from public.search_members('کڕیار')), 0, 'the search doesn''t find it');
select is((select count(*)::integer from public.find_member_duplicates(p_full_name => 'کڕیاری بێ ناو')), 0,
  'nor do the duplicate checks of a new member');
select is((select count(*)::integer from public.check_member_import(
    jsonb_build_array(jsonb_build_object('row', 1, 'full_name', 'کڕیاری بێ ناو'))) where member_id = (select id from walk_in)), 0,
  'nor the checks of an import');

-- Nothing but a sale ---------------------------------------------------------------------------------------------

select throws_ok($$ select public.check_in(gen_random_uuid(), tests.branch('B901'), p_member_id => (select id from walk_in),
    p_override_note => 'تاقیکردنەوە') $$,
  'P0002', 'member_not_found', 'it is never checked in, not even let in anyway');
select is((select count(*)::integer from public.attendance), 0, 'so no visit is counted');
select throws_ok($$ select public.charge_member(gen_random_uuid(), (select id from walk_in), tests.branch('B901'),
    'other', 'تاقیکردنەوە', 1000) $$,
  'P0002', 'member_not_found', 'it is never charged a fee that could stay owed');
select public.add_lockers(tests.branch('B901'), 'mixed', 'daily', '', 1, 1);
select throws_ok($$ select public.give_locker(gen_random_uuid(),
    (select l.id from public.lockers l where l.branch_id = tests.branch('B901')), (select id from walk_in)) $$,
  'P0002', 'member_not_found', 'it gets no locker');
select throws_ok($$ select public.assign_card(gen_random_uuid(), (select id from walk_in), '04A1B2C3D4E590') $$,
  'P0002', 'member_not_found', 'nor a card');
select tests.clear_authentication();
select throws_ok($$ insert into public.member_health (id, gym_id, injuries)
    values ((select id from walk_in), tests.gym('pgtap-a'), 'ئازار') $$,
  'P0002', 'member_not_found', 'nor health information, even from the server');
select throws_ok($$ insert into public.invoice_items (id, gym_id, invoice_id, kind, description_ckb, quantity, unit_price, total)
    values (gen_random_uuid(), tests.gym('pgtap-a'), pg_temp.id(3), 'other', 'تاقیکردنەوە', 1, 1000, 1000) $$,
  'P0002', 'member_not_found', 'and its invoices hold products only');
select results_eq(
  $$ select c.relname::text collate "default" from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'not_walk_in' order by 1 $$,
  $$ values ('attendance'), ('class_bookings'), ('locker_assignments'), ('member_health'), ('member_photos'),
            ('member_pt_packages'), ('member_spa_packages'), ('nfc_cards'), ('spa_bookings'), ('subscriptions') $$,
  'every table of a member''s things refuses it: subscriptions, visits, lockers, spa, classes, PT, cards, photos'
);

-- Voids leave no debt ------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('owner'));
select throws_ok($$ select public.void_payment(pg_temp.id(4), 'هەڵە') $$,
  '23514', 'void_whole_sale', 'a walk-in sale''s payment isn''t voided alone');
select lives_ok($$ select public.void_invoice(pg_temp.id(3), 'هەڵە') $$, 'the whole sale is');
select is((select count(*)::integer from public.payments where id = pg_temp.id(4) and voided_at is not null), 1,
  'with its payment');
select tests.clear_authentication();
select is((select count(*)::integer from public.invoice_balances b join walk_in w on w.id = b.member_id where b.due > 0), 0,
  'the walk-in customer owes nothing');

-- Click Group ----------------------------------------------------------------------------------------------------

select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select results_eq($$ select members, active_members from public.seller_member_counts(tests.gym('pgtap-a')) $$,
  $$ values (1, 1) $$, 'the seller''s member counts leave it out');
select tests.authenticate_as(tests.staff('owner'));
select public.grant_support_access(gen_random_uuid(), 2, 'کێشەی پسوولە');
select tests.authenticate_with_aal(tests.platform_admin('ali@clickgroup.example'), 'aal2');
select is(jsonb_array_length(public.seller_support_members(tests.gym('pgtap-a'))), 1,
  'support access lists the member only');
select is(jsonb_array_length(public.seller_support_members(tests.gym('pgtap-a'), 'کڕیار')), 0, 'and finds no walk-in');
select throws_ok($$ select public.seller_support_member(tests.gym('pgtap-a'), (select id from walk_in)) $$,
  'P0002', 'member_not_found', 'nor opens it');
select is((select count(*)::integer from public.support_reads where member_id = (select id from walk_in)), 0,
  'so no read of it is written');

select * from finish();
rollback;
