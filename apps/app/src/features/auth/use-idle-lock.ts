import { resolveSetting, type SettingKey, type SettingRow } from '@gym/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuthController, useAuthState } from './auth-context';

/** A setting for this device's branch, read from the server (the default until it answers). */
export function useSetting(key: SettingKey): number {
  const controller = useAuthController();
  const { branchId, activeId } = useAuthState();
  const client = controller.activeClient;
  const { data } = useQuery({
    queryKey: ['settings', key, activeId],
    enabled: client !== undefined,
    queryFn: async (): Promise<SettingRow[]> => {
      if (!client) return [];
      const { data: rows, error } = await client
        .from('settings')
        .select('branch_id, key, value')
        .eq('key', key);
      if (error) throw error;
      return rows;
    },
  });
  return resolveSetting(key, data ?? [], branchId);
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
/** How often the idle timer checks; also limits how precise the lock time is. */
const CHECK_EVERY_MS = 15_000;

/** Locks the app after `security.idle_lock_minutes` without a tap, click or key press. */
export function useIdleLock(): void {
  const controller = useAuthController();
  const { activeId } = useAuthState();
  const minutes = useSetting('security.idle_lock_minutes');
  // Kept apart from the timer, so a changed setting doesn't restart the idle time.
  const lastActivity = useRef(0);

  useEffect(() => {
    if (!activeId) return;
    lastActivity.current = Date.now();
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true, capture: true });
    }
    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity, { capture: true });
      }
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const check = () => {
      if (Date.now() - lastActivity.current >= minutes * 60_000) controller.lock();
    };
    // At once too: a shorter limit that just arrived may already have passed.
    check();
    const timer = setInterval(check, Math.min(CHECK_EVERY_MS, minutes * 60_000));
    return () => {
      clearInterval(timer);
    };
  }, [controller, activeId, minutes]);
}
