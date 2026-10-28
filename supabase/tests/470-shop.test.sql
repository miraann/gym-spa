-- Step 8a: the shop. Categories and products, receiving, counting and taking out stock, the stock
-- levels, selling to a member and to the walk-in customer (hidden from staff, pays in full), the
-- checks a sale makes, voiding putting goods back, and who may do what.
begin;
select plan(42);
select tests.create_fixture();

create function pg_temp.id(n integer) returns uuid language sql as $$
  select ('47000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.stock(p_product uuid) returns integer language sql as $$
  select coalesce((select quantity from public.stock_levels(tests.branch('B901')) where product_id = p_product), 0)
$$;
create function pg_temp.cash(p_id uuid, p_amount integer) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'method', 'cash', 'amount', p_amount)
$$;
create function pg_temp.sell(p_invoice uuid, p_branch uuid, p_member uuid, p_items jsonb, p_payment jsonb default null)
returns jsonb language sql as $$
  select public.sell_products(p_invoice, p_branch, p_items, p_payment, p_member)
$$;
create function pg_temp.line(p_product uuid, p_quantity integer, p_price integer) returns jsonb language sql as $$
  select jsonb_build_object('product_id', p_product, 'quantity', p_quantity, 'price', p_price)
$$;

select tests.authenticate_as(tests.staff('owner'));
select public.create_member(p_id => pg_temp.id(1), p_branch_id => tests.branch('B901'), p_full_name => 'ئارام',
  p_gender => 'male', p_phone => '+9647504700001');

-- The catalog -------------------------------------------------------------------------------------------------

select is((public.save_product_category(pg_temp.id(2), 'خواردنەوە')).name_ckb, 'خواردنەوە', 'the Owner adds a category');
select is((public.save_product(pg_temp.id(3), 'ئاو', 500, p_category_id => pg_temp.id(2), p_barcode => '6260001',
  p_low_stock_level => 5)).price, 500.00, 'and a product with a barcode');
select public.save_product(pg_temp.id(4), 'پڕۆتین', 45000);
select public.save_product(pg_temp.id(5), 'خاولی', 1000, p_track_stock => false);
select throws_ok($$ select public.save_product(gen_random_uuid(), 'ئاوی تر', 500, p_barcode => '6260001') $$,
  '23505', 'barcode_in_use', 'a barcode is one active product''s');
select throws_ok($$ select public.save_product(gen_random_uuid(), 'ئاو', 500.5) $$,
  '22023', 'invalid_product', 'prices are whole dinars');
select throws_ok($$ select public.save_product(gen_random_uuid(), 'ئاو', 500, p_category_id => gen_random_uuid()) $$,
  'P0002', 'category_not_found', 'the category is the gym''s');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select public.save_product(gen_random_uuid(), 'ئاو', 500) $$,
  '42501', 'permission_denied', 'reception doesn''t change the catalog (products.manage)');
select is((select count(*)::integer from public.products), 3, 'but sees it');

-- Keeping the stock ---------------------------------------------------------------------------------------------

select throws_ok($$ select public.receive_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(3), 10) $$,
  '42501', 'permission_denied', 'reception doesn''t receive stock (inventory.adjust)');
select tests.authenticate_as(tests.staff('manager_a'));
select is((public.receive_stock(pg_temp.id(11), tests.branch('B901'), pg_temp.id(3), 24, 300, 'کارتۆنێک') ->> 'stock')::integer,
  24, 'the branch manager receives 24');
select is((public.receive_stock(pg_temp.id(11), tests.branch('B901'), pg_temp.id(3), 24, 300) ->> 'stock')::integer,
  24, 'sending it again changes nothing');
select throws_ok($$ select public.receive_stock(pg_temp.id(11), tests.branch('B901'), pg_temp.id(4), 1) $$,
  '23505', 'movement_exists', 'an id is one movement');
select throws_ok($$ select public.receive_stock(gen_random_uuid(), tests.branch('B902'), pg_temp.id(3), 1) $$,
  '42501', 'no_branch_access', 'only in their own branches');
select throws_ok($$ select public.receive_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(5), 1) $$,
  '23514', 'product_not_counted', 'a product whose stock isn''t kept has none');
select throws_ok($$ select public.receive_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(3), 0) $$,
  '22023', 'invalid_movement', 'receiving is 1 or more');
select public.receive_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(4), 3);
select is((public.count_stock(pg_temp.id(12), tests.branch('B901'), pg_temp.id(3), 22, 'ژماردنی هەفتانە') ->> 'stock')::integer,
  22, 'a count of 22 saves the difference');
select is((select quantity from public.stock_movements where id = pg_temp.id(12)), -2, 'as -2');
select is(public.count_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(3), 22) ->> 'movement_id', null,
  'a count that matches saves nothing');
select is((public.remove_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(3), 2, 'damaged') ->> 'stock')::integer,
  20, 'two damaged are taken out');
select throws_ok($$ select public.remove_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(3), 21, 'lost') $$,
  '23514', 'out_of_stock', 'not more than there is');
select throws_ok($$ select public.remove_stock(gen_random_uuid(), tests.branch('B901'), pg_temp.id(3), 1, 'other') $$,
  '22023', 'invalid_movement', '"other" needs a note');

-- Selling -------------------------------------------------------------------------------------------------------

select tests.authenticate_as(tests.staff('reception_a'));
select is(pg_temp.stock(pg_temp.id(3)), 20, 'reception sees the stock levels');
select is((select count(*)::integer from public.stock_movements), 0, 'but not the movements (with what goods cost)');
select is((pg_temp.sell(pg_temp.id(21), tests.branch('B901'), pg_temp.id(1),
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 2, 500), pg_temp.line(pg_temp.id(5), 1, 1000)),
  pg_temp.cash(pg_temp.id(22), 2000)) ->> 'paid')::numeric, 2000.00, 'reception sells water and a towel to a member');
select results_eq($$ select kind, description_ckb, quantity, total from public.invoice_items where invoice_id = '47000000-0000-4000-8000-000000000021' order by description_ckb $$,
  $$ values ('product', 'ئاو', 2, 1000.00::numeric), ('product', 'خاولی', 1, 1000.00::numeric) $$, 'on one invoice');
select is(pg_temp.stock(pg_temp.id(3)), 18, 'the water left the stock');
select is((pg_temp.sell(pg_temp.id(21), tests.branch('B901'), pg_temp.id(1),
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 2, 500)), null) ->> 'invoice_id')::uuid, pg_temp.id(21),
  'sending it again returns what was saved');
select is(pg_temp.stock(pg_temp.id(3)), 18, 'and takes nothing more');
select throws_ok($$ select pg_temp.sell(gen_random_uuid(), tests.branch('B901'), pg_temp.id(1),
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 1, 400))) $$,
  '23514', 'price_changed', 'the price shown is the price');
select throws_ok($$ select pg_temp.sell(gen_random_uuid(), tests.branch('B901'), pg_temp.id(1),
  jsonb_build_array(pg_temp.line(pg_temp.id(4), 4, 45000))) $$,
  '23514', 'out_of_stock', 'not more than the branch has');
select throws_ok($$ select pg_temp.sell(gen_random_uuid(), tests.branch('B901'), pg_temp.id(1),
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 1, 500), pg_temp.line(pg_temp.id(3), 1, 500))) $$,
  '22023', 'invalid_sale', 'each product once');
select is((pg_temp.sell(pg_temp.id(23), tests.branch('B901'), pg_temp.id(1),
  jsonb_build_array(pg_temp.line(pg_temp.id(4), 1, 45000))) ->> 'paid')::numeric, 0.00,
  'a member may owe it');

-- The walk-in customer.
select throws_ok($$ select pg_temp.sell(gen_random_uuid(), tests.branch('B901'), null,
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 1, 500))) $$,
  '23514', 'walk_in_pays_in_full', 'someone who isn''t a member pays now');
select throws_ok($$ select pg_temp.sell(gen_random_uuid(), tests.branch('B901'), null,
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 2, 500)), pg_temp.cash(gen_random_uuid(), 500)) $$,
  '23514', 'walk_in_pays_in_full', 'all of it');
select is((pg_temp.sell(pg_temp.id(24), tests.branch('B901'), null,
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 1, 500)), pg_temp.cash(pg_temp.id(25), 500)) ->> 'paid')::numeric,
  500.00, 'a walk-in buys water');
select pg_temp.sell(gen_random_uuid(), tests.branch('B901'), null,
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 1, 500)), pg_temp.cash(gen_random_uuid(), 500));
select is((select member_id from public.invoices where id = pg_temp.id(24)), public.walk_in_member_id(),
  'on the walk-in customer');
select is((select count(*)::integer from public.members where is_walk_in or id = public.walk_in_member_id()), 0,
  'whom staff never see');
select throws_ok($$ insert into public.members (id, branch_id, full_name, gender, phone, is_walk_in)
                    values (gen_random_uuid(), tests.branch('B901'), 'کڕیار', 'male', '+9647504700002', true) $$,
  '42501', null, 'nor add');
select tests.clear_authentication();
select is((select count(*)::integer from public.members where is_walk_in), 1, 'one per gym, used again');
select tests.authenticate_as(tests.staff('reception_a'));
select throws_ok($$ select pg_temp.sell(gen_random_uuid(), tests.branch('B901'), public.walk_in_member_id(),
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 1, 500))) $$,
  'P0002', 'member_not_found', 'and isn''t sold to by name, where a debt could stay');

select tests.authenticate_as(tests.staff('trainer_ab'));
select throws_ok($$ select pg_temp.sell(gen_random_uuid(), tests.branch('B901'), pg_temp.id(1),
  jsonb_build_array(pg_temp.line(pg_temp.id(3), 1, 500))) $$,
  '42501', 'permission_denied', 'a trainer doesn''t sell (pos.sell)');

-- Voiding puts the goods back.
select tests.authenticate_as(tests.staff('owner'));
select public.void_invoice(pg_temp.id(21), 'هەڵە');
select is(pg_temp.stock(pg_temp.id(3)), 18, 'a voided sale''s goods are back in stock');
select is((select count(*)::integer from public.stock_movements where kind = 'sale_void'), 1,
  'only the counted ones');

select * from finish();
rollback;
