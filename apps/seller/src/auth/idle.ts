import { useEffect } from 'react';

/** The panel signs out after this long without a key press, click or touch. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Calls onIdle once after IDLE_LIMIT_MS without activity in this tab. A tab in the background
 * counts as idle too: its timer keeps running.
 */
export function useIdleSignOut(onIdle: () => void, limitMs: number = IDLE_LIMIT_MS): void {
  useEffect(() => {
    let timer = window.setTimeout(onIdle, limitMs);
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onIdle, limitMs);
    };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, restart, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, restart);
    };
  }, [onIdle, limitMs]);
}
