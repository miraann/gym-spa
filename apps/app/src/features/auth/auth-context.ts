import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DeviceAccount } from './accounts';
import type { AuthController, AuthState } from './auth-controller';

export const AuthControllerContext = createContext<AuthController | null>(null);

export function useAuthController(): AuthController {
  const controller = useContext(AuthControllerContext);
  if (!controller) throw new Error('useAuthController needs an AuthProvider');
  return controller;
}

export function useAuthState(): AuthState {
  const controller = useAuthController();
  return useSyncExternalStore(controller.subscribe, controller.getState);
}

/** The staff member using the app (undefined while locked). */
export function useActiveAccount(): DeviceAccount | undefined {
  const { activeId, accounts } = useAuthState();
  return accounts.find((account) => account.staffId === activeId);
}
