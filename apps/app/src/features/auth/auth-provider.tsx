import { secureStorage } from '@gym/platform';
import type { CommonPowerSyncDatabase } from '@powersync/common';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { readBackendConfig } from '@/lib/backend';
import { logError } from '@/lib/logger';
import { SyncControlsContext, type SyncControls } from '@/lib/sync-controls';
import { AuthControllerContext } from './auth-context';
import { AuthController } from './auth-controller';

/** How often cached staff details (PIN resets, deactivation, permissions) are checked online. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function AuthProvider({
  database,
  children,
}: {
  readonly database: CommonPowerSyncDatabase;
  readonly children: ReactNode;
}) {
  const [controller] = useState(
    () => new AuthController(database, readBackendConfig(), secureStorage()),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  useEffect(() => {
    controller.init().catch((error: unknown) => {
      logError(error, { area: 'auth', action: 'init' });
    });
  }, [controller]);

  // Online checks: at start, when the network comes back, and every few minutes.
  useEffect(() => {
    if (!state.ready) return;
    const refresh = () => {
      if (navigator.onLine) void controller.refreshAll();
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, [controller, state.ready]);

  const syncControls = useMemo<SyncControls>(
    () => ({
      signedIn: state.syncingAs !== null,
      syncNow: state.syncingAs ? () => void controller.syncNow() : undefined,
      waitingForLogin: state.accounts
        .filter(
          (account) =>
            account.passwordRequired === 'session_ended' || account.passwordRequired === 'inactive',
        )
        .map((account) => ({ staffId: account.staffId, fullName: account.fullName })),
    }),
    [controller, state.syncingAs, state.accounts],
  );

  return (
    <AuthControllerContext.Provider value={controller}>
      <SyncControlsContext.Provider value={syncControls}>{children}</SyncControlsContext.Provider>
    </AuthControllerContext.Provider>
  );
}
