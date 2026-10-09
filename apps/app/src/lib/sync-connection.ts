import { createUploader, readAuthor, type AuthorSession } from '@gym/db';
import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  SyncStreamSubscription,
} from '@powersync/common';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { AppSupabaseClient } from './backend';
import { logError } from './logger';

/** What the connection needs to know about the staff members on this device. */
export interface SyncStaff {
  /** Their client, or undefined when they aren't on this device (any more). */
  client(staffId: string): AppSupabaseClient | undefined;
  /** Their login on this device ended; they must log in with their password again. */
  sessionEnded(staffId: string): Promise<void>;
}

/** A staff member's session, if it can be used right now. */
export async function usableSession(
  client: AppSupabaseClient,
): Promise<
  { kind: 'ready'; accessToken: string; expiresAt?: Date } | { kind: 'unavailable' | 'ended' }
> {
  const { data, error } = await client.auth.getSession();
  if (data.session) {
    const { expires_at: expiresAt } = data.session;
    return {
      kind: 'ready',
      accessToken: data.session.access_token,
      ...(expiresAt ? { expiresAt: new Date(expiresAt * 1000) } : {}),
    };
  }
  // Offline or the server didn't answer: the session is kept and tried again later.
  if (error && isAuthRetryableFetchError(error)) return { kind: 'unavailable' };
  return { kind: 'ended' };
}

/**
 * The device's connection to the sync service.
 *   - It connects with one staff member's token (the one who unlocked the app last); switching
 *     staff reconnects but never clears or downloads the local data again.
 *   - The device's branch decides what syncs; the token only authorizes it.
 *   - Every change uploads under its own author's session (see createUploader).
 */
export class SyncConnection {
  private identity: string | null = null;
  private branchId: string | null = null;
  private subscription: SyncStreamSubscription | undefined;
  private readonly connector: PowerSyncBackendConnector;

  constructor(
    private readonly db: CommonPowerSyncDatabase,
    private readonly endpoint: string,
    staff: SyncStaff,
  ) {
    this.connector = {
      fetchCredentials: async () => {
        const client = this.identity ? staff.client(this.identity) : undefined;
        if (!client || !this.identity) return null;
        const session = await usableSession(client);
        if (session.kind === 'ended') await staff.sessionEnded(this.identity);
        if (session.kind !== 'ready') return null;
        return {
          endpoint: this.endpoint,
          token: session.accessToken,
          expiresAt: session.expiresAt,
        };
      },
      uploadData: createUploader({
        sessions: {
          forAuthor: async (authorId): Promise<AuthorSession> => {
            const client = staff.client(authorId);
            // Logging out is refused while a staff member has unsent changes, so this is rare.
            if (!client) return { kind: 'signed_out' };
            const session = await usableSession(client);
            if (session.kind === 'ready') return { kind: 'ready', client };
            // Their changes wait until they log in again; they are never dropped.
            if (session.kind === 'ended') await staff.sessionEnded(authorId);
            return { kind: 'unavailable' };
          },
        },
      }),
    };
  }

  /** Whose token the device syncs with; null disconnects. */
  get syncingAs(): string | null {
    return this.identity;
  }

  async setIdentity(staffId: string | null): Promise<void> {
    if (staffId === this.identity) return;
    this.identity = staffId;
    await this.reconnect();
  }

  /** The device's branch: its data is downloaded while connected. */
  async setBranch(branchId: string | null): Promise<void> {
    if (branchId === this.branchId) return;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.branchId = branchId;
    if (branchId) {
      this.subscription = await this.db.syncStream('branch', { branch_id: branchId }).subscribe();
    }
  }

  /** Connects again at once: sends waiting changes and downloads new ones ("Sync now"). */
  async reconnect(): Promise<void> {
    try {
      if (this.identity) {
        await this.db.connect(this.connector);
      } else {
        await this.db.disconnect();
      }
    } catch (error) {
      logError(error, { area: 'sync' });
    }
  }

  async close(): Promise<void> {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    await this.db.disconnect();
  }
}

/** Unsent changes per author (PowerSync's upload queue, ps_crud). */
export async function pendingByAuthor(
  db: Pick<CommonPowerSyncDatabase, 'getAll'>,
): Promise<Map<string | null, number>> {
  const rows = await db.getAll<{ metadata: string | null; count: number }>(
    "SELECT json_extract(data, '$.metadata') AS metadata, count(*) AS count FROM ps_crud GROUP BY 1",
  );
  const counts = new Map<string | null, number>();
  for (const row of rows) {
    const author = readAuthor(row.metadata ?? undefined);
    counts.set(author, (counts.get(author) ?? 0) + row.count);
  }
  return counts;
}
