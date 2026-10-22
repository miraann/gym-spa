import { ArrowDownIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { Spinner } from '../components/spinner';
import { hasTouchScreen } from '../lib/touch';
import { cn } from '../lib/utils';

/** How far (px) a pull must go before letting go refreshes. */
const THRESHOLD = 72;
/** The indicator moves slower than the finger, like a rubber band. */
const RESISTANCE = 0.5;

/**
 * Pull down at the top of a page to refresh it, on touch screens (CLAUDE.md → Design). The
 * browser's own pull-to-refresh is off (theme.css): it would reload the page and lock the app.
 * Keyboard and mouse users don't need it: TanStack Query refetches when the window gets focus.
 */
export function PullToRefresh({
  onRefresh,
  onThreshold,
  label,
  children,
}: {
  readonly onRefresh: () => Promise<unknown>;
  /** Called once when the pull is far enough (e.g. for a haptic tick). */
  readonly onThreshold?: () => void;
  /** Read out while refreshing. */
  readonly label: string;
  readonly children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // The finger's start and the pull so far, read by the touch listeners.
  const gesture = useRef<{ start: number; pull: number; armed: boolean } | null>(null);

  const begin = useEffectEvent((event: TouchEvent) => {
    if (refreshing || window.scrollY > 0 || event.touches.length !== 1) return;
    // Not from inside a dialog or sheet (they sit above the page).
    if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
    gesture.current = { start: event.touches[0]?.clientY ?? 0, pull: 0, armed: false };
  });

  const move = useEffectEvent((event: TouchEvent) => {
    const current = gesture.current;
    if (!current) return;
    const distance = ((event.touches[0]?.clientY ?? 0) - current.start) * RESISTANCE;
    const next = distance <= 0 || window.scrollY > 0 ? 0 : Math.min(distance, THRESHOLD * 1.5);
    if (next >= THRESHOLD && !current.armed) onThreshold?.();
    current.armed = next >= THRESHOLD;
    current.pull = next;
    setPull(next);
  });

  const end = useEffectEvent(() => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    if (current.pull < THRESHOLD) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    setPull(THRESHOLD);
    void onRefresh().finally(() => {
      setRefreshing(false);
      setPull(0);
    });
  });

  useEffect(() => {
    // Touch screens only (a mouse makes no touch events anyway).
    if (!hasTouchScreen()) return;
    const onStart = (event: TouchEvent) => {
      begin(event);
    };
    const onMove = (event: TouchEvent) => {
      move(event);
    };
    const onEnd = () => {
      end();
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <div data-slot="pull-to-refresh" className="relative">
      <div
        aria-hidden={!refreshing}
        className={cn(
          'pointer-events-none absolute inset-x-0 -top-2 z-10 flex justify-center',
          pull === 0 && !refreshing && 'invisible',
        )}
        style={{ transform: `translateY(${String(pull - 8)}px)`, opacity: progress }}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-card text-primary shadow-md ring-1 ring-foreground/6">
          {refreshing ? (
            <Spinner className="size-5" />
          ) : (
            <ArrowDownIcon
              className="size-5 transition-transform duration-150"
              style={{ rotate: progress >= 1 ? '180deg' : '0deg' }}
            />
          )}
        </span>
        {refreshing && (
          <span role="status" className="sr-only">
            {label}
          </span>
        )}
      </div>
      {/* Moved with top, not a transform: a transform would carry the page's fixed bars (the sticky
          action bar) away with it while pulling. */}
      <div
        className="relative transition-[top] duration-200 ease-spring motion-reduce:transition-none"
        style={{ top: pull > 0 ? `${String(pull * 0.6)}px` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
