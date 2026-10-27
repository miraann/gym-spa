-- Support access (MT-4; spec §2.6, the MT-4 plan of 2026-10-28). Additions only, and one function
-- replaced with the same signature (app.check_gym_writable lets the two support tables through).
--
--   * By default Click Group can't read a gym's members. A gym's staff with support.grant (the
--     Owner and the Admin role) let Click Group in for 1 hour to 7 days, with a reason, and may end it at any time.
--     Every staff member of the gym sees the grant (the app shows a notice while it runs).
--   * The seller reads only through seller_support_members() and seller_support_member(), and each
--     call writes a support_reads row in the same transaction, which the gym sees too. Health
--     information and photos are never part of it. Business tables get no seller policies.
--   * Online gyms only: an offline gym's data never reaches the cloud.

-- The permission ---------------------------------------------------------------------------------
-- The Owner has it like every permission, and the Admin role, which holds the whole catalog, gets
-- it in every gym (like billing.view); no other built-in role.

insert into public.permissions (key, module, sort_order) values ('support.grant', 'settings', 106);
insert into app.role_template_permissions (role_key, permission_key) values ('admin', 'support.grant');
insert into public.role_permissions (gym_id, role_id, permission_key)
select r.gym_id, r.id, 'support.grant'
  from public.roles r
 where r.key = 'admin' and r.is_system;

-- Grants ---------------------------------------------------------------------------------------------

create table public.support_grants (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  reason text not null check (app.is_clean_text(reason, 300)),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  -- Ended early by the gym.
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: grants are never deleted.
  deleted_at timestamptz,
  constraint support_grants_id_gym_id_key unique (id, gym_id),
  constraint support_grants_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint support_grants_length check (
    ends_at >= starts_at + interval '1 hour' and ends_at <= starts_at + interval '7 days'
  ),
  constraint support_grants_revoked check ((revoked_at is null) = (revoked_by is null)),
  constraint support_grants_never_deleted check (deleted_at is null)
);

create index support_grants_gym_id_idx on public.support_grants (gym_id, ends_at desc);

create trigger check_writable before insert or update or delete on public.support_grants
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.support_grants
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'reason', 'starts_at', 'ends_at', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.support_grants
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.support_grants
  for each row execute function app.audit_row();

alter table public.support_grants enable row level security;
revoke all on table public.support_grants from anon, authenticated;
grant all on table public.support_grants to service_role;
-- Staff only read them; the functions below write them.
grant select on table public.support_grants to authenticated;

-- Everyone in the gym: the notice is for all staff.
create policy "staff see their gym's support grants" on public.support_grants
  for select to authenticated
  using (gym_id = (select app.current_gym_id()));

-- What Click Group read ------------------------------------------------------------------------------

create table public.support_reads (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null,
  grant_id uuid not null,
  read_at timestamptz not null default now(),
  -- The platform admin, and their email at the time.
  admin_id uuid not null,
  admin_email text,
  -- members: the member list (details.search); member: one member.
  what text not null check (what in ('members', 'member')),
  member_id uuid,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: reads are never deleted.
  deleted_at timestamptz,
  constraint support_reads_grant_id_gym_id_fkey foreign key (grant_id, gym_id)
    references public.support_grants (id, gym_id),
  constraint support_reads_member_id_gym_id_fkey foreign key (member_id, gym_id)
    references public.members (id, gym_id),
  constraint support_reads_member check ((what = 'member') = (member_id is not null)),
  constraint support_reads_never_deleted check (deleted_at is null)
);

create index support_reads_grant_id_gym_id_idx on public.support_reads (grant_id, gym_id, read_at desc);
create index support_reads_member_id_gym_id_idx on public.support_reads (member_id, gym_id);
create index support_reads_gym_id_idx on public.support_reads (gym_id, read_at desc);

create trigger check_writable before insert or update or delete on public.support_reads
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.support_reads
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'grant_id', 'read_at', 'admin_id', 'admin_email', 'what', 'member_id', 'details',
    'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.support_reads
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.support_reads
  for each row execute function app.audit_row();

alter table public.support_reads enable row level security;
revoke all on table public.support_reads from anon, authenticated;
grant all on table public.support_reads to service_role;
grant select on table public.support_reads to authenticated;

create policy "staff with support.grant see what Click Group read" on public.support_reads
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('support.grant')));

-- The read-only guard lets support access through ------------------------------------------------------

create or replace function app.check_gym_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return coalesce(new, old);
  end if;
  if app.member_import_action() is not null then
    return coalesce(new, old);
  end if;
  -- Support access (MT-4) adds no business data, and a gym must always be able to end it.
  if tg_table_name in ('support_grants', 'support_reads') then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'staff_users' and tg_op = 'UPDATE' then
    if old.id = auth.uid() then
      return new;
    end if;
    if (to_jsonb(new) - array['is_active', 'must_change_password', 'updated_at', 'updated_by'])
         = (to_jsonb(old) - array['is_active', 'must_change_password', 'updated_at', 'updated_by'])
       and (new.is_active = old.is_active or not new.is_active)
       and (new.must_change_password = old.must_change_password or new.must_change_password)
    then
      return new;
    end if;
  end if;
  -- Nested: PL/pgSQL may evaluate every part of an AND, and other tables have no is_active.
  if tg_table_name = 'devices' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['is_active', 'updated_at', 'updated_by'])
         = (to_jsonb(old) - array['is_active', 'updated_at', 'updated_by'])
       and not (to_jsonb(new) -> 'is_active')::boolean
    then
      return new;
    end if;
  end if;
  if not app.gym_writable() then
    raise exception using errcode = '42501', message = 'gym_read_only',
      detail = 'This gym is read-only: it is suspended, or its subscription or license has ended';
  end if;
  return coalesce(new, old);
end
$$;

-- The gym's side -----------------------------------------------------------------------------------------

-- The grant running now in a gym (none: a row of nulls).
create function app.running_support_grant(p_gym_id uuid)
returns public.support_grants
language sql
stable
security definer
set search_path = ''
as $$
  select g.* from public.support_grants g
   where g.gym_id = p_gym_id and g.revoked_at is null and g.starts_at <= now() and g.ends_at > now()
   order by g.ends_at desc
   limit 1
$$;

revoke execute on function app.running_support_grant(uuid) from public, anon, authenticated;

-- Lets Click Group read the gym's members for p_hours (1 to 168), with a reason. The same id again
-- returns the grant already saved. permission_denied (support.grant); support_offline;
-- invalid_request; reason_required; support_already_granted (one runs already: end it first).
create function public.grant_support_access(p_id uuid, p_hours integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  existing public.support_grants;
  saved public.support_grants;
begin
  if not app.has_permission('support.grant') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Letting Click Group in needs support.grant';
  end if;
  select * into existing from public.support_grants g where g.id = p_id;
  if found then
    if existing.gym_id <> gym then
      raise exception using errcode = '23505', message = 'grant_exists',
        detail = 'Another grant has this id';
    end if;
    return jsonb_build_object('id', existing.id, 'ends_at', existing.ends_at);
  end if;
  if (select g.edition from public.gyms g where g.id = gym) <> 'online' then
    raise exception using errcode = '23514', message = 'support_offline',
      detail = 'An offline gym''s data never reaches Click Group';
  end if;
  if p_id is null or p_hours is null or p_hours < 1 or p_hours > 168 then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A grant id, and 1 to 168 hours';
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 300) then
    raise exception using errcode = '22023', message = 'reason_required',
      detail = 'Letting Click Group in needs a reason';
  end if;
  if (app.running_support_grant(gym)).id is not null then
    raise exception using errcode = '23514', message = 'support_already_granted',
      detail = 'Click Group can already see this gym''s data; end that first';
  end if;
  insert into public.support_grants (id, gym_id, reason, starts_at, ends_at)
  values (p_id, gym, p_reason, now(), now() + make_interval(hours => p_hours))
  returning * into saved;
  return jsonb_build_object('id', saved.id, 'ends_at', saved.ends_at);
end
$$;

revoke execute on function public.grant_support_access(uuid, integer, text) from public, anon;
grant execute on function public.grant_support_access(uuid, integer, text) to authenticated;

-- Ends a grant now. One already over changes nothing. permission_denied (support.grant);
-- grant_not_found.
create function public.revoke_support_access(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_grant public.support_grants;
begin
  if not app.has_permission('support.grant') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Ending Click Group''s access needs support.grant';
  end if;
  select * into found_grant from public.support_grants g
   where g.id = p_id and g.gym_id = app.current_gym_id();
  if not found then
    raise exception using errcode = 'P0002', message = 'grant_not_found',
      detail = 'No grant with this id in your gym';
  end if;
  if found_grant.revoked_at is null and found_grant.ends_at > now() then
    update public.support_grants g set revoked_at = now(), revoked_by = auth.uid()
     where g.id = found_grant.id
    returning * into found_grant;
  end if;
  return jsonb_build_object('id', found_grant.id, 'ends_at', found_grant.ends_at,
    'revoked_at', found_grant.revoked_at);
end
$$;

revoke execute on function public.revoke_support_access(uuid) from public, anon;
grant execute on function public.revoke_support_access(uuid) to authenticated;

-- The seller's side ------------------------------------------------------------------------------------------

-- Gyms that let Click Group in now: the gym and the grant, no member data (so no read row).
-- not_platform_admin, mfa_required.
create function public.seller_support_gyms()
returns table (
  gym_id uuid,
  code text,
  name_ckb text,
  grant_id uuid,
  reason text,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select g.id, g.code, g.name_ckb, s.id, s.reason, s.starts_at, s.ends_at
      from public.gyms g
      join public.support_grants s on s.gym_id = g.id
     where s.revoked_at is null and s.starts_at <= now() and s.ends_at > now()
     order by s.ends_at;
end
$$;

revoke execute on function public.seller_support_gyms() from public, anon;
grant execute on function public.seller_support_gyms() to authenticated;

-- The grant a seller read uses, after the platform-admin check; support_not_granted without one.
create function app.require_support_grant(p_gym_id uuid)
returns public.support_grants
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  running public.support_grants;
begin
  perform app.require_platform_admin();
  running := app.running_support_grant(p_gym_id);
  if running.id is null then
    raise exception using errcode = '42501', message = 'support_not_granted',
      detail = 'This gym hasn''t let Click Group see its data, or the time is over';
  end if;
  return running;
end
$$;

revoke execute on function app.require_support_grant(uuid) from public, anon, authenticated;

-- Writes the read row of a seller read, in the caller's transaction.
create function app.log_support_read(
  p_grant public.support_grants,
  p_what text,
  p_member_id uuid,
  p_details jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- The gym's guards are for its staff (app.is_system_context); turned off again below.
  perform set_config('app.platform_write', 'on', true);
  insert into public.support_reads (gym_id, grant_id, admin_id, admin_email, what, member_id, details)
  values (
    p_grant.gym_id, p_grant.id, auth.uid(),
    (select u.email::text from auth.users u where u.id = auth.uid()),
    p_what, p_member_id, coalesce(p_details, '{}')
  );
  perform set_config('app.platform_write', 'off', true);
end
$$;

revoke execute on function app.log_support_read(public.support_grants, text, uuid, jsonb) from public, anon, authenticated;

-- A gym's members while it lets Click Group in: at most 50, by name, number or phone (p_search,
-- matched like the gym app's search). Written to support_reads. not_platform_admin, mfa_required;
-- support_not_granted.
create function public.seller_support_members(p_gym_id uuid, p_search text default null)
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
       where m.gym_id = p_gym_id and m.deleted_at is null
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
create function public.seller_support_member(p_gym_id uuid, p_member_id uuid)
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
   where m.id = p_member_id and m.gym_id = p_gym_id and m.deleted_at is null;
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

-- What Click Group read in a gym, for the seller panel (the gym sees support_reads itself): the
-- newest 200. A list of reads holds no member data, so it writes no read row. not_platform_admin,
-- mfa_required.
create function public.seller_support_reads(p_gym_id uuid)
returns table (
  read_at timestamptz,
  admin_email text,
  what text,
  member_id uuid,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select r.read_at, r.admin_email, r.what, r.member_id, r.details
      from public.support_reads r
     where r.gym_id = p_gym_id
     order by r.read_at desc
     limit 200;
end
$$;

revoke execute on function public.seller_support_reads(uuid) from public, anon;
grant execute on function public.seller_support_reads(uuid) to authenticated;
