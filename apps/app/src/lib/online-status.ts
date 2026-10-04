import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/**
 * Whether the device has a network connection. "Online" does not guarantee the servers are
 * reachable; in 1d the sync status adds the real connection state.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}
