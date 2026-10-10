import { useEffect, useRef, type ReactNode } from 'react';
import { useLayout } from '@/hooks/use-layout';

/**
 * A page's main actions. On phones they float in the thumb zone just above the tab bar, and the
 * page makes room for them (--floating-bar-space, styles.css), so the last item stays visible. On
 * wider screens they sit at the end of the content.
 */
export function StickyActionBar({ children }: { readonly children: ReactNode }) {
  const floating = useLayout() === 'phone';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = ref.current;
    if (!floating || !bar) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty(
        '--floating-bar-space',
        `calc(${String(bar.offsetHeight)}px + var(--tab-bar-gap))`,
      );
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--floating-bar-space');
    };
  }, [floating]);

  if (!floating) {
    return <div className="flex justify-end gap-2">{children}</div>;
  }
  return (
    <div
      data-slot="sticky-action-bar"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-height)+var(--tab-bar-gap)*2+env(safe-area-inset-bottom))] z-20"
    >
      {/* Glass with a solid fallback, like the other floating bars. */}
      <div
        ref={ref}
        className="pointer-events-auto mx-auto flex max-w-md gap-2 rounded-2xl border bg-card p-2 shadow-lg *:flex-1 supports-backdrop-filter:bg-card/80 supports-backdrop-filter:backdrop-blur-md"
      >
        {children}
      </div>
    </div>
  );
}
