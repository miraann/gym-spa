-- Changing subscriptions (Phase 3, step 3f; spec §4.2, the Phase 3 plan of 2026-10-24). Additions only.
--
--   * Freezing (subscriptions.freeze): a number of days from today or later, within the
--     subscription, up to the plan's freeze days in all. The end date moves by as many days at
--     once; unfreezing early moves it back by the days not used. One freeze at a time; the rows
--     are the history.
--   * Changing to another plan (subscriptions.change, an upgrade or downgrade): the unused part of
--     the old subscription is worth its share of what was charged for it (app.unused_value: days
--     left of the days sold, visits left of the visits sold, the smaller for hybrid). That value
--     first clears what is still owed on the old invoice (a credit), and the rest comes off the new
--     plan's price. When it is more than the new price, the change is refused: cancel with a
--     refund and sell the new plan instead. The new subscription starts today.
--   * Transferring (subscriptions.transfer): what is left of a subscription goes to another
--     member of the gym (the same gender rule as selling); the invoice stays with the first.
--   * Cancelling (subscriptions.cancel, a reason): the unused part first clears what is still owed
--     (a credit); what was paid for the rest may be given back at once (payments.refund).
--   * Visits used are 0 until check-in (Phase 4), which replaces app.subscription_used_visits().
--   * Unlimited plans have no length to share out: they can't be changed, and cancelling one
--     clears and gives back nothing by itself.

-- Freezes ---------------------------------------------------------------------------------------------

create table public.subscription_freezes (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  subscription_id uuid not null,
  -- The first and last day, as planned.
  start_date date not null,
  end_date date not null,
  -- Ended early: the first day back (no frozen days from then on). Empty: as planned.
  ended_on date,
  reason text check (app.is_clean_text(reason, 500)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: freezes are never deleted.
  deleted_at timestamptz,
  constraint subscription_freezes_id_gym_id_key unique (id, gym_id),
  constraint subscription_freezes_subscription_id_gym_id_fkey foreign key (subscription_id, gym_id)
    references public.subscriptions (id, gym_id),
  constraint subscription_freezes_dates check (
    end_date >= start_date and (ended_on is null or (ended_on >= start_date and ended_on <= end_date))
  ),
  constraint subscription_freezes_never_deleted check (deleted_at is null)
);

create index subscription_freezes_subscription_id_gym_id_idx
  on public.subscription_freezes (subscription_id, gym_id, start_date);

create trigger check_writable before insert or update or delete on public.subscription_freezes
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.subscription_freezes
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'subscription_id', 'start_date', 'end_date', 'reason', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.subscription_freezes
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.subscription_freezes
  for each row execute function app.audit_row();

alter table public.subscription_freezes enable row level security;
revoke all on table public.subscription_freezes from anon, authenticated;
grant all on table public.subscription_freezes to service_role;
-- Staff only read them; the functions below write them.
grant select on table public.subscription_freezes to authenticated;

create policy "staff with members.view see freezes" on public.subscription_freezes
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

-- The days a freeze keeps the subscription frozen before p_date (all of them: p_date null).
create function app.frozen_days(p_freeze public.subscription_freezes, p_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(0,
    least(coalesce(p_freeze.ended_on, p_freeze.end_date + 1), coalesce(p_date, p_freeze.end_date + 1))
    - p_freeze.start_date)
$$;

-- Whether a subscription is frozen on p_date.
create function app.is_frozen(p_subscription_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscription_freezes f
     where f.subscription_id = p_subscription_id
       and f.start_date <= p_date and p_date < coalesce(f.ended_on, f.end_date + 1)
  )
$$;

revoke execute on function app.is_frozen(uuid, date) from public, anon;
grant execute on function app.is_frozen(uuid, date) to authenticated;

-- What is left -----------------------------------------------------------------------------------------

-- Visits of a subscription so far. There are none before check-in (Phase 4), which replaces this.
create function app.subscription_used_visits(p_subscription_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_subscription_id is null then null else 0 end
$$;

revoke execute on function app.subscription_used_visits(uuid) from public, anon, authenticated;

-- The share of a subscription not used yet on p_date, from 0 to 1: by days for a duration (the days
-- left of the days it was sold for; frozen days are not used), by visits for a visit count, the
-- smaller of the two for hybrid. Null for unlimited plans, which have nothing to share out.
create function app.unused_share(p_subscription public.subscriptions, p_date date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sold_days integer;
  used_days integer;
  day_share numeric;
  visit_share numeric;
begin
  if p_subscription.duration_count is not null then
    sold_days := app.plan_end_date(p_subscription.start_date, p_subscription.duration_unit, p_subscription.duration_count)
                 - p_subscription.start_date + 1;
    used_days := greatest(0, least(p_date, p_subscription.end_date + 1) - p_subscription.start_date)
                 - coalesce((select sum(app.frozen_days(f, p_date)) from public.subscription_freezes f
                              where f.subscription_id = p_subscription.id), 0);
    day_share := greatest(0, sold_days - greatest(0, used_days))::numeric / sold_days;
  end if;
  if p_subscription.visit_count is not null then
    visit_share := greatest(0, p_subscription.visit_count - app.subscription_used_visits(p_subscription.id))::numeric
                   / p_subscription.visit_count;
  end if;
  return case
    when day_share is not null and visit_share is not null then least(day_share, visit_share)
    else coalesce(day_share, visit_share)
  end;
end
$$;

revoke execute on function app.unused_share(public.subscriptions, date) from public, anon, authenticated;

-- What was charged for a subscription: its invoice item after the discount (0 when the invoice was
-- voided or it came by a transfer), and the invoice.
create function app.subscription_charge(p_subscription_id uuid, out invoice_id uuid, out charged numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, case when v.voided_at is null then it.total else 0 end
    from public.invoice_items it
    join public.invoices v on v.id = it.invoice_id and v.gym_id = it.gym_id
   where it.subscription_id = p_subscription_id
$$;

revoke execute on function app.subscription_charge(uuid) from public, anon, authenticated;

-- What a subscription's unused part is worth on p_date, in whole dinars, and how it settles: first
-- it clears what is still owed on its invoice (forgiven), the rest (left) was paid for and not used.
create function app.unused_value(
  p_subscription public.subscriptions,
  p_date date,
  out invoice_id uuid,
  out worth numeric,
  out forgiven numeric,
  out left_over numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  charge record;
  owed numeric;
begin
  select * into charge from app.subscription_charge(p_subscription.id);
  invoice_id := charge.invoice_id;
  worth := coalesce(round(coalesce(charge.charged, 0) * app.unused_share(p_subscription, p_date)), 0);
  select coalesce(b.due, 0) into owed from public.invoice_balances b where b.invoice_id = charge.invoice_id;
  forgiven := least(worth, coalesce(owed, 0));
  left_over := worth - forgiven;
end
$$;

revoke execute on function app.unused_value(public.subscriptions, date) from public, anon, authenticated;

-- The subscription the acting staff member works on: of their gym, and they see members.
-- subscription_not_found otherwise.
create function app.visible_subscription(p_subscription_id uuid)
returns public.subscriptions
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_subscription public.subscriptions;
begin
  select * into found_subscription from public.subscriptions s
   where s.id = p_subscription_id and s.gym_id = app.current_gym_id();
  if not found or not app.has_permission('members.view') then
    raise exception using errcode = 'P0002', message = 'subscription_not_found',
      detail = 'No subscription with this id that you may see';
  end if;
  return found_subscription;
end
$$;

revoke execute on function app.visible_subscription(uuid) from public, anon, authenticated;

-- What the screens show before a change: what the unused part is worth today and how it would
-- settle, the freeze days used and allowed, and the freeze in effect or planned. members.view.
create function public.subscription_change_preview(p_subscription_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  subscription public.subscriptions := app.visible_subscription(p_subscription_id);
  unused record;
  open_freeze public.subscription_freezes;
begin
  select * into unused from app.unused_value(subscription, today);
  select * into open_freeze from public.subscription_freezes f
   where f.subscription_id = subscription.id and f.ended_on is null and f.end_date >= today
   order by f.start_date limit 1;
  return jsonb_build_object(
    'worth', unused.worth,
    'forgiven', unused.forgiven,
    'left_over', unused.left_over,
    'unlimited', subscription.duration_count is null and subscription.visit_count is null,
    'freeze_days_used', coalesce((select sum(app.frozen_days(f, null)) from public.subscription_freezes f
                                   where f.subscription_id = subscription.id), 0),
    'freeze_days_allowed', subscription.max_freeze_days,
    'freeze', case when open_freeze.id is null then null else jsonb_build_object(
      'id', open_freeze.id, 'start_date', open_freeze.start_date, 'end_date', open_freeze.end_date) end
  );
end
$$;

revoke execute on function public.subscription_change_preview(uuid) from public, anon;
grant execute on function public.subscription_change_preview(uuid) to authenticated;

-- Freezing -----------------------------------------------------------------------------------------------

-- Freezes a subscription for p_days from p_start_date (today or later, within the subscription);
-- its end date moves by as many days. The same freeze id again returns what was saved.
-- permission_denied (subscriptions.freeze); subscription_not_found; subscription_not_active;
-- cannot_freeze (no end date, or no freeze days in the plan); subscription_ended;
-- invalid_freeze_dates; already_frozen (one freeze at a time); freeze_too_long (more days than the
-- plan allows in all).
create function public.freeze_subscription(
  p_freeze_id uuid,
  p_subscription_id uuid,
  p_start_date date,
  p_days integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  subscription public.subscriptions;
  existing public.subscription_freezes;
  used integer;
begin
  if not app.has_permission('subscriptions.freeze') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Freezing needs subscriptions.freeze';
  end if;
  subscription := app.visible_subscription(p_subscription_id);
  select * into existing from public.subscription_freezes f where f.id = p_freeze_id;
  if found then
    if existing.subscription_id <> subscription.id then
      raise exception using errcode = '23505', message = 'freeze_exists',
        detail = 'Another freeze has this id';
    end if;
    return jsonb_build_object('freeze_id', existing.id, 'end_date', subscription.end_date);
  end if;
  if subscription.status <> 'active' then
    raise exception using errcode = '23514', message = 'subscription_not_active',
      detail = format('The subscription is %s', subscription.status);
  end if;
  if subscription.end_date is null or subscription.max_freeze_days = 0 then
    raise exception using errcode = '23514', message = 'cannot_freeze',
      detail = 'This plan can''t be frozen';
  end if;
  if subscription.end_date < today then
    raise exception using errcode = '23514', message = 'subscription_ended',
      detail = 'The subscription has ended';
  end if;
  if p_start_date is null or p_start_date < greatest(today, subscription.start_date)
     or p_start_date > subscription.end_date or p_days is null or p_days < 1 then
    raise exception using errcode = '22023', message = 'invalid_freeze_dates',
      detail = 'A freeze starts today or later, within the subscription, for a day or more';
  end if;
  if exists (select 1 from public.subscription_freezes f
              where f.subscription_id = subscription.id and coalesce(f.ended_on, f.end_date + 1) > today) then
    raise exception using errcode = '23514', message = 'already_frozen',
      detail = 'The subscription has a freeze in effect or planned';
  end if;
  used := coalesce((select sum(app.frozen_days(f, null)) from public.subscription_freezes f
                     where f.subscription_id = subscription.id), 0);
  if used + p_days > subscription.max_freeze_days then
    raise exception using errcode = '23514', message = 'freeze_too_long',
      detail = format('%s of %s freeze days are left', subscription.max_freeze_days - used, subscription.max_freeze_days);
  end if;
  if p_reason is not null and not app.is_clean_text(p_reason, 500) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A reason has 1 to 500 characters';
  end if;

  insert into public.subscription_freezes (id, gym_id, subscription_id, start_date, end_date, reason)
  values (p_freeze_id, subscription.gym_id, subscription.id, p_start_date, p_start_date + p_days - 1, p_reason);
  update public.subscriptions s set end_date = s.end_date + p_days where s.id = subscription.id
  returning * into subscription;
  return jsonb_build_object('freeze_id', p_freeze_id, 'end_date', subscription.end_date);
end
$$;

revoke execute on function public.freeze_subscription(uuid, uuid, date, integer, text) from public, anon;
grant execute on function public.freeze_subscription(uuid, uuid, date, integer, text) to authenticated;

-- Ends a freeze early: the member is back today (a freeze that hasn't started yet is taken back
-- whole). The end date moves back by the days not frozen. permission_denied (subscriptions.freeze);
-- freeze_not_found; not_frozen (it is over already).
create function public.unfreeze_subscription(p_freeze_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  paused public.subscription_freezes;
  subscription public.subscriptions;
  back_on date;
begin
  if not app.has_permission('subscriptions.freeze') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Unfreezing needs subscriptions.freeze';
  end if;
  select * into paused from public.subscription_freezes f
   where f.id = p_freeze_id and f.gym_id = app.current_gym_id();
  if not found or not app.has_permission('members.view') then
    raise exception using errcode = 'P0002', message = 'freeze_not_found',
      detail = 'No freeze with this id that you may see';
  end if;
  if paused.ended_on is not null or paused.end_date < today then
    raise exception using errcode = '23514', message = 'not_frozen',
      detail = 'This freeze is over';
  end if;
  back_on := greatest(today, paused.start_date);
  update public.subscription_freezes f set ended_on = back_on where f.id = paused.id;
  update public.subscriptions s set end_date = s.end_date - (paused.end_date + 1 - back_on)
   where s.id = paused.subscription_id
  returning * into subscription;
  return jsonb_build_object('freeze_id', paused.id, 'end_date', subscription.end_date);
end
$$;

revoke execute on function public.unfreeze_subscription(uuid) from public, anon;
grant execute on function public.unfreeze_subscription(uuid) to authenticated;

-- Changing the plan ---------------------------------------------------------------------------------------

-- An upgrade or downgrade from today: the old subscription is replaced, its unused part clears what
-- is still owed on its invoice and the rest comes off the new plan's price, and the new one is sold
-- (app.save_sale: invoice, payment, installments). The same new subscription id again returns what
-- was saved. permission_denied (subscriptions.change and subscriptions.sell; payments.create for a
-- payment); subscription_not_found; subscription_not_active; subscription_not_current (not started,
-- or ended); cannot_change_plan (unlimited); subscription_frozen; no_branch_access,
-- branch_inactive; member_not_active; plan_not_found; plan_not_on_sale; price_changed;
-- plan_gender_mismatch; same_plan; credit_exceeds_price; then the sale's own keys.
create function public.change_plan(
  p_subscription_id uuid,
  p_new_subscription_id uuid,
  p_invoice_id uuid,
  p_plan_id uuid,
  p_branch_id uuid,
  p_price numeric,
  p_payment jsonb default null,
  p_installments jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  old public.subscriptions;
  existing public.subscriptions;
  member public.members;
  plan public.plans;
  unused record;
  old_number text;
begin
  if not (app.has_permission('subscriptions.change') and app.has_permission('subscriptions.sell')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing a plan needs subscriptions.change and subscriptions.sell';
  end if;
  if p_payment is not null and not app.has_permission('payments.create') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Taking a payment needs payments.create';
  end if;
  old := app.visible_subscription(p_subscription_id);
  select * into existing from public.subscriptions s where s.id = p_new_subscription_id;
  if found then
    if existing.replaces_id is distinct from old.id then
      raise exception using errcode = '23505', message = 'sale_exists',
        detail = 'Another sale has this id';
    end if;
    return app.sale_result(existing.id);
  end if;
  if old.status <> 'active' then
    raise exception using errcode = '23514', message = 'subscription_not_active',
      detail = format('The subscription is %s', old.status);
  end if;
  if old.start_date > today or old.end_date < today then
    raise exception using errcode = '23514', message = 'subscription_not_current',
      detail = 'Only a subscription that runs today changes plan';
  end if;
  if old.duration_count is null and old.visit_count is null then
    raise exception using errcode = '23514', message = 'cannot_change_plan',
      detail = 'An unlimited subscription has nothing to share out';
  end if;
  if app.is_frozen(old.id, today) then
    raise exception using errcode = '23514', message = 'subscription_frozen',
      detail = 'Unfreeze it first';
  end if;
  perform app.check_money_branch(p_branch_id);
  select * into member from public.members m where m.id = old.member_id and m.gym_id = old.gym_id;
  if member.status <> 'active' then
    raise exception using errcode = '42501', message = 'member_not_active',
      detail = format('The member is %s', member.status);
  end if;
  select * into plan from public.plans p where p.id = p_plan_id and p.gym_id = old.gym_id;
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
  if plan.id = old.plan_id then
    raise exception using errcode = '23514', message = 'same_plan',
      detail = 'Renew it instead';
  end if;
  select * into unused from app.unused_value(old, today);
  if unused.left_over > plan.price then
    raise exception using errcode = '23514', message = 'credit_exceeds_price',
      detail = format('The unused part (%s) is worth more than the new plan; cancel with a refund instead', unused.left_over);
  end if;

  if unused.forgiven > 0 then
    insert into public.invoice_credits (gym_id, invoice_id, subscription_id, kind, amount)
    values (old.gym_id, unused.invoice_id, old.id, 'plan_change', unused.forgiven);
  end if;
  update public.subscriptions s
     set status = 'replaced', status_changed_at = now(), status_changed_by = auth.uid()
   where s.id = old.id;
  select v.number into old_number from public.invoices v where v.id = unused.invoice_id;
  return app.save_sale(old.gym_id, p_new_subscription_id, p_invoice_id, old.member_id, plan, p_branch_id, today,
    unused.left_over, case when unused.left_over > 0 then old_number end, p_payment, p_installments, old.id)
    || jsonb_build_object('worth', unused.worth, 'forgiven', unused.forgiven, 'credit', unused.left_over);
end
$$;

revoke execute on function public.change_plan(uuid, uuid, uuid, uuid, uuid, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.change_plan(uuid, uuid, uuid, uuid, uuid, numeric, jsonb, jsonb) to authenticated;

-- Transferring ----------------------------------------------------------------------------------------------

-- What is left of a subscription goes to another member: a new subscription from today (or its own
-- start, when later) to the same end, with the visits and freeze days left; the old one is
-- transferred. The invoice stays with the first member. The same new id again returns what was
-- saved. permission_denied (subscriptions.transfer); subscription_not_found;
-- subscription_not_active; subscription_ended; subscription_frozen; member_not_found;
-- member_not_active; same_member; plan_gender_mismatch; reason_required.
create function public.transfer_subscription(
  p_subscription_id uuid,
  p_new_subscription_id uuid,
  p_member_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  old public.subscriptions;
  existing public.subscriptions;
  member public.members;
  used_freeze integer;
begin
  if not app.has_permission('subscriptions.transfer') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Transferring needs subscriptions.transfer';
  end if;
  old := app.visible_subscription(p_subscription_id);
  select * into existing from public.subscriptions s where s.id = p_new_subscription_id;
  if found then
    if existing.transferred_from_id is distinct from old.id then
      raise exception using errcode = '23505', message = 'sale_exists',
        detail = 'Another subscription has this id';
    end if;
    return jsonb_build_object('subscription_id', existing.id, 'start_date', existing.start_date,
      'end_date', existing.end_date);
  end if;
  if old.status <> 'active' then
    raise exception using errcode = '23514', message = 'subscription_not_active',
      detail = format('The subscription is %s', old.status);
  end if;
  if old.end_date < today then
    raise exception using errcode = '23514', message = 'subscription_ended',
      detail = 'The subscription has ended';
  end if;
  if app.is_frozen(old.id, today) then
    raise exception using errcode = '23514', message = 'subscription_frozen',
      detail = 'Unfreeze it first';
  end if;
  select * into member from public.members m
   where m.id = p_member_id and m.gym_id = old.gym_id and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member.status <> 'active' then
    raise exception using errcode = '42501', message = 'member_not_active',
      detail = format('The member is %s', member.status);
  end if;
  if member.id = old.member_id then
    raise exception using errcode = '23514', message = 'same_member',
      detail = 'The subscription is this member''s already';
  end if;
  if old.gender <> 'any' and old.gender <> member.gender then
    raise exception using errcode = '23514', message = 'plan_gender_mismatch',
      detail = format('This plan is for %s members', old.gender);
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 500) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'A transfer needs a reason';
  end if;
  used_freeze := coalesce((select sum(app.frozen_days(f, null)) from public.subscription_freezes f
                            where f.subscription_id = old.id), 0);

  update public.subscriptions s
     set status = 'transferred', status_reason = p_reason, status_changed_at = now(), status_changed_by = auth.uid()
   where s.id = old.id;
  insert into public.subscriptions (
    id, gym_id, member_id, plan_id, branch_id, name_ckb, name_en, name_ar, kind, duration_unit,
    duration_count, visit_count, price, gender, branch_ids, allowed_days, allowed_from, allowed_until,
    daily_visit_limit, max_freeze_days, start_date, end_date, transferred_from_id
  )
  values (
    p_new_subscription_id, old.gym_id, member.id, old.plan_id, old.branch_id, old.name_ckb, old.name_en,
    old.name_ar, old.kind, old.duration_unit, old.duration_count,
    case when old.visit_count is null then null
         else greatest(1, old.visit_count - app.subscription_used_visits(old.id)) end,
    old.price, old.gender, old.branch_ids, old.allowed_days, old.allowed_from, old.allowed_until,
    old.daily_visit_limit, greatest(0, old.max_freeze_days - used_freeze),
    greatest(today, old.start_date), old.end_date, old.id
  );
  return jsonb_build_object('subscription_id', p_new_subscription_id, 'start_date', greatest(today, old.start_date),
    'end_date', old.end_date);
end
$$;

revoke execute on function public.transfer_subscription(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.transfer_subscription(uuid, uuid, uuid, text) to authenticated;

-- Cancelling --------------------------------------------------------------------------------------------------

-- Cancels a subscription, with a reason. Its unused part (app.unused_value) first clears what is
-- still owed on its invoice; up to the rest may be given back now (p_refund: {"id", "amount",
-- "method"}, in dinars, from p_branch_id; payments.refund), with a receipt. permission_denied
-- (subscriptions.cancel; payments.refund for money back); subscription_not_found;
-- subscription_not_active; subscription_ended; reason_required; no_branch_access, branch_inactive;
-- invalid_refund; refund_too_large.
create function public.cancel_subscription(
  p_subscription_id uuid,
  p_reason text,
  p_refund jsonb default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
  subscription public.subscriptions;
  unused record;
  refund_id uuid;
  refund_amount numeric;
  refund_method text;
  saved public.payments;
begin
  if not app.has_permission('subscriptions.cancel') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Cancelling needs subscriptions.cancel';
  end if;
  if p_refund is not null and not app.has_permission('payments.refund') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Giving money back needs payments.refund';
  end if;
  subscription := app.visible_subscription(p_subscription_id);
  if subscription.status <> 'active' then
    raise exception using errcode = '23514', message = 'subscription_not_active',
      detail = format('The subscription is %s', subscription.status);
  end if;
  if subscription.end_date < today then
    raise exception using errcode = '23514', message = 'subscription_ended',
      detail = 'The subscription has ended';
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 500) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'Cancelling needs a reason';
  end if;
  select * into unused from app.unused_value(subscription, today);
  if p_refund is not null then
    perform app.check_money_branch(p_branch_id);
    begin
      refund_id := (p_refund ->> 'id')::uuid;
      refund_amount := (p_refund ->> 'amount')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'invalid_refund',
          detail = 'A refund has an id and an amount';
    end;
    refund_method := p_refund ->> 'method';
    if refund_id is null or refund_amount is null or refund_amount <= 0 or refund_amount <> trunc(refund_amount)
       or coalesce(refund_method, '') not in ('cash', 'card', 'fib', 'fastpay', 'zaincash', 'bank_transfer') then
      raise exception using errcode = '22023', message = 'invalid_refund',
        detail = 'A refund is whole dinars above 0, with a method';
    end if;
    -- At most what was paid for the unused part, and at most what was paid in and not given back.
    if refund_amount > least(unused.left_over, coalesce((
         select b.paid - b.refunded from public.invoice_balances b where b.invoice_id = unused.invoice_id), 0)) then
      raise exception using errcode = '23514', message = 'refund_too_large',
        detail = format('At most %s was paid for the unused part', unused.left_over);
    end if;
  end if;

  if unused.forgiven > 0 then
    insert into public.invoice_credits (gym_id, invoice_id, subscription_id, kind, amount, reason)
    values (subscription.gym_id, unused.invoice_id, subscription.id, 'cancellation', unused.forgiven, p_reason);
  end if;
  update public.subscriptions s
     set status = 'cancelled', status_reason = p_reason, status_changed_at = now(), status_changed_by = auth.uid()
   where s.id = subscription.id;
  if p_refund is not null then
    insert into public.payments (id, gym_id, branch_id, member_id, invoice_id, number, kind, method, amount, reason)
    values (refund_id, subscription.gym_id, p_branch_id, subscription.member_id, unused.invoice_id,
            app.next_document_number(p_branch_id, 'receipt'), 'refund', refund_method, refund_amount, p_reason)
    returning * into saved;
  end if;
  return jsonb_build_object('worth', unused.worth, 'forgiven', unused.forgiven, 'left_over', unused.left_over,
    'refunded', coalesce(saved.amount, 0), 'receipt_number', saved.number);
end
$$;

revoke execute on function public.cancel_subscription(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.cancel_subscription(uuid, text, jsonb, uuid) to authenticated;
