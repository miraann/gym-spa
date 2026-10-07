import { type CommonPowerSyncDatabase, type CrudEntry, UpdateType } from '@powersync/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAuthor } from './schema';

// Sends the local upload queue to Supabase. Every change goes up under its author's own session,
// so the server checks permissions with auth.uid() and never trusts an id in the data.
//
//   * Network problems, server errors and expired sessions: retried later, with backoff.
//   * Changes the server refuses (permissions, validation, guards): recorded in rejected_changes
//     and never retried. The local row goes back to the server's version with the next sync.

/** jsonb columns, stored as JSON text locally and sent as JSON. */
const JSON_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  settings: ['value'],
};

/** The session an author's changes are sent with. */
export type AuthorSession =
  | { readonly kind: 'ready'; readonly client: SupabaseClient }
  /** Not usable right now (offline, refresh failed): try again later. */
  | { readonly kind: 'unavailable' }
  /** Gone for good (logged out everywhere, deactivated): their changes are rejected. */
  | { readonly kind: 'signed_out' };

export interface UploadSessions {
  forAuthor(authorId: string): Promise<AuthorSession>;
}

/** What a PostgREST call returned: enough to decide between retry and reject. */
export interface UploadError {
  readonly status: number;
  readonly code?: string;
  readonly message?: string;
}

export type ErrorDecision = 'retry' | 'reject';

const RETRY_STATUSES = new Set([0, 408, 425, 429]);
// PostgREST: JWT expired / invalid / missing. The session gets refreshed and the change resent.
const SESSION_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);
// Postgres classes that mean "this change is wrong": data (22), integrity (23), access and
// syntax (42), raised by a guard (P0).
const REJECT_CODE_CLASSES = ['22', '23', '42', 'P0'];

export function classifyUploadError(error: UploadError): ErrorDecision {
  const code = error.code ?? '';
  if (RETRY_STATUSES.has(error.status) || error.status >= 500) return 'retry';
  if (SESSION_CODES.has(code)) return 'retry';
  if (REJECT_CODE_CLASSES.some((prefix) => code.startsWith(prefix))) return 'reject';
  if (code.startsWith('PGRST')) return 'reject';
  // Any other 4xx is a request the server won't accept as it is.
  if (error.status >= 400) return 'reject';
  return 'retry';
}

/** The key the app translates. Guards raise a stable key as their message; others get a generic one. */
export function rejectionKey(error: UploadError): string {
  const message = error.message ?? '';
  if (/^[a-z][a-z0-9_]{2,60}$/.test(message)) return message;
  const code = error.code ?? '';
  if (code === '42501') return 'not_allowed';
  if (code === '23505') return 'duplicate';
  if (code === '23503') return 'missing_reference';
  if (code.startsWith('22') || code === '23514' || code === '23502') return 'invalid_value';
  return 'rejected';
}

export type ChangeOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'retry'; readonly reason: string }
  | { readonly kind: 'rejected'; readonly error: UploadError; readonly key: string };

function toServerValues(table: string, values: Record<string, unknown>): Record<string, unknown> {
  const jsonColumns = JSON_COLUMNS[table] ?? [];
  const result: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(values)) {
    result[column] =
      jsonColumns.includes(column) && typeof value === 'string'
        ? (JSON.parse(value) as unknown)
        : value;
  }
  return result;
}

interface PostgrestResult {
  readonly error: { code?: string; message?: string } | null;
  readonly status: number;
  readonly count?: number | null;
}

function failure(result: PostgrestResult): ChangeOutcome {
  const error: UploadError = {
    status: result.status,
    code: result.error?.code,
    message: result.error?.message,
  };
  return classifyUploadError(error) === 'retry'
    ? {
        kind: 'retry',
        reason: `${String(error.status)} ${error.code ?? ''} ${error.message ?? ''}`,
      }
    : { kind: 'rejected', error, key: rejectionKey(error) };
}

export type QueuedChange = Pick<CrudEntry, 'table' | 'id' | 'op' | 'opData'>;

/** Sends one queued change with the given client. */
export async function applyChange(
  client: SupabaseClient,
  entry: QueuedChange,
): Promise<ChangeOutcome> {
  const table = entry.table;
  const values = toServerValues(table, entry.opData ?? {});

  if (entry.op === UpdateType.PUT) {
    // Never an upsert: a stale insert must not overwrite newer changes from other devices.
    const result: PostgrestResult = await client.from(table).insert({ ...values, id: entry.id });
    // The row is already there: an earlier attempt arrived but its response was lost.
    if (result.error?.code === '23505' && result.error.message?.includes(`"${table}_pkey"`)) {
      return { kind: 'done' };
    }
    return result.error ? failure(result) : { kind: 'done' };
  }

  if (entry.op === UpdateType.PATCH) {
    const result: PostgrestResult = await client
      .from(table)
      .update(values, { count: 'exact' })
      .eq('id', entry.id);
    if (result.error) return failure(result);
    // RLS hides rows the author may not change, and deleted rows are gone: either way the server
    // didn't take the change.
    if (result.count === 0) {
      const error: UploadError = { status: 404, message: 'not_found_or_not_allowed' };
      return { kind: 'rejected', error, key: 'not_found_or_not_allowed' };
    }
    return { kind: 'done' };
  }

  // DELETE. Nothing deleted means it is already gone (or hidden); the next sync shows the
  // server's version either way.
  const result: PostgrestResult = await client.from(table).delete().eq('id', entry.id);
  return result.error ? failure(result) : { kind: 'done' };
}

async function recordRejection(
  db: CommonPowerSyncDatabase,
  entry: CrudEntry,
  authorId: string | null,
  error: UploadError,
  key: string,
): Promise<void> {
  // One record per queued change, even if the transaction is retried after a later failure.
  const id = `crud-${String(entry.clientId)}`;
  const existing = await db.getOptional('SELECT id FROM rejected_changes WHERE id = ?', [id]);
  if (existing) return;
  await db.execute(
    `INSERT INTO rejected_changes
       (id, table_name, row_id, op, data, author_id, error_code, error_key, error_message, rejected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.table,
      entry.id,
      entry.op,
      JSON.stringify(entry.opData ?? {}),
      authorId,
      error.code ?? String(error.status),
      key,
      error.message ?? '',
      new Date().toISOString(),
    ],
  );
}

export class UploadRetryError extends Error {
  override readonly name = 'UploadRetryError';
}

export interface UploaderOptions {
  readonly sessions: UploadSessions;
  /** Extra wait before a retry, by consecutive failures (PowerSync adds its own 5 s). */
  readonly backoffMs?: (failures: number) => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultBackoff = (failures: number) => Math.min(1000 * 2 ** (failures - 1), 60_000);
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The `uploadData` of a PowerSync connector. */
export function createUploader(options: UploaderOptions) {
  const backoff = options.backoffMs ?? defaultBackoff;
  const sleep = options.sleep ?? defaultSleep;
  let failures = 0;

  async function retryLater(reason: string): Promise<never> {
    failures += 1;
    await sleep(backoff(failures));
    throw new UploadRetryError(reason);
  }

  return async function uploadData(db: CommonPowerSyncDatabase): Promise<void> {
    for (;;) {
      const transaction = await db.getNextCrudTransaction();
      if (!transaction) {
        failures = 0;
        return;
      }

      for (const entry of transaction.crud) {
        const authorId = readAuthor(entry.metadata);
        if (!authorId) {
          const error: UploadError = { status: 0, message: 'missing_author' };
          await recordRejection(db, entry, null, error, 'missing_author');
          continue;
        }

        const session = await options.sessions.forAuthor(authorId);
        if (session.kind === 'unavailable') return retryLater(`session of ${authorId} unavailable`);
        if (session.kind === 'signed_out') {
          const error: UploadError = { status: 401, message: 'author_signed_out' };
          await recordRejection(db, entry, authorId, error, 'author_signed_out');
          continue;
        }

        let outcome: ChangeOutcome;
        try {
          outcome = await applyChange(session.client, entry);
        } catch (thrown) {
          // fetch itself failed (offline, DNS, connection reset).
          return retryLater(thrown instanceof Error ? thrown.message : String(thrown));
        }
        if (outcome.kind === 'retry') return retryLater(outcome.reason);
        if (outcome.kind === 'rejected') {
          await recordRejection(db, entry, authorId, outcome.error, outcome.key);
        }
      }

      await transaction.complete();
      failures = 0;
    }
  };
}
