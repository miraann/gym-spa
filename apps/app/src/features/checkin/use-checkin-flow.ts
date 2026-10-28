import type { CheckinAnswer } from '@gym/core';
import { haptic, type CardSignal } from '@gym/platform';
import { useCallback, useState } from 'react';
import { useCardScans } from '@/features/cards/card-reader';
import { useStaffClockByCard, type StaffClockAnswer } from '@/features/hr/hr-data';
import { hrErrorKey, type HrErrorKey } from '@/features/hr/hr-errors';
import { useCheckIn, type CheckinWho } from './checkin-data';
import { checkinErrorKey, type CheckinErrorKey } from './checkin-errors';
import { playCheckinSound } from './checkin-sound';

export interface CheckinFlow {
  /** The result on screen, until it closes. */
  readonly answer: CheckinAnswer | null;
  readonly pending: boolean;
  readonly error: CheckinErrorKey | null;
  /** Checks a member picked by hand in. */
  readonly checkInMember: (memberId: string) => void;
  /** Lets the member of the result on screen in anyway (checkin.override). */
  readonly override: (note: string) => void;
  readonly close: () => void;
  /** A staff card was scanned: they were clocked in or out, or why not. */
  readonly staff: StaffResult | null;
  readonly closeStaff: () => void;
}

export type StaffResult =
  | { readonly answer: StaffClockAnswer; readonly error?: undefined }
  | { readonly answer?: undefined; readonly error: HrErrorKey };

/**
 * Checking members in at `branchId` ('' while there is none): every card newly placed on a reader
 * while the screen is shown (never one left lying there, CLAUDE.md), and members picked by hand.
 * Each answer is heard (a tone), felt (Android) and shown on the reader (green, or red twice).
 * A card read while the last one is still being checked is left alone.
 */
export function useCheckinFlow(branchId: string): CheckinFlow {
  const checkIn = useCheckIn();
  const staffClock = useStaffClockByCard();
  const [shown, setShown] = useState<{ answer: CheckinAnswer; who: CheckinWho } | null>(null);
  const [staff, setStaff] = useState<StaffResult | null>(null);

  const show = (answer: CheckinAnswer, who: CheckinWho, signal?: (signal: CardSignal) => void) => {
    setShown({ answer, who });
    playCheckinSound(answer.result);
    haptic(
      answer.result === 'denied' ? 'error' : answer.result === 'allowed' ? 'success' : 'warning',
    );
    signal?.(answer.result === 'denied' ? 'error' : 'ok');
  };

  /** A card no member has may be a staff card (spec §4.7): it clocks its owner in or out. */
  const tryStaffCard = (
    answer: CheckinAnswer,
    who: CheckinWho,
    uid: string,
    signal?: (signal: CardSignal) => void,
  ) => {
    staffClock.mutate(
      { uid, branchId },
      {
        onSuccess: (clocked) => {
          setStaff({ answer: clocked });
          playCheckinSound('allowed');
          haptic('success');
          signal?.('ok');
        },
        onError: (thrown) => {
          const key = hrErrorKey(thrown, 'staff_clock');
          if (key === 'staff_inactive' || key === 'staff_wrong_branch') {
            setStaff({ error: key });
            playCheckinSound('denied');
            haptic('error');
            signal?.('error');
            return;
          }
          // Not a staff card either: the member check-in's answer stands.
          show(answer, who, signal);
        },
      },
    );
  };
  const [error, setError] = useState<CheckinErrorKey | null>(null);

  const run = (who: CheckinWho, signal?: (signal: CardSignal) => void, overrideNote?: string) => {
    if (branchId === '' || checkIn.isPending || staffClock.isPending) {
      signal?.('error');
      return;
    }
    setError(null);
    setStaff(null);
    checkIn.mutate(
      { who, branchId, overrideNote },
      {
        onSuccess: (answer) => {
          if (answer.reason === 'CARD_INVALID' && 'cardUid' in who) {
            tryStaffCard(answer, who, who.cardUid, signal);
            return;
          }
          show(answer, who, signal);
        },
        onError: (thrown) => {
          setShown(null);
          setError(checkinErrorKey(thrown, 'check_in'));
          playCheckinSound('denied');
          haptic('error');
          signal?.('error');
        },
      },
    );
  };

  useCardScans(
    (scan) => {
      if (scan.uid === null) {
        scan.signal('error');
        return;
      }
      run({ cardUid: scan.uid }, scan.signal);
    },
    branchId !== '',
    false,
  );

  const close = useCallback(() => {
    setShown(null);
  }, []);
  const closeStaff = useCallback(() => {
    setStaff(null);
  }, []);

  return {
    answer: shown?.answer ?? null,
    pending: checkIn.isPending || staffClock.isPending,
    error,
    checkInMember: (memberId) => {
      run({ memberId });
    },
    override: (note) => {
      if (shown) run(shown.who, undefined, note);
    },
    close,
    staff,
    closeStaff,
  };
}
