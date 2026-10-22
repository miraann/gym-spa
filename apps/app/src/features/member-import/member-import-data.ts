import { type ImportPayloadRow, type ImportRow, type ImportServerMatch } from '@gym/core';
import { useMutation, useQuery, useQueryClient, type Query } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import type { AppSupabaseClient } from '@/lib/backend';
import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

// The import page's server calls (step 2j), with the acting staff member's own session: the
// preview's check against existing members, and the import itself (all or nothing).

/** Rows per check call: each stays far below the cloud's statement timeout (README → Importing). */
const CHECK_ROWS_PER_CALL = 1000;

const MATCHES = ['phone', 'card_active', 'card_blocked', 'same_name', 'similar_name'] as const;

function isMatch(value: string): value is ImportServerMatch['match'] {
  return MATCHES.some((match) => match === value);
}

async function checkRows(
  client: AppSupabaseClient,
  rows: readonly ImportRow[],
): Promise<ImportServerMatch[]> {
  // Rows with errors too: once fixed (a branch chosen), they need no second check.
  const wanted = rows
    .filter(
      (row) => row.draft.fullName !== null || row.draft.phone !== null || row.draft.card !== null,
    )
    .map((row) => ({
      row: row.row,
      full_name: row.draft.fullName,
      phone: row.draft.phone,
      card: row.draft.card,
    }));
  const matches: ImportServerMatch[] = [];
  for (let start = 0; start < wanted.length; start += CHECK_ROWS_PER_CALL) {
    const { data, error } = await client.rpc('check_member_import', {
      p_rows: wanted.slice(start, start + CHECK_ROWS_PER_CALL),
    });
    if (error) throw error;
    for (const found of data) {
      if (!isMatch(found.match)) continue;
      matches.push({
        row: found.row,
        match: found.match,
        member:
          (found.member_id as string | null) === null
            ? null
            : { id: found.member_id, memberNumber: found.member_number, fullName: found.full_name },
      });
    }
  }
  return matches;
}

/**
 * What the server knows about the rows: members with the same phone or a similar name, cards in
 * use. Read again whenever the rows change (another file, column or branch).
 */
export function useImportCheck(rows: readonly ImportRow[], enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [
      'member-import',
      actor,
      'check',
      rows.map((row) => [row.row, row.draft.fullName, row.draft.phone, row.draft.card]),
    ],
    enabled: enabled && client !== undefined,
    queryFn: () => checkRows(requireClient(client), rows),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}

export interface SavedImport {
  readonly memberCount: number;
  readonly cardCount: number;
}

/** A refused row: its number in the file and the server's reason (import_members' keys). */
export interface RefusedRow {
  readonly row: number | null;
  readonly key: string;
}

export type ImportFailure =
  | { readonly kind: 'refused'; readonly rows: readonly RefusedRow[] }
  | { readonly kind: 'too_slow' | 'network' | 'read_only' | 'failed' };

/** Why an import failed: the rows the server refused, or the reason nothing could be saved. */
export function importFailureOf(error: unknown): ImportFailure {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return { kind: 'network' };
  if (message === 'gym_read_only') return { kind: 'read_only' };
  // The statement timeout: the transaction rolled back, so nothing was saved.
  if (code === '57014') return { kind: 'too_slow' };
  if (message === 'import_refused') {
    try {
      const details = errorField(error, 'details');
      const detail: unknown = JSON.parse(typeof details === 'string' ? details : '[]');
      if (Array.isArray(detail)) {
        return {
          kind: 'refused',
          rows: detail.map((each: { row?: unknown; key?: unknown }) => ({
            row: typeof each.row === 'number' ? each.row : null,
            key: typeof each.key === 'string' ? each.key : 'invalid_row',
          })),
        };
      }
    } catch {
      // Not JSON: logged below.
    }
  }
  logError(error, { area: 'member_import', action: 'import' });
  return { kind: 'failed' };
}

/** Saves the ticked rows (import_members): all or nothing. */
export function useImportMembers() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      readonly importId: string;
      readonly fileName: string;
      readonly rows: readonly ImportPayloadRow[];
    }): Promise<SavedImport> => {
      const { data, error } = await requireClient(client).rpc('import_members', {
        p_import_id: input.importId,
        p_file_name: input.fileName,
        // Plain objects: the generated Json type takes no interface (it has no index signature).
        p_rows: input.rows.map((row) => ({ ...row, kept: { ...row.kept } })),
      });
      if (error) throw error;
      return { memberCount: data.member_count, cardCount: data.card_count };
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['members'] }),
        queryClient.invalidateQueries({ queryKey: ['cards'] }),
        queryClient.invalidateQueries({ predicate: isHistoryQuery }),
      ]),
  });
}

/** The import history, read again after an import or taking one back. */
function isHistoryQuery(query: Query): boolean {
  return query.queryKey[0] === 'member-import' && query.queryKey[2] === 'history';
}

/** One of the gym's imports, for the history (member_import_history()). */
export interface ImportRecord {
  readonly id: string;
  readonly fileName: string;
  readonly memberCount: number;
  readonly cardCount: number;
  readonly createdAt: string;
  readonly createdByName: string | null;
  readonly undoneAt: string | null;
  readonly undoneByName: string | null;
  readonly undoReason: string | null;
}

/** The gym's latest imports, newest first. */
export function useImportHistory() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: ['member-import', actor, 'history'],
    enabled: client !== undefined,
    queryFn: async (): Promise<ImportRecord[]> => {
      const { data, error } = await requireClient(client).rpc('member_import_history');
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        fileName: row.file_name,
        memberCount: row.member_count,
        cardCount: row.card_count,
        createdAt: row.created_at,
        createdByName: row.created_by_name,
        undoneAt: row.undone_at,
        undoneByName: row.undone_by_name,
        undoReason: row.undo_reason,
      }));
    },
  });
}

/** What taking an import back does now (member_import_undo_preview()). */
export interface UndoCounts {
  readonly toArchive: number;
  readonly alreadyArchived: number;
  /** Of toArchive, the members changed since the import. */
  readonly changed: number;
  readonly cards: number;
}

/** Read whenever the confirmation opens: members may have changed since. */
export function useUndoPreview(importId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: ['member-import', actor, 'undo-preview', importId],
    enabled: client !== undefined,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<UndoCounts> => {
      const { data, error } = await requireClient(client).rpc('member_import_undo_preview', {
        p_import_id: importId,
      });
      if (error) throw error;
      const [counts] = data;
      if (!counts) throw new Error('import_not_found');
      return {
        toArchive: counts.to_archive,
        alreadyArchived: counts.already_archived,
        changed: counts.changed,
        cards: counts.cards,
      };
    },
  });
}

export type UndoFailure =
  'import_undone' | 'import_not_found' | 'read_only' | 'permission' | 'network' | 'failed';

/** Why taking an import back failed (nothing was changed). */
export function undoFailureOf(error: unknown): UndoFailure {
  const message = errorField(error, 'message');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (message === 'import_undone' || message === 'import_not_found') return message;
  if (message === 'gym_read_only') return 'read_only';
  if (message === 'permission_denied') return 'permission';
  logError(error, { area: 'member_import', action: 'undo' });
  return 'failed';
}

/** Archives every member of an import that isn't archived yet (undo_member_import()). */
export function useUndoImport() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { readonly importId: string; readonly reason: string }) => {
      const { data, error } = await requireClient(client).rpc('undo_member_import', {
        p_import_id: input.importId,
        p_reason: input.reason,
      });
      if (error) throw error;
      const [done] = data;
      return { archived: done?.archived ?? 0, cardsEnded: done?.cards_ended ?? 0 };
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['members'] }),
        queryClient.invalidateQueries({ queryKey: ['cards'] }),
        queryClient.invalidateQueries({ predicate: isHistoryQuery }),
      ]),
  });
}
