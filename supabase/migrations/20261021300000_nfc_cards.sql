-- NFC cards (Phase 2, step 2d; spec §1, decided by the user on 2026-10-19, with decision 6).
-- Additions only.
--
--   * The UID is the card's identity: uppercase hex without separators, 4, 7 or 10 bytes. The
--     user's cards are NTAG215 clones with 7-byte UIDs; 4-byte cards and readers that type a
--     10-digit decimal number work too. app.normalize_card_uid() turns what a reader gives into
--     that form; the app has the same rules (normalizeCardUid() in packages/core/src/cards.ts),
--     and a test runs the same cases through both.
--   * One row per time a card was a member's: their card history. A member has at most one
--     active card, and a UID is active or blocked at most once per gym (two gyms' cards may share
--     a UID). Unique indexes decide, so two staff giving one card to two members at the same
--     moment can't both succeed.
--   * Lost or damaged: the card stops working at once; the new card can be given in the same step
--     (replace_card). Stolen: the card is also blocked (cards.blacklist), and nobody can be given
--     it until a manager unblocks it. Returned (end_card), or the member is archived: the card can
--     be given to someone else. A manager can also block a card that was lost or returned.
--   * Staff with members.view see cards; cards.manage gives, replaces and ends them;
--     cards.blacklist blocks and unblocks. A read-only gym changes no cards. Cards are never
--     deleted.
--   * The replacement fee comes with payments (Phase 3): replaces_id links a new card to the one
--     it replaced.

-- Rules shared with the app -------------------------------------------------------------------

-- A card UID as stored (normalizeCardUid() in packages/core), or null when it isn't one:
--   * hex, with or without separators (spaces, : or -), in any case: 04:a2:3b:c1:5d:6e:80;
--   * exactly 10 digits: a decimal number of 4 bytes, as some readers type it (0000000255);
--   * reversed: the reader gives the bytes in reverse order (some keyboard-type readers); they
--     are turned around, so the card has one UID whichever reader read it.
-- Kurdish and Arabic digits count as 0-9. A UID of only 0 or only F bytes is refused: some readers
-- give that when a read fails.
create function app.normalize_card_uid(value text, reversed boolean default false)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with typed as (
    select btrim(translate(value, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), E' \t\r\n') as text
  ),
  hex as (
    select case
      when t.text ~ '^[0-9]{10}$' then
        case when t.text::bigint <= 4294967295 then lpad(upper(to_hex(t.text::bigint)), 8, '0') end
      when regexp_replace(t.text, '[ \t\r\n:-]', '', 'g') ~ '^([0-9A-Fa-f]{8}|[0-9A-Fa-f]{14}|[0-9A-Fa-f]{20})$' then
        upper(regexp_replace(t.text, '[ \t\r\n:-]', '', 'g'))
    end as uid
    from typed t
  )
  select case
    when h.uid is null or h.uid ~ '^(0+|F+)$' then null
    when coalesce(reversed, false) then
      (select string_agg(substr(h.uid, b.i, 2), '' order by b.i desc) from generate_series(1, length(h.uid), 2) as b (i))
    else h.uid
  end
  from hex h
$$;

-- Cards ---------------------------------------------------------------------------------------

create table public.nfc_cards (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  member_id uuid not null,
  -- As app.normalize_card_uid() writes it.
  uid text not null check (app.normalize_card_uid(uid) is not distinct from uid),
  -- active: the member's card. ended: no longer theirs; anyone may be given it. blocked: nobody
  -- may use it or be given it until it is unblocked.
  status text not null default 'active' check (status in ('active', 'ended', 'blocked')),
  -- The card this one replaced (replace_card).
  replaces_id uuid,
  -- Why it stopped being the member's card, and when; empty while it is active.
  --   blocked: a manager blocked it while the member had it (block_card).
  --   member_archived: the member was archived.
  end_reason text check (end_reason in ('returned', 'lost', 'damaged', 'stolen', 'blocked', 'member_archived')),
  ended_at timestamptz,
  ended_by uuid,
  -- Set when it is blocked (a reported theft needs no reason). Kept after unblocking, for the
  -- history; blocking again starts over.
  block_reason text check (app.is_clean_text(block_reason, 300)),
  blocked_at timestamptz,
  blocked_by uuid,
  unblocked_at timestamptz,
  unblocked_by uuid,
  -- When the member was given the card (the server's time for staff).
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: cards are never deleted. Here for the shape every table has.
  deleted_at timestamptz,
  constraint nfc_cards_id_gym_id_key unique (id, gym_id),
  constraint nfc_cards_member_id_gym_id_fkey foreign key (member_id, gym_id) references public.members (id, gym_id),
  constraint nfc_cards_replaces_id_gym_id_fkey foreign key (replaces_id, gym_id) references public.nfc_cards (id, gym_id),
  constraint nfc_cards_ended check ((status = 'active') = (end_reason is null) and (end_reason is null) = (ended_at is null)),
  constraint nfc_cards_blocked check (
    (status = 'blocked') = (blocked_at is not null and unblocked_at is null)
    and (unblocked_at is null or blocked_at is not null)
    and (blocked_at is null or block_reason is not null or end_reason = 'stolen')
    and (end_reason is distinct from 'stolen' or blocked_at is not null)
  )
);

-- A UID is active or blocked at most once per gym; a member has at most one active card. The
-- functions below turn these into card_in_use, card_blocked and member_has_card.
create unique index nfc_cards_uid_in_use_key on public.nfc_cards (gym_id, uid) where status in ('active', 'blocked');
create unique index nfc_cards_member_active_key on public.nfc_cards (gym_id, member_id) where status = 'active';
-- A UID's history (find_card) and a member's cards.
create index nfc_cards_gym_id_uid_idx on public.nfc_cards (gym_id, uid, created_at desc);
create index nfc_cards_member_id_gym_id_idx on public.nfc_cards (member_id, gym_id);
create index nfc_cards_replaces_id_gym_id_idx on public.nfc_cards (replaces_id, gym_id);

comment on column public.nfc_cards.uid is 'The card''s UID: uppercase hex, 4, 7 or 10 bytes (app.normalize_card_uid). Its identity.';

-- Guards --------------------------------------------------------------------------------------

-- BEFORE INSERT OR UPDATE on nfc_cards. Staff change cards only in these steps, and the server
-- writes when and who (the row's own values are ignored):
--   new card: active, given now, to a member who isn't archived (cards.manage, checked by RLS);
--   active → ended: returned, lost or damaged (cards.manage); member_archived only from the
--     trigger that archives the member;
--   active → blocked: stolen, or blocked with a reason (cards.blacklist);
--   ended → blocked: with a reason, and only the card's latest row: once the card was given to
--     someone else, it is blocked from there (cards.blacklist);
--   blocked → ended: unblocked (cards.blacklist).
-- Nothing else about a card changes.
create function app.guard_nfc_cards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The columns the steps change; created_* and updated_* are the stamp trigger's.
  step_columns constant text[] := array[
    'status', 'end_reason', 'ended_at', 'ended_by', 'block_reason', 'blocked_at', 'blocked_by',
    'unblocked_at', 'unblocked_by', 'created_at', 'created_by', 'updated_at', 'updated_by'
  ];
begin
  if app.is_system_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from public.members m where m.id = new.member_id and m.gym_id = new.gym_id and m.status = 'archived') then
      raise exception using errcode = '42501', message = 'member_archived',
        detail = 'An archived member can''t be given a card; restore them first';
    end if;
    if new.replaces_id is not null and not exists (
      select 1 from public.nfc_cards c
       where c.id = new.replaces_id and c.gym_id = new.gym_id and c.member_id = new.member_id and c.status <> 'active'
    ) then
      raise exception using errcode = '42501', message = 'invalid_card_change',
        detail = 'A new card replaces one of the same member''s cards that no longer works';
    end if;
    new.status := 'active';
    new.end_reason := null;
    new.ended_at := null;
    new.ended_by := null;
    new.block_reason := null;
    new.blocked_at := null;
    new.blocked_by := null;
    new.unblocked_at := null;
    new.unblocked_by := null;
    new.created_at := now();
    return new;
  end if;

  if (to_jsonb(new) - step_columns) is distinct from (to_jsonb(old) - step_columns) then
    raise exception using errcode = '42501', message = 'invalid_card_change',
      detail = 'Only a card''s status changes, through its steps';
  end if;

  if old.status = 'active' and new.status = 'ended' then
    if new.end_reason = 'member_archived' then
      if pg_trigger_depth() < 2 then
        raise exception using errcode = '42501', message = 'invalid_card_change',
          detail = 'member_archived is set when the member is archived';
      end if;
    elsif new.end_reason in ('returned', 'lost', 'damaged') then
      if not app.has_permission('cards.manage') then
        raise exception using errcode = '42501', message = 'permission_denied',
          detail = 'Ending a card needs cards.manage';
      end if;
    else
      raise exception using errcode = '42501', message = 'invalid_card_change',
        detail = 'A card ends as returned, lost or damaged';
    end if;
    new.ended_at := now();
    new.ended_by := auth.uid();
    new.block_reason := old.block_reason;
    new.blocked_at := old.blocked_at;
    new.blocked_by := old.blocked_by;
    new.unblocked_at := old.unblocked_at;
    new.unblocked_by := old.unblocked_by;
  elsif new.status = 'blocked' and old.status in ('active', 'ended') then
    if not app.has_permission('cards.blacklist') then
      raise exception using errcode = '42501', message = 'permission_denied',
        detail = 'Blocking a card needs cards.blacklist';
    end if;
    if old.status = 'active' then
      if new.end_reason is null or new.end_reason not in ('stolen', 'blocked') then
        raise exception using errcode = '42501', message = 'invalid_card_change',
          detail = 'A working card is blocked as stolen, or blocked with a reason';
      end if;
      if new.end_reason = 'stolen' then
        new.block_reason := null;
      end if;
      new.ended_at := now();
      new.ended_by := auth.uid();
    else
      if exists (
        select 1 from public.nfc_cards c
         where c.gym_id = old.gym_id and c.uid = old.uid and c.id <> old.id and c.created_at >= old.created_at
      ) then
        raise exception using errcode = '23514', message = 'card_reassigned',
          detail = 'The card was given to someone else afterwards; block it from there';
      end if;
      new.end_reason := old.end_reason;
      new.ended_at := old.ended_at;
      new.ended_by := old.ended_by;
    end if;
    if new.block_reason is null and new.end_reason <> 'stolen' then
      raise exception using errcode = '23514', message = 'reason_required',
        detail = 'Blocking a card needs a reason';
    end if;
    new.blocked_at := now();
    new.blocked_by := auth.uid();
    new.unblocked_at := null;
    new.unblocked_by := null;
  elsif old.status = 'blocked' and new.status = 'ended' then
    if not app.has_permission('cards.blacklist') then
      raise exception using errcode = '42501', message = 'permission_denied',
        detail = 'Unblocking a card needs cards.blacklist';
    end if;
    new.end_reason := old.end_reason;
    new.ended_at := old.ended_at;
    new.ended_by := old.ended_by;
    new.block_reason := old.block_reason;
    new.blocked_at := old.blocked_at;
    new.blocked_by := old.blocked_by;
    new.unblocked_at := now();
    new.unblocked_by := auth.uid();
  elsif (to_jsonb(new) - array['created_at', 'created_by', 'updated_at', 'updated_by'])
        is distinct from (to_jsonb(old) - array['created_at', 'created_by', 'updated_at', 'updated_by']) then
    raise exception using errcode = '42501', message = 'invalid_card_change',
      detail = format('A card doesn''t go from %s to %s, nor change otherwise', old.status, new.status);
  end if;
  return new;
end
$$;

-- AFTER UPDATE on members: archiving a member ends their card, so it can be given to someone else.
-- As the table's owner, so archiving needs members.delete only (the guard allows this one step
-- from here).
create function app.end_card_of_archived_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nfc_cards c
     set status = 'ended', end_reason = 'member_archived', ended_at = now(), ended_by = auth.uid()
   where c.member_id = new.id and c.gym_id = new.gym_id and c.status = 'active';
  return null;
end
$$;

create trigger end_card after update of status on public.members
  for each row when (new.status = 'archived' and old.status is distinct from 'archived')
  execute function app.end_card_of_archived_member();

-- BEFORE triggers run in name order: check_writable, guard, read_only, stamp.
create trigger check_writable before insert or update or delete on public.nfc_cards
  for each row execute function app.check_gym_writable();
create trigger guard before insert or update on public.nfc_cards
  for each row execute function app.guard_nfc_cards();
create trigger read_only before update on public.nfc_cards
  for each row execute function app.read_only_columns('id', 'gym_id', 'member_id', 'uid', 'replaces_id');
create trigger stamp before insert or update on public.nfc_cards
  for each row execute function app.stamp_row();
create trigger audit after insert or update or delete on public.nfc_cards
  for each row execute function app.audit_row();

-- Row level security --------------------------------------------------------------------------

alter table public.nfc_cards enable row level security;

revoke all on table public.nfc_cards from anon, authenticated;
grant all on table public.nfc_cards to service_role;
-- Never deleted: a card's rows are its history.
grant select, insert, update on table public.nfc_cards to authenticated;

create policy "staff with members.view see cards" on public.nfc_cards
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

create policy "staff with cards.manage give cards" on public.nfc_cards
  for insert to authenticated
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('cards.manage')));

-- The guard decides which steps: ending needs cards.manage, blocking and unblocking cards.blacklist.
create policy "staff with cards.manage or cards.blacklist change cards" on public.nfc_cards
  for update to authenticated
  using (
    gym_id = (select app.current_gym_id())
    and ((select app.has_permission('cards.manage')) or (select app.has_permission('cards.blacklist')))
  )
  with check (
    gym_id = (select app.current_gym_id())
    and ((select app.has_permission('cards.manage')) or (select app.has_permission('cards.blacklist')))
  );

-- RPCs ----------------------------------------------------------------------------------------
-- As the caller (security invoker): RLS, the guards and the audit log apply. They take the UID as
-- the app read it, in the card's own byte order (the app turns a reversed reader's UID around
-- first, normalizeCardUid()), and store it normalized. The screens read a member's cards straight
-- from the table.

-- Gives a member a card (p_id made by the app), checked in this order: the same id again says
-- card_exists (a retry after a lost answer); a UID that isn't one, invalid_card_uid; a blocked
-- one, card_blocked; one that is someone's (this member's too), card_in_use; a member who already
-- has a card, member_has_card. Two saves at the same moment are decided by the unique indexes,
-- with the same keys. Used by assign_card() and replace_card().
create function app.give_card(p_id uuid, p_member_id uuid, p_uid text, p_replaces_id uuid default null)
returns public.nfc_cards
language plpgsql
set search_path = ''
as $$
declare
  card_uid text := app.normalize_card_uid(p_uid);
  given public.nfc_cards;
  failed_constraint text;
begin
  if exists (select 1 from public.nfc_cards c where c.id = p_id) then
    raise exception using errcode = '23505', message = 'card_exists',
      detail = 'A card with this id was already saved';
  end if;
  if card_uid is null then
    raise exception using errcode = '22023', message = 'invalid_card_uid',
      detail = 'A card UID is 4, 7 or 10 bytes of hex, or 10 digits';
  end if;
  if exists (select 1 from public.nfc_cards c where c.uid = card_uid and c.status = 'blocked') then
    raise exception using errcode = '23505', message = 'card_blocked',
      detail = 'This card is blocked; a manager must unblock it first';
  end if;
  if exists (select 1 from public.nfc_cards c where c.uid = card_uid and c.status = 'active') then
    raise exception using errcode = '23505', message = 'card_in_use',
      detail = 'This card is a member''s card';
  end if;
  if exists (select 1 from public.nfc_cards c where c.member_id = p_member_id and c.status = 'active') then
    raise exception using errcode = '23505', message = 'member_has_card',
      detail = 'The member already has a card; replace it instead';
  end if;

  begin
    insert into public.nfc_cards (id, member_id, uid, replaces_id)
    values (p_id, p_member_id, card_uid, p_replaces_id)
    returning * into given;
  exception
    when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint = 'nfc_cards_uid_in_use_key' then
        if exists (select 1 from public.nfc_cards c where c.uid = card_uid and c.status = 'blocked') then
          raise exception using errcode = '23505', message = 'card_blocked',
            detail = 'This card is blocked; a manager must unblock it first';
        end if;
        raise exception using errcode = '23505', message = 'card_in_use',
          detail = 'This card was given to another member at the same moment';
      elsif failed_constraint = 'nfc_cards_member_active_key' then
        raise exception using errcode = '23505', message = 'member_has_card',
          detail = 'The member was given another card at the same moment';
      elsif failed_constraint = 'nfc_cards_pkey' then
        raise exception using errcode = '23505', message = 'card_exists',
          detail = 'A card with this id was already saved';
      end if;
      raise;
  end;
  return given;
end
$$;

revoke execute on function app.give_card(uuid, uuid, text, uuid) from public, anon;
grant execute on function app.give_card(uuid, uuid, text, uuid) to authenticated;

-- Gives a member a card (see app.give_card). Needs cards.manage and members.view (it returns the
-- card). An archived member gets none (member_archived).
create function public.assign_card(p_id uuid, p_member_id uuid, p_uid text)
returns public.nfc_cards
language plpgsql
security invoker
set search_path = ''
as $$
declare
  member_status text;
begin
  if not (app.has_permission('cards.manage') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Giving a card needs cards.manage and members.view';
  end if;
  select m.status into member_status from public.members m where m.id = p_member_id and m.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No member with this id in your gym';
  end if;
  if member_status = 'archived' then
    raise exception using errcode = '42501', message = 'member_archived',
      detail = 'An archived member can''t be given a card; restore them first';
  end if;
  return app.give_card(p_id, p_member_id, p_uid);
end
$$;

revoke execute on function public.assign_card(uuid, uuid, text) from public, anon;
grant execute on function public.assign_card(uuid, uuid, text) to authenticated;

-- A member's card was lost, damaged or stolen (p_reason): it stops working at once, and with
-- p_new_uid the member gets the new card (p_new_id made by the app) in the same step, all or
-- nothing. A stolen card is also blocked, which needs cards.blacklist as well. Returns the new
-- card, or the old one when no new card was given.
create function public.replace_card(
  p_card_id uuid,
  p_reason text,
  p_new_id uuid default null,
  p_new_uid text default null
)
returns public.nfc_cards
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_card public.nfc_cards;
begin
  if not (app.has_permission('cards.manage') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Replacing a card needs cards.manage and members.view';
  end if;
  if p_reason is null or p_reason not in ('lost', 'damaged', 'stolen') then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A card is replaced because it was lost, damaged or stolen';
  end if;
  if p_reason = 'stolen' and not app.has_permission('cards.blacklist') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'A stolen card is blocked, which needs cards.blacklist';
  end if;
  if (p_new_id is null) <> (p_new_uid is null) then
    raise exception using errcode = '22023', message = 'invalid_request',
      detail = 'A new card needs both p_new_id and p_new_uid';
  end if;

  -- Locked until the end: the same card replaced twice at the same moment waits here, then finds
  -- it no longer active.
  select * into old_card from public.nfc_cards c where c.id = p_card_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'card_not_found',
      detail = 'No card with this id in your gym';
  end if;
  if old_card.status <> 'active' then
    raise exception using errcode = '23514', message = 'card_not_active',
      detail = 'This card no longer works';
  end if;
  if p_new_uid is not null and app.normalize_card_uid(p_new_uid) = old_card.uid then
    raise exception using errcode = '22023', message = 'same_card',
      detail = 'The new card is the old one';
  end if;

  update public.nfc_cards c
     set status = case when p_reason = 'stolen' then 'blocked' else 'ended' end,
         end_reason = p_reason
   where c.id = p_card_id
  returning * into old_card;

  if p_new_uid is null then
    return old_card;
  end if;
  return app.give_card(p_new_id, old_card.member_id, p_new_uid, old_card.id);
end
$$;

revoke execute on function public.replace_card(uuid, text, uuid, text) from public, anon;
grant execute on function public.replace_card(uuid, text, uuid, text) to authenticated;

-- The member gave their card back: it stops working, and anyone may be given it. Needs
-- cards.manage.
create function public.end_card(p_card_id uuid)
returns public.nfc_cards
language plpgsql
security invoker
set search_path = ''
as $$
declare
  card public.nfc_cards;
begin
  if not (app.has_permission('cards.manage') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Ending a card needs cards.manage and members.view';
  end if;
  select * into card from public.nfc_cards c where c.id = p_card_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'card_not_found',
      detail = 'No card with this id in your gym';
  end if;
  if card.status <> 'active' then
    raise exception using errcode = '23514', message = 'card_not_active',
      detail = 'This card no longer works';
  end if;
  update public.nfc_cards c set status = 'ended', end_reason = 'returned' where c.id = p_card_id
  returning * into card;
  return card;
end
$$;

revoke execute on function public.end_card(uuid) from public, anon;
grant execute on function public.end_card(uuid) to authenticated;

-- Blocks a card, with a reason: a working card stops working, and nobody can be given it until it
-- is unblocked. A card that no longer works (lost, returned) is blocked from its latest row
-- (card_reassigned otherwise). Needs cards.blacklist.
create function public.block_card(p_card_id uuid, p_reason text)
returns public.nfc_cards
language plpgsql
security invoker
set search_path = ''
as $$
declare
  card public.nfc_cards;
begin
  if not (app.has_permission('cards.blacklist') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Blocking a card needs cards.blacklist and members.view';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode = '23514', message = 'reason_required',
      detail = 'Blocking a card needs a reason';
  end if;
  select * into card from public.nfc_cards c where c.id = p_card_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'card_not_found',
      detail = 'No card with this id in your gym';
  end if;
  if card.status = 'blocked' then
    raise exception using errcode = '23514', message = 'card_blocked',
      detail = 'This card is blocked already';
  end if;
  begin
    update public.nfc_cards c
       set status = 'blocked',
           end_reason = case when c.status = 'active' then 'blocked' else c.end_reason end,
           block_reason = p_reason
     where c.id = p_card_id
    returning * into card;
  exception
    when unique_violation then
      raise exception using errcode = '23514', message = 'card_reassigned',
        detail = 'The card was given to someone else at the same moment; block it from there';
  end;
  return card;
end
$$;

revoke execute on function public.block_card(uuid, text) from public, anon;
grant execute on function public.block_card(uuid, text) to authenticated;

-- Unblocks a card: it doesn't work again by itself, but anyone may be given it. Needs
-- cards.blacklist.
create function public.unblock_card(p_card_id uuid)
returns public.nfc_cards
language plpgsql
security invoker
set search_path = ''
as $$
declare
  card public.nfc_cards;
begin
  if not (app.has_permission('cards.blacklist') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Unblocking a card needs cards.blacklist and members.view';
  end if;
  select * into card from public.nfc_cards c where c.id = p_card_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'card_not_found',
      detail = 'No card with this id in your gym';
  end if;
  if card.status <> 'blocked' then
    raise exception using errcode = '23514', message = 'card_not_blocked',
      detail = 'This card isn''t blocked';
  end if;
  update public.nfc_cards c set status = 'ended' where c.id = p_card_id
  returning * into card;
  return card;
end
$$;

revoke execute on function public.unblock_card(uuid) from public, anon;
grant execute on function public.unblock_card(uuid) to authenticated;

-- What a scanned card is: the member's card that uses the UID (active or blocked), or else the
-- latest one that did (ended); nothing for a card the gym never gave out. Needs members.view.
create function public.find_card(p_uid text)
returns setof public.nfc_cards
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  card_uid text := app.normalize_card_uid(p_uid);
begin
  if not app.has_permission('members.view') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Finding a card needs members.view';
  end if;
  if card_uid is null then
    raise exception using errcode = '22023', message = 'invalid_card_uid',
      detail = 'A card UID is 4, 7 or 10 bytes of hex, or 10 digits';
  end if;
  return query
    select c.*
      from public.nfc_cards c
     where c.uid = card_uid
     order by c.status in ('active', 'blocked') desc, c.created_at desc, c.id desc
     limit 1;
end
$$;

revoke execute on function public.find_card(text) from public, anon;
grant execute on function public.find_card(text) to authenticated;
