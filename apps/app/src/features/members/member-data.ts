import {
  BLOOD_TYPES,
  MEMBER_PHOTO_MAX_BYTES,
  MEMBER_THUMBNAIL_MAX_BYTES,
  parseStoredImage,
  type StoredImage,
  GENDERS,
  MEMBER_STATUSES,
  REFERRAL_SOURCES,
  escapeLikePattern,
  memberSearchNeedle,
  normalizeName,
  type BloodType,
  type Gender,
  type MemberStatus,
  type ReferralSource,
} from '@gym/core';
import type { Database } from '@gym/db';
import { LANGUAGE_CODES, type Language } from '@gym/i18n';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import type { AppSupabaseClient } from '@/lib/backend';
import { errorField } from '@/lib/save-error';
import { hasHealthInput, type MemberInput } from './member-form';
import type { MemberListParams } from './member-list-search';
import type { PreparedPhoto } from './member-photo-image';

// The members screens' server calls, each with the acting staff member's own session: RLS and the
// database functions decide what they see and may change (README → Members). The query keys
// include who is acting, so a PIN switch never shows another staff member's view from the cache.

const MEMBERS_QUERY = 'members';
const MEMBER_TAGS_QUERY = 'member-tags';
export const MEMBER_PAGE_SIZE = 25;

type MemberRow = Database['public']['Tables']['members']['Row'];
type HealthRow = Database['public']['Tables']['member_health']['Row'];

/** A member's profile (public.members, without search_text). */
export interface Member {
  readonly id: string;
  readonly memberNumber: number;
  readonly branchId: string;
  readonly fullName: string;
  readonly gender: Gender;
  /** null: no phone of their own. */
  readonly phone: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyPhone: string | null;
  readonly birthDate: string | null;
  readonly preferredLanguage: Language;
  readonly address: string | null;
  readonly referralSource: ReferralSource | null;
  readonly goals: string | null;
  readonly notes: string | null;
  readonly tags: readonly string[];
  readonly status: MemberStatus;
  readonly statusReason: string | null;
  readonly statusChangedAt: string | null;
  readonly hasHealthNotes: boolean;
  /** When the photo last changed; null: no photo. */
  readonly photoUpdatedAt: string | null;
  readonly createdAt: string;
}

/** Health info (public.member_health), for staff with members.medical.view only. */
export interface MemberHealth {
  readonly bloodType: BloodType | null;
  readonly medicalNotes: string | null;
  readonly injuries: string | null;
}

/** A member who might be the same person as the one being typed in. */
export interface PossibleDuplicate {
  readonly id: string;
  readonly memberNumber: number;
  readonly fullName: string;
  readonly phone: string | null;
  readonly status: MemberStatus;
  readonly match: 'phone' | 'same_name' | 'similar_name';
}

export interface MemberPage {
  readonly members: readonly Member[];
  readonly total: number;
}

const MEMBER_COLUMNS =
  'id, member_number, branch_id, full_name, gender, phone, emergency_contact_name, emergency_phone, birth_date, preferred_language, address, referral_source, goals, notes, tags, status, status_reason, status_changed_at, has_health_notes, photo_updated_at, created_at';

/** The database's checks keep these columns to their lists; this only narrows the types. */
function oneOf<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
  return values.find((each) => each === value) ?? fallback;
}

function optionalOneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return values.find((each) => each === value) ?? null;
}

type MemberColumns = Pick<
  MemberRow,
  | 'id'
  | 'member_number'
  | 'branch_id'
  | 'full_name'
  | 'gender'
  | 'phone'
  | 'emergency_contact_name'
  | 'emergency_phone'
  | 'birth_date'
  | 'preferred_language'
  | 'address'
  | 'referral_source'
  | 'goals'
  | 'notes'
  | 'tags'
  | 'status'
  | 'status_reason'
  | 'status_changed_at'
  | 'has_health_notes'
  | 'photo_updated_at'
  | 'created_at'
>;

export function toMember(row: MemberColumns): Member {
  return {
    id: row.id,
    memberNumber: row.member_number,
    branchId: row.branch_id,
    fullName: row.full_name,
    gender: oneOf(GENDERS, row.gender, 'male'),
    phone: row.phone,
    emergencyContactName: row.emergency_contact_name,
    emergencyPhone: row.emergency_phone,
    birthDate: row.birth_date,
    preferredLanguage: oneOf(LANGUAGE_CODES, row.preferred_language, 'ckb'),
    address: row.address,
    referralSource: optionalOneOf(REFERRAL_SOURCES, row.referral_source),
    goals: row.goals,
    notes: row.notes,
    tags: row.tags,
    status: oneOf(MEMBER_STATUSES, row.status, 'active'),
    statusReason: row.status_reason,
    statusChangedAt: row.status_changed_at,
    hasHealthNotes: row.has_health_notes,
    photoUpdatedAt: row.photo_updated_at,
    createdAt: row.created_at,
  };
}

function toHealth(row: Pick<HealthRow, 'blood_type' | 'medical_notes' | 'injuries'>): MemberHealth {
  return {
    bloodType: optionalOneOf(BLOOD_TYPES, row.blood_type),
    medicalNotes: row.medical_notes,
    injuries: row.injuries,
  };
}

/** One page of the list, filtered, sorted and counted by the server. */
async function fetchMemberPage(
  client: AppSupabaseClient,
  params: MemberListParams,
): Promise<MemberPage> {
  let query = client
    .from('members')
    .select(MEMBER_COLUMNS, { count: 'exact' })
    .is('deleted_at', null);
  // PostgREST reads * as a wildcard too; names and phones never contain one.
  const needle = memberSearchNeedle(params.q).replaceAll('*', '');
  if (needle !== '') query = query.ilike('search_text', `%${escapeLikePattern(needle)}%`);
  query =
    params.status === 'current'
      ? query.neq('status', 'archived')
      : query.eq('status', params.status);
  if (params.gender !== null) query = query.eq('gender', params.gender);
  if (params.branch !== null) query = query.eq('branch_id', params.branch);
  if (params.tag !== null) query = query.contains('tags', [params.tag]);
  query =
    params.sort === 'newest'
      ? query.order('created_at', { ascending: false }).order('member_number', { ascending: false })
      : params.sort === 'number'
        ? query.order('member_number')
        : query.order('full_name').order('member_number');
  const from = (params.page - 1) * MEMBER_PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + MEMBER_PAGE_SIZE - 1);
  // A page past the end (the list got shorter): an empty page; the list goes back to page 1.
  if (error && errorField(error, 'code') === 'PGRST103') return { members: [], total: 0 };
  if (error) throw error;
  return { members: data.map(toMember), total: count ?? data.length };
}

export function useMemberPage(params: MemberListParams) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [MEMBERS_QUERY, actor, 'page', params],
    enabled: client !== undefined,
    queryFn: () => fetchMemberPage(requireClient(client), params),
    // Paging and typing keep the last page on screen until the next one is there.
    placeholderData: keepPreviousData,
  });
}

export interface MemberCounts {
  readonly active: number;
  /** Members registered since `since` (the start of this month, for the dashboard). */
  readonly newSince: number;
}

/** The dashboard's member numbers, counted by the server in the branches the staff member sees. */
export function useMemberCounts(since: Date) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [MEMBERS_QUERY, actor, 'counts', since.toISOString()],
    enabled: client !== undefined,
    queryFn: async (): Promise<MemberCounts> => {
      const db = requireClient(client);
      const count = (filter: 'active' | 'new') => {
        const query = db
          .from('members')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null);
        return filter === 'active'
          ? query.eq('status', 'active')
          : query.gte('created_at', since.toISOString());
      };
      const [active, created] = await Promise.all([count('active'), count('new')]);
      if (active.error) throw active.error;
      if (created.error) throw created.error;
      return { active: active.count ?? 0, newSince: created.count ?? 0 };
    },
  });
}

export function useMember(memberId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [MEMBERS_QUERY, actor, 'member', memberId],
    enabled: client !== undefined,
    queryFn: async (): Promise<Member | null> => {
      const { data, error } = await requireClient(client)
        .from('members')
        .select(MEMBER_COLUMNS)
        .eq('id', memberId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data ? toMember(data) : null;
    },
  });
}

/** Health info; only asked for with members.medical.view (RLS shows nothing otherwise). */
export function useMemberHealth(memberId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [MEMBERS_QUERY, actor, 'health', memberId],
    enabled: enabled && client !== undefined,
    queryFn: async (): Promise<MemberHealth | null> => {
      const { data, error } = await requireClient(client)
        .from('member_health')
        .select('blood_type, medical_notes, injuries')
        .eq('id', memberId)
        .maybeSingle();
      if (error) throw error;
      return data ? toHealth(data) : null;
    },
  });
}

/** The tags in use in the gym, most used first (filter and suggestions). */
export function useMemberTags() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [MEMBER_TAGS_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await requireClient(client).rpc('member_tags');
      if (error) throw error;
      return data.map((row) => row.tag);
    },
  });
}

/**
 * Members who might be the same person (find_member_duplicates): asked for once the name has 3
 * letters or the phone is a valid number.
 */
export function useMemberDuplicates(fullName: string, phone: string | null, excludeId?: string) {
  const { client, actor } = useActingClient();
  const name = normalizeName(fullName);
  return useQuery({
    queryKey: [MEMBERS_QUERY, actor, 'duplicates', name, phone, excludeId ?? null],
    enabled: client !== undefined && (name.length >= 3 || phone !== null),
    queryFn: async (): Promise<PossibleDuplicate[]> => {
      const { data, error } = await requireClient(client).rpc('find_member_duplicates', {
        ...(name.length >= 3 ? { p_full_name: name } : {}),
        ...(phone === null ? {} : { p_phone: phone }),
        ...(excludeId === undefined ? {} : { p_exclude_id: excludeId }),
      });
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        memberNumber: row.member_number,
        fullName: row.full_name,
        phone: row.phone,
        status: oneOf(MEMBER_STATUSES, row.status, 'active'),
        match: oneOf(['phone', 'same_name', 'similar_name'] as const, row.match, 'similar_name'),
      }));
    },
    placeholderData: keepPreviousData,
  });
}

/** After a change, the lists and the member read the server again. */
function useRefreshMembers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [MEMBERS_QUERY, MEMBER_TAGS_QUERY].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

/**
 * The profile as create_member / update_member take it. Empty values are left out: the parameters'
 * default is null, which also clears a field when editing (last write wins).
 */
export function profileArgs(input: MemberInput) {
  return {
    p_branch_id: input.branchId,
    p_full_name: input.fullName,
    p_gender: input.gender,
    p_preferred_language: input.preferredLanguage,
    p_tags: [...input.tags],
    ...(input.phone === null ? {} : { p_phone: input.phone }),
    ...(input.emergencyContactName === null
      ? {}
      : { p_emergency_contact_name: input.emergencyContactName }),
    ...(input.emergencyPhone === null ? {} : { p_emergency_phone: input.emergencyPhone }),
    ...(input.birthDate === null ? {} : { p_birth_date: input.birthDate }),
    ...(input.address === null ? {} : { p_address: input.address }),
    ...(input.referralSource === null ? {} : { p_referral_source: input.referralSource }),
    ...(input.goals === null ? {} : { p_goals: input.goals }),
    ...(input.notes === null ? {} : { p_notes: input.notes }),
  };
}

export function healthArgs(input: MemberInput) {
  return {
    ...(input.bloodType === null ? {} : { p_blood_type: input.bloodType }),
    ...(input.medicalNotes === null ? {} : { p_medical_notes: input.medicalNotes }),
    ...(input.injuries === null ? {} : { p_injuries: input.injuries }),
  };
}

/**
 * Adds a member (create_member) with the id the form made. Saving the same id again (a retry
 * after a lost answer) finds the member already saved and answers with them.
 */
export function useCreateMember() {
  const { client } = useActingClient();
  const refresh = useRefreshMembers();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: MemberInput }): Promise<Member> => {
      const acting = requireClient(client);
      const { data, error } = await acting.rpc('create_member', {
        p_id: id,
        ...profileArgs(input),
        ...(hasHealthInput(input) ? healthArgs(input) : {}),
      });
      if (error && errorField(error, 'message') === 'member_exists') {
        const saved = await acting.from('members').select(MEMBER_COLUMNS).eq('id', id).single();
        if (saved.error) throw saved.error;
        return toMember(saved.data);
      }
      if (error) throw error;
      return toMember(data);
    },
    onSettled: refresh,
  });
}

/** Saves the whole profile (update_member); with saveHealth also the health info. */
export function useUpdateMember() {
  const { client } = useActingClient();
  const refresh = useRefreshMembers();
  return useMutation({
    mutationFn: async ({
      id,
      input,
      saveHealth,
    }: {
      id: string;
      input: MemberInput;
      saveHealth: boolean;
    }): Promise<Member> => {
      const { data, error } = await requireClient(client).rpc('update_member', {
        p_id: id,
        ...profileArgs(input),
        ...(saveHealth ? { p_save_health: true, ...healthArgs(input) } : {}),
      });
      if (error) throw error;
      return toMember(data);
    },
    onSettled: refresh,
  });
}

/** Suspends, bans, archives or reactivates a member (set_member_status, members.delete). */
export function useSetMemberStatus() {
  const { client } = useActingClient();
  const refresh = useRefreshMembers();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: MemberStatus;
      reason: string | null;
    }): Promise<Member> => {
      const { data, error } = await requireClient(client).rpc('set_member_status', {
        p_id: id,
        p_status: status,
        ...(reason === null ? {} : { p_reason: reason }),
      });
      if (error) throw error;
      return toMember(data);
    },
    onSettled: refresh,
  });
}

// Photos (step 2c) -------------------------------------------------------------------------------
// Keyed by photo_updated_at, so a cached picture is used until the photo changes.

/** A member's photo, or null without one. */
export function useMemberPhoto(member: Pick<Member, 'id' | 'photoUpdatedAt'>) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [MEMBERS_QUERY, actor, 'photo', member.id, member.photoUpdatedAt],
    enabled: client !== undefined && member.photoUpdatedAt !== null,
    staleTime: Infinity,
    queryFn: async (): Promise<StoredImage | null> => {
      const { data, error } = await requireClient(client)
        .from('member_photos')
        .select('photo_type, photo')
        .eq('id', member.id)
        .maybeSingle();
      if (error) throw error;
      return data ? parseStoredImage(data.photo_type, data.photo, MEMBER_PHOTO_MAX_BYTES) : null;
    },
  });
}

/** The thumbnails of the members shown (only those with a photo), by member id. */
export function useMemberThumbnails(members: readonly Pick<Member, 'id' | 'photoUpdatedAt'>[]) {
  const { client, actor } = useActingClient();
  const withPhoto = members.filter((member) => member.photoUpdatedAt !== null);
  return useQuery({
    queryKey: [
      MEMBERS_QUERY,
      actor,
      'thumbnails',
      withPhoto.map((member) => `${member.id}@${member.photoUpdatedAt ?? ''}`),
    ],
    enabled: client !== undefined && withPhoto.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<ReadonlyMap<string, StoredImage>> => {
      const { data, error } = await requireClient(client)
        .from('member_photos')
        .select('id, thumbnail_type, thumbnail')
        .in(
          'id',
          withPhoto.map((member) => member.id),
        );
      if (error) throw error;
      const thumbnails = new Map<string, StoredImage>();
      for (const row of data) {
        const image = parseStoredImage(
          row.thumbnail_type,
          row.thumbnail,
          MEMBER_THUMBNAIL_MAX_BYTES,
        );
        if (image) thumbnails.set(row.id, image);
      }
      return thumbnails;
    },
    placeholderData: keepPreviousData,
  });
}

/** Adds or replaces a member's photo (set_member_photo, members.edit). */
export function useSetMemberPhoto() {
  const { client } = useActingClient();
  const refresh = useRefreshMembers();
  return useMutation({
    mutationFn: async ({ id, photo }: { id: string; photo: PreparedPhoto }): Promise<void> => {
      const { error } = await requireClient(client).rpc('set_member_photo', {
        p_member_id: id,
        p_photo_type: photo.photo.type,
        p_photo: photo.photo.data,
        p_thumbnail_type: photo.thumbnail.type,
        p_thumbnail: photo.thumbnail.data,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

/** Removes a member's photo; it is deleted, not kept (remove_member_photo, members.edit). */
export function useRemoveMemberPhoto() {
  const { client } = useActingClient();
  const refresh = useRefreshMembers();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await requireClient(client).rpc('remove_member_photo', { p_member_id: id });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}
