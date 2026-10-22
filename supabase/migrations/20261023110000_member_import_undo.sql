-- Phase 2, step 2j: taking back a wrong import (decided by the user on 2026-10-22). Staff with
-- members.delete archive every member an import added in one step, all or nothing, with a reason.
-- Members are archived, never deleted, so each one can still be restored later, and archiving ends
-- their working card as it does for one member (app.end_card_of_archived_member()). Members changed
-- since the import are archived too; the confirmation counts them first. Expand first: new columns
-- and functions only.

-- When an import was taken back, by whom and why. Written once, by undo_member_import() only (no
-- API role may change member_imports).
alter table public.member_imports
  add column undone_at timestamptz,
  add column undone_by uuid,
  add column undo_reason text check (app.is_clean_text(undo_reason, 300)),
  add constraint member_imports_undone check ((undone_at is null) = (undo_reason is null));

comment on column public.member_imports.undone_at is 'When undo_member_import() archived the import''s members, else null.';

-- What taking an import back would do now, in the caller's gym (null if there is no such import):
--   to_archive: its members not archived yet; already_archived: the others;
--   changed: of to_archive, those changed since the import (their profile, status, photo, health
--     info or cards);
--   cards: the working cards of to_archive, which archiving ends.
create function app.member_import_undo_counts(p_import_id uuid, p_gym_id uuid)
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

revoke execute on function app.member_import_undo_counts(uuid, uuid) from public, anon, authenticated;

-- The gym's latest imports (up to 50, newest first): who, when, which file, how many members and
-- cards, and whether they were taken back. Needs members.view and members.import or members.delete.
-- Security definer for the staff names, which the caller may otherwise not see.
create function public.member_import_history()
returns table (
  id uuid,
  file_name text,
  member_count integer,
  card_count integer,
  created_at timestamptz,
  created_by_name text,
  undone_at timestamptz,
  undone_by_name text,
  undo_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
begin
  if gym is null or not app.has_permission('members.view')
     or not (app.has_permission('members.import') or app.has_permission('members.delete')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'The import history needs members.view, and members.import or members.delete';
  end if;
  return query
    select i.id, i.file_name, i.member_count, i.card_count, i.created_at, c.full_name,
           i.undone_at, u.full_name, i.undo_reason
      from public.member_imports i
      left join public.staff_users c on c.id = i.created_by and c.gym_id = i.gym_id
      left join public.staff_users u on u.id = i.undone_by and u.gym_id = i.gym_id
     where i.gym_id = gym and i.deleted_at is null
     order by i.created_at desc, i.id
     limit 50;
end
$$;

revoke execute on function public.member_import_history() from public, anon;
grant execute on function public.member_import_history() to authenticated;

-- For the confirmation: what undo_member_import() would do now. Needs members.delete.
create function public.member_import_undo_preview(p_import_id uuid)
returns table (to_archive integer, already_archived integer, changed integer, cards integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
begin
  if gym is null or not (app.has_permission('members.delete') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Taking an import back needs members.delete';
  end if;
  return query select * from app.member_import_undo_counts(p_import_id, gym);
  if not found then
    raise exception using errcode = 'P0002', message = 'import_not_found',
      detail = 'No import with this id in your gym';
  end if;
end
$$;

revoke execute on function public.member_import_undo_preview(uuid) from public, anon;
grant execute on function public.member_import_undo_preview(uuid) to authenticated;

-- Archives every member of an import that isn't archived yet, with the reason, and records that
-- the import was taken back: all or nothing. Archiving ends each member's working card. Returns
-- what it did (the counts as the preview gives them). Needs members.delete. Security definer,
-- because member_imports takes no changes from API roles, and to mark its transaction like
-- import_members() (action undo, see 20261023100000_member_import.sql): the member triggers then
-- skip the two checks made here once for all members (the gym is writable, the caller has
-- members.delete), so 5,000 members fit within the cloud's statement timeout. The triggers and the
-- audit log still name the caller (auth.uid()). Refusals: reason_required, import_not_found,
-- import_undone (also for a retry after a lost answer), gym_read_only.
create function public.undo_member_import(p_import_id uuid, p_reason text)
returns table (archived integer, already_archived integer, changed integer, cards_ended integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  gym uuid := app.current_gym_id();
  undone_import public.member_imports;
  counts record;
  archived_count integer;
  member_ids uuid[];
begin
  if gym is null or not (app.has_permission('members.delete') and app.has_permission('members.view')) then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Taking an import back needs members.delete';
  end if;
  if p_reason is null or not app.is_clean_text(p_reason, 300) then
    raise exception using errcode = '23514', message = 'reason_required',
      detail = 'Taking an import back needs a reason (up to 300 letters)';
  end if;
  -- One at a time per import.
  select * into undone_import from public.member_imports i
   where i.id = p_import_id and i.gym_id = gym and i.deleted_at is null
     for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'import_not_found',
      detail = 'No import with this id in your gym';
  end if;
  if undone_import.undone_at is not null then
    raise exception using errcode = '23514', message = 'import_undone',
      detail = 'This import was already taken back';
  end if;
  if not app.gym_writable() then
    raise exception using errcode = '42501', message = 'gym_read_only',
      detail = 'This gym is read-only: it is suspended, or its subscription or license has ended';
  end if;

  select * into counts from app.member_import_undo_counts(p_import_id, gym);

  -- The members by id: right after a big import the table's statistics are old, and a join could
  -- be planned as if there were one member.
  member_ids := array(
    select m.id from public.members m
     where m.import_id = p_import_id and m.gym_id = gym and m.status <> 'archived' and m.deleted_at is null
  );

  insert into app.member_import_marks (xact, import_id, action)
  values (pg_current_xact_id(), p_import_id, 'undo');
  -- Their cards first, all at once (app.end_card_of_archived_member() then has nothing to do).
  update public.nfc_cards c
     set status = 'ended', end_reason = 'member_archived', ended_at = now(), ended_by = auth.uid()
   where c.member_id = any (member_ids) and c.gym_id = gym and c.status = 'active';
  update public.members m
     set status = 'archived', status_reason = p_reason
   where m.id = any (member_ids) and m.gym_id = gym;
  get diagnostics archived_count = row_count;

  update public.member_imports i
     set undone_at = now(), undone_by = auth.uid(), undo_reason = p_reason
   where i.id = p_import_id and i.gym_id = gym;
  delete from app.member_import_marks m where m.xact = pg_current_xact_id();

  return query select archived_count, counts.already_archived, counts.changed, counts.cards;
end
$$;

revoke execute on function public.undo_member_import(uuid, text) from public, anon;
grant execute on function public.undo_member_import(uuid, text) to authenticated;
