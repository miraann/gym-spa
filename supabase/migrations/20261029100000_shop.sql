-- The shop and its stock (Phase 8, step 8a; spec §4.3 and the Phase 8 plan in §8 of 2026-10-29).
-- Additions only.
--
--   * product_categories, products: the gym-wide catalog (products.manage). A product's price is in
--     whole dinars, the same in every branch; an optional barcode is unique among the gym's active
--     products; stock is counted unless track_stock is off; low_stock_level marks low stock. Never
--     deleted; made inactive.
--   * stock_movements: append-only, per branch: receive, sale, sale_void, count, adjust. A branch's
--     stock is their sum (stock_levels()), never a stored number. Receiving, counting and taking out
--     need inventory.adjust.
--   * sell_products(): one invoice with an item per product (kind product, the new
--     invoice_items.product_id), the stock taken, and an optional payment, all or nothing (pos.sell
--     and payments.create). A counted product is never sold beyond the branch's stock.
--   * The walk-in customer: invoices and payments need a member, so each gym has one hidden member
--     row (is_walk_in) for people who aren't members; they pay in full. Staff never see or change it.
--   * Voiding a shop invoice puts its goods back in stock.

-- The walk-in customer -------------------------------------------------------------------------------------

alter table public.members add column is_walk_in boolean not null default false;

-- One per gym.
create unique index members_gym_id_walk_in_key on public.members (gym_id) where is_walk_in;

-- Staff never see, add or change it: it is not in the list, the guests or the search. Only the
-- server's functions (security definer) use it.
create policy "the walk-in customer is the server's" on public.members
  as restrictive
  for all to authenticated
  using (gym_id = (select app.current_gym_id()) and not is_walk_in)
  with check (gym_id = (select app.current_gym_id()) and not is_walk_in);

-- The gym's walk-in customer, made in p_branch_id when first needed. Every member row has a gender
-- and a phone, so it gets placeholders nothing uses: male, and an emergency phone no line can have
-- (+1 000..., an area code that doesn't exist).
create function app.walk_in_member(p_branch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  found_id uuid;
begin
  select m.id into found_id from public.members m where m.gym_id = gym and m.is_walk_in;
  if found_id is not null then
    return found_id;
  end if;
  begin
    insert into public.members (id, gym_id, branch_id, full_name, gender, emergency_phone, is_guest, is_walk_in)
    values (gen_random_uuid(), gym, p_branch_id, 'کڕیاری بێ ناو', 'male', '+10000000000', true, true)
    returning id into found_id;
  exception
    when unique_violation then
      -- Another sale made it at the same moment.
      select m.id into found_id from public.members m where m.gym_id = gym and m.is_walk_in;
  end;
  return found_id;
end
$$;

revoke execute on function app.walk_in_member(uuid) from public, anon, authenticated;

-- The walk-in customer's id, so the screens can name it (it is hidden from staff otherwise).
create function public.walk_in_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.members m where m.gym_id = app.current_gym_id() and m.is_walk_in
$$;

revoke execute on function public.walk_in_member_id() from public, anon;
grant execute on function public.walk_in_member_id() to authenticated;

-- The catalog ---------------------------------------------------------------------------------------------------

create table public.product_categories (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  name_ckb text not null check (app.is_clean_text(name_ckb, 60)),
  name_en text check (app.is_clean_text(name_en, 60)),
  name_ar text check (app.is_clean_text(name_ar, 60)),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: categories are never deleted.
  deleted_at timestamptz,
  constraint product_categories_id_gym_id_key unique (id, gym_id),
  constraint product_categories_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint product_categories_never_deleted check (deleted_at is null)
);

create index product_categories_gym_id_idx on public.product_categories (gym_id);

create table public.products (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  category_id uuid,
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  -- Whole dinars, the same in every branch.
  price numeric(14,2) not null check (price >= 0 and price <= 1000000000 and price = trunc(price)),
  -- What a scanner types: letters, digits, dots and dashes.
  barcode text check (barcode ~ '^[0-9A-Za-z.-]{3,64}$'),
  -- Off for things that aren't kept in stock (a towel service, say).
  track_stock boolean not null default true,
  -- At or below it, the stock is low; empty: never.
  low_stock_level integer check (low_stock_level between 0 and 100000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: products are never deleted.
  deleted_at timestamptz,
  constraint products_id_gym_id_key unique (id, gym_id),
  constraint products_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint products_category_id_gym_id_fkey foreign key (category_id, gym_id)
    references public.product_categories (id, gym_id),
  constraint products_never_deleted check (deleted_at is null)
);

create index products_gym_id_idx on public.products (gym_id);
create index products_category_id_gym_id_idx on public.products (category_id, gym_id);
create unique index products_gym_id_barcode_key on public.products (gym_id, barcode) where barcode is not null and is_active;

-- What an invoice item sold: set for kind product.
alter table public.invoice_items add column product_id uuid;
alter table public.invoice_items add constraint invoice_items_product_id_gym_id_fkey
  foreign key (product_id, gym_id) references public.products (id, gym_id);
-- New rows only: older rows have no product.
alter table public.invoice_items add constraint invoice_items_product
  check ((kind = 'product') = (product_id is not null)) not valid;
create index invoice_items_product_id_gym_id_idx on public.invoice_items (product_id, gym_id) where product_id is not null;

-- Stock -------------------------------------------------------------------------------------------------------

create table public.stock_movements (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  product_id uuid not null,
  -- receive: goods came in; sale: sold; sale_void: its invoice was voided; count: the difference a
  -- count found; adjust: taken out (damaged, expired, lost, used by the gym).
  kind text not null check (kind in ('receive', 'sale', 'sale_void', 'count', 'adjust')),
  -- In, above 0; out, below 0.
  quantity integer not null check (quantity <> 0 and quantity between -100000 and 100000),
  -- Receiving: what one cost, in dinars (for the profit report later).
  unit_cost numeric(14,2) check (unit_cost >= 0),
  -- Taking out: why.
  reason text check (reason in ('damaged', 'expired', 'lost', 'gym_use', 'other')),
  note text check (app.is_clean_text(note, 300)),
  -- Selling and voiding: the invoice item.
  invoice_item_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: movements are the history.
  deleted_at timestamptz,
  constraint stock_movements_id_gym_id_key unique (id, gym_id),
  constraint stock_movements_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint stock_movements_product_id_gym_id_fkey foreign key (product_id, gym_id) references public.products (id, gym_id),
  constraint stock_movements_invoice_item_id_gym_id_fkey foreign key (invoice_item_id, gym_id)
    references public.invoice_items (id, gym_id),
  constraint stock_movements_kind check (
    case kind
      when 'receive' then quantity > 0 and reason is null and invoice_item_id is null
      when 'sale' then quantity < 0 and invoice_item_id is not null and unit_cost is null and reason is null
      when 'sale_void' then quantity > 0 and invoice_item_id is not null and unit_cost is null and reason is null
      when 'count' then invoice_item_id is null and unit_cost is null and reason is null
      else quantity < 0 and reason is not null and invoice_item_id is null and unit_cost is null
    end
  ),
  constraint stock_movements_never_deleted check (deleted_at is null)
);

create index stock_movements_branch_id_gym_id_idx on public.stock_movements (branch_id, gym_id, product_id);
create index stock_movements_product_id_gym_id_idx on public.stock_movements (product_id, gym_id, created_at desc);
create index stock_movements_invoice_item_id_gym_id_idx on public.stock_movements (invoice_item_id, gym_id)
  where invoice_item_id is not null;

-- Triggers and row level security --------------------------------------------------------------------------

create trigger check_writable before insert or update or delete on public.product_categories
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.product_categories
  for each row execute function app.read_only_columns('id', 'gym_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.product_categories
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.product_categories
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.products
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.products
  for each row execute function app.read_only_columns('id', 'gym_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.products
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.products
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.stock_movements
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.stock_movements
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'product_id', 'kind', 'quantity', 'unit_cost', 'reason', 'note', 'invoice_item_id',
    'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.stock_movements
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.stock_movements
  for each row execute function app.audit_row();

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

revoke all on table public.product_categories, public.products, public.stock_movements from anon, authenticated;
grant all on table public.product_categories, public.products, public.stock_movements to service_role;
-- Only the functions below write them.
grant select on table public.product_categories, public.products, public.stock_movements to authenticated;

-- The catalog is the gym's price list: every staff member of the gym sees it.
create policy "staff see their gym's product categories" on public.product_categories
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

create policy "staff see their gym's products" on public.products
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

-- The movements (with what goods cost): those who keep the stock, in their branches. The till reads
-- the levels through stock_levels().
create policy "staff who keep the stock see its movements" on public.stock_movements
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and branch_id in (select app.accessible_branch_ids())
    and ((select app.has_permission('inventory.adjust')) or (select app.has_permission('products.manage')))
  );

-- The levels ---------------------------------------------------------------------------------------------------

create function app.stock_of(p_branch_id uuid, p_product_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(s.quantity), 0)::integer from public.stock_movements s
   where s.branch_id = p_branch_id and s.product_id = p_product_id
$$;

revoke execute on function app.stock_of(uuid, uuid) from public, anon, authenticated;

-- Staff who sell or keep the stock: what is in stock in one of their branches, per counted product
-- that has ever had a movement there. permission_denied; no_branch_access.
create function public.stock_levels(p_branch_id uuid)
returns table (product_id uuid, quantity integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission('pos.sell') or app.has_permission('inventory.adjust')
          or app.has_permission('products.manage')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Stock is seen with pos.sell, inventory.adjust or products.manage';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only in your own branches';
  end if;
  return query
    select s.product_id, sum(s.quantity)::integer
      from public.stock_movements s
      join public.products p on p.id = s.product_id
     where s.gym_id = app.current_gym_id() and s.branch_id = p_branch_id and p.track_stock
     group by s.product_id;
end
$$;

revoke execute on function public.stock_levels(uuid) from public, anon;
grant execute on function public.stock_levels(uuid) to authenticated;

-- The catalog's functions (products.manage) ---------------------------------------------------------------------

-- Adds a category (p_id made by the app) or changes one. permission_denied; invalid_category.
create function public.save_product_category(
  p_id uuid,
  p_name_ckb text,
  p_name_en text default null,
  p_name_ar text default null,
  p_sort_order integer default 0,
  p_is_active boolean default true
)
returns public.product_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  saved public.product_categories;
begin
  if gym is null or not app.has_permission('products.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing the shop''s categories needs products.manage';
  end if;
  if exists (select 1 from public.product_categories c where c.id = p_id and c.gym_id <> gym) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No category with this id that you may change';
  end if;
  begin
    insert into public.product_categories as c (id, gym_id, name_ckb, name_en, name_ar, sort_order, is_active)
    values (p_id, gym, p_name_ckb, p_name_en, p_name_ar, coalesce(p_sort_order, 0), coalesce(p_is_active, true))
    on conflict (id) do update set
      name_ckb = excluded.name_ckb,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active
    returning c.* into saved;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_category',
        detail = 'A name of at most 60 characters and an order from 0 to 1000';
  end;
  return saved;
end
$$;

revoke execute on function public.save_product_category(uuid, text, text, text, integer, boolean) from public, anon;
grant execute on function public.save_product_category(uuid, text, text, text, integer, boolean) to authenticated;

-- Adds a product (p_id made by the app) or changes one; invoices keep what was sold. permission_denied;
-- category_not_found; barcode_in_use (another active product has it); invalid_product.
create function public.save_product(
  p_id uuid,
  p_name_ckb text,
  p_price numeric,
  p_name_en text default null,
  p_name_ar text default null,
  p_category_id uuid default null,
  p_barcode text default null,
  p_track_stock boolean default true,
  p_low_stock_level integer default null,
  p_is_active boolean default true
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  saved public.products;
  barcode text := nullif(btrim(coalesce(p_barcode, '')), '');
begin
  if gym is null or not app.has_permission('products.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing the shop''s products needs products.manage';
  end if;
  if exists (select 1 from public.products p where p.id = p_id and p.gym_id <> gym) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'No product with this id that you may change';
  end if;
  if p_category_id is not null
     and not exists (select 1 from public.product_categories c where c.id = p_category_id and c.gym_id = gym) then
    raise exception using errcode = 'P0002', message = 'category_not_found',
      detail = 'No such category in your gym';
  end if;
  begin
    insert into public.products as p (
      id, gym_id, category_id, name_ckb, name_en, name_ar, price, barcode, track_stock, low_stock_level, is_active
    ) values (
      p_id, gym, p_category_id, p_name_ckb, p_name_en, p_name_ar, p_price, barcode, coalesce(p_track_stock, true),
      p_low_stock_level, coalesce(p_is_active, true)
    )
    on conflict (id) do update set
      category_id = excluded.category_id,
      name_ckb = excluded.name_ckb,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      price = excluded.price,
      barcode = excluded.barcode,
      track_stock = excluded.track_stock,
      low_stock_level = excluded.low_stock_level,
      is_active = excluded.is_active
    returning p.* into saved;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'barcode_in_use',
        detail = 'Another active product has this barcode';
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_product',
        detail = 'A name, a whole price, a barcode of 3 to 64 letters or digits, a low-stock level of 0 or more';
  end;
  return saved;
end
$$;

revoke execute on function public.save_product(uuid, text, numeric, text, text, uuid, text, boolean, integer, boolean) from public, anon;
grant execute on function public.save_product(uuid, text, numeric, text, text, uuid, text, boolean, integer, boolean) to authenticated;

-- Keeping the stock (inventory.adjust) ---------------------------------------------------------------------------

-- The product a stock function works on, locked so two changes to its stock don't cross, after
-- checking the permission and the branch. permission_denied; no_branch_access, branch_inactive;
-- product_not_found; product_not_counted (its stock isn't kept).
create function app.stock_product(p_branch_id uuid, p_product_id uuid)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  product public.products;
begin
  if app.current_gym_id() is null or not app.has_permission('inventory.adjust') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Keeping the stock needs inventory.adjust';
  end if;
  perform app.check_money_branch(p_branch_id);
  select * into product from public.products p
   where p.id = p_product_id and p.gym_id = app.current_gym_id()
     for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'product_not_found',
      detail = 'No such product in your gym';
  end if;
  if not product.track_stock then
    raise exception using errcode = '23514', message = 'product_not_counted',
      detail = 'This product''s stock isn''t kept';
  end if;
  return product;
end
$$;

revoke execute on function app.stock_product(uuid, uuid) from public, anon, authenticated;

-- A movement saved before with this id: the same one again returns the stock; another is refused.
create function app.saved_movement(p_id uuid, p_branch_id uuid, p_product_id uuid, p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  saved public.stock_movements;
begin
  select * into saved from public.stock_movements s where s.id = p_id;
  if not found then
    return null;
  end if;
  if saved.gym_id is distinct from app.current_gym_id() or saved.branch_id <> p_branch_id
     or saved.product_id <> p_product_id or saved.kind <> p_kind then
    raise exception using errcode = '23505', message = 'movement_exists',
      detail = 'Another stock movement has this id';
  end if;
  return jsonb_build_object('movement_id', saved.id, 'stock', app.stock_of(p_branch_id, p_product_id));
end
$$;

revoke execute on function app.saved_movement(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Goods that came in to a branch: a quantity above 0, what one cost (optional) and a note. The same
-- p_id again returns the stock. See app.stock_product(); movement_exists; invalid_movement.
create function public.receive_stock(
  p_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
begin
  perform app.stock_product(p_branch_id, p_product_id);
  saved := app.saved_movement(p_id, p_branch_id, p_product_id, 'receive');
  if saved is not null then
    return saved;
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000
     or (p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost > 1000000000)) then
    raise exception using errcode = '22023', message = 'invalid_movement',
      detail = 'Receiving 1 to 100000, with a cost of 0 or more';
  end if;
  begin
    insert into public.stock_movements (id, gym_id, branch_id, product_id, kind, quantity, unit_cost, note)
    values (p_id, app.current_gym_id(), p_branch_id, p_product_id, 'receive', p_quantity, p_unit_cost,
            nullif(btrim(coalesce(p_note, '')), ''));
  exception
    when check_violation then
      raise exception using errcode = '22023', message = 'invalid_movement',
        detail = 'A note of at most 300 characters';
  end;
  return jsonb_build_object('movement_id', p_id, 'stock', app.stock_of(p_branch_id, p_product_id));
end
$$;

revoke execute on function public.receive_stock(uuid, uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.receive_stock(uuid, uuid, uuid, integer, numeric, text) to authenticated;

-- What a count found on the shelf (0 or more): the difference to the stock is saved as a movement
-- (none when they match). The same p_id again returns the stock. See app.stock_product();
-- movement_exists; invalid_movement.
create function public.count_stock(
  p_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_counted integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
  difference integer;
begin
  perform app.stock_product(p_branch_id, p_product_id);
  saved := app.saved_movement(p_id, p_branch_id, p_product_id, 'count');
  if saved is not null then
    return saved;
  end if;
  if p_counted is null or p_counted < 0 or p_counted > 100000 then
    raise exception using errcode = '22023', message = 'invalid_movement',
      detail = 'A count is 0 to 100000';
  end if;
  difference := p_counted - app.stock_of(p_branch_id, p_product_id);
  if difference = 0 then
    return jsonb_build_object('movement_id', null, 'stock', p_counted);
  end if;
  begin
    insert into public.stock_movements (id, gym_id, branch_id, product_id, kind, quantity, note)
    values (p_id, app.current_gym_id(), p_branch_id, p_product_id, 'count', difference,
            nullif(btrim(coalesce(p_note, '')), ''));
  exception
    when check_violation then
      raise exception using errcode = '22023', message = 'invalid_movement',
        detail = 'A note of at most 300 characters';
  end;
  return jsonb_build_object('movement_id', p_id, 'stock', p_counted);
end
$$;

revoke execute on function public.count_stock(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.count_stock(uuid, uuid, uuid, integer, text) to authenticated;

-- Goods taken out of a branch's stock (damaged, expired, lost, gym_use, other), at most what is
-- there. The same p_id again returns the stock. See app.stock_product(); movement_exists;
-- invalid_movement; out_of_stock.
create function public.remove_stock(
  p_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
begin
  perform app.stock_product(p_branch_id, p_product_id);
  saved := app.saved_movement(p_id, p_branch_id, p_product_id, 'adjust');
  if saved is not null then
    return saved;
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000
     or coalesce(p_reason, '') not in ('damaged', 'expired', 'lost', 'gym_use', 'other')
     or (p_reason = 'other' and nullif(btrim(coalesce(p_note, '')), '') is null) then
    raise exception using errcode = '22023', message = 'invalid_movement',
      detail = 'Taking out 1 to 100000 with a reason; "other" needs a note';
  end if;
  if p_quantity > app.stock_of(p_branch_id, p_product_id) then
    raise exception using errcode = '23514', message = 'out_of_stock',
      detail = 'Not as many in stock';
  end if;
  begin
    insert into public.stock_movements (id, gym_id, branch_id, product_id, kind, quantity, reason, note)
    values (p_id, app.current_gym_id(), p_branch_id, p_product_id, 'adjust', -p_quantity, p_reason,
            nullif(btrim(coalesce(p_note, '')), ''));
  exception
    when check_violation then
      raise exception using errcode = '22023', message = 'invalid_movement',
        detail = 'A note of at most 300 characters';
  end;
  return jsonb_build_object('movement_id', p_id, 'stock', app.stock_of(p_branch_id, p_product_id));
end
$$;

revoke execute on function public.remove_stock(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.remove_stock(uuid, uuid, uuid, integer, text, text) to authenticated;

-- Selling (pos.sell and payments.create) --------------------------------------------------------------------------

-- A sale in a branch: p_items is [{"product_id", "quantity" (1 to 1000), "price" (the price the
-- screen showed)}], 1 to 50 products, each once; to a member (p_member_id), or to the walk-in
-- customer (null), who pays in full. One invoice with an item per product, the stock taken and an
-- optional payment, all or nothing. The same p_invoice_id again returns what was saved.
-- permission_denied; invoice_exists; no_branch_access, branch_inactive; member_not_found,
-- member_archived; invalid_sale; product_not_found; product_inactive; price_changed;
-- out_of_stock; walk_in_pays_in_full; invalid_payment; payment_too_large.
create function public.sell_products(
  p_invoice_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_items jsonb,
  p_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  existing public.invoices;
  member public.members;
  buyer uuid;
  product_ids uuid[];
  quantities integer[];
  prices numeric[];
  item record;
  product public.products;
  total numeric(14,2) := 0;
  item_id uuid;
  paid record;
begin
  if gym is null or not (app.has_permission('pos.sell') and app.has_permission('payments.create')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Selling in the shop needs pos.sell and payments.create';
  end if;
  select * into existing from public.invoices v where v.id = p_invoice_id;
  if found then
    if existing.gym_id is distinct from gym
       or not exists (select 1 from public.invoice_items i where i.invoice_id = existing.id and i.kind = 'product') then
      raise exception using errcode = '23505', message = 'invoice_exists',
        detail = 'Another invoice has this id';
    end if;
    return app.saved_invoice(existing.id);
  end if;
  perform app.check_money_branch(p_branch_id);

  if p_member_id is null then
    buyer := app.walk_in_member(p_branch_id);
  else
    select * into member from public.members m
     where m.id = p_member_id and m.gym_id = gym and m.deleted_at is null and not m.is_walk_in;
    if not found then
      raise exception using errcode = 'P0002', message = 'member_not_found',
        detail = 'No member with this id in your gym';
    end if;
    if member.status = 'archived' then
      raise exception using errcode = '23514', message = 'member_archived',
        detail = 'An archived member buys nothing';
    end if;
    buyer := member.id;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid_sale',
      detail = 'A sale has 1 to 50 products';
  end if;
  begin
    select array_agg(l.product_id order by l.product_id), array_agg(l.quantity order by l.product_id),
           array_agg(l.price order by l.product_id)
      into product_ids, quantities, prices
      from jsonb_to_recordset(p_items) as l (product_id uuid, quantity integer, price numeric);
  exception
    when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value
         or datatype_mismatch then
      raise exception using errcode = '22023', message = 'invalid_sale',
        detail = 'Each product once, with a quantity and the price shown';
  end;
  if array_position(product_ids, null) is not null or array_position(quantities, null) is not null
     or array_position(prices, null) is not null
     or (select count(distinct x) from unnest(product_ids) x) <> cardinality(product_ids)
     or exists (select 1 from unnest(quantities) q where q not between 1 and 1000) then
    raise exception using errcode = '22023', message = 'invalid_sale',
      detail = 'Each product once, with a quantity of 1 to 1000 and the price shown';
  end if;

  -- In a fixed order, so two sales lock the same products the same way.
  for item in
    select l.product_id, l.quantity, l.price
      from unnest(product_ids, quantities, prices) as l (product_id, quantity, price)
     order by l.product_id
  loop
    select * into product from public.products p where p.id = item.product_id and p.gym_id = gym for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'product_not_found',
        detail = 'No such product in your gym';
    end if;
    if not product.is_active then
      raise exception using errcode = '23514', message = 'product_inactive',
        detail = format('%s is no longer sold', product.id);
    end if;
    if item.price <> product.price then
      raise exception using errcode = '23514', message = 'price_changed',
        detail = format('%s costs %s now', product.id, product.price);
    end if;
    if product.track_stock and item.quantity > app.stock_of(p_branch_id, product.id) then
      raise exception using errcode = '23514', message = 'out_of_stock',
        detail = format('Not as many of %s in stock', product.id);
    end if;
    total := total + item.quantity * product.price;
  end loop;

  if p_member_id is null then
    if total > 0 and p_payment is null then
      raise exception using errcode = '23514', message = 'walk_in_pays_in_full',
        detail = 'Someone who isn''t a member pays it all now';
    end if;
    if p_payment is not null then
      select * into paid from app.read_payment(p_payment, total);
      if paid.amount <> total then
        raise exception using errcode = '23514', message = 'walk_in_pays_in_full',
          detail = 'Someone who isn''t a member pays it all now';
      end if;
    end if;
  elsif p_payment is not null then
    perform app.read_payment(p_payment, total);
  end if;

  insert into public.invoices (id, gym_id, branch_id, member_id, number, subtotal, discount, total)
  values (p_invoice_id, gym, p_branch_id, buyer, app.next_document_number(p_branch_id, 'invoice'), total, 0, total);
  for item in
    select l.quantity, p.*
      from unnest(product_ids, quantities) as l (product_id, quantity)
      join public.products p on p.id = l.product_id
     order by p.name_ckb
  loop
    item_id := gen_random_uuid();
    insert into public.invoice_items (
      id, gym_id, invoice_id, kind, product_id, description_ckb, description_en, description_ar, quantity, unit_price, total
    ) values (
      item_id, gym, p_invoice_id, 'product', item.id, item.name_ckb, item.name_en, item.name_ar, item.quantity,
      item.price, item.quantity * item.price
    );
    if item.track_stock then
      insert into public.stock_movements (id, gym_id, branch_id, product_id, kind, quantity, invoice_item_id)
      values (gen_random_uuid(), gym, p_branch_id, item.id, 'sale', -item.quantity, item_id);
    end if;
  end loop;
  if p_payment is not null and total > 0 then
    perform app.record_payment(p_payment, total, gym, p_branch_id, buyer, p_invoice_id);
  end if;
  return app.saved_invoice(p_invoice_id);
end
$$;

revoke execute on function public.sell_products(uuid, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.sell_products(uuid, uuid, uuid, jsonb, jsonb) to authenticated;

-- AFTER UPDATE of voided_at on invoices: a voided invoice's goods go back to the stock they came from.
create function app.return_invoice_goods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_movements (id, gym_id, branch_id, product_id, kind, quantity, invoice_item_id)
  select gen_random_uuid(), s.gym_id, s.branch_id, s.product_id, 'sale_void', -s.quantity, s.invoice_item_id
    from public.stock_movements s
    join public.invoice_items i on i.id = s.invoice_item_id
   where i.invoice_id = new.id and s.kind = 'sale';
  return null;
end
$$;

revoke execute on function app.return_invoice_goods() from public, anon, authenticated;

create trigger return_goods after update of voided_at on public.invoices
  for each row
  when (old.voided_at is null and new.voided_at is not null)
  execute function app.return_invoice_goods();
