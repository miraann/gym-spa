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

export interface DashboardTrends {
  /** Check-ins yesterday up to this time of day. */
  readonly checkinsYesterday: number | null;
  /** Check-ins per day, the last 7 days, today last. */
  readonly checkinsWeek: readonly number[] | null;
  /** Dinars. */
  readonly takingsYesterday: number | null;
  readonly takingsWeek: readonly number[] | null;
  readonly classesToday: number | null;
  readonly classesNow: number | null;
  readonly classPlaces: number | null;
  readonly classTaken: number | null;
  readonly ptToday: number | null;
}

function week(value: unknown): readonly number[] | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  return value.map((each: unknown) => numberOf(each) ?? 0);
}

export function parseDashboardTrends(json: unknown): DashboardTrends {
  const raw = json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  return {
    checkinsYesterday: numberOf(raw.checkins_yesterday),
    checkinsWeek: week(raw.checkins_week),
    takingsYesterday: numberOf(raw.takings_yesterday),
    takingsWeek: week(raw.takings_week),
    classesToday: numberOf(raw.classes_today),
    classesNow: numberOf(raw.classes_now),
    classPlaces: numberOf(raw.class_places),
    classTaken: numberOf(raw.class_taken),
    ptToday: numberOf(raw.pt_today),
  };
}

/**
 * Today against yesterday up to the same time, in whole percent (+12, -8, 0); null when there is
 * nothing to compare with (yesterday had none by now), so no "+∞%" is shown.
 */
export function trendPercent(today: number | null, yesterday: number | null): number | null {
  if (today === null || yesterday === null || yesterday <= 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

/** The dashboard's trends (step D-4): what the tiles compare and draw, read again every minute. */
export function useDashboardTrends(enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: ['dashboard', 'trends', actor],
    enabled: enabled && client !== undefined,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DashboardTrends> => {
      const { data, error } = await requireClient(client).rpc('dashboard_trends');
      if (error) throw error;
      return parseDashboardTrends(data);
    },
  });
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
