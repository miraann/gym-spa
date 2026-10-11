import {
  billingNotice,
  billingNoticeAudience,
  isBillingNoticeDismissible,
  type BillingNotice,
} from '@gym/core';
import { useCallback, useEffect, useState } from 'react';
import { useActiveAccount, useDeviceGym } from '@/features/auth/auth-context';
import { usePermission } from '@/features/auth/use-permissions';

/** A reception PC stays open for days: the days left are counted again every hour. */
const TICK_MS = 60 * 60 * 1000;

const HIDDEN_KEY_PREFIX = 'gym.billingNotice.hidden.';

function readHidden(staffId: string): string | null {
  try {
    return localStorage.getItem(HIDDEN_KEY_PREFIX + staffId);
  } catch {
    return null;
  }
}

function saveHidden(staffId: string, value: string): void {
  try {
    localStorage.setItem(HIDDEN_KEY_PREFIX + staffId, value);
  } catch {
    // Storage is blocked: the notice just comes back on the next start.
  }
}

/** Every hour, the current time (so the notice moves on at midnight without a reload). */
function useHourlyNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

export interface ShownBillingNotice {
  readonly notice: Exclude<BillingNotice, { kind: 'none' }>;
  /** Present for the 30- and 7-day warnings: hides it until the next stage or a new end date. */
  readonly hide?: () => void;
}

/**
 * The billing notice the signed-in staff member should see now (spec §2.6), from the gym state of
 * the last server check: read-only for everyone, the subscription's dates for billing.view. A
 * closed warning stays closed for this staff member on this device until its stage changes.
 */
export function useBillingNotice(): ShownBillingNotice | null {
  const gym = useDeviceGym();
  const staffId = useActiveAccount()?.staffId;
  const canViewBilling = usePermission('billing.view');
  const now = useHourlyNow();
  // What each staff member hid on this device, once read or changed here.
  const [hidden, setHidden] = useState<Readonly<Record<string, string | null>>>({});

  const notice: BillingNotice = gym ? billingNotice(gym, now) : { kind: 'none' };
  const audience = billingNoticeAudience(notice);
  const marker =
    gym && notice.kind === 'ending' ? `${gym.id}|${String(gym.paidUntil)}|${notice.stage}` : null;

  const hide = useCallback(() => {
    if (staffId === undefined || marker === null) return;
    saveHidden(staffId, marker);
    setHidden((current) => ({ ...current, [staffId]: marker }));
  }, [staffId, marker]);

  if (notice.kind === 'none' || audience === null) return null;
  if (audience === 'billing' && !canViewBilling) return null;
  if (!isBillingNoticeDismissible(notice) || staffId === undefined || marker === null) {
    return { notice };
  }
  const hiddenMarker = staffId in hidden ? hidden[staffId] : readHidden(staffId);
  if (hiddenMarker === marker) return null;
  return { notice, hide };
}
