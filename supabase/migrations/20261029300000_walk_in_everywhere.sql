-- The walk-in customer is left out everywhere (Phase 8, step 8g). Additions only: new triggers, and
-- three functions replaced with the same arguments and results.
--
-- Staff never see the walk-in customer (the restrictive policy of 8a), so the members list, its
-- counts, the search, the duplicate checks and every function that runs as the caller leave it out
-- already. What runs as the server (security definer) could still reach it by its id; now:
--   * nothing but a till sale is ever made for it: no subscription, visit, locker, spa booking or
--     package, class booking, personal training package, card, photo or health row (a trigger on
--     each), and an invoice of the walk-in holds only products;
--   * a payment of a walk-in sale is voided only with its whole sale (void_invoice), so no debt is
--     ever left on someone nobody can see or remind (void_whole_sale);
--   * Click Group's support reads never list or open it.
-- The seller's member counts left it out already (it is a guest too).

-- Nothing but a sale --------------------------------------------------------------------------------------------

-- Refuses a row for the walk-in customer: the member's id is in the column named by the trigger's
-- argument. As the server, because staff never see that row.
create function app.guard_not_walk_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if exists (select 1 from public.members m where m.id = member_id and m.is_walk_in) then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'The walk-in customer only buys at the till';
  end if;
  return new;
end
$$;

revoke execute on function app.guard_not_walk_in() from public, anon, authenticated;

create trigger not_walk_in before insert or update of member_id on public.subscriptions
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert or update of member_id on public.attendance
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert or update of member_id on public.locker_assignments
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert or update of member_id on public.spa_bookings
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert or update of member_id on public.member_spa_packages
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert or update of member_id on public.class_bookings
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert or update of member_id on public.member_pt_packages
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert or update of member_id on public.nfc_cards
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert on public.member_photos
  for each row execute function app.guard_not_walk_in('id');
create trigger not_walk_in before insert on public.member_health
  for each row execute function app.guard_not_walk_in('id');

-- An invoice of the walk-in customer holds only products (a charge, a fee or a subscription would
-- stay owed by nobody).
create function app.guard_walk_in_invoice_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'product' and exists (
    select 1 from public.invoices v join public.members m on m.id = v.member_id
     where v.id = new.invoice_id and m.is_walk_in
  ) then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'The walk-in customer only buys at the till';
  end if;
  return new;
end
$$;

revoke execute on function app.guard_walk_in_invoice_items() from public, anon, authenticated;

create trigger walk_in_products_only before insert or update of kind on public.invoice_items
  for each row execute function app.guard_walk_in_invoice_items();

-- Voids ---------------------------------------------------------------------------------------------------------

-- As before (Phase 3, step 3e), and a walk-in sale's payment is voided only with the whole sale:
-- void_whole_sale.
-- A payment or refund taken by mistake, on the day it was taken: it counts for nothing.
-- permission_denied (payments.void); payment_not_found; already_voided; void_too_late (an earlier
-- day: give money back with a refund instead); reason_required; void_whole_sale.
create or replace function public.void_payment(p_payment_id uuid, p_reason text)
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
  if exists (select 1 from public.invoices v join public.members m on m.id = v.member_id
              where v.id = payment.invoice_id and m.is_walk_in) then
    raise exception using errcode = '23514', message = 'void_whole_sale',
      detail = 'A walk-in sale is voided as a whole (void_invoice)';
  end if;
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

-- Click Group's support reads ------------------------------------------------------------------------------

-- As before (MT-4a), without the walk-in customer.
-- A gym's members while it lets Click Group in: at most 50, by name, number or phone (p_search,
-- matched like the gym app's search). Written to support_reads. not_platform_admin, mfa_required;
-- support_not_granted.
create or replace function public.seller_support_members(p_gym_id uuid, p_search text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  running public.support_grants := app.require_support_grant(p_gym_id);
  needle text := nullif(app.member_search_needle(p_search), '');
  found_rows jsonb;
begin
  perform app.log_support_read(running, 'members', null, jsonb_build_object('search', p_search));
  select coalesce(jsonb_agg(to_jsonb(m) order by m.full_name, m.member_number), '[]'::jsonb) into found_rows
    from (
      select m.id, m.member_number, m.full_name, m.phone, m.status, public.membership(m) as membership,
             b.code as branch_code
        from public.members m
        join public.branches b on b.id = m.branch_id and b.gym_id = m.gym_id
       where m.gym_id = p_gym_id and m.deleted_at is null and not m.is_walk_in
         and (needle is null or m.search_text like '%' || needle || '%')
       order by m.full_name, m.member_number
       limit 50
    ) m;
  return found_rows;
end
$$;

revoke execute on function public.seller_support_members(uuid, text) from public, anon;
grant execute on function public.seller_support_members(uuid, text) to authenticated;

-- One member of a gym while it lets Click Group in: their details (no health information, no
-- photo), subscriptions, invoices with what is owed, payments, cards and last 20 visits. Written to
-- support_reads. not_platform_admin, mfa_required; support_not_granted; member_not_found.
create or replace function public.seller_support_member(p_gym_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  running public.support_grants := app.require_support_grant(p_gym_id);
  member public.members;
begin
  select * into member from public.members m
   where m.id = p_member_id and m.gym_id = p_gym_id and m.deleted_at is null and not m.is_walk_in;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in this gym';
  end if;
  perform app.log_support_read(running, 'member', member.id, '{}');
  return jsonb_build_object(
    'member', jsonb_build_object(
      'id', member.id, 'member_number', member.member_number, 'full_name', member.full_name,
      'gender', member.gender, 'phone', member.phone, 'birth_date', member.birth_date,
      'status', member.status, 'status_reason', member.status_reason, 'created_at', member.created_at,
      'membership', public.membership(member),
      'branch_code', (select b.code from public.branches b where b.id = member.branch_id)
    ),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name_ckb', s.name_ckb, 'kind', s.kind, 'start_date', s.start_date,
        'end_date', s.end_date, 'status', s.status, 'visit_count', s.visit_count,
        'used_visits', case when s.visit_count is null then null else app.subscription_used_visits(s.id) end
      ) order by s.start_date desc)
        from public.subscriptions s where s.member_id = member.id and s.gym_id = p_gym_id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.invoice_id, 'number', b.number, 'total', b.total, 'paid', b.paid, 'due', b.due,
        'refunded', b.refunded, 'created_at', b.created_at, 'voided_at', b.voided_at
      ) order by b.created_at desc)
        from public.invoice_balances b where b.member_id = member.id and b.gym_id = p_gym_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'number', p.number, 'kind', p.kind, 'method', p.method, 'amount', p.amount,
        'created_at', p.created_at, 'voided_at', p.voided_at
      ) order by p.created_at desc)
        from public.payments p where p.member_id = member.id and p.gym_id = p_gym_id
    ), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'uid', c.uid, 'status', c.status, 'end_reason', c.end_reason, 'created_at', c.created_at
      ) order by c.created_at desc)
        from public.nfc_cards c where c.member_id = member.id and c.gym_id = p_gym_id
    ), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.checked_in_at desc) from (
        select a.id, a.checked_in_at, a.checked_out_at, a.method, a.override_reason, a.voided_at,
               (select b.code from public.branches b where b.id = a.branch_id) as branch_code
          from public.attendance a where a.member_id = member.id and a.gym_id = p_gym_id
         order by a.checked_in_at desc
         limit 20
      ) v
    ), '[]'::jsonb)
  );
end
$$;

revoke execute on function public.seller_support_member(uuid, uuid) from public, anon;
grant execute on function public.seller_support_member(uuid, uuid) to authenticated;
