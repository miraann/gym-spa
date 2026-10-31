import { useEffect, useRef, useState } from 'react';

/** Whether the viewer asked for less motion (then numbers change at once). */
function prefersReducedMotion(): boolean {
  return (
    typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * A number that counts from its last value to the new one in at most 400 ms (CLAUDE.md → Motion:
 * short, never delaying work); at once with reduced motion and on the first value.
 */
export function useCountUp(value: number | null): number | null {
  const [shown, setShown] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    const from = last.current;
    last.current = value;
    if (value === null || from === null || from === value || prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 400);
      const eased = 1 - (1 - progress) ** 3;
      setShown(progress === 1 ? value : from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return shown;
}
