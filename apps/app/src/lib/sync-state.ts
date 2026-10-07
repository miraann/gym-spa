/** What the sync indicator shows. */
export type SyncIndicatorState = 'offline' | 'not_syncing' | 'syncing' | 'error' | 'online';

export interface SyncFacts {
  /** The device has a network connection. */
  readonly online: boolean;
  /** Someone is logged in, so the device can connect to the sync service. */
  readonly signedIn: boolean;
  readonly connected: boolean;
  readonly connecting: boolean;
  readonly uploading: boolean;
  readonly downloading: boolean;
  readonly hasError: boolean;
  /** Local changes not yet sent. */
  readonly pending: number;
}

/**
 * Offline first (nothing else matters without a network), then not logged in, then errors, then
 * activity. Pending changes on a connected device mean an upload is due, so they count as syncing.
 */
export function syncIndicatorState(facts: SyncFacts): SyncIndicatorState {
  if (!facts.online) return 'offline';
  if (!facts.signedIn) return 'not_syncing';
  if (facts.hasError) return 'error';
  if (facts.connecting || facts.uploading || facts.downloading || facts.pending > 0)
    return 'syncing';
  return facts.connected ? 'online' : 'syncing';
}
