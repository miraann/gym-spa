import { PAYMENT_METHODS } from '@gym/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The cash register's server calls (step 8e), with the acting staff member's own session: shifts
// are seen with cash_register.operate or view_all in their branches; the report comes from
// cash_shift_report(), which leaves an open shift's expected amounts out without view_all.
// supabase/migrations/20261029200000_cash_register.sql.

export const CASH_QUERY = 'cash';

export interface CashShift {
  readonly id: string;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly countedIqd: number | null;
  readonly countedUsd: number | null;
  readonly expectedIqd: number | null;
  readonly expectedUsd: number | null;
}

/** A branch's shifts, the latest first: the open one (if any) and the last 30. */
export function useCashShifts(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [CASH_QUERY, actor, 'shifts', branchId],
    enabled: client !== undefined && branchId !== '',
    queryFn: async (): Promise<CashShift[]> => {
      const { data, error } = await requireClient(client)
        .from('cash_shifts')
        .select('id, opened_at, closed_at, counted_iqd, counted_usd, expected_iqd, expected_usd')
        .eq('branch_id', branchId)
        .order('opened_at', { ascending: false })
        .limit(31);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        countedIqd: row.counted_iqd,
        countedUsd: row.counted_usd,
        expectedIqd: row.expected_iqd,
        expectedUsd: row.expected_usd,
      }));
    },
  });
}

const reportSchema = z.object({
  shift_id: z.string(),
  opened_at: z.string(),
  opened_by: z.string().nullable(),
  closed_at: z.string().nullable(),
  closed_by: z.string().nullable(),
  opening_iqd: z.number(),
  opening_usd: z.number(),
  close_note: z.string().nullable(),
  methods: z.array(
    z.object({
      method: z.enum(PAYMENT_METHODS),
      kind: z.enum(['payment', 'refund']),
      count: z.number(),
      amount: z.number(),
      usd: z.number().nullable(),
    }),
  ),
  cash_in_iqd: z.number(),
  cash_out_iqd: z.number(),
  cash_in_usd: z.number(),
  cash_out_usd: z.number(),
  expected_iqd: z.number().nullable(),
  expected_usd: z.number().nullable(),
  counted_iqd: z.number().nullable(),
  counted_usd: z.number().nullable(),
  difference_iqd: z.number().nullable(),
  difference_usd: z.number().nullable(),
});

export type CashReport = z.infer<typeof reportSchema>;

/** What a shift took and what its drawer should have; refreshed while it is open. */
export function useCashReport(shiftId: string | null) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [CASH_QUERY, actor, 'report', shiftId],
    enabled: client !== undefined && shiftId !== null,
    // The drawer changes with every payment: read again whenever the page shows it.
    staleTime: 0,
    refetchInterval: 30_000,
    queryFn: async (): Promise<CashReport> => {
      const { data, error } = await requireClient(client).rpc('cash_shift_report', {
        p_shift_id: shiftId ?? '',
      });
      if (error) throw error;
      return reportSchema.parse(data);
    },
  });
}

export function useOpenCashShift() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; branchId: string; iqd: number; usd: number }) => {
      const { error } = await requireClient(client).rpc('open_cash_shift', {
        p_id: input.id,
        p_branch_id: input.branchId,
        p_opening_iqd: input.iqd,
        p_opening_usd: input.usd,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CASH_QUERY] }),
  });
}

export function useAddCashMovement() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      shiftId: string;
      kind: 'in' | 'out';
      currency: 'IQD' | 'USD';
      amount: number;
      reason: string;
    }) => {
      const { error } = await requireClient(client).rpc('add_cash_movement', {
        p_id: input.id,
        p_shift_id: input.shiftId,
        p_kind: input.kind,
        p_currency: input.currency,
        p_amount: input.amount,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CASH_QUERY] }),
  });
}

export function useCloseCashShift() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      shiftId: string;
      iqd: number;
      usd: number;
      note: string | null;
    }): Promise<CashReport> => {
      const { data, error } = await requireClient(client).rpc('close_cash_shift', {
        p_shift_id: input.shiftId,
        p_counted_iqd: input.iqd,
        p_counted_usd: input.usd,
        ...(input.note ? { p_note: input.note } : {}),
      });
      if (error) throw error;
      return reportSchema.parse(data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [CASH_QUERY] }),
  });
}
