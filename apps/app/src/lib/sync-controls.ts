import { createContext, useContext } from 'react';

/** What the sync indicator can do. Provided by the login/session layer (step 1d-2). */
export interface SyncControls {
  /** Someone is logged in, so the device connects to the sync service. */
  readonly signedIn: boolean;
  /** Reconnects and sends waiting changes now. Absent while it can't run. */
  readonly syncNow?: () => void;
}

export const SyncControlsContext = createContext<SyncControls>({ signedIn: false });

export function useSyncControls(): SyncControls {
  return useContext(SyncControlsContext);
}
