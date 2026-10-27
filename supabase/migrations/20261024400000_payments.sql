-- Payments and debts (Phase 3, step 3e; spec §4.3, the Phase 3 plan of 2026-10-24). Additions only.
--
--   * pay_invoice(): a payment on an invoice that is still owed (dinars, or dollars with change),
--     with the next receipt number of the branch where the money is taken. Payments pay the part
--     without an installment first, then the installments oldest first (installment_balances).
--   * void_invoice() and void_payment(): a mistake, undone on the day it was made (Baghdad time),
--     with payments.void and a reason. A voided invoice counts for nothing, with its payments, and
--     its subscription is voided too. Nothing is deleted.
--   * refund_invoice(): money given back (payments.refund, a reason), at most what was paid in. A
--     refund lowers the charge by as much, so the member never owes more because of it.
--   * charge_member(): an invoice for something other than a subscription: the card replacement
--     fee (spec §1) or another charge, with an optional payment.
--   * member_debts: what each member owes, what is owed now (the rest is installments not due
--     yet) and the next due date. Computed, never stored.
--   * As with selling, only these functions write money rows; staff see an invoice and its
--     payments with payments.view and access to the invoice's branch.

-- Helpers -------------------------------------------------------------------------------------------------

-- Whether a moment was today in Baghdad: what may still be voided.
create function app.is_baghdad_today(p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Baghdad')::date = (now() at time zone 'Asia/Baghdad')::date
$$;

-- The invoice the acting staff member works on: of their gym, in a branch they reach, with
-- payments.view. invoice_not_found otherwise (also for another gym's invoice).
create function app.visible_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  invoice public.invoices;
begin
  select * into invoice from public.invoices v
   where v.id = p_invoice_id and v.gym_id = app.current_gym_id();
  if not found or not app.has_permission('payments.view') or not app.has_branch_access(invoice.branch_id) then
    raise exception using errcode = 'P0002', message = 'invoice_not_found',
      detail = 'No invoice with this id that you may see';
  end if;
  return invoice;
end
$$;

revoke execute on function app.visible_invoice(uuid) from public, anon, authenticated;

-- The branch where money is taken: one the staff member reaches, and active.
create function app.check_money_branch(p_branch_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Money is taken only in your own branches';
  end if;
  if not app.is_active_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'branch_inactive',
      detail = 'This branch is deactivated';
  end if;
end
$$;

revoke execute on function app.check_money_branch(uuid) from public, anon, authenticated;

-- What one payment was, for the screen and the receipt.
create function app.payment_result(p_payment public.payments)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'payment_id', p_payment.id,
    'receipt_number', p_payment.number,
    'kind', p_payment.kind,
    'amount', p_payment.amount,
    'change_given', coalesce(p_payment.change_given, 0),
    'due', b.due
  )
    from public.invoice_balances b
   where b.invoice_id = p_payment.invoice_id
$$;

revoke execute on function app.payment_result(public.payments) from public, anon, authenticated;

-- Paying ------------------------------------------------------------------------------------------------------

-- A payment on an invoice (p_payment as for selling: app.read_payment), taken in p_branch_id.
-- The same payment id again returns what was saved (a retry after a lost answer). In order:
-- permission_denied (payments.create); invoice_not_found; invoice_voided; nothing_owed;
-- no_branch_access, branch_inactive; invalid_payment; payment_too_large.
create function public.pay_invoice(p_invoice_id uuid, p_branch_id uuid, p_payment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.invoices;
  existing public.payments;
  owed numeric(14,2);
begin
  if not app.has_permission('payments.create') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Taking a payment needs payments.create';
  end if;
  invoice := app.visible_invoice(p_invoice_id);

  begin
    select * into existing from public.payments p where p.id = (p_payment ->> 'id')::uuid;
  exception
    when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_payment',
        detail = 'A payment''s id is an id';
  end;
  if found then
    if existing.invoice_id <> invoice.id or existing.kind <> 'payment' then
      raise exception using errcode = '23505', message = 'payment_exists',
        detail = 'Another payment has this id';
    end if;
    return app.payment_result(existing);
  end if;

  if invoice.voided_at is not null then
    raise exception using errcode = '23514', message = 'invoice_voided',
      detail = 'A voided invoice is owed nothing';
  end if;
  select b.due into owed from public.invoice_balances b where b.invoice_id = invoice.id;
  if owed <= 0 then
    raise exception using errcode = '23514', message = 'nothing_owed',
      detail = 'This invoice is paid';
  end if;
  perform app.check_money_branch(p_branch_id);
  -- Saved first: the result, a statement of its own, sees the payment.
  existing := app.record_payment(p_payment, owed, invoice.gym_id, p_branch_id, invoice.member_id, invoice.id);
  return app.payment_result(existing);
end
$$;

revoke execute on function public.pay_invoice(uuid, uuid, jsonb) from public, anon;
grant execute on function public.pay_invoice(uuid, uuid, jsonb) to authenticated;

-- Voids ---------------------------------------------------------------------------------------------------------

-- A payment or refund taken by mistake, on the day it was taken: it counts for nothing.
-- permission_denied (payments.void); payment_not_found; already_voided; void_too_late (an earlier
-- day: give money back with a refund instead); reason_required.
create function public.void_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.payments;
begin
  if not app.has_permission('payments.void') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Voiding needs payments.void';
  end if;
  select * into payment from public.payments p where p.id = p_payment_id and p.gym_id = app.current_gym_id();
  if not found then
    raise exception using errcode = 'P0002', message = 'payment_not_found',
      detail = 'No payment with this id that you may see';
  end if;
  begin
    perform app.visible_invoice(payment.invoice_id);
  exception
    when no_data_found then
      raise exception using errcode = 'P0002', message = 'payment_not_found',
        detail = 'No payment with this id that you may see';
  end;
  if payment.voided_at is not null then
    raise exception using errcode = '23514', message = 'already_voided',
      detail = 'This payment is voided already';
  end if;
  if not app.is_baghdad_today(payment.created_at) then
    raise exception using errcode = '23514', message = 'void_too_late',
      detail = 'Only today''s payments are voided; give money back with a refund';
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 500) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'Voiding needs a reason';
  end if;
  update public.payments p
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where p.id = payment.id
  returning * into payment;
  return app.payment_result(payment);
end
$$;

revoke execute on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- An invoice made by mistake, on the day it was made: it and its payments count for nothing, and
-- its subscription is voided. permission_denied (payments.void); invoice_not_found;
-- already_voided; void_too_late; reason_required.
create function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.invoices;
begin
  if not app.has_permission('payments.void') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Voiding needs payments.void';
  end if;
  invoice := app.visible_invoice(p_invoice_id);
  if invoice.voided_at is not null then
    raise exception using errcode = '23514', message = 'already_voided',
      detail = 'This invoice is voided already';
  end if;
  if not app.is_baghdad_today(invoice.created_at) then
    raise exception using errcode = '23514', message = 'void_too_late',
      detail = 'Only today''s invoices are voided; give money back with a refund';
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 500) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'Voiding needs a reason';
  end if;

  update public.payments p
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where p.invoice_id = invoice.id and p.gym_id = invoice.gym_id and p.voided_at is null;
  update public.subscriptions s
     set status = 'voided', status_reason = p_reason, status_changed_at = now(), status_changed_by = auth.uid()
   where s.gym_id = invoice.gym_id and s.status = 'active'
     and s.id in (select it.subscription_id from public.invoice_items it
                   where it.invoice_id = invoice.id and it.gym_id = invoice.gym_id);
  update public.invoices v
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where v.id = invoice.id;
end
$$;

revoke execute on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated;

-- Refunds ------------------------------------------------------------------------------------------------------

-- Money given back on an invoice, in dinars, from p_branch_id: at most what was paid in and not
-- given back yet. It lowers the charge by as much, so what is owed stays the same. The same id
-- again returns what was saved. permission_denied (payments.refund); invoice_not_found;
-- invoice_voided; no_branch_access, branch_inactive; invalid_refund (whole dinars above 0, a
-- method); refund_too_large; reason_required.
create function public.refund_invoice(
  p_refund_id uuid,
  p_invoice_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_method text,
  p_reason text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.invoices;
  existing public.payments;
  refundable numeric(14,2);
  saved public.payments;
begin
  if not app.has_permission('payments.refund') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Giving money back needs payments.refund';
  end if;
  invoice := app.visible_invoice(p_invoice_id);
  select * into existing from public.payments p where p.id = p_refund_id;
  if found then
    if existing.invoice_id <> invoice.id or existing.kind <> 'refund' then
      raise exception using errcode = '23505', message = 'payment_exists',
        detail = 'Another payment has this id';
    end if;
    return app.payment_result(existing);
  end if;
  if invoice.voided_at is not null then
    raise exception using errcode = '23514', message = 'invoice_voided',
      detail = 'A voided invoice has nothing to give back';
  end if;
  perform app.check_money_branch(p_branch_id);
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount)
     or coalesce(p_method, '') not in ('cash', 'card', 'fib', 'fastpay', 'zaincash', 'bank_transfer')
     or not app.is_clean_text(nullif(btrim(coalesce(p_reference, '')), ''), 100) then
    raise exception using errcode = '22023', message = 'invalid_refund',
      detail = 'A refund is whole dinars above 0, with a method';
  end if;
  select b.paid - b.refunded into refundable from public.invoice_balances b where b.invoice_id = invoice.id;
  if p_amount > refundable then
    raise exception using errcode = '23514', message = 'refund_too_large',
      detail = format('At most %s can be given back', refundable);
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 500) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'A refund needs a reason';
  end if;

  insert into public.payments (id, gym_id, branch_id, member_id, invoice_id, number, kind, method, amount, reference, reason)
  values (p_refund_id, invoice.gym_id, p_branch_id, invoice.member_id, invoice.id,
          app.next_document_number(p_branch_id, 'receipt'), 'refund', p_method, p_amount,
          nullif(btrim(coalesce(p_reference, '')), ''), p_reason)
  returning * into saved;
  return app.payment_result(saved);
end
$$;

revoke execute on function public.refund_invoice(uuid, uuid, uuid, numeric, text, text, text) from public, anon;
grant execute on function public.refund_invoice(uuid, uuid, uuid, numeric, text, text, text) to authenticated;

-- Charges ------------------------------------------------------------------------------------------------------

-- An invoice for something that isn't a subscription: a new card after one was lost or damaged
-- (card_replacement, spec §1), or another charge (other), with a description, in whole dinars, and
-- an optional payment (as for selling). The same invoice id again returns what was saved.
-- permission_denied (payments.create and members.view); no_branch_access, branch_inactive;
-- member_not_found; member_archived; invalid_charge (the kind, a description, whole dinars above
-- 0); invalid_payment; payment_too_large.
create function public.charge_member(
  p_invoice_id uuid,
  p_member_id uuid,
  p_branch_id uuid,
  p_kind text,
  p_description text,
  p_amount numeric,
  p_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  member public.members;
  existing public.invoices;
  payment public.payments;
begin
  if gym is null or not (app.has_permission('payments.create') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Charging needs payments.create and members.view';
  end if;
  select * into existing from public.invoices v where v.id = p_invoice_id;
  if found then
    if existing.gym_id is distinct from gym or existing.member_id <> p_member_id then
      raise exception using errcode = '23505', message = 'charge_exists',
        detail = 'Another invoice has this id';
    end if;
    select * into payment from public.payments p
     where p.invoice_id = existing.id and p.gym_id = gym and p.kind = 'payment'
     order by p.created_at limit 1;
    return jsonb_build_object('invoice_id', existing.id, 'invoice_number', existing.number,
      'total', existing.total, 'receipt_number', payment.number, 'paid', coalesce(payment.amount, 0),
      'change_given', coalesce(payment.change_given, 0));
  end if;
  perform app.check_money_branch(p_branch_id);
  select * into member from public.members m where m.id = p_member_id and m.gym_id = gym and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member.status = 'archived' then
    raise exception using errcode = '42501', message = 'member_archived',
      detail = 'An archived member is charged nothing';
  end if;
  if coalesce(p_kind, '') not in ('card_replacement', 'other')
     or p_description is null or not app.is_clean_text(p_description, 200)
     or p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) or p_amount > 1000000000 then
    raise exception using errcode = '22023', message = 'invalid_charge',
      detail = 'A charge is a card replacement or another charge, with a description and whole dinars above 0';
  end if;
  if p_payment is not null then
    perform app.read_payment(p_payment, p_amount);
  end if;

  insert into public.invoices (id, gym_id, branch_id, member_id, number, subtotal, discount, total)
  values (p_invoice_id, gym, p_branch_id, p_member_id, app.next_document_number(p_branch_id, 'invoice'),
          p_amount, 0, p_amount)
  returning * into existing;
  insert into public.invoice_items (gym_id, invoice_id, kind, description_ckb, unit_price, total)
  values (gym, p_invoice_id, p_kind, p_description, p_amount, p_amount);
  if p_payment is not null then
    payment := app.record_payment(p_payment, p_amount, gym, p_branch_id, p_member_id, p_invoice_id);
  end if;
  return jsonb_build_object('invoice_id', existing.id, 'invoice_number', existing.number,
    'total', existing.total, 'receipt_number', payment.number, 'paid', coalesce(payment.amount, 0),
    'change_given', coalesce(payment.change_given, 0));
end
$$;

revoke execute on function public.charge_member(uuid, uuid, uuid, text, text, numeric, jsonb) from public, anon;
grant execute on function public.charge_member(uuid, uuid, uuid, text, text, numeric, jsonb) to authenticated;

-- Debts --------------------------------------------------------------------------------------------------------

-- What each member owes on the invoices the caller sees: in all, now (the rest is installments not
-- due yet), and the next installment's date. As the caller (security_invoker).
create view public.member_debts with (security_invoker = true) as
with owed as (
  select b.invoice_id,
         b.member_id,
         b.gym_id,
         b.due,
         greatest(0, b.due - coalesce((
           select sum(i.amount - i.paid) from public.installment_balances i
            where i.invoice_id = b.invoice_id and i.due_date >= (now() at time zone 'Asia/Baghdad')::date
         ), 0)) as owed_now,
         (select min(i.due_date) from public.installment_balances i
           where i.invoice_id = b.invoice_id and i.paid < i.amount) as next_due_date
    from public.invoice_balances b
   where b.due > 0
)
select o.member_id,
       o.gym_id,
       m.full_name,
       m.member_number,
       m.phone,
       m.status,
       sum(o.due)::numeric(14,2) as due,
       sum(o.owed_now)::numeric(14,2) as owed_now,
       min(o.next_due_date) as next_due_date,
       count(*)::integer as invoice_count
  from owed o
  join public.members m on m.id = o.member_id and m.gym_id = o.gym_id
 group by o.member_id, o.gym_id, m.full_name, m.member_number, m.phone, m.status;

revoke all on table public.member_debts from anon, authenticated;
grant select on table public.member_debts to authenticated, service_role;
