import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The page's large title and whether it has scrolled away, for the phone's top bar: like a native
 * app, the bar shows the title in small type once the large one is gone (page-header.tsx).
 */
export interface PageTitleState {
  readonly title: string | null;
  readonly collapsed: boolean;
}

let state: PageTitleState = { title: null, collapsed: false };
const listeners = new Set<() => void>();

function setState(next: PageTitleState): void {
  if (next.title === state.title && next.collapsed === state.collapsed) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePageTitle(): PageTitleState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/**
 * Registers a page's large title: returns the ref for its heading. The title counts as collapsed
 * once the heading has scrolled up under the top bar.
 */
export function useCollapsingTitle(title: string): (element: HTMLElement | null) => void {
  const observer = useRef<IntersectionObserver | null>(null);
  const titleRef = useRef(title);

  useEffect(() => {
    titleRef.current = title;
    setState({ ...state, title });
  }, [title]);

  useEffect(
    () => () => {
      observer.current?.disconnect();
      if (state.title === titleRef.current) setState({ title: null, collapsed: false });
    },
    [],
  );

  return useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    // Below the top bar (it pads itself for the status bar), or about its usual height.
    const bar = document.querySelector('[data-slot="top-bar"]');
    const barHeight =
      bar?.getBoundingClientRect().bottom ??
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.5;
    observer.current = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setState({
          title: titleRef.current,
          collapsed: !entry.isIntersecting && entry.boundingClientRect.top < barHeight,
        });
      },
      { rootMargin: `-${String(Math.round(barHeight))}px 0px 0px 0px`, threshold: 0 },
    );
    observer.current.observe(element);
  }, []);
}
