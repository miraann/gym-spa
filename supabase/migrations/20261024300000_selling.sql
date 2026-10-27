-- Selling a subscription (Phase 3, step 3c; spec §4.2 and §4.3, the Phase 3 plan of 2026-10-24).
-- Additions only, and one function replaced: taking an import back counts members who bought
-- something since the import as changed (spec §4.1).
--
--   * sell_subscription() saves the subscription, its invoice and item, the first payment and the
--     installments together, or nothing. Money rows are written only by the server's functions:
--     staff read them (payments.view, and access to the invoice's branch) and never add, change or
--     delete them themselves. Nothing financial is ever deleted.
--   * A subscription keeps its own copy of the plan, so changing the plan later never changes it.
--     Its last day comes from app.plan_end_date().
--   * Discounts are whole dinars, at most the share the seller's permission allows
--     (discount.apply.max_10/25/50/any, the highest one counts), with a reason.
--   * Every amount is in IQD. A payment in USD keeps the dollars and that day's rate (dinars for one
--     dollar); its value in dinars is worked out here (app.usd_to_iqd). Dollars are whole bills, so
--     what is more than the invoice owes is change, given back in dinars (change_given). A payment
--     never counts for more than the invoice still owes, so nobody has credit.
--   * Installments add up to what wasn't paid at the sale, due today or later, each after the one
--     before. Payments pay them oldest first (installment_balances).
--   * Numbers come from the branch's counters, in order and without gaps (a sale that fails gives
--     its number back): invoices B1-000457, payment receipts B1-R000123.
--   * The member's balance is computed (invoice_balances), never a stored counter.

-- Rules shared with the app ---------------------------------------------------------------------

-- Dollars (2 decimals) at a rate (dinars for one dollar) in whole dinars, rounded half up
-- (usdToIqd() in packages/core; a test runs the same cases through both).
create function app.usd_to_iqd(p_amount numeric, p_rate numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select round(p_amount * p_rate)
$$;

-- Whether a discount is one the seller may give: whole dinars, from 0 to the price, and at most
-- p_max_percent of it (isDiscountAllowed() in packages/core, the same cases).
create function app.is_discount_allowed(p_price numeric, p_discount numeric, p_max_percent integer)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_discount is not null and p_discount >= 0 and p_discount = trunc(p_discount)
     and p_discount <= p_price and p_discount * 100 <= p_price * p_max_percent
$$;

-- The largest discount, in percent of the price, the acting staff member may give (0: none).
create function app.max_discount_percent()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.has_permission('discount.apply.any') then 100
    when app.has_permission('discount.apply.max_50') then 50
    when app.has_permission('discount.apply.max_25') then 25
    when app.has_permission('discount.apply.max_10') then 10
    else 0
  end
$$;

revoke execute on function app.max_discount_percent() from public, anon;
grant execute on function app.max_discount_percent() to authenticated;

-- Numbers -------------------------------------------------------------------------------------------

-- The last number each branch gave, per kind of document. Private: only app.next_document_number()
-- uses it, inside the transaction that saves the document, so a failed sale gives its number back.
create table app.branch_counters (
  gym_id uuid not null,
  branch_id uuid not null,
  counter text not null check (counter in ('invoice', 'receipt')),
  last_value bigint not null check (last_value > 0),
  primary key (branch_id, counter),
  -- Branches are never deleted (only test data is); a counter goes with its branch, like
  -- app.gym_counters with its gym.
  foreign key (branch_id, gym_id) references public.branches (id, gym_id) on delete cascade
);

revoke all on table app.branch_counters from public, anon, authenticated;

-- The next number of a branch: B1-000457 for an invoice, B1-R000123 for a receipt (more digits
-- after 999999). Two sales at once in one branch wait for each other here, briefly.
create function app.next_document_number(p_branch_id uuid, p_counter text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  branch public.branches;
  next_value bigint;
begin
  select * into strict branch from public.branches b where b.id = p_branch_id;
  insert into app.branch_counters as c (gym_id, branch_id, counter, last_value)
  values (branch.gym_id, branch.id, p_counter, 1)
  on conflict (branch_id, counter) do update set last_value = c.last_value + 1
  returning c.last_value into next_value;
  return branch.code || '-' || case p_counter when 'receipt' then 'R' else '' end
    || lpad(next_value::text, greatest(6, length(next_value::text)), '0');
end
$$;

revoke execute on function app.next_document_number(uuid, text) from public, anon, authenticated;

-- Subscriptions -------------------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  member_id uuid not null,
  plan_id uuid not null,
  -- Where it was sold.
  branch_id uuid not null,
  -- The plan as it was sold (plans.*).
  name_ckb text not null check (app.is_clean_text(name_ckb, 80)),
  name_en text check (app.is_clean_text(name_en, 80)),
  name_ar text check (app.is_clean_text(name_ar, 80)),
  kind text not null check (kind in ('time', 'visits', 'hybrid', 'unlimited')),
  duration_unit text check (duration_unit in ('day', 'month')),
  duration_count integer check (duration_count > 0),
  visit_count integer check (visit_count > 0),
  -- The plan's price on the day; what the member pays is on the invoice.
  price numeric(14,2) not null check (price >= 0),
  gender text not null check (gender in ('any', 'male', 'female')),
  -- Empty: every branch.
  branch_ids uuid[],
  allowed_days smallint[] check (app.is_valid_weekdays(allowed_days)),
  allowed_from time,
  allowed_until time,
  daily_visit_limit smallint check (daily_visit_limit > 0),
  max_freeze_days integer not null check (max_freeze_days >= 0),
  start_date date not null,
  -- Its last day (time and hybrid): app.plan_end_date() at the sale. Freezing (step 3f) moves it.
  end_date date,
  -- active: sold and not undone. Expired, frozen and not started yet come from the dates.
  -- cancelled (step 3f), voided (its invoice was a mistake, step 3e), replaced (by an upgrade or
  -- downgrade, step 3f), transferred (to another member, step 3f).
  status text not null default 'active' check (status in ('active', 'cancelled', 'voided', 'replaced', 'transferred')),
  status_reason text check (app.is_clean_text(status_reason, 500)),
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: subscriptions are never deleted.
  deleted_at timestamptz,
  constraint subscriptions_id_gym_id_key unique (id, gym_id),
  constraint subscriptions_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint subscriptions_plan_id_gym_id_fkey foreign key (plan_id, gym_id) references public.plans (id, gym_id),
  constraint subscriptions_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint subscriptions_kind check (
    (kind in ('time', 'hybrid')) = (duration_count is not null)
    and (duration_unit is null) = (duration_count is null)
    and (kind in ('time', 'hybrid')) = (end_date is not null)
    and (kind in ('visits', 'hybrid')) = (visit_count is not null)
    and (end_date is null or end_date >= start_date)
  ),
  constraint subscriptions_window check (
    (allowed_from is null) = (allowed_until is null) and (allowed_from is null or allowed_from < allowed_until)
  ),
  constraint subscriptions_status check ((status = 'active') = (status_changed_at is null)),
  constraint subscriptions_never_deleted check (deleted_at is null)
);

-- A member's subscriptions by state and end (spec §5), and the foreign keys.
create index subscriptions_member_id_gym_id_idx on public.subscriptions (member_id, gym_id, status, end_date);
create index subscriptions_plan_id_gym_id_idx on public.subscriptions (plan_id, gym_id);
create index subscriptions_branch_id_gym_id_idx on public.subscriptions (branch_id, gym_id);

-- Invoices --------------------------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  -- Where it was made: its number is the branch's.
  branch_id uuid not null,
  member_id uuid not null,
  -- From the branch's counter: B1-000457. Never changes.
  number text not null check (number ~ '^B[1-9][0-9]{0,2}-[0-9]{6,}$'),
  -- Whole dinars: the items' prices, their discounts, and what the member pays.
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null,
  -- A mistake (step 3e): it counts for nothing, with its payments.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (app.is_clean_text(void_reason, 500)),
  -- When it was made, and who made it.
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: invoices are never deleted.
  deleted_at timestamptz,
  constraint invoices_id_gym_id_key unique (id, gym_id),
  constraint invoices_id_member_id_gym_id_key unique (id, member_id, gym_id),
  constraint invoices_gym_id_number_key unique (gym_id, number),
  constraint invoices_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint invoices_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint invoices_total check (total = subtotal - discount and total >= 0 and total = trunc(total)),
  constraint invoices_voided check ((voided_at is null) = (void_reason is null)),
  constraint invoices_never_deleted check (deleted_at is null)
);

create index invoices_branch_id_gym_id_idx on public.invoices (branch_id, gym_id, created_at desc);
create index invoices_member_id_gym_id_idx on public.invoices (member_id, gym_id, created_at desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  invoice_id uuid not null,
  -- What was sold. Lockers, spa, the shop and penalties come in later phases.
  kind text not null check (kind in ('subscription', 'card_replacement', 'locker', 'spa', 'product', 'penalty', 'other')),
  subscription_id uuid,
  -- The words on the receipt, in the languages the gym has them.
  description_ckb text not null check (app.is_clean_text(description_ckb, 200)),
  description_en text check (app.is_clean_text(description_en, 200)),
  description_ar text check (app.is_clean_text(description_ar, 200)),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  unit_price numeric(14,2) not null check (unit_price >= 0 and unit_price = trunc(unit_price)),
  discount numeric(14,2) not null default 0 check (discount >= 0 and discount = trunc(discount)),
  discount_reason text check (app.is_clean_text(discount_reason, 500)),
  total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint invoice_items_id_gym_id_key unique (id, gym_id),
  constraint invoice_items_invoice_id_gym_id_fkey foreign key (invoice_id, gym_id) references public.invoices (id, gym_id),
  constraint invoice_items_subscription_id_gym_id_fkey foreign key (subscription_id, gym_id) references public.subscriptions (id, gym_id),
  constraint invoice_items_total check (total = quantity * unit_price - discount and total >= 0),
  constraint invoice_items_subscription check ((kind = 'subscription') = (subscription_id is not null)),
  constraint invoice_items_discount check (discount = 0 or discount_reason is not null),
  constraint invoice_items_never_deleted check (deleted_at is null)
);

create index invoice_items_invoice_id_gym_id_idx on public.invoice_items (invoice_id, gym_id);
-- A subscription is sold once.
create unique index invoice_items_subscription_id_gym_id_key on public.invoice_items (subscription_id, gym_id) where subscription_id is not null;

-- Payments ----------------------------------------------------------------------------------------------

create table public.payments (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  -- Where the money was taken: the receipt's number is the branch's.
  branch_id uuid not null,
  member_id uuid not null,
  invoice_id uuid not null,
  -- From the branch's counter: B1-R000123. Never changes.
  number text not null check (number ~ '^B[1-9][0-9]{0,2}-R[0-9]{6,}$'),
  -- payment: money in; refund: money given back (step 3e).
  kind text not null default 'payment' check (kind in ('payment', 'refund')),
  method text not null check (method in ('cash', 'card', 'fib', 'fastpay', 'zaincash', 'bank_transfer')),
  -- What it counts for, in whole dinars.
  amount numeric(14,2) not null check (amount > 0 and amount = trunc(amount)),
  -- What was handed over: dinars, or dollars at that day's rate (dinars for one dollar).
  currency text not null default 'IQD' check (currency in ('IQD', 'USD')),
  foreign_amount numeric(14,2) check (foreign_amount > 0),
  exchange_rate numeric(10,2) check (exchange_rate > 0),
  -- Dollars only: what was given back in dinars, when the dollars were worth more than was owed.
  change_given numeric(14,2) check (change_given >= 0 and change_given = trunc(change_given)),
  -- The card slip's or transfer's number (card, FIB, FastPay, ZainCash, bank transfer).
  reference text check (app.is_clean_text(reference, 100)),
  -- Why money was given back (a refund needs one).
  reason text check (app.is_clean_text(reason, 500)),
  -- A mistake, voided the same day (step 3e): it counts for nothing.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (app.is_clean_text(void_reason, 500)),
  -- When the money was taken, and who took it.
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: payments are never deleted.
  deleted_at timestamptz,
  constraint payments_id_gym_id_key unique (id, gym_id),
  constraint payments_gym_id_number_key unique (gym_id, number),
  constraint payments_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint payments_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  -- The invoice is the same member's.
  constraint payments_invoice_id_member_id_gym_id_fkey foreign key (invoice_id, member_id, gym_id)
    references public.invoices (id, member_id, gym_id),
  constraint payments_currency check (
    (currency = 'USD') = (foreign_amount is not null)
    and (currency = 'USD') = (exchange_rate is not null)
    and (currency = 'USD') = (change_given is not null)
    and (currency = 'IQD' or amount + change_given = app.usd_to_iqd(foreign_amount, exchange_rate))
  ),
  constraint payments_reason check (kind = 'payment' or reason is not null),
  constraint payments_voided check ((voided_at is null) = (void_reason is null)),
  constraint payments_never_deleted check (deleted_at is null)
);

create index payments_invoice_id_member_id_gym_id_idx on public.payments (invoice_id, member_id, gym_id);
create index payments_member_id_gym_id_idx on public.payments (member_id, gym_id, created_at desc);
create index payments_branch_id_gym_id_idx on public.payments (branch_id, gym_id, created_at desc);

create table public.installments (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  invoice_id uuid not null,
  due_date date not null,
  -- Whole dinars.
  amount numeric(14,2) not null check (amount > 0 and amount = trunc(amount)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint installments_id_gym_id_key unique (id, gym_id),
  constraint installments_invoice_id_due_date_key unique (invoice_id, due_date),
  constraint installments_invoice_id_gym_id_fkey foreign key (invoice_id, gym_id) references public.invoices (id, gym_id),
  constraint installments_never_deleted check (deleted_at is null)
);

create index installments_invoice_id_gym_id_idx on public.installments (invoice_id, gym_id);

-- Triggers ------------------------------------------------------------------------------------------------
-- BEFORE triggers run in name order: check_writable, read_only, stamp. Only the server's functions
-- write these tables (no client role may), so they need no guard; the read_only triggers keep
-- what a document says from ever changing, also for them.

create trigger check_writable before insert or update or delete on public.subscriptions
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.subscriptions
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'member_id', 'plan_id', 'branch_id', 'name_ckb', 'name_en', 'name_ar', 'kind',
    'duration_unit', 'duration_count', 'visit_count', 'price', 'gender', 'branch_ids', 'allowed_days',
    'allowed_from', 'allowed_until', 'daily_visit_limit', 'max_freeze_days', 'start_date', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.subscriptions
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.subscriptions
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.invoices
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.invoices
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_id', 'number', 'subtotal', 'discount', 'total', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.invoices
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.invoices
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.invoice_items
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.invoice_items
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'invoice_id', 'kind', 'subscription_id', 'description_ckb', 'description_en', 'description_ar',
    'quantity', 'unit_price', 'discount', 'discount_reason', 'total', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.invoice_items
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.invoice_items
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.payments
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.payments
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_id', 'invoice_id', 'number', 'kind', 'method', 'amount', 'currency',
    'foreign_amount', 'exchange_rate', 'change_given', 'reference', 'reason', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.payments
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.payments
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.installments
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.installments
  for each row execute function app.read_only_columns('id', 'gym_id', 'invoice_id', 'due_date', 'amount', 'created_at', 'created_by');
create trigger stamp before insert or update on public.installments
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.installments
  for each row execute function app.audit_row();

-- Row level security ----------------------------------------------------------------------------------------

alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.installments enable row level security;

revoke all on table public.subscriptions, public.invoices, public.invoice_items, public.payments, public.installments
  from anon, authenticated;
grant all on table public.subscriptions, public.invoices, public.invoice_items, public.payments, public.installments
  to service_role;
-- Staff only read them; the functions below write them.
grant select on table public.subscriptions, public.invoices, public.invoice_items, public.payments, public.installments
  to authenticated;

-- Members belong to the whole gym, and so do their subscriptions (spec §4.1).
create policy "staff with members.view see subscriptions" on public.subscriptions
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

-- Money is seen per branch: the invoice's.
create policy "staff with payments.view see their branches' invoices" on public.invoices
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('payments.view'))
    and branch_id in (select app.accessible_branch_ids())
  );

-- An invoice's items, payments and installments are seen with the invoice (its policy applies in
-- the subquery, which runs once per query).
create policy "staff see the items of invoices they see" on public.invoice_items
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and invoice_id in (select v.id from public.invoices v));

create policy "staff see the payments of invoices they see" on public.payments
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and invoice_id in (select v.id from public.invoices v));

create policy "staff see the installments of invoices they see" on public.installments
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and invoice_id in (select v.id from public.invoices v));

-- Balances --------------------------------------------------------------------------------------------------
-- Computed from the rows, never stored (CLAUDE.md → Data rules). As the caller (security_invoker),
-- so they show only what the caller may see.

-- Each invoice: what was paid (payments minus refunds, voided ones not counted) and what is still
-- owed. A voided invoice owes nothing.
create view public.invoice_balances with (security_invoker = true) as
select v.id as invoice_id,
       v.gym_id,
       v.branch_id,
       v.member_id,
       v.number,
       v.total,
       v.created_at,
       v.voided_at,
       coalesce(p.paid, 0)::numeric(14,2) as paid,
       case when v.voided_at is null then v.total - coalesce(p.paid, 0) else 0 end::numeric(14,2) as due
  from public.invoices v
  left join lateral (
    select sum(case p.kind when 'payment' then p.amount else -p.amount end) as paid
      from public.payments p
     where p.invoice_id = v.id and p.gym_id = v.gym_id and p.voided_at is null
  ) p on true;

-- Each installment: how much of it is paid. What was paid goes first to the part of the invoice
-- that had no installment (paid at the sale), then to the installments oldest first.
create view public.installment_balances with (security_invoker = true) as
with ordered as (
  select i.*,
         sum(i.amount) over (partition by i.invoice_id order by i.due_date) as through,
         sum(i.amount) over (partition by i.invoice_id) as all_installments
    from public.installments i
)
select o.id as installment_id,
       o.gym_id,
       o.invoice_id,
       o.due_date,
       o.amount,
       least(o.amount, greatest(0, b.paid - (b.total - o.all_installments) - (o.through - o.amount)))::numeric(14,2) as paid,
       (b.voided_at is not null) as voided
  from ordered o
  join public.invoice_balances b on b.invoice_id = o.invoice_id;

revoke all on table public.invoice_balances, public.installment_balances from anon, authenticated;
grant select on table public.invoice_balances, public.installment_balances to authenticated, service_role;

-- Selling ---------------------------------------------------------------------------------------------------

-- What a sale saved, for the screen and the receipt (also for the same sale sent again).
create function app.sale_result(p_subscription_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'subscription_id', s.id,
    'invoice_id', v.id,
    'invoice_number', v.number,
    'total', v.total,
    'payment_id', p.id,
    'receipt_number', p.number,
    'paid', coalesce(p.amount, 0),
    'change_given', coalesce(p.change_given, 0),
    'start_date', s.start_date,
    'end_date', s.end_date
  )
    from public.subscriptions s
    join public.invoice_items it on it.subscription_id = s.id and it.gym_id = s.gym_id
    join public.invoices v on v.id = it.invoice_id and v.gym_id = s.gym_id
    left join lateral (
      select p.id, p.number, p.amount, p.change_given from public.payments p
       where p.invoice_id = v.id and p.gym_id = v.gym_id and p.kind = 'payment'
       order by p.created_at
       limit 1
    ) p on true
   where s.id = p_subscription_id
$$;

revoke execute on function app.sale_result(uuid) from public, anon, authenticated;

-- Sells a member a plan: the subscription, its invoice with one item, the first payment and the
-- installments, all or nothing. The ids are made by the app; the same sale sent again (a retry
-- after a lost answer) returns what was saved. Checked in this order:
--   permission_denied: subscriptions.sell and members.view (payments.create for a payment);
--   no_branch_access, branch_inactive: the branch where it is sold;
--   member_not_found; member_not_active (suspended, banned or archived);
--   plan_not_found; plan_not_on_sale; price_changed (p_price is the price the screen showed);
--   plan_gender_mismatch; invalid_start_date (30 days back to a year ahead, Baghdad time);
--   invalid_discount; discount_too_large (the seller's permission); reason_required;
--   invalid_payment; payment_too_large (dinars beyond what the invoice owes; dollars beyond it are
--   change, given back in dinars);
--   invalid_installments (amounts, dates today or later and in order); installments_mismatch
--   (they don't add up to what is left).
-- p_payment: {"id", "method", "amount"} in dinars, or {"id", "method", "currency": "USD",
-- "foreign_amount", "exchange_rate"}, with an optional "reference". p_installments:
-- [{"id", "due_date", "amount"}]. Security definer: staff can't write money rows themselves; it
-- makes every check RLS would (the caller's gym, permissions and branch), and the row stamps and
-- the audit log name the caller.
create function public.sell_subscription(
  p_subscription_id uuid,
  p_invoice_id uuid,
  p_member_id uuid,
  p_plan_id uuid,
  p_branch_id uuid,
  p_start_date date,
  p_price numeric,
  p_discount numeric default 0,
  p_discount_reason text default null,
  p_payment jsonb default null,
  p_installments jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  today date := (now() at time zone 'Asia/Baghdad')::date;
  member public.members;
  plan public.plans;
  existing public.subscriptions;
  total numeric(14,2);
  paid numeric(14,2) := 0;
  payment_id uuid;
  change numeric(14,2);
  currency text;
  foreign_amount numeric;
  rate numeric;
  installment record;
  installments_total numeric(14,2) := 0;
  last_due date;
begin
  if gym is null or not (app.has_permission('subscriptions.sell') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Selling needs subscriptions.sell and members.view';
  end if;
  if p_payment is not null and not app.has_permission('payments.create') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Taking a payment needs payments.create';
  end if;

  select * into existing from public.subscriptions s where s.id = p_subscription_id;
  if found then
    if existing.gym_id is distinct from gym or existing.member_id <> p_member_id or existing.plan_id <> p_plan_id then
      raise exception using errcode = '23505', message = 'sale_exists',
        detail = 'Another sale has this id';
    end if;
    return app.sale_result(p_subscription_id);
  end if;
  if exists (select 1 from public.invoices v where v.id = p_invoice_id) then
    raise exception using errcode = '23505', message = 'sale_exists',
      detail = 'Another sale has this invoice id';
  end if;

  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'You can sell only in your own branches';
  end if;
  if not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'branch_inactive',
      detail = 'This branch is deactivated';
  end if;

  select * into member from public.members m where m.id = p_member_id and m.gym_id = gym and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member.status <> 'active' then
    raise exception using errcode = '42501', message = 'member_not_active',
      detail = format('The member is %s', member.status);
  end if;

  select * into plan from public.plans p where p.id = p_plan_id and p.gym_id = gym;
  if not found then
    raise exception using errcode = 'P0002', message = 'plan_not_found',
      detail = 'No plan with this id in your gym';
  end if;
  if not plan.is_active then
    raise exception using errcode = '23514', message = 'plan_not_on_sale',
      detail = 'This plan is no longer sold';
  end if;
  if p_price is distinct from plan.price then
    raise exception using errcode = '23514', message = 'price_changed',
      detail = format('The plan costs %s now', plan.price);
  end if;
  if plan.gender <> 'any' and plan.gender <> member.gender then
    raise exception using errcode = '23514', message = 'plan_gender_mismatch',
      detail = format('This plan is for %s members', plan.gender);
  end if;
  if p_start_date is null or p_start_date < today - 30 or p_start_date > today + 365 then
    raise exception using errcode = '22023', message = 'invalid_start_date',
      detail = 'A subscription starts from 30 days ago to a year ahead';
  end if;

  if not app.is_discount_allowed(plan.price, p_discount, 100) then
    raise exception using errcode = '22023', message = 'invalid_discount',
      detail = 'A discount is whole dinars, from 0 to the price';
  end if;
  if p_discount > 0 then
    if not app.is_discount_allowed(plan.price, p_discount, app.max_discount_percent()) then
      raise exception using errcode = '42501', message = 'discount_too_large',
        detail = format('You may give at most %s%% off', app.max_discount_percent());
    end if;
    if p_discount_reason is null or not app.is_clean_text(p_discount_reason, 500) then
      raise exception using errcode = '22023', message = 'reason_required',
        detail = 'A discount needs a reason';
    end if;
  end if;
  total := plan.price - p_discount;

  if p_payment is not null then
    currency := coalesce(p_payment ->> 'currency', 'IQD');
    begin
      payment_id := (p_payment ->> 'id')::uuid;
      if currency = 'USD' then
        foreign_amount := (p_payment ->> 'foreign_amount')::numeric;
        rate := (p_payment ->> 'exchange_rate')::numeric;
        if foreign_amount <= 0 or rate <= 0 or foreign_amount <> round(foreign_amount, 2) or rate <> round(rate, 2) then
          raise exception using errcode = '22023', message = 'invalid_payment';
        end if;
        -- Dollars worth more than the invoice: the rest is change, in dinars.
        paid := least(app.usd_to_iqd(foreign_amount, rate), total);
        change := app.usd_to_iqd(foreign_amount, rate) - paid;
      elsif currency = 'IQD' then
        paid := (p_payment ->> 'amount')::numeric;
      else
        raise exception using errcode = '22023', message = 'invalid_payment';
      end if;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'invalid_payment',
          detail = 'A payment''s amounts are numbers';
    end;
    if paid is null or paid <= 0 or paid <> trunc(paid) or payment_id is null
       or coalesce(p_payment ->> 'method', '') not in ('cash', 'card', 'fib', 'fastpay', 'zaincash', 'bank_transfer') then
      raise exception using errcode = '22023', message = 'invalid_payment',
        detail = 'A payment has an id, a method and an amount of whole dinars above 0';
    end if;
    if paid > total then
      raise exception using errcode = '23514', message = 'payment_too_large',
        detail = format('The invoice is %s', total);
    end if;
  end if;

  if p_installments is not null and jsonb_typeof(p_installments) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_installments',
      detail = 'Installments are a list';
  end if;
  begin
    for installment in
      select (e ->> 'due_date')::date as due_date, (e ->> 'amount')::numeric as amount, (e ->> 'id')::uuid as id
        from jsonb_array_elements(coalesce(p_installments, '[]'::jsonb)) as e
    loop
      if installment.id is null or installment.amount is null or installment.amount <= 0
         or installment.amount <> trunc(installment.amount) or installment.due_date is null
         or installment.due_date < today or installment.due_date <= last_due then
        raise exception using errcode = '22023', message = 'invalid_installments';
      end if;
      last_due := installment.due_date;
      installments_total := installments_total + installment.amount;
    end loop;
  exception
    when invalid_parameter_value or invalid_text_representation or invalid_datetime_format
         or datetime_field_overflow or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'invalid_installments',
        detail = 'Each installment has an id, a due date from today on after the one before, and whole dinars above 0';
  end;
  if last_due is not null and installments_total <> total - paid then
    raise exception using errcode = '23514', message = 'installments_mismatch',
      detail = format('The installments add up to %s, not %s', installments_total, total - paid);
  end if;

  insert into public.subscriptions (
    id, gym_id, member_id, plan_id, branch_id, name_ckb, name_en, name_ar, kind, duration_unit,
    duration_count, visit_count, price, gender, branch_ids, allowed_days, allowed_from, allowed_until,
    daily_visit_limit, max_freeze_days, start_date, end_date
  )
  values (
    p_subscription_id, gym, p_member_id, plan.id, p_branch_id, plan.name_ckb, plan.name_en, plan.name_ar,
    plan.kind, plan.duration_unit, plan.duration_count, plan.visit_count, plan.price, plan.gender,
    case when plan.all_branches then null
         else array(select pb.branch_id from public.plan_branches pb where pb.plan_id = plan.id order by pb.branch_id) end,
    plan.allowed_days, plan.allowed_from, plan.allowed_until, plan.daily_visit_limit, plan.max_freeze_days,
    p_start_date,
    case when plan.duration_count is not null
         then app.plan_end_date(p_start_date, plan.duration_unit, plan.duration_count) end
  );

  insert into public.invoices (id, gym_id, branch_id, member_id, number, subtotal, discount, total)
  values (p_invoice_id, gym, p_branch_id, p_member_id, app.next_document_number(p_branch_id, 'invoice'),
          plan.price, p_discount, total);

  insert into public.invoice_items (
    gym_id, invoice_id, kind, subscription_id, description_ckb, description_en, description_ar,
    unit_price, discount, discount_reason, total
  )
  values (
    gym, p_invoice_id, 'subscription', p_subscription_id, plan.name_ckb, plan.name_en, plan.name_ar,
    plan.price, p_discount, case when p_discount > 0 then p_discount_reason end, total
  );

  if p_payment is not null then
    insert into public.payments (
      id, gym_id, branch_id, member_id, invoice_id, number, method, amount, currency, foreign_amount,
      exchange_rate, change_given, reference
    )
    values (
      payment_id, gym, p_branch_id, p_member_id, p_invoice_id,
      app.next_document_number(p_branch_id, 'receipt'), p_payment ->> 'method', paid, currency,
      case when currency = 'USD' then foreign_amount end, case when currency = 'USD' then rate end,
      case when currency = 'USD' then change end,
      nullif(btrim(coalesce(p_payment ->> 'reference', '')), '')
    );
  end if;

  insert into public.installments (id, gym_id, invoice_id, due_date, amount)
  select (e ->> 'id')::uuid, gym, p_invoice_id, (e ->> 'due_date')::date, (e ->> 'amount')::numeric
    from jsonb_array_elements(coalesce(p_installments, '[]'::jsonb)) as e;

  return app.sale_result(p_subscription_id);
end
$$;

revoke execute on function public.sell_subscription(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, text, jsonb, jsonb) from public, anon;
grant execute on function public.sell_subscription(uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, text, jsonb, jsonb) to authenticated;

-- Taking an import back (spec §4.1) ---------------------------------------------------------------------
-- A member who bought something since the import counts as changed, so the confirmation says so.

create or replace function app.member_import_undo_counts(p_import_id uuid, p_gym_id uuid)
returns table (to_archive integer, already_archived integer, changed integer, cards integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where m.status <> 'archived')::integer,
         count(*) filter (where m.status = 'archived')::integer,
         count(*) filter (where m.status <> 'archived' and (
           m.updated_at > i.created_at
           or exists (select 1 from public.member_health h
                       where h.id = m.id and h.gym_id = m.gym_id and h.updated_at > i.created_at)
           or exists (select 1 from public.nfc_cards c
                       where c.member_id = m.id and c.gym_id = m.gym_id and c.updated_at > i.created_at)
           or exists (select 1 from public.invoices v
                       where v.member_id = m.id and v.gym_id = m.gym_id)
         ))::integer,
         -- A member has one working card at most.
         count(*) filter (where m.status <> 'archived' and exists (
           select 1 from public.nfc_cards c
            where c.member_id = m.id and c.gym_id = m.gym_id and c.status = 'active'
         ))::integer
    from public.member_imports i
    left join public.members m on m.import_id = i.id and m.gym_id = i.gym_id and m.deleted_at is null
   where i.id = p_import_id and i.gym_id = p_gym_id
   group by i.id, i.gym_id, i.created_at
$$;
