import { useSyncExternalStore } from 'react';

// A new version of the web app that the service worker has downloaded and keeps waiting (step 3a).
// pwa.ts reports it here; UpdateNotice shows it until staff switch to it, on every screen, also
// the login and lock screens.

type ApplyUpdate = () => Promise<void>;

let applyUpdate: ApplyUpdate | null = null;
const listeners = new Set<() => void>();

/** A new version is waiting; `apply` reloads into it. */
export function setUpdateReady(apply: ApplyUpdate): void {
  applyUpdate = apply;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Switches to the waiting version (the page reloads), or null while there is none. */
export function useAppUpdate(): ApplyUpdate | null {
  return useSyncExternalStore(
    subscribe,
    () => applyUpdate,
    () => null,
  );
}
