import { useSyncExternalStore } from 'react';

/** Wide enough for the list and the detail side by side: tablets in landscape, and desktops. */
const SIDE_BY_SIDE_QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(SIDE_BY_SIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function sideBySide(): boolean {
  return window.matchMedia(SIDE_BY_SIDE_QUERY).matches;
}

/** Whether the list and the detail sit side by side right now. */
export function useSideBySide(): boolean {
  return useSyncExternalStore(subscribe, sideBySide);
}
