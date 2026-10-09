import { secureStorage } from '@gym/platform';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { readBackendConfig } from '@/lib/backend';
import { useConnection } from '@/lib/connection';
import { logError } from '@/lib/logger';
import { AuthControllerContext } from './auth-context';
import { AuthController } from './auth-controller';

/** How often cached staff details (PIN resets, deactivation, permissions) are checked. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [controller] = useState(() => new AuthController(readBackendConfig(), secureStorage()));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const connected = useConnection().state === 'connected';

  useEffect(() => {
    controller.init().catch((error: unknown) => {
      logError(error, { area: 'auth', action: 'init' });
    });
  }, [controller]);

  // Server checks: at start, whenever the connection comes back, and every few minutes.
  useEffect(() => {
    if (!state.ready || !connected) return;
    const refresh = () => void controller.refreshAll();
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, [controller, state.ready, connected]);

  return (
    <AuthControllerContext.Provider value={controller}>{children}</AuthControllerContext.Provider>
  );
}
