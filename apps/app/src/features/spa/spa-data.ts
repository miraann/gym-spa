import {
  SPA_GENDERS,
  SPA_KINDS,
  WEEK_ORDER,
  type SpaGender,
  type SpaKind,
  type Weekday,
  type WorkWindow,
} from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PLANS_QUERY } from '@/features/plans/plan-data';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The spa setup's server calls (step 6d), with the acting staff member's own session: services and
// packages are the gym's (everyone sees them), rooms and therapists those of a branch (spa.view);
// only the save functions change them (spa.manage; plan sessions plans.manage).
// supabase/migrations/20261028400000_spa_setup.sql and 20261028500000_spa_packages.sql.

export const SPA_SERVICES_QUERY = 'spa-services';
export const SPA_ROOMS_QUERY = 'spa-rooms';
export const SPA_THERAPISTS_QUERY = 'spa-therapists';
export const SPA_PACKAGES_QUERY = 'spa-packages';
const PLAN_SPA_SESSIONS_QUERY = 'plan-spa-sessions';

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return values.find((each) => each === value) ?? fallback;
}

/** Active first, then by Kurdish name. */
function byShelf(
  a: { isActive: boolean; nameCkb: string },
  b: { isActive: boolean; nameCkb: string },
) {
  return Number(b.isActive) - Number(a.isActive) || a.nameCkb.localeCompare(b.nameCkb, 'ckb');
}

export interface SpaService extends LocalizedNames {
  readonly id: string;
  readonly kind: SpaKind;
  readonly durationMinutes: number;
  readonly cleanupMinutes: number;
  /** Whole dinars. */
  readonly price: number;
  readonly gender: SpaGender;
  readonly needsTherapist: boolean;
  readonly isActive: boolean;
}

export type SpaServiceDraft = Omit<SpaService, 'id'>;

export function useSpaServices() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_SERVICES_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async (): Promise<SpaService[]> => {
      const { data, error } = await requireClient(client)
        .from('spa_services')
        .select(
          'id, name_ckb, name_en, name_ar, kind, duration_minutes, cleanup_minutes, price, gender, needs_therapist, is_active',
        );
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          nameCkb: row.name_ckb,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          kind: oneOf(SPA_KINDS, row.kind, 'other'),
          durationMinutes: row.duration_minutes,
          cleanupMinutes: row.cleanup_minutes,
          price: row.price,
          gender: oneOf(SPA_GENDERS, row.gender, 'any'),
          needsTherapist: row.needs_therapist,
          isActive: row.is_active,
        }))
        .sort(byShelf);
    },
  });
}

export function useSaveSpaService() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, service }: { id: string | null; service: SpaServiceDraft }) => {
      const { error } = await requireClient(client).rpc('save_spa_service', {
        p_id: id ?? crypto.randomUUID(),
        p_name_ckb: service.nameCkb,
        p_kind: service.kind,
        p_duration_minutes: service.durationMinutes,
        p_price: service.price,
        p_cleanup_minutes: service.cleanupMinutes,
        p_gender: service.gender,
        p_needs_therapist: service.needsTherapist,
        p_is_active: service.isActive,
        ...(service.nameEn ? { p_name_en: service.nameEn } : {}),
        ...(service.nameAr ? { p_name_ar: service.nameAr } : {}),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SPA_SERVICES_QUERY] }),
  });
}

export interface SpaRoom extends LocalizedNames {
  readonly id: string;
  readonly branchId: string;
  readonly kind: SpaKind;
  readonly capacity: number;
  readonly isActive: boolean;
}

export type SpaRoomDraft = Omit<SpaRoom, 'id'>;

/** A branch's rooms ('' for none: nothing is read). */
export function useSpaRooms(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_ROOMS_QUERY, actor, branchId],
    enabled: client !== undefined && branchId !== '',
    queryFn: async (): Promise<SpaRoom[]> => {
      const { data, error } = await requireClient(client)
        .from('spa_rooms')
        .select('id, branch_id, name_ckb, name_en, name_ar, kind, capacity, is_active')
        .eq('branch_id', branchId);
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          branchId: row.branch_id,
          nameCkb: row.name_ckb,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          kind: oneOf(SPA_KINDS, row.kind, 'other'),
          capacity: row.capacity,
          isActive: row.is_active,
        }))
        .sort(byShelf);
    },
  });
}

export function useSaveSpaRoom() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, room }: { id: string | null; room: SpaRoomDraft }) => {
      const { error } = await requireClient(client).rpc('save_spa_room', {
        p_id: id ?? crypto.randomUUID(),
        p_branch_id: room.branchId,
        p_name_ckb: room.nameCkb,
        p_kind: room.kind,
        p_capacity: room.capacity,
        p_is_active: room.isActive,
        ...(room.nameEn ? { p_name_en: room.nameEn } : {}),
        ...(room.nameAr ? { p_name_ar: room.nameAr } : {}),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SPA_ROOMS_QUERY] }),
  });
}

export interface SpaTherapist {
  readonly id: string;
  readonly branchId: string;
  readonly fullName: string;
  readonly gender: 'male' | 'female';
  /** E.164, or null. */
  readonly phone: string | null;
  readonly staffUserId: string | null;
  readonly commissionPercent: number;
  readonly isActive: boolean;
  readonly serviceIds: readonly string[];
  /** In week order, then by start. */
  readonly hours: readonly WorkWindow[];
}

export type SpaTherapistDraft = Omit<SpaTherapist, 'id'>;

/** Postgres gives a time as HH:MM:SS, and the end of a day as 24:00:00. */
function toClock(time: string): string {
  return time.slice(0, 5);
}

function isWeekday(value: number): value is Weekday {
  return WEEK_ORDER.some((day) => day === value);
}

/** A branch's therapists, with the services they do and their hours ('' for none). */
export function useSpaTherapists(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_THERAPISTS_QUERY, actor, branchId],
    enabled: client !== undefined && branchId !== '',
    queryFn: async (): Promise<SpaTherapist[]> => {
      const { data, error } = await requireClient(client)
        .from('spa_therapists')
        .select(
          'id, branch_id, full_name, gender, phone, staff_user_id, commission_percent, is_active, spa_therapist_services (service_id), spa_therapist_hours (weekday, starts_at, ends_at)',
        )
        .eq('branch_id', branchId);
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          branchId: row.branch_id,
          fullName: row.full_name,
          gender: row.gender === 'female' ? ('female' as const) : ('male' as const),
          phone: row.phone,
          staffUserId: row.staff_user_id,
          commissionPercent: row.commission_percent,
          isActive: row.is_active,
          serviceIds: row.spa_therapist_services.map((each) => each.service_id),
          hours: row.spa_therapist_hours
            .flatMap((each) =>
              isWeekday(each.weekday)
                ? [
                    {
                      weekday: each.weekday,
                      from: toClock(each.starts_at),
                      until: toClock(each.ends_at),
                    },
                  ]
                : [],
            )
            .sort(
              (a, b) =>
                WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) ||
                a.from.localeCompare(b.from),
            ),
        }))
        .sort(
          (a, b) =>
            Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName, 'ckb'),
        );
    },
  });
}

export function useSaveSpaTherapist() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, therapist }: { id: string | null; therapist: SpaTherapistDraft }) => {
      const { error } = await requireClient(client).rpc('save_spa_therapist', {
        p_id: id ?? crypto.randomUUID(),
        p_branch_id: therapist.branchId,
        p_full_name: therapist.fullName,
        p_gender: therapist.gender,
        p_service_ids: [...therapist.serviceIds],
        p_hours: therapist.hours.map((window) => ({ ...window })),
        p_commission_percent: therapist.commissionPercent,
        p_is_active: therapist.isActive,
        ...(therapist.phone === null ? {} : { p_phone: therapist.phone }),
        ...(therapist.staffUserId === null ? {} : { p_staff_user_id: therapist.staffUserId }),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SPA_THERAPISTS_QUERY] }),
  });
}

export interface SpaPackage extends LocalizedNames {
  readonly id: string;
  readonly serviceId: string;
  readonly sessionCount: number;
  /** Whole dinars, for all the sessions. */
  readonly price: number;
  /** null: no time limit. */
  readonly validDays: number | null;
  readonly isActive: boolean;
}

export type SpaPackageDraft = Omit<SpaPackage, 'id'>;

export function useSpaPackages() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SPA_PACKAGES_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async (): Promise<SpaPackage[]> => {
      const { data, error } = await requireClient(client)
        .from('spa_packages')
        .select(
          'id, name_ckb, name_en, name_ar, service_id, session_count, price, valid_days, is_active',
        );
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          nameCkb: row.name_ckb,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          serviceId: row.service_id,
          sessionCount: row.session_count,
          price: row.price,
          validDays: row.valid_days,
          isActive: row.is_active,
        }))
        .sort(byShelf);
    },
  });
}

export function useSaveSpaPackage() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pack }: { id: string | null; pack: SpaPackageDraft }) => {
      const { error } = await requireClient(client).rpc('save_spa_package', {
        p_id: id ?? crypto.randomUUID(),
        p_name_ckb: pack.nameCkb,
        p_service_id: pack.serviceId,
        p_session_count: pack.sessionCount,
        p_price: pack.price,
        p_is_active: pack.isActive,
        ...(pack.nameEn ? { p_name_en: pack.nameEn } : {}),
        ...(pack.nameAr ? { p_name_ar: pack.nameAr } : {}),
        ...(pack.validDays === null ? {} : { p_valid_days: pack.validDays }),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SPA_PACKAGES_QUERY] }),
  });
}

export interface PlanSpaSession {
  readonly serviceId: string;
  readonly count: number;
}

/** The spa sessions a plan includes per subscription. */
export function usePlanSpaSessions(planId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [PLAN_SPA_SESSIONS_QUERY, actor, planId],
    enabled: client !== undefined,
    queryFn: async (): Promise<PlanSpaSession[]> => {
      const { data, error } = await requireClient(client)
        .from('plan_spa_sessions')
        .select('service_id, session_count, created_at')
        .eq('plan_id', planId)
        .order('created_at');
      if (error) throw error;
      return data.map((row) => ({ serviceId: row.service_id, count: row.session_count }));
    },
  });
}

export function useSetPlanSpaSessions() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      planId,
      sessions,
    }: {
      planId: string;
      sessions: readonly PlanSpaSession[];
    }) => {
      const { error } = await requireClient(client).rpc('set_plan_spa_sessions', {
        p_plan_id: planId,
        p_sessions: sessions.map((each) => ({ service_id: each.serviceId, count: each.count })),
      });
      if (error) throw error;
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [PLAN_SPA_SESSIONS_QUERY] }),
        queryClient.invalidateQueries({ queryKey: [PLANS_QUERY] }),
      ]),
  });
}
