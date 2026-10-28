-- The cash register (Phase 8, step 8b; spec §4.3 and the Phase 8 plan in §8 of 2026-10-29).
-- Additions only.
--
--   * cash_shifts: one drawer per branch. A shift is opened with the float counted in the drawer
--     (dinars and dollars) and closed with what was counted; only one is open in a branch at a time
--     (cash_register.operate). Closing saves the expected amounts with the counted ones, so a later
--     void doesn't change a closed shift.
--   * payments.cash_shift_id: every payment taken at a branch while its shift is open belongs to it
--     (set on insert, never changed). Cash taken while the drawer is closed belongs to no shift: it is
--     in the drawer when the next float is counted.
--   * cash_movements: money put in or taken out of the drawer during a shift, with a reason.
--   * cash_shift_report(): what a shift took per method, the cash in and out, and the expected,
--     counted and difference per currency. Staff without cash_register.view_all see the expected
--     amounts of a shift only once it is closed (a blind count).

-- Shifts ---------------------------------------------------------------------------------------------------------

create table public.cash_shifts (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  opened_at timestamptz not null default now(),
  opened_by uuid,
  -- The float counted in the drawer: whole dinars, and dollars with cents.
  opening_iqd numeric(14,2) not null check (opening_iqd >= 0 and opening_iqd = trunc(opening_iqd)),
  opening_usd numeric(14,2) not null default 0 check (opening_usd >= 0),
  closed_at timestamptz,
  closed_by uuid,
  -- Saved on closing: what was counted, and what the drawer should have had.
  counted_iqd numeric(14,2) check (counted_iqd >= 0 and counted_iqd = trunc(counted_iqd)),
  counted_usd numeric(14,2) check (counted_usd >= 0),
  expected_iqd numeric(14,2),
  expected_usd numeric(14,2),
  close_note text check (app.is_clean_text(close_note, 500)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: shifts are the history.
  deleted_at timestamptz,
  constraint cash_shifts_id_gym_id_key unique (id, gym_id),
  constraint cash_shifts_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint cash_shifts_closed check (
    (closed_at is null) = (closed_by is null)
    and (closed_at is null) = (counted_iqd is null)
    and (closed_at is null) = (counted_usd is null)
    and (closed_at is null) = (expected_iqd is null)
    and (closed_at is null) = (expected_usd is null)
  ),
  constraint cash_shifts_never_deleted check (deleted_at is null)
);

-- One open shift per branch.
create unique index cash_shifts_branch_id_gym_id_open_key on public.cash_shifts (branch_id, gym_id) where closed_at is null;
create index cash_shifts_branch_id_gym_id_idx on public.cash_shifts (branch_id, gym_id, opened_at desc);

create table public.cash_movements (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  shift_id uuid not null,
  -- in: put in the drawer (change from the bank); out: taken out (buying something, to the owner).
  kind text not null check (kind in ('in', 'out')),
  currency text not null check (currency in ('IQD', 'USD')),
  -- Whole dinars, or dollars with cents.
  amount numeric(14,2) not null check (amount > 0 and amount <= 1000000000 and (currency = 'USD' or amount = trunc(amount))),
  reason text not null check (app.is_clean_text(reason, 300)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: movements are the history.
  deleted_at timestamptz,
  constraint cash_movements_id_gym_id_key unique (id, gym_id),
  constraint cash_movements_shift_id_gym_id_fkey foreign key (shift_id, gym_id) references public.cash_shifts (id, gym_id),
  constraint cash_movements_never_deleted check (deleted_at is null)
);

create index cash_movements_shift_id_gym_id_idx on public.cash_movements (shift_id, gym_id);

-- The shift a payment was taken in.
alter table public.payments add column cash_shift_id uuid;
alter table public.payments add constraint payments_cash_shift_id_gym_id_fkey
  foreign key (cash_shift_id, gym_id) references public.cash_shifts (id, gym_id);
create index payments_cash_shift_id_gym_id_idx on public.payments (cash_shift_id, gym_id) where cash_shift_id is not null;

-- Triggers and row level security --------------------------------------------------------------------------

create trigger check_writable before insert or update or delete on public.cash_shifts
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.cash_shifts
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'opened_at', 'opened_by', 'opening_iqd', 'opening_usd', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.cash_shifts
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.cash_shifts
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.cash_movements
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.cash_movements
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'shift_id', 'kind', 'currency', 'amount', 'reason', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.cash_movements
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.cash_movements
  for each row execute function app.audit_row();

alter table public.cash_shifts enable row level security;
alter table public.cash_movements enable row level security;

revoke all on table public.cash_shifts, public.cash_movements from anon, authenticated;
grant all on table public.cash_shifts, public.cash_movements to service_role;
-- Only the functions below write them.
grant select on table public.cash_shifts, public.cash_movements to authenticated;

create policy "staff with the cash register see their branches' shifts" on public.cash_shifts
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and branch_id in (select app.accessible_branch_ids())
    and ((select app.has_permission('cash_register.operate')) or (select app.has_permission('cash_register.view_all')))
  );

create policy "staff see the movements of shifts they see" on public.cash_movements
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and shift_id in (select s.id from public.cash_shifts s));

-- BEFORE INSERT on payments: the branch's open shift, if any. The shift is locked (shared), so a
-- shift being closed waits for the payment, or the payment for the closing.
create function app.payment_cash_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.id into new.cash_shift_id from public.cash_shifts s
   where s.branch_id = new.branch_id and s.gym_id = new.gym_id and s.closed_at is null
     for share;
  return new;
end
$$;

revoke execute on function app.payment_cash_shift() from public, anon, authenticated;

create trigger cash_shift before insert on public.payments
  for each row execute function app.payment_cash_shift();

-- BEFORE UPDATE of cash_shift_id on payments: it never changes.
create function app.keep_payment_cash_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cash_shift_id is distinct from old.cash_shift_id then
    raise exception using errcode = '42501', message = 'read_only_column',
      detail = 'payments.cash_shift_id is set when the payment is taken';
  end if;
  return new;
end
$$;

revoke execute on function app.keep_payment_cash_shift() from public, anon, authenticated;

create trigger keep_cash_shift before update of cash_shift_id on public.payments
  for each row execute function app.keep_payment_cash_shift();

-- What the drawer should have -------------------------------------------------------------------------------------

-- The float, plus cash payments in dinars, minus dinars given back as change for dollars, minus cash
-- refunds, plus and minus the cash in and out; in dollars, the float, plus dollars taken, plus and
-- minus the cash in and out. Voided payments count for nothing.
create function app.cash_shift_expected(p_shift public.cash_shifts, out iqd numeric, out usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p_shift.opening_iqd
           + coalesce(sum(p.amount) filter (where p.kind = 'payment' and p.currency = 'IQD'), 0)
           - coalesce(sum(p.change_given) filter (where p.kind = 'payment' and p.currency = 'USD'), 0)
           - coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0)
           + coalesce((select sum(case m.kind when 'in' then m.amount else -m.amount end)
                         from public.cash_movements m where m.shift_id = p_shift.id and m.currency = 'IQD'), 0),
         p_shift.opening_usd
           + coalesce(sum(p.foreign_amount) filter (where p.kind = 'payment' and p.currency = 'USD'), 0)
           + coalesce((select sum(case m.kind when 'in' then m.amount else -m.amount end)
                         from public.cash_movements m where m.shift_id = p_shift.id and m.currency = 'USD'), 0)
    from public.payments p
   where p.cash_shift_id = p_shift.id and p.method = 'cash' and p.voided_at is null
$$;

revoke execute on function app.cash_shift_expected(public.cash_shifts) from public, anon, authenticated;

-- The shift a staff member works on: in a branch they reach, with cash_register.operate (or
-- view_all when only reading). permission_denied; shift_not_found.
create function app.cash_shift(p_shift_id uuid, p_reading boolean)
returns public.cash_shifts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shift public.cash_shifts;
begin
  if app.current_gym_id() is null
     or not (app.has_permission('cash_register.operate')
             or (p_reading and app.has_permission('cash_register.view_all'))) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'The cash register needs cash_register.operate (or view_all to read)';
  end if;
  select * into shift from public.cash_shifts s where s.id = p_shift_id and s.gym_id = app.current_gym_id();
  if not found or not app.has_branch_access(shift.branch_id) then
    raise exception using errcode = 'P0002', message = 'shift_not_found',
      detail = 'No shift with this id that you may see';
  end if;
  return shift;
end
$$;

revoke execute on function app.cash_shift(uuid, boolean) from public, anon, authenticated;

-- Opening, cash in and out, closing (cash_register.operate) ---------------------------------------------------------

-- Opens a branch's drawer (p_id made by the app) with the float counted in it. The same p_id again
-- returns it. permission_denied; shift_exists; no_branch_access, branch_inactive; shift_open (the
-- branch's drawer is open already); invalid_shift.
create function public.open_cash_shift(
  p_id uuid,
  p_branch_id uuid,
  p_opening_iqd numeric,
  p_opening_usd numeric default 0
)
returns public.cash_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift public.cash_shifts;
  failed_constraint text;
begin
  if app.current_gym_id() is null or not app.has_permission('cash_register.operate') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Opening the cash register needs cash_register.operate';
  end if;
  select * into shift from public.cash_shifts s where s.id = p_id;
  if found then
    if shift.gym_id is distinct from app.current_gym_id() or shift.branch_id <> p_branch_id then
      raise exception using errcode = '23505', message = 'shift_exists',
        detail = 'Another shift has this id';
    end if;
    return shift;
  end if;
  perform app.check_money_branch(p_branch_id);
  if p_opening_iqd is null or p_opening_iqd < 0 or p_opening_iqd <> trunc(p_opening_iqd) or p_opening_iqd > 1000000000
     or coalesce(p_opening_usd, 0) < 0 or coalesce(p_opening_usd, 0) <> round(coalesce(p_opening_usd, 0), 2)
     or coalesce(p_opening_usd, 0) > 10000000 then
    raise exception using errcode = '22023', message = 'invalid_shift',
      detail = 'The float is whole dinars and dollars with cents, 0 or more';
  end if;
  begin
    insert into public.cash_shifts (id, gym_id, branch_id, opened_by, opening_iqd, opening_usd)
    values (p_id, app.current_gym_id(), p_branch_id, auth.uid(), p_opening_iqd, coalesce(p_opening_usd, 0))
    returning * into shift;
  exception
    when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint = 'cash_shifts_branch_id_gym_id_open_key' then
        raise exception using errcode = '23505', message = 'shift_open',
          detail = 'This branch''s cash register is open already';
      end if;
      raise;
  end;
  return shift;
end
$$;

revoke execute on function public.open_cash_shift(uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.open_cash_shift(uuid, uuid, numeric, numeric) to authenticated;

-- Money put in (in) or taken out (out) of an open shift's drawer, with a reason. The same p_id again
-- returns it. See app.cash_shift(); movement_exists; shift_closed; invalid_cash_movement.
create function public.add_cash_movement(
  p_id uuid,
  p_shift_id uuid,
  p_kind text,
  p_currency text,
  p_amount numeric,
  p_reason text
)
returns public.cash_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift public.cash_shifts;
  saved public.cash_movements;
begin
  shift := app.cash_shift(p_shift_id, false);
  select * into saved from public.cash_movements m where m.id = p_id;
  if found then
    if saved.gym_id is distinct from shift.gym_id or saved.shift_id <> shift.id then
      raise exception using errcode = '23505', message = 'movement_exists',
        detail = 'Another cash movement has this id';
    end if;
    return saved;
  end if;
  select * into shift from public.cash_shifts s where s.id = shift.id for update;
  if shift.closed_at is not null then
    raise exception using errcode = '23514', message = 'shift_closed',
      detail = 'This shift is closed';
  end if;
  begin
    insert into public.cash_movements (id, gym_id, shift_id, kind, currency, amount, reason)
    values (p_id, shift.gym_id, shift.id, p_kind, p_currency, p_amount, nullif(btrim(coalesce(p_reason, '')), ''))
    returning * into saved;
  exception
    when check_violation or not_null_violation then
      raise exception using errcode = '22023', message = 'invalid_cash_movement',
        detail = 'In or out, IQD (whole) or USD, above 0, with a reason';
  end;
  return saved;
end
$$;

revoke execute on function public.add_cash_movement(uuid, uuid, text, text, numeric, text) from public, anon;
grant execute on function public.add_cash_movement(uuid, uuid, text, text, numeric, text) to authenticated;

-- What a shift took and what its drawer should have, as jsonb: the shift, payments and refunds per
-- method, cash in and out per currency, and the expected amounts and differences. The expected
-- amounts of an open shift are null for staff without cash_register.view_all (a blind count).
-- See app.cash_shift().
create function public.cash_shift_report(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shift public.cash_shifts;
  expected record;
  sees_expected boolean;
begin
  shift := app.cash_shift(p_shift_id, true);
  sees_expected := shift.closed_at is not null or app.has_permission('cash_register.view_all');
  if shift.closed_at is null then
    select * into expected from app.cash_shift_expected(shift);
  else
    select shift.expected_iqd as iqd, shift.expected_usd as usd into expected;
  end if;
  return jsonb_build_object(
    'shift_id', shift.id,
    'branch_id', shift.branch_id,
    'opened_at', shift.opened_at,
    'opened_by', (select u.full_name from public.staff_users u where u.id = shift.opened_by),
    'closed_at', shift.closed_at,
    'closed_by', (select u.full_name from public.staff_users u where u.id = shift.closed_by),
    'opening_iqd', shift.opening_iqd,
    'opening_usd', shift.opening_usd,
    'close_note', shift.close_note,
    'methods', coalesce((
      select jsonb_agg(jsonb_build_object('method', x.method, 'kind', x.kind, 'count', x.count, 'amount', x.amount,
                                          'usd', x.usd) order by x.kind, x.method)
        from (select p.method, p.kind, count(*)::integer as count, sum(p.amount) as amount,
                     sum(p.foreign_amount) as usd
                from public.payments p
               where p.cash_shift_id = shift.id and p.voided_at is null
               group by p.method, p.kind) x
    ), '[]'::jsonb),
    'cash_in_iqd', (select coalesce(sum(m.amount), 0) from public.cash_movements m
                     where m.shift_id = shift.id and m.kind = 'in' and m.currency = 'IQD'),
    'cash_out_iqd', (select coalesce(sum(m.amount), 0) from public.cash_movements m
                      where m.shift_id = shift.id and m.kind = 'out' and m.currency = 'IQD'),
    'cash_in_usd', (select coalesce(sum(m.amount), 0) from public.cash_movements m
                     where m.shift_id = shift.id and m.kind = 'in' and m.currency = 'USD'),
    'cash_out_usd', (select coalesce(sum(m.amount), 0) from public.cash_movements m
                      where m.shift_id = shift.id and m.kind = 'out' and m.currency = 'USD'),
    'expected_iqd', case when sees_expected then expected.iqd end,
    'expected_usd', case when sees_expected then expected.usd end,
    'counted_iqd', shift.counted_iqd,
    'counted_usd', shift.counted_usd,
    'difference_iqd', shift.counted_iqd - shift.expected_iqd,
    'difference_usd', shift.counted_usd - shift.expected_usd
  );
end
$$;

revoke execute on function public.cash_shift_report(uuid) from public, anon;
grant execute on function public.cash_shift_report(uuid) to authenticated;

-- Closes an open shift with what was counted in the drawer (any staff member with
-- cash_register.operate in the branch, so a handover works). Returns the report. Sending the same
-- count again for a shift this staff member closed returns the report. See app.cash_shift();
-- shift_closed; invalid_count.
create function public.close_cash_shift(
  p_shift_id uuid,
  p_counted_iqd numeric,
  p_counted_usd numeric default 0,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  shift public.cash_shifts;
  expected record;
begin
  shift := app.cash_shift(p_shift_id, false);
  select * into shift from public.cash_shifts s where s.id = shift.id for update;
  if shift.closed_at is not null then
    if shift.closed_by = auth.uid() and shift.counted_iqd = p_counted_iqd
       and shift.counted_usd = coalesce(p_counted_usd, 0) then
      return public.cash_shift_report(shift.id);
    end if;
    raise exception using errcode = '23514', message = 'shift_closed',
      detail = 'This shift is closed';
  end if;
  if p_counted_iqd is null or p_counted_iqd < 0 or p_counted_iqd <> trunc(p_counted_iqd) or p_counted_iqd > 1000000000
     or coalesce(p_counted_usd, 0) < 0 or coalesce(p_counted_usd, 0) <> round(coalesce(p_counted_usd, 0), 2)
     or coalesce(p_counted_usd, 0) > 10000000
     or (p_note is not null and not app.is_clean_text(p_note, 500)) then
    raise exception using errcode = '22023', message = 'invalid_count',
      detail = 'Whole dinars and dollars with cents, 0 or more, with a short note';
  end if;
  select * into expected from app.cash_shift_expected(shift);
  update public.cash_shifts s
     set closed_at = now(), closed_by = auth.uid(), counted_iqd = p_counted_iqd,
         counted_usd = coalesce(p_counted_usd, 0), expected_iqd = expected.iqd, expected_usd = expected.usd,
         close_note = nullif(btrim(coalesce(p_note, '')), '')
   where s.id = shift.id;
  return public.cash_shift_report(shift.id);
end
$$;

revoke execute on function public.close_cash_shift(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.close_cash_shift(uuid, numeric, numeric, text) to authenticated;
