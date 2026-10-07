import { AppSchema } from '@gym/db';
import { openLocalDatabase } from '@gym/platform';
import type { CommonPowerSyncDatabase } from '@powersync/common';

/** The app's local database file. Never rename it: devices would lose their unsynced changes. */
const DB_FILENAME = 'gym-spa.db';

/** Opens the local database and makes sure this install has a device id. */
export async function openAppDatabase(): Promise<CommonPowerSyncDatabase> {
  const db = await openLocalDatabase({ schema: AppSchema, dbFilename: DB_FILENAME });
  await ensureDeviceId(db);
  return db;
}

/**
 * This install's id, made on first launch. It goes with every request (X-Device-Id) so the audit
 * log records the device; registering the device in a branch comes later (step 1e).
 */
export async function ensureDeviceId(db: CommonPowerSyncDatabase): Promise<string> {
  const existing = await db.getOptional<{ value: string }>(
    "SELECT value FROM local_kv WHERE id = 'device_id'",
  );
  if (existing) return existing.value;
  const id = crypto.randomUUID();
  await db.execute("INSERT INTO local_kv (id, value) VALUES ('device_id', ?)", [id]);
  return id;
}
