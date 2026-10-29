import { strToU8, zipSync } from 'fflate';
import Papa from 'papaparse';
import type { AppSupabaseClient } from '@/lib/backend';

// Exporting all of a gym's data (Phase 10, step 10f; backups.export): one .zip of CSV files, one
// per table, of everything the staff member may read (RLS decides), made here page by page. It is
// an export, not a backup that can be restored: the offline edition's backups come with the
// offline packaging phase.

/** The tables exported, in this order. */
export const EXPORT_TABLES = [
  'branches',
  'roles',
  'role_permissions',
  'staff_users',
  'staff_branches',
  'staff_profiles',
  'staff_cards',
  'staff_clock',
  'staff_shifts',
  'devices',
  'settings',
  'members',
  'member_health',
  'member_imports',
  'nfc_cards',
  'plans',
  'plan_branches',
  'plan_spa_sessions',
  'subscriptions',
  'subscription_freezes',
  'subscription_spa_sessions',
  'invoices',
  'invoice_items',
  'invoice_credits',
  'installments',
  'payments',
  'cash_shifts',
  'cash_movements',
  'attendance',
  'lockers',
  'locker_assignments',
  'spa_services',
  'spa_rooms',
  'spa_therapists',
  'spa_therapist_services',
  'spa_therapist_hours',
  'spa_packages',
  'member_spa_packages',
  'spa_bookings',
  'class_types',
  'class_schedules',
  'class_sessions',
  'class_bookings',
  'pt_packages',
  'member_pt_packages',
  'pt_sessions',
  'product_categories',
  'products',
  'stock_movements',
  'message_templates',
  'reminders',
  'member_messages',
  'staff_notifications',
  'support_grants',
  'support_reads',
  'audit_logs',
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

/**
 * Left out on purpose: photos (large; they stay in the app), the global permission catalog, PIN
 * hashes (nobody reads them), the gym's own row, and rows the server keeps for itself (device
 * heartbeats, the branch access list, who read which notification).
 */
export const NOT_EXPORTED = [
  'member_photos',
  'permissions',
  'staff_pins',
  'gyms',
  'device_status',
  'staff_branch_access',
  'staff_notification_reads',
] as const;

const PAGE = 1000;

/** A value as one CSV cell: JSON for objects and lists, nothing for null. */
function cellOf(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

/** Rows as CSV, with a byte order mark so Excel reads Kurdish and Arabic. */
export function toCsv(rows: readonly Readonly<Record<string, unknown>>[]): string {
  if (rows.length === 0) return '\uFEFF';
  const columns = Object.keys(rows[0] ?? {});
  return `\uFEFF${Papa.unparse({
    fields: columns,
    data: rows.map((row) => columns.map((column) => cellOf(row[column]))),
  })}`;
}

async function readTable(
  db: AppSupabaseClient,
  table: ExportTable,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) return rows;
  }
}

/** Every exported table as CSV in one zip; `onTable` says how far it got. */
export async function exportGymData(
  db: AppSupabaseClient,
  onTable: (done: number, total: number) => void,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (const [index, table] of EXPORT_TABLES.entries()) {
    files[`${table}.csv`] = strToU8(toCsv(await readTable(db, table)));
    onTable(index + 1, EXPORT_TABLES.length);
  }
  return new Blob([zipSync(files)], { type: 'application/zip' });
}
