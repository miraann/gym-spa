-- Notifications and scheduled jobs (Phase 9, step 9a; the Phase 9 plan in spec §8 of 2026-10-29).
-- Additions only. Nothing is ever sent by the server: staff open WhatsApp with a filled-in message
-- and press Send themselves (the user's decision of 2026-10-29).
--
--   * message_templates: the gym's own wording of the nine fixed templates, per language
--     (notifications.templates.manage). The defaults live in the app's translation files; a
--     language left empty uses its default.
--   * member_messages: append-only, one row each time staff open WhatsApp for a member
--     (notifications.send). Status 'opened', never 'sent': nobody knows whether it was sent.
--   * reminders: who should be contacted on a day and why, with a copy of what the message needs.
--     app.collect_reminders() makes them; pg_cron runs it every 15 minutes on the cloud, and the
--     reminders page runs it for its own gym (refresh_reminders), which is all the offline edition
--     has until its server gets a timer. Staff mark them done.
--   * staff_notifications and staff_notification_reads: the bell. The same job adds "today's
--     reminders are ready" (notifications.send) and "low stock" (inventory.adjust), per branch.
--   * The built-in Receptionist gets notifications.send in every gym.

-- Who sends reminders ------------------------------------------------------------------------------------------

insert into app.role_template_permissions (role_key, permission_key) values ('receptionist', 'notifications.send');
insert into public.role_permissions (gym_id, role_id, permission_key)
select r.gym_id, r.id, 'notifications.send'
  from public.roles r
 where r.key = 'receptionist' and r.is_system
on conflict do nothing;

-- Shared checks ----------------------------------------------------------------------------------------------

-- The nine templates (packages/core MESSAGE_TEMPLATE_KEYS keeps the same list).
create function app.is_message_template_key(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value in ('expiring_7', 'expiring_3', 'expiring_1', 'expired', 'installment_due', 'debt',
                   'spa_booking', 'welcome', 'birthday')
$$;

-- A message: 1 to p_max_length characters, no space at either end, line breaks and tabs allowed but
-- no other control characters.
create function app.is_message_text(value text, max_length integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is null
    or (length(value) between 1 and max_length and value !~ '^\s' and value !~ '\s$'
        and replace(replace(value, E'\n', ''), E'\t', '') !~ '[[:cntrl:]]')
$$;

-- Templates ----------------------------------------------------------------------------------------------------

create table public.message_templates (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  key text not null check (app.is_message_template_key(key)),
  -- Empty: that language's default (the app's translation files).
  body_ckb text check (app.is_message_text(body_ckb, 1000)),
  body_en text check (app.is_message_text(body_en, 1000)),
  body_ar text check (app.is_message_text(body_ar, 1000)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: "back to default" empties the texts.
  deleted_at timestamptz,
  constraint message_templates_id_gym_id_key unique (id, gym_id),
  constraint message_templates_gym_id_key_key unique (gym_id, key),
  constraint message_templates_gym_id_fkey foreign key (gym_id) references public.gyms (id),
  constraint message_templates_never_deleted check (deleted_at is null)
);

-- Reminders ----------------------------------------------------------------------------------------------------

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  member_id uuid not null,
  -- Which template it uses.
  kind text not null check (app.is_message_template_key(kind)),
  -- The day the member should be contacted (Baghdad).
  remind_on date not null,
  -- What it is about: the subscription (expiring, expired), the installment, the spa booking, or the
  -- member (debt, welcome, birthday). One reminder per kind, subject and day.
  subject_id uuid not null,
  -- A copy of what the message needs, made with the reminder: names in three languages, dates,
  -- amounts (packages/core ReminderDetails).
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  done_at timestamptz,
  done_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: reminders are the history.
  deleted_at timestamptz,
  constraint reminders_id_gym_id_key unique (id, gym_id),
  constraint reminders_once_key unique (gym_id, kind, subject_id, remind_on),
  constraint reminders_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint reminders_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint reminders_done check ((done_at is null) = (done_by is null)),
  constraint reminders_never_deleted check (deleted_at is null)
);

create index reminders_gym_id_remind_on_idx on public.reminders (gym_id, remind_on, branch_id);
create index reminders_branch_id_gym_id_idx on public.reminders (branch_id, gym_id);
create index reminders_member_id_gym_id_idx on public.reminders (member_id, gym_id, kind, remind_on);

-- The message log ----------------------------------------------------------------------------------------------

create table public.member_messages (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  -- Where it was opened (the device's branch).
  branch_id uuid not null,
  member_id uuid not null,
  -- The reminder it was for, if any.
  reminder_id uuid,
  -- The template it started from; empty: written by hand.
  template_key text check (app.is_message_template_key(template_key)),
  -- whatsapp_link: opened in WhatsApp, sent by staff. The others wait for a provider (not built).
  channel text not null default 'whatsapp_link' check (channel in ('whatsapp_link', 'whatsapp_api', 'sms')),
  status text not null default 'opened' check (status in ('opened', 'queued', 'sent', 'failed')),
  -- The number used, as stored on the member (+964...).
  phone text not null,
  -- The member has no phone of their own, so it went to the emergency contact.
  to_emergency_contact boolean not null,
  language public.language_code not null,
  body text not null check (app.is_message_text(body, 2000)),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: the log is the history.
  deleted_at timestamptz,
  constraint member_messages_id_gym_id_key unique (id, gym_id),
  constraint member_messages_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint member_messages_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint member_messages_reminder_id_gym_id_fkey foreign key (reminder_id, gym_id) references public.reminders (id, gym_id),
  constraint member_messages_never_deleted check (deleted_at is null)
);

create index member_messages_branch_id_gym_id_idx on public.member_messages (branch_id, gym_id);
create index member_messages_member_id_gym_id_idx on public.member_messages (member_id, gym_id, created_at desc);
create index member_messages_reminder_id_gym_id_idx on public.member_messages (reminder_id, gym_id) where reminder_id is not null;

-- Staff notifications ------------------------------------------------------------------------------------------

create table public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  branch_id uuid not null,
  -- reminders_ready: the branch has reminders today (staff with notifications.see them);
  -- low_stock: a product is at or below its level in the branch (inventory.adjust).
  kind text not null check (kind in ('reminders_ready', 'low_stock')),
  -- The branch (reminders_ready) or the product (low_stock). One per kind, subject and day.
  subject_id uuid not null,
  notify_on date not null,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: they are the history.
  deleted_at timestamptz,
  constraint staff_notifications_id_gym_id_key unique (id, gym_id),
  constraint staff_notifications_once_key unique (gym_id, kind, branch_id, subject_id, notify_on),
  constraint staff_notifications_branch_id_gym_id_fkey foreign key (branch_id, gym_id) references public.branches (id, gym_id),
  constraint staff_notifications_never_deleted check (deleted_at is null)
);

create index staff_notifications_branch_id_gym_id_idx on public.staff_notifications (branch_id, gym_id, notify_on desc);

create table public.staff_notification_reads (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default app.current_gym_id(),
  notification_id uuid not null,
  staff_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: a notification read stays read.
  deleted_at timestamptz,
  constraint staff_notification_reads_id_gym_id_key unique (id, gym_id),
  constraint staff_notification_reads_once_key unique (notification_id, staff_id),
  constraint staff_notification_reads_notification_id_gym_id_fkey foreign key (notification_id, gym_id)
    references public.staff_notifications (id, gym_id),
  constraint staff_notification_reads_staff_id_gym_id_fkey foreign key (staff_id, gym_id)
    references public.staff_users (id, gym_id),
  constraint staff_notification_reads_never_deleted check (deleted_at is null)
);

create index staff_notification_reads_notification_id_gym_id_idx on public.staff_notification_reads (notification_id, gym_id);
create index staff_notification_reads_staff_id_gym_id_idx on public.staff_notification_reads (staff_id, gym_id);

-- Never the walk-in customer (step 8g).
create trigger not_walk_in before insert or update of member_id on public.reminders
  for each row execute function app.guard_not_walk_in('member_id');
create trigger not_walk_in before insert or update of member_id on public.member_messages
  for each row execute function app.guard_not_walk_in('member_id');

-- Triggers and row level security --------------------------------------------------------------------------

create trigger check_writable before insert or update or delete on public.message_templates
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.message_templates
  for each row execute function app.read_only_columns('id', 'gym_id', 'key', 'created_at', 'created_by');
create trigger stamp before insert or update on public.message_templates
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.message_templates
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.reminders
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.reminders
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_id', 'kind', 'remind_on', 'subject_id', 'details', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.reminders
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.reminders
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.member_messages
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.member_messages
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'member_id', 'reminder_id', 'template_key', 'channel', 'phone',
    'to_emergency_contact', 'language', 'body', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.member_messages
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.member_messages
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.staff_notifications
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.staff_notifications
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'branch_id', 'kind', 'subject_id', 'notify_on', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.staff_notifications
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.staff_notifications
  for each row execute function app.audit_row();

create trigger check_writable before insert or update or delete on public.staff_notification_reads
  for each row execute function app.check_gym_writable();
create trigger read_only before update on public.staff_notification_reads
  for each row execute function app.read_only_columns(
    'id', 'gym_id', 'notification_id', 'staff_id', 'created_at', 'created_by'
  );
create trigger stamp before insert or update on public.staff_notification_reads
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.staff_notification_reads
  for each row execute function app.audit_row();

alter table public.message_templates enable row level security;
alter table public.reminders enable row level security;
alter table public.member_messages enable row level security;
alter table public.staff_notifications enable row level security;
alter table public.staff_notification_reads enable row level security;

revoke all on table public.message_templates, public.reminders, public.member_messages,
  public.staff_notifications, public.staff_notification_reads from anon, authenticated;
grant all on table public.message_templates, public.reminders, public.member_messages,
  public.staff_notifications, public.staff_notification_reads to service_role;
-- Only the functions below write them.
grant select on table public.message_templates, public.reminders, public.member_messages,
  public.staff_notifications, public.staff_notification_reads to authenticated;

create policy "staff who send messages or edit them see the templates" on public.message_templates
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and ((select app.has_permission('notifications.send')) or (select app.has_permission('notifications.templates.manage')))
  );

create policy "staff who send messages see their branches' reminders" on public.reminders
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and branch_id in (select app.accessible_branch_ids())
    and (select app.has_permission('notifications.send'))
  );

create policy "staff who send messages see their branches' messages" on public.member_messages
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and branch_id in (select app.accessible_branch_ids())
    and (select app.has_permission('notifications.send'))
  );

create policy "staff see their branches' notifications for what they do" on public.staff_notifications
  for select to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and branch_id in (select app.accessible_branch_ids())
    and (
      (kind = 'reminders_ready' and (select app.has_permission('notifications.send')))
      or (kind = 'low_stock' and (select app.has_permission('inventory.adjust')))
    )
  );

create policy "staff see what they read" on public.staff_notification_reads
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and staff_id = (select auth.uid()));

-- Templates: saving ------------------------------------------------------------------------------------------

-- The gym's wording of one template; an empty language uses its default, and all three empty is
-- "back to default". permission_denied (notifications.templates.manage); invalid_template.
create function public.save_message_template(
  p_key text,
  p_body_ckb text default null,
  p_body_en text default null,
  p_body_ar text default null
)
returns public.message_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.message_templates;
begin
  if not app.has_permission('notifications.templates.manage') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Templates are edited with notifications.templates.manage';
  end if;
  if not coalesce(app.is_message_template_key(p_key), false)
     or not app.is_message_text(p_body_ckb, 1000) or not app.is_message_text(p_body_en, 1000)
     or not app.is_message_text(p_body_ar, 1000) then
    raise exception using errcode = '22023', message = 'invalid_template',
      detail = 'One of the nine keys, and texts of up to 1,000 characters';
  end if;
  insert into public.message_templates as t (id, gym_id, key, body_ckb, body_en, body_ar)
  values (gen_random_uuid(), app.current_gym_id(), p_key, p_body_ckb, p_body_en, p_body_ar)
  on conflict (gym_id, key) do update
    set body_ckb = excluded.body_ckb, body_en = excluded.body_en, body_ar = excluded.body_ar
  returning * into saved;
  return saved;
end
$$;

revoke execute on function public.save_message_template(text, text, text, text) from public, anon;
grant execute on function public.save_message_template(text, text, text, text) to authenticated;

-- Collecting reminders ---------------------------------------------------------------------------------------

-- Names in three languages, as the details of a reminder keep them.
create function app.names_json(p_ckb text, p_en text, p_ar text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ckb', p_ckb, 'en', p_en, 'ar', p_ar)
$$;

-- Makes the reminders and staff notifications of p_today (Baghdad) for one gym, or for every gym
-- that may still change data (active or grace) when p_gym_id is empty, and returns how many
-- reminders it added. Running it again the same day adds only what is new. Runs without a staff
-- session (pg_cron, the offline server's timer later) and from refresh_reminders().
create function app.collect_reminders(
  p_gym_id uuid default null,
  p_today date default (now() at time zone 'Asia/Baghdad')::date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym_ids uuid[] := array(
    select g.id from public.gyms g
     where (p_gym_id is null or g.id = p_gym_id) and app.gym_access(g) in ('active', 'grace')
  );
  added integer;
begin

  with
  -- Members who get messages: not the walk-in customer, not deleted.
  people as (
    select m.* from public.members m
     where m.gym_id = any (gym_ids) and m.deleted_at is null and not m.is_walk_in
  ),
  -- Each member's membership end, as membership_ends_on() on p_today: the last day of the running
  -- and coming subscriptions; none when one of them has no end.
  ends as (
    select s.member_id, s.gym_id,
           case when bool_or(s.end_date is null) then null else max(s.end_date) end as ends_on
      from public.subscriptions s
     where s.gym_id = any (gym_ids) and s.status = 'active' and (s.end_date is null or s.end_date >= p_today)
       and (s.visit_count is null or app.subscription_used_visits(s.id) < s.visit_count)
     group by s.member_id, s.gym_id
  ),
  expiring as (
    select p.gym_id, p.branch_id, p.id as member_id,
           'expiring_' || (e.ends_on - p_today) as kind, last_one.id as subject_id,
           jsonb_build_object('plan', app.names_json(last_one.name_ckb, last_one.name_en, last_one.name_ar),
                              'end_date', e.ends_on, 'days', e.ends_on - p_today) as details
      from people p
      join ends e on e.member_id = p.id and e.gym_id = p.gym_id
      cross join lateral (
        select s.id, s.name_ckb, s.name_en, s.name_ar from public.subscriptions s
         where s.member_id = p.id and s.gym_id = p.gym_id and s.status = 'active' and s.end_date = e.ends_on
         order by s.start_date desc, s.id
         limit 1
      ) last_one
     where p.status = 'active' and not p.is_guest
       and e.ends_on - p_today in (7, 3, 1)
       and not exists (
         select 1 from public.subscription_freezes f
           join public.subscriptions s on s.id = f.subscription_id and s.gym_id = f.gym_id
          where s.member_id = p.id and s.gym_id = p.gym_id and s.status = 'active'
            and f.start_date <= p_today and p_today < coalesce(f.ended_on, f.end_date + 1)
       )
  ),
  expired as (
    select p.gym_id, p.branch_id, p.id as member_id, 'expired' as kind, last_one.id as subject_id,
           jsonb_build_object('plan', app.names_json(last_one.name_ckb, last_one.name_en, last_one.name_ar),
                              'end_date', last_one.end_date) as details
      from people p
      cross join lateral (
        select s.id, s.name_ckb, s.name_en, s.name_ar, s.end_date from public.subscriptions s
         where s.member_id = p.id and s.gym_id = p.gym_id and s.status = 'active' and s.end_date = p_today - 1
         order by s.start_date desc, s.id
         limit 1
      ) last_one
     where p.status = 'active' and not p.is_guest
       and not exists (select 1 from ends e where e.member_id = p.id and e.gym_id = p.gym_id)
  ),
  installments_due as (
    select p.gym_id, v.branch_id, p.id as member_id, 'installment_due' as kind, i.installment_id as subject_id,
           jsonb_build_object('amount', i.amount - i.paid, 'due_date', i.due_date) as details
      from public.installment_balances i
      join public.invoices v on v.id = i.invoice_id and v.gym_id = i.gym_id
      join people p on p.id = v.member_id and p.gym_id = v.gym_id
     where i.due_date = p_today + 3 and i.paid < i.amount and not i.voided
       and p.status in ('active', 'suspended')
  ),
  debts as (
    select p.gym_id, p.branch_id, p.id as member_id, 'debt' as kind, p.id as subject_id,
           jsonb_build_object('amount', d.owed_now) as details
      from public.member_debts d
      join people p on p.id = d.member_id and p.gym_id = d.gym_id
     where d.owed_now > 0 and p.status in ('active', 'suspended')
       and not exists (
         select 1 from public.reminders r
          where r.gym_id = p.gym_id and r.member_id = p.id and r.kind = 'debt'
            and r.remind_on > p_today - 7 and r.remind_on <> p_today
       )
  ),
  spa as (
    select p.gym_id, b.branch_id, p.id as member_id, 'spa_booking' as kind, b.id as subject_id,
           jsonb_build_object('service', app.names_json(b.name_ckb, b.name_en, b.name_ar),
                              'starts_at', b.starts_at) as details
      from public.spa_bookings b
      join people p on p.id = b.member_id and p.gym_id = b.gym_id
     where b.status in ('booked', 'confirmed')
       and (b.starts_at at time zone 'Asia/Baghdad')::date = p_today + 1
       and p.status not in ('banned', 'archived')
  ),
  welcome as (
    select p.gym_id, p.branch_id, p.id as member_id, 'welcome' as kind, p.id as subject_id,
           '{}'::jsonb as details
      from people p
     where p.status = 'active' and not p.is_guest and p.import_id is null
       and (p.created_at at time zone 'Asia/Baghdad')::date = p_today
  ),
  birthdays as (
    select p.gym_id, p.branch_id, p.id as member_id, 'birthday' as kind, p.id as subject_id,
           '{}'::jsonb as details
      from people p
     where p.status = 'active' and not p.is_guest and p.birth_date is not null
       and (
         (extract(month from p.birth_date), extract(day from p.birth_date))
           = (extract(month from p_today), extract(day from p_today))
         or (extract(month from p.birth_date) = 2 and extract(day from p.birth_date) = 29
             and extract(month from p_today) = 2 and extract(day from p_today) = 28
             and extract(day from (date_trunc('month', p_today) + interval '1 month - 1 day')) = 28)
       )
  ),
  wanted as (
    select * from expiring union all select * from expired union all select * from installments_due
    union all select * from debts union all select * from spa union all select * from welcome
    union all select * from birthdays
  ),
  inserted as (
    insert into public.reminders (gym_id, branch_id, member_id, kind, remind_on, subject_id, details)
    select w.gym_id, w.branch_id, w.member_id, w.kind, p_today, w.subject_id, w.details from wanted w
    on conflict (gym_id, kind, subject_id, remind_on) do nothing
    returning 1
  )
  select count(*)::integer into added from inserted;

  -- The bell: today's reminders per branch (the count kept up to date through the day).
  insert into public.staff_notifications as n (gym_id, branch_id, kind, subject_id, notify_on, details)
  select r.gym_id, r.branch_id, 'reminders_ready', r.branch_id, p_today, jsonb_build_object('count', count(*))
    from public.reminders r
   where r.gym_id = any (gym_ids) and r.remind_on = p_today
   group by r.gym_id, r.branch_id
  on conflict (gym_id, kind, branch_id, subject_id, notify_on) do update
    set details = excluded.details
    where n.details is distinct from excluded.details;

  -- The bell: products at or below their level in a branch that keeps them.
  insert into public.staff_notifications (gym_id, branch_id, kind, subject_id, notify_on, details)
  select s.gym_id, s.branch_id, 'low_stock', p.id, p_today,
         jsonb_build_object('product', app.names_json(p.name_ckb, p.name_en, p.name_ar),
                            'quantity', sum(s.quantity), 'level', p.low_stock_level)
    from public.stock_movements s
    join public.products p on p.id = s.product_id and p.gym_id = s.gym_id
    join public.branches b on b.id = s.branch_id and b.gym_id = s.gym_id
   where s.gym_id = any (gym_ids) and p.track_stock and p.is_active and p.deleted_at is null and p.low_stock_level is not null
     and b.is_active and b.deleted_at is null
   group by s.gym_id, s.branch_id, p.id
  having sum(s.quantity) <= p.low_stock_level
  on conflict (gym_id, kind, branch_id, subject_id, notify_on) do nothing;

  return added;
end
$$;

revoke execute on function app.collect_reminders(uuid, date) from public, anon, authenticated;

-- The caller's gym's reminders of today, collected now: the reminders page calls it when it opens
-- (the offline edition has no pg_cron). Returns how many were added. permission_denied
-- (notifications.send).
create function public.refresh_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('notifications.send') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Reminders are seen with notifications.send';
  end if;
  return app.collect_reminders(app.current_gym_id());
end
$$;

revoke execute on function public.refresh_reminders() from public, anon;
grant execute on function public.refresh_reminders() to authenticated;

-- Every 15 minutes on the cloud. Skipped where pg_cron isn't installed (the offline edition's
-- Postgres for Windows); cron.schedule with a name replaces a job of the same name.
do $$
begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('collect-reminders', '*/15 * * * *', 'select app.collect_reminders()');
  end if;
end
$$;

-- Working through the list -------------------------------------------------------------------------------------

-- Marks a reminder done (p_done) or not done again. permission_denied (notifications.send);
-- reminder_not_found (not in the caller's branches).
create function public.set_reminder_done(p_id uuid, p_done boolean)
returns public.reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.reminders;
begin
  if not app.has_permission('notifications.send') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Reminders are worked through with notifications.send';
  end if;
  update public.reminders r
     set done_at = case when p_done then coalesce(r.done_at, now()) end,
         done_by = case when p_done then coalesce(r.done_by, auth.uid()) end
   where r.id = p_id and r.gym_id = app.current_gym_id() and app.has_branch_access(r.branch_id)
  returning * into saved;
  if not found then
    raise exception using errcode = 'P0002', message = 'reminder_not_found',
      detail = 'No reminder with this id in your branches';
  end if;
  return saved;
end
$$;

revoke execute on function public.set_reminder_done(uuid, boolean) from public, anon;
grant execute on function public.set_reminder_done(uuid, boolean) to authenticated;

-- Writes down that staff opened WhatsApp for a member in p_branch_id (p_id made by the app; the same
-- id again returns what was saved). p_phone must be the member's phone, or the emergency contact's
-- when the member has none. permission_denied (notifications.send); no_branch_access;
-- member_not_found; reminder_not_found; wrong_phone; invalid_message; message_exists.
create function public.record_message_opened(
  p_id uuid,
  p_branch_id uuid,
  p_member_id uuid,
  p_phone text,
  p_language public.language_code,
  p_body text,
  p_template_key text default null,
  p_reminder_id uuid default null
)
returns public.member_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  member public.members;
  saved public.member_messages;
begin
  if not app.has_permission('notifications.send') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Messages are opened with notifications.send';
  end if;
  select * into saved from public.member_messages m where m.id = p_id;
  if found then
    if saved.gym_id = gym and saved.created_by = auth.uid() and saved.member_id = p_member_id then
      return saved;
    end if;
    raise exception using errcode = '23505', message = 'message_exists',
      detail = 'Another message has this id';
  end if;
  if not app.has_branch_access(p_branch_id) then
    raise exception using errcode = '42501', message = 'no_branch_access',
      detail = 'Only in your own branches';
  end if;
  select * into member from public.members m
   where m.id = p_member_id and m.gym_id = gym and m.deleted_at is null and not m.is_walk_in;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if p_reminder_id is not null and not exists (
    select 1 from public.reminders r
     where r.id = p_reminder_id and r.gym_id = gym and r.member_id = member.id and app.has_branch_access(r.branch_id)
  ) then
    raise exception using errcode = 'P0002', message = 'reminder_not_found',
      detail = 'No reminder of this member in your branches';
  end if;
  if p_phone is null or p_phone is distinct from coalesce(member.phone, member.emergency_phone) then
    raise exception using errcode = '23514', message = 'wrong_phone',
      detail = 'The member''s phone, or the emergency contact''s when the member has none';
  end if;
  if p_language is null or p_body is null or not app.is_message_text(p_body, 2000)
     or (p_template_key is not null and not app.is_message_template_key(p_template_key)) then
    raise exception using errcode = '22023', message = 'invalid_message',
      detail = 'A language, a text of up to 2,000 characters and one of the nine template keys';
  end if;
  insert into public.member_messages (id, gym_id, branch_id, member_id, reminder_id, template_key, phone,
                                      to_emergency_contact, language, body)
  values (p_id, gym, p_branch_id, member.id, p_reminder_id, p_template_key, p_phone,
          member.phone is null, p_language, p_body)
  returning * into saved;
  return saved;
end
$$;

revoke execute on function public.record_message_opened(uuid, uuid, uuid, text, public.language_code, text, text, uuid) from public, anon;
grant execute on function public.record_message_opened(uuid, uuid, uuid, text, public.language_code, text, text, uuid) to authenticated;

-- What a message to a member written now can say, as reminders keep it (packages/core
-- ReminderDetails): the plan and end of the running membership, what is owed now, the next unpaid
-- installment, the next spa booking. As the caller, so it holds only what they may see (no money
-- without payments.view). permission_denied (notifications.send); member_not_found.
create function public.member_message_details(p_member_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  member public.members;
  today date := (now() at time zone 'Asia/Baghdad')::date;
  ends_on date;
  plan jsonb;
  owed numeric;
  next_installment record;
  next_booking record;
begin
  if not app.has_permission('notifications.send') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Messages are written with notifications.send';
  end if;
  select * into member from public.members m where m.id = p_member_id and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id that you may see';
  end if;
  ends_on := public.membership_ends_on(member);
  select app.names_json(s.name_ckb, s.name_en, s.name_ar) into plan
    from public.subscriptions s
   where s.member_id = member.id and s.status = 'active' and (s.end_date is null or s.end_date >= today)
   order by s.end_date desc nulls first, s.start_date desc
   limit 1;
  select d.owed_now into owed from public.member_debts d where d.member_id = member.id;
  select i.amount - i.paid as amount, i.due_date into next_installment
    from public.installment_balances i
    join public.invoices v on v.id = i.invoice_id
   where v.member_id = member.id and not i.voided and i.paid < i.amount
   order by i.due_date
   limit 1;
  select b.name_ckb, b.name_en, b.name_ar, b.starts_at into next_booking
    from public.spa_bookings b
   where b.member_id = member.id and b.status in ('booked', 'confirmed') and b.starts_at >= now()
   order by b.starts_at
   limit 1;
  return jsonb_strip_nulls(jsonb_build_object(
    'plan', plan,
    'end_date', ends_on,
    'days', ends_on - today,
    'amount', coalesce(next_installment.amount, case when owed > 0 then owed end),
    'due_date', next_installment.due_date,
    'service', case when next_booking.starts_at is not null
                 then app.names_json(next_booking.name_ckb, next_booking.name_en, next_booking.name_ar) end,
    'starts_at', next_booking.starts_at
  ));
end
$$;

revoke execute on function public.member_message_details(uuid) from public, anon;
grant execute on function public.member_message_details(uuid) to authenticated;

-- The bell ---------------------------------------------------------------------------------------------------

-- Marks notifications read for the caller: those they see (as the select policy); others are
-- skipped. Returns how many were new.
create function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  with visible as (
    select n.id, n.gym_id from public.staff_notifications n
     where n.id = any (p_ids) and n.gym_id = app.current_gym_id() and app.has_branch_access(n.branch_id)
       and ((n.kind = 'reminders_ready' and app.has_permission('notifications.send'))
            or (n.kind = 'low_stock' and app.has_permission('inventory.adjust')))
  ), inserted as (
    insert into public.staff_notification_reads (gym_id, notification_id, staff_id)
    select v.gym_id, v.id, auth.uid() from visible v
    on conflict (notification_id, staff_id) do nothing
    returning 1
  )
  select count(*)::integer into added from inserted;
  return added;
end
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
