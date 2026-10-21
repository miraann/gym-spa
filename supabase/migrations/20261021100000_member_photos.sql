-- Member photos (Phase 2, step 2c; spec §4.1, decided by the user on 2026-10-19). Additions only.
--
--   * Kept in Postgres like the gym's logo, never in Storage, so both editions work the same and
--     every backup has them: base64 text, WebP or JPEG. The app resizes a photo to at most 480 px
--     and 150 KB, with a square thumbnail of at most 12 KB for lists; the database checks the
--     type (the file's first bytes) and the sizes again.
--   * One row per member (its id is the member's), apart from members so lists never load
--     pictures. members.photo_updated_at says which members have one and when it last changed,
--     so lists fetch only those thumbnails and caches know when a photo is new.
--   * Staff with members.view see photos; members.edit adds, replaces and removes them. Nothing
--     changes while the member is archived. A removed photo is deleted for real, not soft-deleted:
--     it is personal data the gym asked to remove. The audit log records who and when, never the
--     picture.
--   * The app has the same limits in packages/core/src/member-photos.ts; tests compare them.

-- True when data is base64 of a file of this type (by its first bytes: JPEG or WebP) of at most
-- max_bytes. The app's sniffImageType() reads the same bytes.
create function app.is_valid_image(data text, image_type text, max_bytes integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when data is null or image_type is null or data = ''
      or image_type not in ('image/jpeg', 'image/webp')
      or data !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
      then false
    else (
      select octet_length(bytes) <= max_bytes
         and case image_type
               when 'image/jpeg' then substring(bytes from 1 for 3) = '\xffd8ff'::bytea
               else substring(bytes from 1 for 4) = '\x52494646'::bytea
                    and substring(bytes from 9 for 4) = '\x57454250'::bytea
             end
        from (select decode(data, 'base64') as bytes) as decoded
    )
  end
$$;

-- Set by the trigger on member_photos; null: no photo.
alter table public.members add column photo_updated_at timestamptz;

comment on column public.members.photo_updated_at is 'When the member''s photo (member_photos) last changed; null: no photo. Kept by a trigger.';

create table public.member_photos (
  id uuid primary key,
  gym_id uuid not null default app.current_gym_id(),
  photo_type text not null check (photo_type in ('image/jpeg', 'image/webp')),
  -- base64, at most 150 KB of picture.
  photo text not null,
  thumbnail_type text not null check (thumbnail_type in ('image/jpeg', 'image/webp')),
  -- base64, at most 12 KB of picture.
  thumbnail text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Always null: a removed photo is deleted (see above). Here for the shape every table has.
  deleted_at timestamptz,
  constraint member_photos_id_gym_id_key unique (id, gym_id),
  constraint member_photos_id_gym_id_fkey foreign key (id, gym_id) references public.members (id, gym_id),
  constraint member_photos_photo_check check (app.is_valid_image(photo, photo_type, 153600)),
  constraint member_photos_thumbnail_check check (app.is_valid_image(thumbnail, thumbnail_type, 12288))
);

-- Guards --------------------------------------------------------------------------------------

-- BEFORE INSERT OR UPDATE OR DELETE on member_photos: nothing changes while the member is archived
-- (restore them first). RLS has already checked members.edit.
create function app.guard_member_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if app.is_system_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.members m where m.id = member_id and m.status = 'archived') then
    raise exception using errcode = '42501', message = 'member_archived',
      detail = 'An archived member can''t be changed; restore them first';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- AFTER INSERT OR UPDATE OR DELETE on member_photos: keeps members.photo_updated_at.
create function app.sync_member_photo_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.members m set photo_updated_at = null where m.id = old.id and m.gym_id = old.gym_id;
  else
    update public.members m set photo_updated_at = new.updated_at where m.id = new.id and m.gym_id = new.gym_id;
  end if;
  return null;
end
$$;

-- BEFORE INSERT OR UPDATE on members: only the trigger on member_photos (one trigger level down)
-- sets photo_updated_at; a new member starts without a photo.
create function app.guard_member_photo_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.is_system_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.photo_updated_at := null;
  elsif new.photo_updated_at is distinct from old.photo_updated_at and pg_trigger_depth() < 2 then
    raise exception using errcode = '42501', message = 'read_only_column',
      detail = 'members.photo_updated_at follows member_photos';
  end if;
  return new;
end
$$;

create trigger guard_photo_flag before insert or update on public.members
  for each row execute function app.guard_member_photo_flag();

-- BEFORE triggers run in name order: check_writable, guard, read_only, stamp.
create trigger check_writable before insert or update or delete on public.member_photos
  for each row execute function app.check_gym_writable();
create trigger guard before insert or update or delete on public.member_photos
  for each row execute function app.guard_member_photos();
create trigger read_only before update on public.member_photos
  for each row execute function app.read_only_columns('id', 'gym_id');
create trigger stamp before insert or update on public.member_photos
  for each row execute function app.stamp_row();
-- The log records who changed the photo and when, never the picture.
create trigger audit after insert or update or delete on public.member_photos
  for each row execute function app.audit_row('{photo,thumbnail}');
create trigger sync_flag after insert or update or delete on public.member_photos
  for each row execute function app.sync_member_photo_flag();

-- Row level security --------------------------------------------------------------------------

alter table public.member_photos enable row level security;

revoke all on table public.member_photos from anon, authenticated;
grant all on table public.member_photos to service_role;
grant select, insert, update, delete on table public.member_photos to authenticated;

create policy "staff with members.view see photos" on public.member_photos
  for select to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.view')));

create policy "staff with members.edit add photos" on public.member_photos
  for insert to authenticated
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.edit')));

create policy "staff with members.edit change photos" on public.member_photos
  for update to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.edit')))
  with check (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.edit')));

create policy "staff with members.edit remove photos" on public.member_photos
  for delete to authenticated
  using (gym_id = (select app.current_gym_id()) and (select app.has_permission('members.edit')));

-- RPCs ----------------------------------------------------------------------------------------
-- As the caller (security invoker): RLS, the guards and the audit log apply.

-- Adds or replaces a member's photo. Returns when it was saved (members.photo_updated_at).
-- invalid_photo: not JPEG or WebP, not base64, or too large.
create function public.set_member_photo(
  p_member_id uuid,
  p_photo_type text,
  p_photo text,
  p_thumbnail_type text,
  p_thumbnail text
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_at timestamptz;
begin
  if not exists (select 1 from public.members m where m.id = p_member_id) then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No such member, or not visible to you';
  end if;
  if not app.has_permission('members.edit') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'A photo needs members.edit';
  end if;
  if not app.is_valid_image(p_photo, p_photo_type, 153600)
     or not app.is_valid_image(p_thumbnail, p_thumbnail_type, 12288) then
    raise exception using errcode = '22023', message = 'invalid_photo',
      detail = 'A photo is JPEG or WebP of at most 150 KB, with a thumbnail of at most 12 KB';
  end if;
  insert into public.member_photos as p (id, photo_type, photo, thumbnail_type, thumbnail)
  values (p_member_id, p_photo_type, p_photo, p_thumbnail_type, p_thumbnail)
  on conflict (id) do update
    set photo_type = excluded.photo_type,
        photo = excluded.photo,
        thumbnail_type = excluded.thumbnail_type,
        thumbnail = excluded.thumbnail
  returning p.updated_at into saved_at;
  return saved_at;
end
$$;

revoke execute on function public.set_member_photo(uuid, text, text, text, text) from public, anon;
grant execute on function public.set_member_photo(uuid, text, text, text, text) to authenticated;

-- Removes a member's photo (deleted, not kept). Removing a photo that isn't there is fine.
create function public.remove_member_photo(p_member_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.members m where m.id = p_member_id) then
    raise exception using errcode = 'P0002', message = 'member_not_found',
      detail = 'No such member, or not visible to you';
  end if;
  if not app.has_permission('members.edit') then
    raise exception using errcode = '42501', message = 'permission_denied',
      detail = 'Removing a photo needs members.edit';
  end if;
  delete from public.member_photos p where p.id = p_member_id;
end
$$;

revoke execute on function public.remove_member_photo(uuid) from public, anon;
grant execute on function public.remove_member_photo(uuid) to authenticated;
