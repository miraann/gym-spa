import { useSyncExternalStore } from 'react';

// A new version of the app that is downloaded and waits (step 3a): the web app's service worker
// (pwa.ts) or the Windows app's own updater (desktop-update.ts, step 11c) reports it here;
// UpdateNotice shows it until staff switch to it, on every screen, also the login and lock screens.

export interface AppUpdate {
  /** Switches to the waiting version: the page reloads, or the Windows app restarts. */
  readonly apply: () => Promise<void>;
  /** The Windows app closes and starts again (else the page reloads). */
  readonly restartsApp: boolean;
}

let update: AppUpdate | null = null;
const listeners = new Set<() => void>();

/** A new version is waiting. */
export function setUpdateReady(apply: () => Promise<void>, restartsApp = false): void {
  update = { apply, restartsApp };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The waiting version, or null while there is none. */
export function useAppUpdate(): AppUpdate | null {
  return useSyncExternalStore(
    subscribe,
    () => update,
    () => null,
  );
}
