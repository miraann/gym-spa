import type { CommonPowerSyncDatabase, Schema } from '@powersync/common';
import { platform } from './runtime';

export interface LocalDatabaseOptions {
  readonly schema: Schema;
  /** One database file per app; opening the same file twice is not supported. */
  readonly dbFilename: string;
}

/**
 * Opens the device's local SQLite database (PowerSync):
 *   - Android (and later iOS): native SQLite through the Capacitor SDK.
 *   - Browser and Windows: SQLite compiled to WebAssembly, stored in the Origin Private File System.
 *     OPFSCoopSyncVFS supports several tabs of the web app at once.
 *
 * Each SDK is loaded only on its own platform, so the web build doesn't carry the native plugin
 * code path and the APK doesn't start the WebAssembly database.
 */
export async function openLocalDatabase({
  schema,
  dbFilename,
}: LocalDatabaseOptions): Promise<CommonPowerSyncDatabase> {
  if (platform === 'android' || platform === 'ios') {
    const { PowerSyncDatabase } = await import('@powersync/capacitor');
    const database = new PowerSyncDatabase({ schema, database: { dbFilename } });
    await database.init();
    return database;
  }

  const { PowerSyncDatabase, WASQLiteVFS } = await import('@powersync/web');
  const database = new PowerSyncDatabase({
    schema,
    database: { dbFilename, vfs: WASQLiteVFS.OPFSCoopSyncVFS },
  });
  await database.init();
  return database;
}
