import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The HR screens' server calls (step 7d), with the acting staff member's own session: pay terms,
// cards, the clock and shifts of the staff they may see (hr.view, or their own); the save functions
// change them (hr.manage, never one's own). supabase/migrations/20261028700000_staff_hr.sql.

export const HR_QUERY = 'hr';

export const SALARY_TYPES = ['fixed', 'hourly', 'commission'] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];

export interface StaffProfile {
  readonly salaryType: SalaryType;
  /** Whole dinars a month (fixed) or an hour (hourly). */
  readonly monthlySalary: number | null;
  readonly hourlyRate: number | null;
  readonly classFee: number;
  readonly ptPercent: number;
  readonly teaches: boolean;
  readonly hiredOn: string | null;
  readonly note: string | null;
}

function salaryType(value: string): SalaryType {
  return SALARY_TYPES.find((each) => each === value) ?? 'fixed';
}

/** A staff member's pay terms, or null when none are saved (or the viewer may not see them). */
export function useStaffProfile(staffId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [HR_QUERY, actor, 'profile', staffId],
    enabled: client !== undefined && enabled,
    queryFn: async (): Promise<StaffProfile | null> => {
      const { data, error } = await requireClient(client)
        .from('staff_profiles')
        .select(
          'salary_type, monthly_salary, hourly_rate, class_fee, pt_percent, teaches, hired_on, note',
        )
        .eq('id', staffId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            salaryType: salaryType(data.salary_type),
            monthlySalary: data.monthly_salary,
            hourlyRate: data.hourly_rate,
            classFee: data.class_fee,
            ptPercent: data.pt_percent,
            teaches: data.teaches,
            hiredOn: data.hired_on,
            note: data.note,
          }
        : null;
    },
  });
}

export function useSaveStaffProfile() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, profile }: { staffId: string; profile: StaffProfile }) => {
      const { error } = await requireClient(client).rpc('save_staff_profile', {
        p_staff_id: staffId,
        p_salary_type: profile.salaryType,
        p_class_fee: profile.classFee,
        p_pt_percent: profile.ptPercent,
        p_teaches: profile.teaches,
        ...(profile.monthlySalary === null ? {} : { p_monthly_salary: profile.monthlySalary }),
        ...(profile.hourlyRate === null ? {} : { p_hourly_rate: profile.hourlyRate }),
        ...(profile.hiredOn === null ? {} : { p_hired_on: profile.hiredOn }),
        ...(profile.note === null ? {} : { p_note: profile.note }),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [HR_QUERY] }),
  });
}

export interface StaffCard {
  readonly id: string;
  readonly uid: string;
  readonly createdAt: string;
}

/** A staff member's card in use, or null. */
export function useStaffCard(staffId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [HR_QUERY, actor, 'card', staffId],
    enabled: client !== undefined && enabled,
    queryFn: async (): Promise<StaffCard | null> => {
      const { data, error } = await requireClient(client)
        .from('staff_cards')
        .select('id, uid, created_at')
        .eq('staff_id', staffId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, uid: data.uid, createdAt: data.created_at } : null;
    },
  });
}

export function useGiveStaffCard() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, staffId, uid }: { id: string; staffId: string; uid: string }) => {
      const { error } = await requireClient(client).rpc('give_staff_card', {
        p_id: id,
        p_staff_id: staffId,
        p_uid: uid,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [HR_QUERY] }),
  });
}

export function useEndStaffCard() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, reason }: { cardId: string; reason: 'returned' | 'lost' }) => {
      const { error } = await requireClient(client).rpc('end_staff_card', {
        p_card_id: cardId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [HR_QUERY] }),
  });
}

export interface ClockRecord {
  readonly id: string;
  readonly staffId: string;
  readonly fullName: string | null;
  readonly branchId: string;
  readonly clockedInAt: string;
  readonly clockedOutAt: string | null;
  readonly method: 'card' | 'manual';
  readonly note: string | null;
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
}

const CLOCK_COLUMNS =
  'id, staff_id, branch_id, clocked_in_at, clocked_out_at, method, note, voided_at, void_reason, staff_users!staff_clock_staff_id_gym_id_fkey (full_name)';

/** Clock records: one staff member's, or a branch's, starting in [from, until). */
export function useClockRecords(
  filter: { readonly staffId: string } | { readonly branchId: string },
  from: string,
  until: string,
  enabled = true,
) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [HR_QUERY, actor, 'clock', filter, from, until],
    enabled: client !== undefined && enabled,
    queryFn: async (): Promise<ClockRecord[]> => {
      let query = requireClient(client)
        .from('staff_clock')
        .select(CLOCK_COLUMNS)
        .gte('clocked_in_at', from)
        .lt('clocked_in_at', until)
        .order('clocked_in_at', { ascending: false })
        .limit(500);
      query =
        'staffId' in filter
          ? query.eq('staff_id', filter.staffId)
          : query.eq('branch_id', filter.branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data.map((row) => {
        // RLS hides staff the viewer can't see, whatever the types say.
        const staff = row.staff_users as typeof row.staff_users | null;
        return {
          id: row.id,
          staffId: row.staff_id,
          fullName: staff?.full_name ?? null,
          branchId: row.branch_id,
          clockedInAt: row.clocked_in_at,
          clockedOutAt: row.clocked_out_at,
          method: row.method === 'card' ? 'card' : 'manual',
          note: row.note,
          voidedAt: row.voided_at,
          voidReason: row.void_reason,
        };
      });
    },
  });
}

export function useClockManual() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      staffId: string;
      branchId: string;
      clockIn: boolean;
      at: Date;
      note: string;
    }) => {
      const { error } = await requireClient(client).rpc('staff_clock_manual', {
        p_staff_id: input.staffId,
        p_branch_id: input.branchId,
        p_in: input.clockIn,
        p_at: input.at.toISOString(),
        p_note: input.note,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [HR_QUERY] }),
  });
}

export function useVoidClock() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordId, reason }: { recordId: string; reason: string }) => {
      const { error } = await requireClient(client).rpc('void_staff_clock', {
        p_record_id: recordId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [HR_QUERY] }),
  });
}

const clockAnswerSchema = z.object({
  result: z.enum(['in', 'out', 'already']),
  full_name: z.string().nullable(),
  clocked_in_at: z.string(),
  clocked_out_at: z.string().nullable(),
});

export type StaffClockAnswer = z.infer<typeof clockAnswerSchema>;

/** A staff card scanned at the check-in screen: clocks its owner in or out. */
export function useStaffClockByCard() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uid, branchId }: { uid: string; branchId: string }) => {
      const { data, error } = await requireClient(client).rpc('staff_clock_by_card', {
        p_uid: uid,
        p_branch_id: branchId,
      });
      if (error) throw error;
      return clockAnswerSchema.parse(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [HR_QUERY] }),
  });
}

export interface Shift {
  readonly id: string;
  readonly staffId: string;
  readonly branchId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly note: string | null;
}

/** A branch's shifts starting in [from, until), not removed. */
export function useShifts(branchId: string, from: string, until: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [HR_QUERY, actor, 'shifts', branchId, from, until],
    enabled: client !== undefined && branchId !== '',
    queryFn: async (): Promise<Shift[]> => {
      const { data, error } = await requireClient(client)
        .from('staff_shifts')
        .select('id, staff_id, branch_id, starts_at, ends_at, note')
        .eq('branch_id', branchId)
        .is('deleted_at', null)
        .gte('starts_at', from)
        .lt('starts_at', until)
        .order('starts_at');
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        staffId: row.staff_id,
        branchId: row.branch_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        note: row.note,
      }));
    },
  });
}

export function useSaveShift() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shift: Shift) => {
      const { error } = await requireClient(client).rpc('save_staff_shift', {
        p_id: shift.id,
        p_staff_id: shift.staffId,
        p_branch_id: shift.branchId,
        p_starts_at: shift.startsAt,
        p_ends_at: shift.endsAt,
        ...(shift.note ? { p_note: shift.note } : {}),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [HR_QUERY] }),
  });
}

export function useRemoveShift() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shiftId: string) => {
      const { error } = await requireClient(client).rpc('remove_staff_shift', { p_id: shiftId });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [HR_QUERY] }),
  });
}

export interface Trainer {
  readonly id: string;
  readonly fullName: string;
}

/** The active staff who teach (names only), optionally those of one branch. */
export function useTrainers(branchId: string | null) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [HR_QUERY, actor, 'trainers', branchId],
    enabled: client !== undefined,
    queryFn: async (): Promise<Trainer[]> => {
      const { data, error } = await requireClient(client).rpc(
        'trainers',
        branchId === null ? {} : { p_branch_id: branchId },
      );
      if (error) throw error;
      return data.map((row) => ({ id: row.id, fullName: row.full_name }));
    },
  });
}
