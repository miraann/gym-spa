import { useQuery } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The dashboard (Phase 10, step 10a): today's numbers from dashboard_summary(), as the staff
// member, so each part is there only with its permission (null otherwise).

export interface DashboardSummary {
  readonly checkinsToday: number | null;
  readonly insideNow: number | null;
  /** Check-ins per hour today (Baghdad), 24 numbers; null without attendance.view. */
  readonly hourly: readonly number[] | null;
  readonly activeMembers: number | null;
  readonly newThisMonth: number | null;
  readonly endingThisWeek: number | null;
  readonly spaToday: number | null;
  /** Dinars. */
  readonly takingsToday: number | null;
  readonly owedNow: number | null;
}

function numberOf(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

export function parseDashboardSummary(json: unknown): DashboardSummary {
  const raw = json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const hourly = Array.isArray(raw.hourly)
    ? raw.hourly.map((value: unknown) => numberOf(value) ?? 0)
    : null;
  return {
    checkinsToday: numberOf(raw.checkins_today),
    insideNow: numberOf(raw.inside_now),
    hourly: hourly?.length === 24 ? hourly : null,
    activeMembers: numberOf(raw.active_members),
    newThisMonth: numberOf(raw.new_this_month),
    endingThisWeek: numberOf(raw.ending_this_week),
    spaToday: numberOf(raw.spa_today),
    takingsToday: numberOf(raw.takings_today),
    owedNow: numberOf(raw.owed_now),
  };
}

/** Today's numbers in every branch the staff member reaches, read again every minute. */
export function useDashboard(enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: ['dashboard', actor],
    enabled: enabled && client !== undefined,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DashboardSummary> => {
      const { data, error } = await requireClient(client).rpc('dashboard_summary');
      if (error) throw error;
      return parseDashboardSummary(data);
    },
  });
}

/** The hours a day's chart shows: 06:00 to 22:00, widened to any hour that had a check-in. */
export function chartHours(hourly: readonly number[]): number[] {
  const busy = hourly.flatMap((visits, hour) => (visits > 0 ? [hour] : []));
  const first = Math.min(6, ...busy);
  const last = Math.max(22, ...busy);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
