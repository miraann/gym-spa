import { useQuery } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import type { AppSupabaseClient } from '@/lib/backend';

// The reports (Phase 10, steps 10b and 10c): each is one report_*() function in the database that
// checks the staff member's gym, branches and permissions. Here each one's rows are read and kept
// as they come; report-table.ts turns them into what the screen, Excel and print show.

export const REPORT_KEYS = [
  'revenue',
  'payments',
  'attendance',
  'peakHours',
  'plans',
  'retention',
  'debts',
  'inventory',
  'cash',
  'discounts',
  'staff',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** The reports that show money: reports.financial.view. */
export const MONEY_REPORTS: ReadonlySet<ReportKey> = new Set([
  'revenue',
  'payments',
  'plans',
  'debts',
  'cash',
  'discounts',
  'staff',
]);

export interface ReportFilter {
  readonly from: string;
  readonly to: string;
  /** Empty: every branch the staff member reaches. */
  readonly branchId: string;
}

export interface Names {
  readonly nameCkb: string;
  readonly nameEn: string | null;
  readonly nameAr: string | null;
}

export type ReportRows =
  | {
      readonly key: 'revenue';
      readonly rows: readonly { day: string; source: string; amount: number }[];
    }
  | {
      readonly key: 'payments';
      readonly rows: readonly {
        method: string;
        currency: string;
        payments: number;
        amount: number;
        refunds: number;
        dollars: number;
      }[];
    }
  | {
      readonly key: 'attendance';
      readonly rows: readonly { day: string; visits: number; members: number }[];
    }
  | {
      readonly key: 'peakHours';
      readonly rows: readonly { weekday: number; hour: number; visits: number }[];
    }
  | { readonly key: 'plans'; readonly rows: readonly (Names & { sold: number; revenue: number })[] }
  | {
      readonly key: 'retention';
      readonly rows: readonly {
        fullName: string;
        memberNumber: number;
        endedOn: string;
        renewedOn: string | null;
      }[];
    }
  | {
      readonly key: 'debts';
      readonly rows: readonly {
        fullName: string;
        memberNumber: number;
        phone: string | null;
        due: number;
        owedNow: number;
        nextDueDate: string | null;
      }[];
    }
  | {
      readonly key: 'inventory';
      readonly rows: readonly (Names & {
        branchId: string;
        quantity: number;
        lowStockLevel: number | null;
        unitCost: number | null;
        value: number | null;
      })[];
    }
  | {
      readonly key: 'cash';
      readonly rows: readonly {
        branchId: string;
        closedAt: string;
        openedBy: string | null;
        closedBy: string | null;
        expectedIqd: number;
        countedIqd: number;
        differenceIqd: number;
        differenceUsd: number;
      }[];
    }
  | {
      readonly key: 'discounts';
      readonly rows: readonly { fullName: string | null; invoices: number; discount: number }[];
    }
  | {
      readonly key: 'staff';
      readonly rows: readonly {
        fullName: string;
        payments: number;
        amount: number;
        subscriptions: number;
        manualCheckins: number;
      }[];
    };

const num = (value: number | string | null | undefined): number => Number(value ?? 0);
const numOrNull = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);
/** The generated types call every returned column non-null; these can be null. */
const nullable = <T>(value: T): T | null => value;

async function fetchReport(
  db: AppSupabaseClient,
  key: ReportKey,
  filter: ReportFilter,
): Promise<ReportRows> {
  const range = {
    p_from: filter.from,
    p_to: filter.to,
    ...(filter.branchId === '' ? {} : { p_branch_id: filter.branchId }),
  };
  switch (key) {
    case 'revenue': {
      const { data, error } = await db.rpc('report_revenue', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({ day: row.day, source: row.source, amount: num(row.amount) })),
      };
    }
    case 'payments': {
      const { data, error } = await db.rpc('report_payments', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          method: row.method,
          currency: row.currency,
          payments: num(row.payments),
          amount: num(row.amount),
          refunds: num(row.refunds),
          dollars: num(row.dollars),
        })),
      };
    }
    case 'attendance': {
      const { data, error } = await db.rpc('report_attendance', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          day: row.day,
          visits: num(row.visits),
          members: num(row.members),
        })),
      };
    }
    case 'peakHours': {
      const { data, error } = await db.rpc('report_peak_hours', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          weekday: num(row.weekday),
          hour: num(row.hour),
          visits: num(row.visits),
        })),
      };
    }
    case 'plans': {
      const { data, error } = await db.rpc('report_plans', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          nameCkb: row.name_ckb,
          nameEn: nullable(row.name_en),
          nameAr: nullable(row.name_ar),
          sold: num(row.sold),
          revenue: num(row.revenue),
        })),
      };
    }
    case 'retention': {
      const { data, error } = await db.rpc('report_retention', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          fullName: row.full_name,
          memberNumber: num(row.member_number),
          endedOn: row.ended_on,
          renewedOn: nullable(row.renewed_on),
        })),
      };
    }
    case 'debts': {
      // What is owed now does not depend on the range; RLS shows the members the staff member sees.
      const { data, error } = await db
        .from('member_debts')
        .select('full_name, member_number, phone, due, owed_now, next_due_date')
        .order('owed_now', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          fullName: row.full_name ?? '',
          memberNumber: num(row.member_number),
          phone: row.phone,
          due: num(row.due),
          owedNow: num(row.owed_now),
          nextDueDate: row.next_due_date,
        })),
      };
    }
    case 'inventory': {
      const { data, error } = await db.rpc(
        'report_inventory',
        filter.branchId === '' ? {} : { p_branch_id: filter.branchId },
      );
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          nameCkb: row.name_ckb,
          nameEn: nullable(row.name_en),
          nameAr: nullable(row.name_ar),
          branchId: row.branch_id,
          quantity: num(row.quantity),
          lowStockLevel: numOrNull(nullable(row.low_stock_level)),
          unitCost: numOrNull(nullable(row.unit_cost)),
          value: numOrNull(nullable(row.value)),
        })),
      };
    }
    case 'cash': {
      const { data, error } = await db.rpc('report_cash', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          branchId: row.branch_id,
          closedAt: row.closed_at,
          openedBy: nullable(row.opened_by),
          closedBy: nullable(row.closed_by),
          expectedIqd: num(row.expected_iqd),
          countedIqd: num(row.counted_iqd),
          differenceIqd: num(row.difference_iqd),
          differenceUsd: num(row.difference_usd),
        })),
      };
    }
    case 'discounts': {
      const { data, error } = await db.rpc('report_discounts', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          fullName: nullable(row.full_name),
          invoices: num(row.invoices),
          discount: num(row.discount),
        })),
      };
    }
    case 'staff': {
      const { data, error } = await db.rpc('report_staff', range);
      if (error) throw error;
      return {
        key,
        rows: data.map((row) => ({
          fullName: row.full_name,
          payments: num(row.payments),
          amount: num(row.amount),
          subscriptions: num(row.subscriptions),
          manualCheckins: num(row.manual_checkins),
        })),
      };
    }
  }
}

/** A report's rows for a filter; read when asked for, kept for a minute. */
export function useReport(key: ReportKey, filter: ReportFilter, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: ['reports', actor, key, filter.from, filter.to, filter.branchId],
    enabled: enabled && client !== undefined,
    staleTime: 60_000,
    queryFn: () => fetchReport(requireClient(client), key, filter),
  });
}
