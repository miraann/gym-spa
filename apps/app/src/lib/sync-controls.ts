import { createContext, useContext } from 'react';

/** What the sync indicator can do. Provided by the login/session layer (features/auth). */
export interface SyncControls {
  /** Someone is logged in, so the device connects to the sync service. */
  readonly signedIn: boolean;
  /** Reconnects and sends waiting changes now. Absent while it can't run. */
  readonly syncNow?: () => void;
  /**
   * Staff members whose login on this device ended: their unsent changes wait until they log in
   * with their password again.
   */
  readonly waitingForLogin?: readonly { readonly staffId: string; readonly fullName: string }[];
}

export const SyncControlsContext = createContext<SyncControls>({ signedIn: false });

export function useSyncControls(): SyncControls {
  return useContext(SyncControlsContext);
}
