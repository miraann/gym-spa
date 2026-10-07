import { Schema, Table, column } from '@powersync/common';

// The local SQLite database on each device (PowerSync). Synced tables mirror the Postgres tables
// that supabase/powersync/sync-config.yaml sends to devices; schema-drift.ts makes typecheck fail
// when a Postgres column is added, removed or renamed without updating this file.
//
// PowerSync stores values as SQLite types: uuids, timestamps (ISO text) and JSON as text, booleans
// as integers (0/1).

// Tables devices write to record each change's author in `_metadata` (see writeMetadata()), so
// the upload connector sends the change under that staff member's own session.
const authored = { trackMetadata: true } as const;

const branches = new Table(
  {
    code: column.text,
    name_ckb: column.text,
    name_en: column.text,
    name_ar: column.text,
    phone: column.text,
    address: column.text,
    is_active: column.integer,
    created_at: column.text,
    created_by: column.text,
    updated_at: column.text,
    updated_by: column.text,
    deleted_at: column.text,
  },
  authored,
);

const roles = new Table(
  {
    key: column.text,
    name_ckb: column.text,
    name_en: column.text,
    name_ar: column.text,
    is_system: column.integer,
    created_at: column.text,
    created_by: column.text,
    updated_at: column.text,
    updated_by: column.text,
    deleted_at: column.text,
  },
  authored,
);

// Read-only catalog. Synced with key AS id.
const permissions = new Table({
  module: column.text,
  sort_order: column.integer,
});

const role_permissions = new Table(
  {
    role_id: column.text,
    permission_key: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { ...authored, indexes: { role: ['role_id'] } },
);

const staff_users = new Table(
  {
    username: column.text,
    full_name: column.text,
    phone: column.text,
    role_id: column.text,
    all_branches: column.integer,
    preferred_language: column.text,
    is_active: column.integer,
    must_change_password: column.integer,
    created_at: column.text,
    created_by: column.text,
    updated_at: column.text,
    updated_by: column.text,
    deleted_at: column.text,
  },
  authored,
);

const staff_branches = new Table(
  {
    staff_id: column.text,
    branch_id: column.text,
    created_at: column.text,
    created_by: column.text,
  },
  { ...authored, indexes: { staff: ['staff_id'], branch: ['branch_id'] } },
);

// Derived on the server (app.refresh_branch_access); read-only here.
const staff_branch_access = new Table(
  {
    staff_id: column.text,
    branch_id: column.text,
  },
  { indexes: { staff: ['staff_id'], branch: ['branch_id'] } },
);

const devices = new Table(
  {
    branch_id: column.text,
    code: column.text,
    name: column.text,
    platform: column.text,
    default_language: column.text,
    is_active: column.integer,
    created_at: column.text,
    created_by: column.text,
    updated_at: column.text,
    updated_by: column.text,
    deleted_at: column.text,
  },
  authored,
);

const settings = new Table(
  {
    branch_id: column.text,
    key: column.text,
    // JSON text
    value: column.text,
    created_at: column.text,
    created_by: column.text,
    updated_at: column.text,
    updated_by: column.text,
  },
  { ...authored, indexes: { key: ['key'] } },
);

// Local only ----------------------------------------------------------------------------------

/**
 * Changes the server refused (permission, validation, guard). They are never retried; the Sync
 * screen lists them with their translated reason. The local row returns to the server's version
 * with the next sync.
 */
const rejected_changes = new Table(
  {
    table_name: column.text,
    row_id: column.text,
    // PUT, PATCH or DELETE
    op: column.text,
    // JSON of the values that were sent
    data: column.text,
    author_id: column.text,
    // Postgres SQLSTATE / PostgREST code, and the guard's stable key when there is one
    error_code: column.text,
    error_key: column.text,
    error_message: column.text,
    rejected_at: column.text,
  },
  { localOnly: true },
);

/** Small per-device values (device id, chosen branch). id = the key. */
const local_kv = new Table({ value: column.text }, { localOnly: true });

export const AppSchema = new Schema({
  branches,
  roles,
  permissions,
  role_permissions,
  staff_users,
  staff_branches,
  staff_branch_access,
  devices,
  settings,
  rejected_changes,
  local_kv,
});

export type LocalDatabase = (typeof AppSchema)['types'];
export type LocalTableName = keyof LocalDatabase;
/** Tables that come from the server (the rest are local only). */
export const SYNCED_TABLES = [
  'branches',
  'roles',
  'permissions',
  'role_permissions',
  'staff_users',
  'staff_branches',
  'staff_branch_access',
  'devices',
  'settings',
] as const satisfies readonly LocalTableName[];
export type SyncedTableName = (typeof SYNCED_TABLES)[number];

/** Who made a local change. Stored in `_metadata` on authored tables. */
export interface ChangeMetadata {
  author: string;
}

/** The `_metadata` value to set on every insert/update/delete of an authored table. */
export function writeMetadata(authorId: string): string {
  return JSON.stringify({ author: authorId } satisfies ChangeMetadata);
}

/** Reads the author from a queued change's metadata; null when missing or malformed. */
export function readAuthor(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'author' in parsed &&
      typeof parsed.author === 'string'
    ) {
      return parsed.author;
    }
  } catch {
    // Malformed metadata: treated as unknown author.
  }
  return null;
}
