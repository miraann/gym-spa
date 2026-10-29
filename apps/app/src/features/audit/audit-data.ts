import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The audit log (Phase 10, step 10e): audit_logs as staff with audit.view see it (RLS), newest
// first, 100 at a time. Read only.

export const AUDIT_PAGE = 100;

export interface AuditFilter {
  /** Empty: every table. */
  readonly table: string;
  /** Empty: everyone. */
  readonly actorId: string;
  /** YYYY-MM-DD in Baghdad; empty: no limit. */
  readonly from: string;
  readonly to: string;
}

export interface AuditEntry {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorId: string | null;
  readonly table: string;
  readonly rowId: string;
  readonly action: 'insert' | 'update' | 'delete';
  readonly changedColumns: readonly string[] | null;
  readonly oldValues: Readonly<Record<string, unknown>> | null;
  readonly newValues: Readonly<Record<string, unknown>> | null;
}

function objectOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function startOf(day: string): string {
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}

function nextDayStart(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00+03:00`) + 86_400_000).toISOString();
}

export function useAuditLog(filter: AuditFilter) {
  const { client, actor } = useActingClient();
  return useInfiniteQuery({
    queryKey: ['audit', actor, filter],
    enabled: client !== undefined,
    initialPageParam: 0,
    getNextPageParam: (last: readonly AuditEntry[], pages) =>
      last.length < AUDIT_PAGE ? undefined : pages.length * AUDIT_PAGE,
    queryFn: async ({ pageParam }): Promise<AuditEntry[]> => {
      let query = requireClient(client)
        .from('audit_logs')
        .select(
          'id, occurred_at, actor_id, table_name, row_id, action, changed_columns, old_values, new_values',
        )
        .order('occurred_at', { ascending: false })
        .range(pageParam, pageParam + AUDIT_PAGE - 1);
      if (filter.table !== '') query = query.eq('table_name', filter.table);
      if (filter.actorId !== '') query = query.eq('actor_id', filter.actorId);
      if (filter.from !== '') query = query.gte('occurred_at', startOf(filter.from));
      if (filter.to !== '') query = query.lt('occurred_at', nextDayStart(filter.to));
      const { data, error } = await query;
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at,
        actorId: row.actor_id,
        table: row.table_name,
        rowId: row.row_id,
        action: row.action === 'insert' || row.action === 'delete' ? row.action : 'update',
        changedColumns: row.changed_columns,
        oldValues: objectOf(row.old_values),
        newValues: objectOf(row.new_values),
      }));
    },
  });
}

/** The tables the log names, for the filter. */
export function useAuditTables() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: ['audit', actor, 'tables'],
    enabled: client !== undefined,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await requireClient(client).rpc('audit_tables');
      if (error) throw error;
      return data;
    },
  });
}

/** A stored value as one line of text. */
export function valueText(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** The columns an entry shows: what changed (an update), or every column (added or removed). */
export function entryColumns(entry: AuditEntry): string[] {
  if (entry.changedColumns && entry.changedColumns.length > 0) return [...entry.changedColumns];
  return Object.keys(entry.newValues ?? entry.oldValues ?? {}).filter(
    (column) => !['updated_at', 'updated_by'].includes(column),
  );
}
