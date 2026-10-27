import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuthState } from '@/features/auth/auth-context';

/**
 * Something over the whole app (the check-in result, the door screen), on the page's body so no
 * part of the app's layout lies above it. Only while the app is unlocked: the lock screen hides
 * the app, and this must never cover the lock screen.
 */
export function ScreenOverlay({ children }: { readonly children: ReactNode }) {
  const unlocked = useAuthState().activeId !== null;
  return unlocked ? createPortal(children, document.body) : null;
}
