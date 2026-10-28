import { addDays, baghdadMoment, weekdayOf, type Weekday } from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The classes screens' server calls (step 7e), with the acting staff member's own session: types are
// the gym's, schedules, sessions and bookings those of their branches (classes.view); only the class
// functions change them. supabase/migrations/20261028800000_classes.sql.

export const CLASSES_QUERY = 'classes';

export interface ClassType extends LocalizedNames {
  readonly id: string;
  readonly durationMinutes: number;
  readonly capacity: number;
  readonly isActive: boolean;
}

export type ClassTypeDraft = Omit<ClassType, 'id'>;

export function useClassTypes() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [CLASSES_QUERY, actor, 'types'],
    enabled: client !== undefined,
    queryFn: async (): Promise<ClassType[]> => {
      const { data, error } = await requireClient(client)
        .from('class_types')
        .select('id, name_ckb, name_en, name_ar, duration_minutes, capacity, is_active');
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          nameCkb: row.name_ckb,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          durationMinutes: row.duration_minutes,
          capacity: row.capacity,
          isActive: row.is_active,
        }))
        .sort(
          (a, b) =>
            Number(b.isActive) - Number(a.isActive) || a.nameCkb.localeCompare(b.nameCkb, 'ckb'),
        );
    },
  });
}

export function useSaveClassType() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, type }: { id: string | null; type: ClassTypeDraft }) => {
      const { error } = await requireClient(client).rpc('save_class_type', {
        p_id: id ?? crypto.randomUUID(),
        p_name_ckb: type.nameCkb,
        p_duration_minutes: type.durationMinutes,
        p_capacity: type.capacity,
        p_is_active: type.isActive,
        ...(type.nameEn ? { p_name_en: type.nameEn } : {}),
        ...(type.nameAr ? { p_name_ar: type.nameAr } : {}),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY] }),
  });
}

export interface ClassSchedule {
  readonly id: string;
  readonly branchId: string;
  readonly classTypeId: string;
  readonly weekday: Weekday;
  /** HH:MM, Baghdad time. */
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly capacity: number;
  readonly trainerId: string | null;
  readonly place: string | null;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly isActive: boolean;
}

export type ClassScheduleDraft = Omit<ClassSchedule, 'id'>;

/** A branch's weekly classes ('' for none). */
export function useClassSchedules(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [CLASSES_QUERY, actor, 'schedules', branchId],
    enabled: client !== undefined && branchId !== '',
    queryFn: async (): Promise<ClassSchedule[]> => {
      const { data, error } = await requireClient(client)
        .from('class_schedules')
        .select(
          'id, branch_id, class_type_id, weekday, starts_at, duration_minutes, capacity, trainer_id, place, starts_on, ends_on, is_active',
        )
        .eq('branch_id', branchId)
        .order('weekday')
        .order('starts_at');
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        branchId: row.branch_id,
        classTypeId: row.class_type_id,
        weekday: Math.min(Math.max(row.weekday, 1), 7) as Weekday,
        startsAt: row.starts_at.slice(0, 5),
        durationMinutes: row.duration_minutes,
        capacity: row.capacity,
        trainerId: row.trainer_id,
        place: row.place,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        isActive: row.is_active,
      }));
    },
  });
}

export function useSaveClassSchedule() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, schedule }: { id: string | null; schedule: ClassScheduleDraft }) => {
      const { error } = await requireClient(client).rpc('save_class_schedule', {
        p_id: id ?? crypto.randomUUID(),
        p_branch_id: schedule.branchId,
        p_class_type_id: schedule.classTypeId,
        p_weekday: schedule.weekday,
        p_starts_at: schedule.startsAt,
        p_duration_minutes: schedule.durationMinutes,
        p_capacity: schedule.capacity,
        p_starts_on: schedule.startsOn,
        p_is_active: schedule.isActive,
        ...(schedule.trainerId === null ? {} : { p_trainer_id: schedule.trainerId }),
        ...(schedule.place ? { p_place: schedule.place } : {}),
        ...(schedule.endsOn === null ? {} : { p_ends_on: schedule.endsOn }),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY] }),
  });
}

/** A session that took place or will: from its row when it has one, else from the schedule. */
export interface ClassOccurrence {
  readonly scheduleId: string;
  readonly classTypeId: string;
  readonly date: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly trainerId: string | null;
  readonly place: string | null;
  /** The session's row, once something happened to it. */
  readonly sessionId: string | null;
  readonly taken: number;
  readonly cancelled: boolean;
  readonly cancelReason: string | null;
}

interface SessionRow {
  readonly id: string;
  readonly scheduleId: string;
  readonly date: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly trainerId: string | null;
  readonly place: string | null;
  readonly taken: number;
  readonly cancelReason: string | null;
}

/** A branch's classes of a week (7 days from `weekStart`), schedules and sessions together. */
export function useClassWeek(branchId: string, weekStart: string) {
  const { client, actor } = useActingClient();
  const schedules = useClassSchedules(branchId);
  const sessions = useQuery({
    queryKey: [CLASSES_QUERY, actor, 'sessions', branchId, weekStart],
    enabled: client !== undefined && branchId !== '',
    refetchInterval: 30_000,
    queryFn: async (): Promise<SessionRow[]> => {
      const { data, error } = await requireClient(client)
        .from('class_sessions')
        .select(
          'id, schedule_id, session_date, starts_at, ends_at, capacity, trainer_id, place, cancel_reason, taken',
        )
        .eq('branch_id', branchId)
        .gte('session_date', weekStart)
        .lt('session_date', addDays(weekStart, 7));
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        scheduleId: row.schedule_id,
        date: row.session_date,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        capacity: row.capacity,
        trainerId: row.trainer_id,
        place: row.place,
        taken: row.taken ?? 0,
        cancelReason: row.cancel_reason,
      }));
    },
  });

  const occurrences: ClassOccurrence[] = [];
  if (schedules.data && sessions.data) {
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(weekStart, index);
      for (const schedule of schedules.data) {
        const row = sessions.data.find(
          (each) => each.scheduleId === schedule.id && each.date === date,
        );
        const runs =
          schedule.weekday === weekdayOf(date) &&
          schedule.isActive &&
          date >= schedule.startsOn &&
          (schedule.endsOn === null || date <= schedule.endsOn);
        if (!row && !runs) continue;
        const [hours = 0, minutes = 0] = schedule.startsAt.split(':').map(Number);
        const start = baghdadMoment(date, hours * 60 + minutes);
        occurrences.push({
          scheduleId: schedule.id,
          classTypeId: schedule.classTypeId,
          date,
          startsAt: row ? new Date(row.startsAt) : start,
          endsAt: row
            ? new Date(row.endsAt)
            : new Date(start.getTime() + schedule.durationMinutes * 60_000),
          capacity: row?.capacity ?? schedule.capacity,
          trainerId: row ? row.trainerId : schedule.trainerId,
          place: row ? row.place : schedule.place,
          sessionId: row?.id ?? null,
          taken: row?.taken ?? 0,
          cancelled: row?.cancelReason != null,
          cancelReason: row?.cancelReason ?? null,
        });
      }
    }
    occurrences.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
  return {
    occurrences,
    isPending: schedules.isPending || sessions.isPending,
    error: schedules.error ?? sessions.error,
  };
}

export const CLASS_BOOKING_STATUSES = [
  'booked',
  'waitlisted',
  'attended',
  'no_show',
  'cancelled',
] as const;
export type ClassBookingStatus = (typeof CLASS_BOOKING_STATUSES)[number];

export interface ClassBooking {
  readonly id: string;
  readonly memberId: string;
  readonly fullName: string | null;
  readonly memberNumber: number | null;
  readonly status: ClassBookingStatus;
  readonly waitlistedAt: string | null;
}

/** A session's bookings, the waitlist in its order. */
export function useClassBookings(sessionId: string | null) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [CLASSES_QUERY, actor, 'bookings', sessionId],
    enabled: client !== undefined && sessionId !== null,
    queryFn: async (): Promise<ClassBooking[]> => {
      const { data, error } = await requireClient(client)
        .from('class_bookings')
        .select(
          'id, member_id, status, waitlisted_at, created_at, members (full_name, member_number)',
        )
        .eq('session_id', sessionId ?? '')
        .order('waitlisted_at', { nullsFirst: true })
        .order('created_at');
      if (error) throw error;
      return data.map((row) => {
        // RLS hides the member from staff without members.view, whatever the types say.
        const member = row.members as typeof row.members | null;
        return {
          id: row.id,
          memberId: row.member_id,
          fullName: member?.full_name ?? null,
          memberNumber: member?.member_number ?? null,
          status: CLASS_BOOKING_STATUSES.find((each) => each === row.status) ?? 'booked',
          waitlistedAt: row.waitlisted_at,
        };
      });
    },
  });
}

const bookedSchema = z.object({
  status: z.string(),
  position: z.number().nullable().optional(),
});

export function useBookClass() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scheduleId: string;
      date: string;
      memberId: string;
      id: string;
    }) => {
      const { data, error } = await requireClient(client).rpc('book_class', {
        p_booking_id: input.id,
        p_schedule_id: input.scheduleId,
        p_date: input.date,
        p_member_id: input.memberId,
      });
      if (error) throw error;
      return bookedSchema.parse(data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY] }),
  });
}

export function useCancelClassBooking() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await requireClient(client).rpc('cancel_class_booking', {
        p_booking_id: bookingId,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY] }),
  });
}

export function useMarkClassAttendance() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      status,
    }: {
      bookingId: string;
      status: 'attended' | 'no_show';
    }) => {
      const { error } = await requireClient(client).rpc('mark_class_attendance', {
        p_booking_id: bookingId,
        p_status: status,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY] }),
  });
}

export function useCancelClassSession() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { scheduleId: string; date: string; reason: string }) => {
      const { error } = await requireClient(client).rpc('cancel_class_session', {
        p_schedule_id: input.scheduleId,
        p_date: input.date,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CLASSES_QUERY] }),
  });
}
