import type { OverridableReason } from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import { SUBSCRIPTIONS_QUERY } from '@/features/subscriptions/subscription-data';
import { ATTENDANCE_QUERY } from './checkin-data';

// The visits of a branch's day and who is inside now (step 4c), read as the staff member
// (attendance.view). Checking out and voiding go through check_out() and void_visit().

/** How often who is inside is read again while the screen is open. */
const REFRESH_MS = 30_000;
/** A day of one branch has fewer visits than this; more are left out (and said so). */
export const VISITS_LIMIT = 500;

export interface Visit {
  readonly id: string;
  readonly checkedInAt: string;
  readonly checkedOutAt: string | null;
  readonly method: 'card' | 'manual';
  readonly overrideReason: OverridableReason | null;
  readonly overrideNote: string | null;
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
  readonly inside: boolean;
  readonly member: {
    readonly id: string;
    readonly fullName: string;
    readonly memberNumber: number;
    readonly photoUpdatedAt: string | null;
  };
  readonly subscription: LocalizedNames | null;
}

export function useVisits(branchId: string, date: string, insideOnly: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [ATTENDANCE_QUERY, actor, 'day', branchId, date, insideOnly],
    enabled: client !== undefined && branchId !== '',
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<Visit[]> => {
      let query = requireClient(client)
        .from('attendance')
        .select(
          'id, checked_in_at, checked_out_at, method, override_reason, override_note, voided_at, void_reason, inside, members (id, full_name, member_number, photo_updated_at), subscriptions (name_ckb, name_en, name_ar)',
        )
        .eq('branch_id', branchId)
        .eq('visit_date', date);
      if (insideOnly) query = query.is('inside', true);
      const { data, error } = await query
        .order('checked_in_at', { ascending: false })
        .limit(VISITS_LIMIT);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        checkedInAt: row.checked_in_at,
        checkedOutAt: row.checked_out_at,
        method: row.method === 'card' ? 'card' : 'manual',
        overrideReason: row.override_reason as OverridableReason | null,
        overrideNote: row.override_note,
        voidedAt: row.voided_at,
        voidReason: row.void_reason,
        inside: row.inside === true,
        member: {
          id: row.members.id,
          fullName: row.members.full_name,
          memberNumber: row.members.member_number,
          photoUpdatedAt: row.members.photo_updated_at,
        },
        subscription: row.subscriptions
          ? {
              nameCkb: row.subscriptions.name_ckb,
              nameEn: row.subscriptions.name_en,
              nameAr: row.subscriptions.name_ar,
            }
          : null,
      }));
    },
  });
}

/** How many members are inside the branch now. */
export function useOccupancy(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [ATTENDANCE_QUERY, actor, 'occupancy', branchId],
    enabled: client !== undefined && branchId !== '',
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<number> => {
      const { data, error } = await requireClient(client).rpc('branch_occupancy', {
        p_branch_id: branchId,
      });
      if (error) throw error;
      return data;
    },
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [ATTENDANCE_QUERY, SUBSCRIPTIONS_QUERY].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

export function useCheckOut() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await requireClient(client).rpc('check_out', {
        p_attendance_id: visitId,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useVoidVisit() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: { visitId: string; reason: string }) => {
      const { error } = await requireClient(client).rpc('void_visit', {
        p_attendance_id: input.visitId,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}
