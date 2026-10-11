import { useSyncExternalStore } from 'react';

/**
 * The navigation layout for the window width (CLAUDE.md → Design): a bottom tab bar on phones, an
 * icon rail on tablets, the full sidebar on desktops. 768px is also the shadcn sidebar's mobile
 * breakpoint (use-mobile.ts).
 */
export type Layout = 'phone' | 'tablet' | 'desktop';

const TABLET_QUERY = '(min-width: 768px)';
const DESKTOP_QUERY = '(min-width: 1280px)';

function subscribe(onChange: () => void): () => void {
  const queries = [window.matchMedia(TABLET_QUERY), window.matchMedia(DESKTOP_QUERY)];
  for (const query of queries) query.addEventListener('change', onChange);
  return () => {
    for (const query of queries) query.removeEventListener('change', onChange);
  };
}

function currentLayout(): Layout {
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop';
  return window.matchMedia(TABLET_QUERY).matches ? 'tablet' : 'phone';
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, currentLayout);
}
