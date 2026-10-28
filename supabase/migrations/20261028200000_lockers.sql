-- Lockers (Phase 5, step 5a; spec §4.4 and the Phase 5 plan in §8 of 2026-10-28). Additions only,
-- and app.is_valid_setting replaced with the same signature (two new keys).
--
--   * lockers: a branch's lockers, numbered (12, A12), in a zone (men, women, mixed), daily or
--     rented. Out of order with a note; removed (soft delete) only while free.
--   * locker_assignments: who holds a locker. One open assignment per locker (the second staff
--     member gets locker_taken at once), one open daily locker per member. Rows are never deleted;
--     an assignment ends by being released (returned, checked out, renewed, key lost, invoice
--     voided, end of day).
--   * The status (free, occupied, reserved, overdue, out of order) is computed by the app
--     (lockerStatus() in packages/core), never stored.
--   * Daily lockers end when the member checks out or the visit is voided (a trigger), or by hand.
--     There is no scheduled job: one left from an earlier day is overdue, and
--     release_daily_lockers() releases them for the end-of-day list.
--   * Renting is by whole months at lockers.rent_month_price, one invoice (item kind locker) with
--     an optional payment, in one function. Voiding the invoice releases the locker (a trigger).
--   * A lost key costs lockers.lost_key_fee (item kind penalty) and releases the locker.
--   * Only these functions write lockers and assignments; staff read them with lockers.view in
--     their branches.

-- Settings ------------------------------------------------------------------------------------------

create or replace function app.is_valid_setting(setting_key text, value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case setting_key
    -- Wrong PIN tries before the staff member must log in with their password again.
    when 'security.pin_max_attempts' then app.is_json_integer(value, 3, 10)
    -- Minutes without activity before the app locks.
    when 'security.idle_lock_minutes' then app.is_json_integer(value, 1, 240)
    -- The gym's brand color: a preset, or a custom color as lowercase #rrggbb.
    when 'appearance.brand_color' then jsonb_typeof(value) = 'string' and (value #>> '{}' = any (array['indigo', 'blue', 'purple', 'gray', 'midnight', 'gold', 'teal']) or value #>> '{}' ~ '^#[0-9a-f]{6}$')
    -- Corners: soft (the default), medium or sharp.
    when 'appearance.corner_style' then jsonb_typeof(value) = 'string' and value #>> '{}' in ('soft', 'medium', 'sharp')
    when 'appearance.logo' then app.is_valid_logo(value)
    -- Minutes after a visit in which another scan counts nothing (shown as "already in").
    when 'checkin.cooldown_minutes' then app.is_json_integer(value, 1, 720)
    -- Hours a visit counts as inside when nobody checks the member out.
    when 'checkin.visit_hours' then app.is_json_integer(value, 1, 24)
    -- 1: money owed now above checkin.debt_limit refuses entry; 0: it is only a warning.
    when 'checkin.deny_for_debt' then app.is_json_integer(value, 0, 1)
    -- Dinars a member may owe now and still come in, when checkin.deny_for_debt is 1.
    when 'checkin.debt_limit' then app.is_json_integer(value, 0, 1000000000)
    -- Dinars a rented locker costs per month; 0: not set, so lockers can't be rented yet.
    when 'lockers.rent_month_price' then app.is_json_integer(value, 0, 1000000000)
    -- Dinars charged for a lost locker key; 0: no fee.
    when 'lockers.lost_key_fee' then app.is_json_integer(value, 0, 1000000000)
    else false
  end
$$;

-- Lockers ---------------------------------------------------------------------------------------------

create table public.lockers (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  -- 12 or A12: up to 3 capital Latin letters, then 1 to 4 digits. Shown left to right.
  number text not null check (number ~ '^[A-Z]{0,3}[0-9]{1,4}$'),
  zone text not null check (zone in ('men', 'women', 'mixed')),
  -- daily: given with a visit; rented: by the month.
  kind text not null check (kind in ('daily', 'rented')),
  -- Out of order (lockers.manage), with a note; nobody is given it meanwhile.
  out_of_order_at timestamptz,
  out_of_order_note text check (app.is_clean_text(out_of_order_note, 200)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Removed (only while free): its history stays.
  deleted_at timestamptz,
  constraint lockers_id_gym_id_key unique (id, gym_id),
  constraint lockers_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint lockers_out_of_order check ((out_of_order_at is null) = (out_of_order_note is null))
);

-- A number once per branch among the lockers not removed; also the branch's map.
create unique index lockers_branch_id_gym_id_number_key on public.lockers (branch_id, gym_id, number)
  where deleted_at is null;
create index lockers_branch_id_gym_id_idx on public.lockers (branch_id, gym_id);

create trigger check_writable before insert or update or delete on public.lockers
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.lockers
  for each row execute function app.read_only_columns('id', 'gym_id', 'branch_id', 'created_at', 'created_by');
create trigger stamp before insert or update on public.lockers
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.lockers
  for each row execute function app.audit_row();

alter table public.lockers enable row level security;
revoke all on table public.lockers from anon, authenticated;
grant all on table public.lockers to service_role;
-- Staff only read lockers; the functions below write them.
grant select on table public.lockers to authenticated;

create policy "staff with lockers.view see their branches' lockers" on public.lockers
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('lockers.view'))
    and branch_id in (select app.accessible_branch_ids())
  );

-- Assignments -------------------------------------------------------------------------------------------

create table public.locker_assignments (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  -- The locker's branch.
  branch_id uuid not null,
  locker_id uuid not null,
  member_id uuid not null,
  kind text not null check (kind in ('daily', 'rented')),
  -- daily: the visit it came with, if any.
  attendance_id uuid,
  -- rented: the rent invoice.
  invoice_id uuid,
  -- daily: the day it was given (Baghdad); rented: the first paid day.
  starts_on date not null,
  -- rented: the last paid day.
  ends_on date,
  -- rented: the rental this one continues.
  renews_id uuid,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid,
  release_reason text check (release_reason in (
    'returned', 'checked_out', 'renewed', 'key_lost', 'invoice_voided', 'end_of_day'
  )),
  -- The lost key fee's invoice (none when there is no fee).
  key_fee_invoice_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: assignments are the history and are never deleted.
  deleted_at timestamptz,
  constraint locker_assignments_id_gym_id_key unique (id, gym_id),
  constraint locker_assignments_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint locker_assignments_locker_id_gym_id_fkey foreign key (locker_id, gym_id) references public.lockers (id, gym_id),
  constraint locker_assignments_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint locker_assignments_attendance_id_gym_id_fkey foreign key (attendance_id, gym_id)
    references public.attendance (id, gym_id),
  constraint locker_assignments_invoice_id_gym_id_fkey foreign key (invoice_id, gym_id) references public.invoices (id, gym_id),
  constraint locker_assignments_renews_id_gym_id_fkey foreign key (renews_id, gym_id)
    references public.locker_assignments (id, gym_id),
  constraint locker_assignments_key_fee_invoice_id_gym_id_fkey foreign key (key_fee_invoice_id, gym_id)
    references public.invoices (id, gym_id),
  constraint locker_assignments_kind check (
    case kind
      when 'daily' then invoice_id is null and ends_on is null and renews_id is null
      else attendance_id is null and invoice_id is not null and ends_on >= starts_on
    end
  ),
  constraint locker_assignments_released check (
    (released_at is null) = (release_reason is null) and (released_at is null or released_at >= assigned_at)
  ),
  constraint locker_assignments_never_deleted check (deleted_at is null)
);

-- One holder per locker, one daily locker per member: the second one is refused at once.
create unique index locker_assignments_open_locker_key on public.locker_assignments (locker_id)
  where released_at is null;
create unique index locker_assignments_open_daily_member_key on public.locker_assignments (member_id)
  where released_at is null and kind = 'daily';
-- A locker's history, a member's lockers, a branch's open ones, and the foreign keys.
create index locker_assignments_locker_id_gym_id_idx on public.locker_assignments (locker_id, gym_id, assigned_at desc);
create index locker_assignments_member_id_gym_id_idx on public.locker_assignments (member_id, gym_id, assigned_at desc);
create index locker_assignments_branch_id_gym_id_idx on public.locker_assignments (branch_id, gym_id);
create index locker_assignments_attendance_id_gym_id_idx on public.locker_assignments (attendance_id, gym_id);
create index locker_assignments_invoice_id_gym_id_idx on public.locker_assignments (invoice_id, gym_id);
create index locker_assignments_renews_id_gym_id_idx on public.locker_assignments (renews_id, gym_id);
create index locker_assignments_key_fee_invoice_id_gym_id_idx on public.locker_assignments (key_fee_invoice_id, gym_id);

create trigger check_writable before insert or update or delete on public.locker_assignments
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.locker_assignments
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'locker_id', 'member_id', 'kind', 'attendance_id', 'invoice_id',
    'starts_on', 'ends_on', 'renews_id', 'assigned_at', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.locker_assignments
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.locker_assignments
  for each row execute function app.audit_row();

alter table public.locker_assignments enable row level security;
revoke all on table public.locker_assignments from anon, authenticated;
grant all on table public.locker_assignments to service_role;
grant select on table public.locker_assignments to authenticated;

create policy "staff with lockers.view see their branches' locker holders" on public.locker_assignments
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and (select app.has_permission('lockers.view'))
    and branch_id in (select app.accessible_branch_ids())
  );

-- Helpers -----------------------------------------------------------------------------------------------

-- Today in Baghdad.
create function app.baghdad_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Baghdad')::date
$$;

-- The locker the acting staff member works on, locked for this transaction: of their gym, not
-- removed, in a branch they reach. locker_not_found otherwise.
create function app.lock_locker(p_locker_id uuid)
returns public.lockers
language plpgsql
security definer
set search_path = ''
as $$
declare
  locker public.lockers;
begin
  select * into locker from public.lockers l
   where l.id = p_locker_id and l.gym_id = app.current_gym_id() and l.deleted_at is null
     for update;
  if not found or not app.has_branch_access(locker.branch_id) then
    raise exception using errcode = 'P0002', message = 'locker_not_found',
      detail = 'No locker with this id that you may use';
  end if;
  return locker;
end
$$;

revoke execute on function app.lock_locker(uuid) from public, anon, authenticated;

-- Whether a locker has someone holding it.
create function app.locker_is_held(p_locker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select from public.locker_assignments a where a.locker_id = p_locker_id and a.released_at is null
  )
$$;

revoke execute on function app.locker_is_held(uuid) from public, anon, authenticated;

-- An open assignment the acting staff member works on, locked. assignment_not_found (also for
-- another gym's, or a branch they don't reach); already_released.
create function app.lock_open_assignment(p_assignment_id uuid)
returns public.locker_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.locker_assignments;
begin
  select * into assignment from public.locker_assignments a
   where a.id = p_assignment_id and a.gym_id = app.current_gym_id()
     for update;
  if not found or not app.has_branch_access(assignment.branch_id) then
    raise exception using errcode = 'P0002', message = 'assignment_not_found',
      detail = 'No locker holder with this id that you may see';
  end if;
  if assignment.released_at is not null then
    raise exception using errcode = '23514', message = 'already_released',
      detail = 'This locker was released already';
  end if;
  return assignment;
end
$$;

revoke execute on function app.lock_open_assignment(uuid) from public, anon, authenticated;

-- The member a locker goes to, locked: of the gym, not archived, and (p_active) active; their
-- gender must fit the zone. member_not_found; member_archived; member_not_active; locker_wrong_zone.
create function app.locker_member(p_member_id uuid, p_zone text, p_active boolean)
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.members;
begin
  select * into member from public.members m
   where m.id = p_member_id and m.gym_id = app.current_gym_id() and m.deleted_at is null
     for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member.status = 'archived' then
    raise exception using errcode = '42501', message = 'member_archived',
      detail = 'An archived member gets no locker';
  end if;
  if p_active and member.status <> 'active' then
    raise exception using errcode = '42501', message = 'member_not_active',
      detail = 'Only an active member gets a daily locker';
  end if;
  if p_zone = 'men' and member.gender <> 'male' or p_zone = 'women' and member.gender <> 'female' then
    raise exception using errcode = '23514', message = 'locker_wrong_zone',
      detail = 'This locker is in the other zone';
  end if;
  return member;
end
$$;

revoke execute on function app.locker_member(uuid, text, boolean) from public, anon, authenticated;

-- A free locker of the right kind, ready to give. locker_out_of_order; locker_wrong_kind; locker_taken.
create function app.check_locker_free(p_locker public.lockers, p_kind text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_locker.out_of_order_at is not null then
    raise exception using errcode = '23514', message = 'locker_out_of_order',
      detail = 'This locker is out of order';
  end if;
  if p_locker.kind <> p_kind then
    raise exception using errcode = '23514', message = 'locker_wrong_kind',
      detail = 'This locker is of the other kind (daily or rented)';
  end if;
  if app.locker_is_held(p_locker.id) then
    raise exception using errcode = '23505', message = 'locker_taken',
      detail = 'Someone holds this locker already';
  end if;
end
$$;

revoke execute on function app.check_locker_free(public.lockers, text) from public, anon, authenticated;

-- An invoice for a locker (one item) with an optional payment, as charge_member makes one.
-- invalid_request (the description); invalid_payment; payment_too_large.
create function app.locker_invoice(
  p_invoice_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_kind text,
  p_description text,
  p_amount numeric,
  p_payment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  invoice public.invoices;
  payment public.payments;
begin
  if p_description is null or not app.is_clean_text(p_description, 200) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A locker invoice needs a description of at most 200 characters';
  end if;
  if p_payment is not null then
    perform app.read_payment(p_payment, p_amount);
  end if;
  insert into public.invoices (id, gym_id, branch_id, member_id, number, subtotal, discount, total)
  values (p_invoice_id, gym, p_branch_id, p_member_id, app.next_document_number(p_branch_id, 'invoice'),
          p_amount, 0, p_amount)
  returning * into invoice;
  insert into public.invoice_items (gym_id, invoice_id, kind, description_ckb, unit_price, total)
  values (gym, p_invoice_id, p_kind, p_description, p_amount, p_amount);
  if p_payment is not null then
    payment := app.record_payment(p_payment, p_amount, gym, p_branch_id, p_member_id, p_invoice_id);
  end if;
  return jsonb_build_object('invoice_id', invoice.id, 'invoice_number', invoice.number,
    'total', invoice.total, 'receipt_number', payment.number, 'paid', coalesce(payment.amount, 0),
    'change_given', coalesce(payment.change_given, 0));
end
$$;

revoke execute on function app.locker_invoice(uuid, uuid, uuid, text, text, numeric, jsonb) from public, anon, authenticated;

-- What an assignment is, for the screens (with its invoice when it has one).
create function app.assignment_result(p_assignment public.locker_assignments, p_invoice jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'assignment_id', p_assignment.id,
    'locker_id', p_assignment.locker_id,
    'starts_on', p_assignment.starts_on,
    'ends_on', p_assignment.ends_on
  ) || coalesce(p_invoice, '{}'::jsonb)
$$;

revoke execute on function app.assignment_result(public.locker_assignments, jsonb) from public, anon, authenticated;

-- What an existing rent invoice was, for a retry.
create function app.saved_invoice(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('invoice_id', v.id, 'invoice_number', v.number, 'total', v.total,
    'receipt_number', p.number, 'paid', coalesce(p.amount, 0), 'change_given', coalesce(p.change_given, 0))
    from public.invoices v
    left join lateral (
      select * from public.payments p
       where p.invoice_id = v.id and p.gym_id = v.gym_id and p.kind = 'payment'
       order by p.created_at limit 1
    ) p on true
   where v.id = p_invoice_id
$$;

revoke execute on function app.saved_invoice(uuid) from public, anon, authenticated;

-- Managing lockers (lockers.manage) ---------------------------------------------------------------------

-- Lockers p_from to p_to (at most 300) in a branch, numbered p_prefix || n, all of one zone and
-- kind. All or none: permission_denied; no_branch_access, branch_inactive; invalid_locker (the
-- zone, kind, prefix or range); locker_number_taken (one of the numbers is used in the branch).
create function public.add_lockers(
  p_branch_id uuid,
  p_zone text,
  p_kind text,
  p_prefix text,
  p_from integer,
  p_to integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  added integer;
begin
  if gym is null or not app.has_permission('lockers.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Adding lockers needs lockers.manage';
  end if;
  perform app.check_money_branch(p_branch_id);
  if coalesce(p_zone, '') not in ('men', 'women', 'mixed') or coalesce(p_kind, '') not in ('daily', 'rented')
     or coalesce(p_prefix, '') !~ '^[A-Z]{0,3}$' or p_from is null or p_to is null
     or p_from < 1 or p_to > 9999 or p_to < p_from or p_to - p_from >= 300 then
    raise exception using errcode = '22023', message = 'invalid_locker',
      detail = 'Lockers need a zone, a kind, up to 3 capital letters and numbers 1 to 9999, at most 300 at once';
  end if;
  if exists (
    select from public.lockers l
     where l.branch_id = p_branch_id and l.gym_id = gym and l.deleted_at is null
       and l.number in (select p_prefix || n from generate_series(p_from, p_to) n)
  ) then
    raise exception using errcode = '23505', message = 'locker_number_taken',
      detail = 'A locker in this branch has one of these numbers';
  end if;
  insert into public.lockers (id, gym_id, branch_id, number, zone, kind)
  select gen_random_uuid(), gym, p_branch_id, p_prefix || n, p_zone, p_kind
    from generate_series(p_from, p_to) n;
  get diagnostics added = row_count;
  return added;
end
$$;

revoke execute on function public.add_lockers(uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.add_lockers(uuid, text, text, text, integer, integer) to authenticated;

-- A locker's number, zone and kind. The zone and kind change only while it is free.
-- permission_denied; locker_not_found; invalid_locker; locker_in_use; locker_number_taken.
create function public.update_locker(p_locker_id uuid, p_number text, p_zone text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locker public.lockers;
begin
  if not app.has_permission('lockers.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Changing a locker needs lockers.manage';
  end if;
  locker := app.lock_locker(p_locker_id);
  if coalesce(p_number, '') !~ '^[A-Z]{0,3}[0-9]{1,4}$' or coalesce(p_zone, '') not in ('men', 'women', 'mixed')
     or coalesce(p_kind, '') not in ('daily', 'rented') then
    raise exception using errcode = '22023', message = 'invalid_locker',
      detail = 'A locker needs a number like 12 or A12, a zone and a kind';
  end if;
  if (p_zone <> locker.zone or p_kind <> locker.kind) and app.locker_is_held(locker.id) then
    raise exception using errcode = '23514', message = 'locker_in_use',
      detail = 'Release the locker before changing its zone or kind';
  end if;
  if exists (
    select from public.lockers l
     where l.branch_id = locker.branch_id and l.gym_id = locker.gym_id and l.deleted_at is null
       and l.number = p_number and l.id <> locker.id
  ) then
    raise exception using errcode = '23505', message = 'locker_number_taken',
      detail = 'Another locker in this branch has this number';
  end if;
  update public.lockers l set number = p_number, zone = p_zone, kind = p_kind where l.id = locker.id;
end
$$;

revoke execute on function public.update_locker(uuid, text, text, text) from public, anon;
grant execute on function public.update_locker(uuid, text, text, text) to authenticated;

-- Out of order with a note, or back in order (no note). Only while free.
-- permission_denied; locker_not_found; invalid_request (the note); locker_in_use.
create function public.set_locker_out_of_order(p_locker_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locker public.lockers;
begin
  if not app.has_permission('lockers.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Marking a locker out of order needs lockers.manage';
  end if;
  locker := app.lock_locker(p_locker_id);
  if p_note is not null and not app.is_clean_text(p_note, 200) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'The note has at most 200 characters';
  end if;
  if p_note is not null and app.locker_is_held(locker.id) then
    raise exception using errcode = '23514', message = 'locker_in_use',
      detail = 'Release the locker before marking it out of order';
  end if;
  update public.lockers l
     set out_of_order_at = case when p_note is null then null else coalesce(l.out_of_order_at, now()) end,
         out_of_order_note = p_note
   where l.id = locker.id;
end
$$;

revoke execute on function public.set_locker_out_of_order(uuid, text) from public, anon;
grant execute on function public.set_locker_out_of_order(uuid, text) to authenticated;

-- Removed from the map (its history stays). Only while free.
-- permission_denied; locker_not_found; locker_in_use.
create function public.remove_locker(p_locker_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locker public.lockers;
begin
  if not app.has_permission('lockers.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Removing a locker needs lockers.manage';
  end if;
  locker := app.lock_locker(p_locker_id);
  if app.locker_is_held(locker.id) then
    raise exception using errcode = '23514', message = 'locker_in_use',
      detail = 'Release the locker before removing it';
  end if;
  update public.lockers l set deleted_at = now() where l.id = locker.id;
end
$$;

revoke execute on function public.remove_locker(uuid) from public, anon;
grant execute on function public.remove_locker(uuid) to authenticated;

-- Giving and releasing (lockers.assign) -----------------------------------------------------------------

-- A daily locker for an active member, optionally with today's visit in the locker's branch (it
-- is released when they check out). The same assignment id again returns what was saved. In order:
-- permission_denied; locker_not_found; branch_inactive; locker_out_of_order, locker_wrong_kind,
-- locker_taken; member_not_found, member_archived, member_not_active, locker_wrong_zone;
-- already_has_locker; visit_not_found (not the member's open visit of today in this branch).
create function public.give_locker(
  p_assignment_id uuid,
  p_locker_id uuid,
  p_member_id uuid,
  p_attendance_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  locker public.lockers;
  assignment public.locker_assignments;
begin
  if gym is null or not app.has_permission('lockers.assign') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Giving a locker needs lockers.assign';
  end if;
  select * into assignment from public.locker_assignments a where a.id = p_assignment_id;
  if found then
    if assignment.gym_id is distinct from gym or assignment.locker_id <> p_locker_id
       or assignment.member_id <> p_member_id then
      raise exception using errcode = '23505', message = 'assignment_exists',
        detail = 'Another locker holder has this id';
    end if;
    return app.assignment_result(assignment, null);
  end if;
  locker := app.lock_locker(p_locker_id);
  if not app.is_active_branch(locker.branch_id) then
    raise exception using errcode = '42501', message = 'branch_inactive',
      detail = 'This branch is deactivated';
  end if;
  perform app.check_locker_free(locker, 'daily');
  perform app.locker_member(p_member_id, locker.zone, true);
  if exists (
    select from public.locker_assignments a
     where a.member_id = p_member_id and a.kind = 'daily' and a.released_at is null
  ) then
    raise exception using errcode = '23505', message = 'already_has_locker',
      detail = 'This member holds a daily locker already';
  end if;
  if p_attendance_id is not null and not exists (
    select from public.attendance v
     where v.id = p_attendance_id and v.gym_id = gym and v.member_id = p_member_id
       and v.branch_id = locker.branch_id and v.voided_at is null and v.checked_out_at is null
       and v.visit_date = app.baghdad_today()
  ) then
    raise exception using errcode = 'P0002', message = 'visit_not_found',
      detail = 'Not an open visit of this member today in this branch';
  end if;
  insert into public.locker_assignments (id, gym_id, branch_id, locker_id, member_id, kind, attendance_id, starts_on)
  values (p_assignment_id, gym, locker.branch_id, locker.id, p_member_id, 'daily', p_attendance_id, app.baghdad_today())
  returning * into assignment;
  return app.assignment_result(assignment, null);
end
$$;

revoke execute on function public.give_locker(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.give_locker(uuid, uuid, uuid, uuid) to authenticated;

-- A rented locker for p_months whole months from p_starts_on (today up to 60 days ahead), at the
-- month price that applies in the locker's branch, with one invoice (p_description on it) and an
-- optional payment. The same assignment id again returns what was saved. In order:
-- permission_denied (lockers.assign and payments.create); locker_not_found; no_branch_access,
-- branch_inactive; locker_out_of_order, locker_wrong_kind, locker_taken; member_not_found,
-- member_archived, locker_wrong_zone; invalid_rental (months or start); locker_price_not_set;
-- invalid_request (description); invalid_payment; payment_too_large.
create function public.rent_locker(
  p_assignment_id uuid,
  p_invoice_id uuid,
  p_locker_id uuid,
  p_member_id uuid,
  p_starts_on date,
  p_months integer,
  p_description text,
  p_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  locker public.lockers;
  assignment public.locker_assignments;
  price integer;
  invoice jsonb;
begin
  if gym is null or not (app.has_permission('lockers.assign') and app.has_permission('payments.create')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Renting a locker needs lockers.assign and payments.create';
  end if;
  select * into assignment from public.locker_assignments a where a.id = p_assignment_id;
  if found then
    if assignment.gym_id is distinct from gym or assignment.locker_id <> p_locker_id
       or assignment.member_id <> p_member_id then
      raise exception using errcode = '23505', message = 'assignment_exists',
        detail = 'Another locker holder has this id';
    end if;
    return app.assignment_result(assignment, app.saved_invoice(assignment.invoice_id));
  end if;
  locker := app.lock_locker(p_locker_id);
  perform app.check_money_branch(locker.branch_id);
  perform app.check_locker_free(locker, 'rented');
  perform app.locker_member(p_member_id, locker.zone, false);
  if p_months is null or p_months not between 1 and 12 or p_starts_on is null
     or p_starts_on not between app.baghdad_today() and app.baghdad_today() + 60 then
    raise exception using errcode = '22023', message = 'invalid_rental',
      detail = 'A rental is 1 to 12 months, starting today or within 60 days';
  end if;
  price := app.setting_integer(locker.branch_id, 'lockers.rent_month_price', 0);
  if price <= 0 then
    raise exception using errcode = '23514', message = 'locker_price_not_set',
      detail = 'Set lockers.rent_month_price before renting lockers';
  end if;
  invoice := app.locker_invoice(p_invoice_id, locker.branch_id, p_member_id, 'locker', p_description,
    price * p_months, p_payment);
  insert into public.locker_assignments (
    id, gym_id, branch_id, locker_id, member_id, kind, invoice_id, starts_on, ends_on
  ) values (
    p_assignment_id, gym, locker.branch_id, locker.id, p_member_id, 'rented', p_invoice_id, p_starts_on,
    app.plan_end_date(p_starts_on, 'month', p_months)
  )
  returning * into assignment;
  return app.assignment_result(assignment, invoice);
end
$$;

revoke execute on function public.rent_locker(uuid, uuid, uuid, uuid, date, integer, text, jsonb) from public, anon;
grant execute on function public.rent_locker(uuid, uuid, uuid, uuid, date, integer, text, jsonb) to authenticated;

-- Another p_months for a rental that is still open: a new assignment from the day after its last
-- paid day, with its own invoice; the old one ends as renewed. The same assignment id again
-- returns what was saved. permission_denied; assignment_not_found, already_released;
-- not_a_rental; no_branch_access, branch_inactive; member_archived; invalid_rental;
-- locker_price_not_set; invalid_request; invalid_payment; payment_too_large.
create function public.renew_locker_rental(
  p_assignment_id uuid,
  p_invoice_id uuid,
  p_renews_id uuid,
  p_months integer,
  p_description text,
  p_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  old public.locker_assignments;
  assignment public.locker_assignments;
  price integer;
  starts date;
  invoice jsonb;
begin
  if gym is null or not (app.has_permission('lockers.assign') and app.has_permission('payments.create')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Renewing a locker needs lockers.assign and payments.create';
  end if;
  select * into assignment from public.locker_assignments a where a.id = p_assignment_id;
  if found then
    if assignment.gym_id is distinct from gym or assignment.renews_id is distinct from p_renews_id then
      raise exception using errcode = '23505', message = 'assignment_exists',
        detail = 'Another locker holder has this id';
    end if;
    return app.assignment_result(assignment, app.saved_invoice(assignment.invoice_id));
  end if;
  old := app.lock_open_assignment(p_renews_id);
  if old.kind <> 'rented' then
    raise exception using errcode = '23514', message = 'not_a_rental',
      detail = 'Only a rented locker is renewed';
  end if;
  perform app.check_money_branch(old.branch_id);
  perform app.locker_member(old.member_id, 'mixed', false);
  if p_months is null or p_months not between 1 and 12 then
    raise exception using errcode = '22023', message = 'invalid_rental',
      detail = 'A rental is 1 to 12 months';
  end if;
  price := app.setting_integer(old.branch_id, 'lockers.rent_month_price', 0);
  if price <= 0 then
    raise exception using errcode = '23514', message = 'locker_price_not_set',
      detail = 'Set lockers.rent_month_price before renting lockers';
  end if;
  invoice := app.locker_invoice(p_invoice_id, old.branch_id, old.member_id, 'locker', p_description,
    price * p_months, p_payment);
  update public.locker_assignments a
     set released_at = greatest(now(), a.assigned_at), released_by = auth.uid(), release_reason = 'renewed'
   where a.id = old.id;
  starts := old.ends_on + 1;
  insert into public.locker_assignments (
    id, gym_id, branch_id, locker_id, member_id, kind, invoice_id, starts_on, ends_on, renews_id
  ) values (
    p_assignment_id, gym, old.branch_id, old.locker_id, old.member_id, 'rented', p_invoice_id, starts,
    app.plan_end_date(starts, 'month', p_months), old.id
  )
  returning * into assignment;
  return app.assignment_result(assignment, invoice);
end
$$;

revoke execute on function public.renew_locker_rental(uuid, uuid, uuid, integer, text, jsonb) from public, anon;
grant execute on function public.renew_locker_rental(uuid, uuid, uuid, integer, text, jsonb) to authenticated;

-- The member gave the locker back. Releasing again changes nothing. permission_denied;
-- assignment_not_found.
create function public.release_locker(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.locker_assignments;
begin
  if not app.has_permission('lockers.assign') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Releasing a locker needs lockers.assign';
  end if;
  select * into assignment from public.locker_assignments a
   where a.id = p_assignment_id and a.gym_id = app.current_gym_id()
     for update;
  if not found or not app.has_branch_access(assignment.branch_id) then
    raise exception using errcode = 'P0002', message = 'assignment_not_found',
      detail = 'No locker holder with this id that you may see';
  end if;
  if assignment.released_at is null then
    update public.locker_assignments a
       set released_at = greatest(now(), a.assigned_at), released_by = auth.uid(), release_reason = 'returned'
     where a.id = assignment.id
    returning * into assignment;
  end if;
  return jsonb_build_object('assignment_id', assignment.id, 'released_at', assignment.released_at);
end
$$;

revoke execute on function public.release_locker(uuid) from public, anon;
grant execute on function public.release_locker(uuid) to authenticated;

-- The key was lost: the locker is released, and when lockers.lost_key_fee is set the member is
-- charged it on a new invoice (item kind penalty, p_description on it) with an optional payment.
-- permission_denied (lockers.assign and payments.create); assignment_not_found, already_released;
-- no_branch_access, branch_inactive; invalid_request; invalid_payment; payment_too_large.
create function public.lost_locker_key(
  p_assignment_id uuid,
  p_invoice_id uuid,
  p_description text,
  p_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.locker_assignments;
  fee integer;
  invoice jsonb;
begin
  if not (app.has_permission('lockers.assign') and app.has_permission('payments.create')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'A lost key needs lockers.assign and payments.create';
  end if;
  assignment := app.lock_open_assignment(p_assignment_id);
  perform app.check_money_branch(assignment.branch_id);
  fee := app.setting_integer(assignment.branch_id, 'lockers.lost_key_fee', 0);
  if fee > 0 then
    invoice := app.locker_invoice(p_invoice_id, assignment.branch_id, assignment.member_id, 'penalty',
      p_description, fee, p_payment);
  end if;
  update public.locker_assignments a
     set released_at = greatest(now(), a.assigned_at), released_by = auth.uid(), release_reason = 'key_lost',
         key_fee_invoice_id = case when fee > 0 then p_invoice_id end
   where a.id = assignment.id
  returning * into assignment;
  return jsonb_build_object('assignment_id', assignment.id, 'fee', fee) || coalesce(invoice, '{}'::jsonb);
end
$$;

revoke execute on function public.lost_locker_key(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.lost_locker_key(uuid, uuid, text, jsonb) to authenticated;

-- The end-of-day list: releases the branch's daily lockers given on an earlier day (Baghdad) and
-- still not given back, and returns how many. permission_denied; no_branch_access.
create function public.release_daily_lockers(p_branch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
begin
  if not app.has_permission('lockers.assign') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Releasing lockers needs lockers.assign';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only lockers in your own branches';
  end if;
  update public.locker_assignments a
     set released_at = greatest(now(), a.assigned_at), released_by = auth.uid(), release_reason = 'end_of_day'
   where a.branch_id = p_branch_id and a.gym_id = app.current_gym_id() and a.kind = 'daily'
     and a.released_at is null and a.starts_on < app.baghdad_today();
  get diagnostics released = row_count;
  return released;
end
$$;

revoke execute on function public.release_daily_lockers(uuid) from public, anon;
grant execute on function public.release_daily_lockers(uuid) to authenticated;

-- Released by other events --------------------------------------------------------------------------------

-- A visit checked out or voided gives its daily locker back.
create function app.release_visit_lockers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.locker_assignments a
     set released_at = greatest(now(), a.assigned_at), released_by = auth.uid(), release_reason = 'checked_out'
   where a.attendance_id = new.id and a.gym_id = new.gym_id and a.released_at is null;
  return null;
end
$$;

revoke execute on function app.release_visit_lockers() from public, anon, authenticated;

create trigger release_lockers after update of checked_out_at, voided_at on public.attendance
  for each row
  when (old.checked_out_at is null and new.checked_out_at is not null
        or old.voided_at is null and new.voided_at is not null)
  execute function app.release_visit_lockers();

-- A voided rent invoice releases its locker.
create function app.release_invoice_lockers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.locker_assignments a
     set released_at = greatest(now(), a.assigned_at), released_by = auth.uid(), release_reason = 'invoice_voided'
   where a.invoice_id = new.id and a.gym_id = new.gym_id and a.released_at is null;
  return null;
end
$$;

revoke execute on function app.release_invoice_lockers() from public, anon, authenticated;

create trigger release_lockers after update of voided_at on public.invoices
  for each row
  when (old.voided_at is null and new.voided_at is not null)
  execute function app.release_invoice_lockers();
