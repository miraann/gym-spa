import type { CheckinAnswer } from '@gym/core';
import { haptic, type CardSignal } from '@gym/platform';
import { useCallback, useState } from 'react';
import { useCardScans } from '@/features/cards/card-reader';
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
}

/**
 * Checking members in at `branchId` ('' while there is none): every card newly placed on a reader
 * while the screen is shown (never one left lying there, CLAUDE.md), and members picked by hand.
 * Each answer is heard (a tone), felt (Android) and shown on the reader (green, or red twice).
 * A card read while the last one is still being checked is left alone.
 */
export function useCheckinFlow(branchId: string): CheckinFlow {
  const checkIn = useCheckIn();
  const [shown, setShown] = useState<{ answer: CheckinAnswer; who: CheckinWho } | null>(null);
  const [error, setError] = useState<CheckinErrorKey | null>(null);

  const run = (who: CheckinWho, signal?: (signal: CardSignal) => void, overrideNote?: string) => {
    if (branchId === '' || checkIn.isPending) {
      signal?.('error');
      return;
    }
    setError(null);
    checkIn.mutate(
      { who, branchId, overrideNote },
      {
        onSuccess: (answer) => {
          setShown({ answer, who });
          playCheckinSound(answer.result);
          haptic(
            answer.result === 'denied'
              ? 'error'
              : answer.result === 'allowed'
                ? 'success'
                : 'warning',
          );
          signal?.(answer.result === 'denied' ? 'error' : 'ok');
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

  return {
    answer: shown?.answer ?? null,
    pending: checkIn.isPending,
    error,
    checkInMember: (memberId) => {
      run({ memberId });
    },
    override: (note) => {
      if (shown) run(shown.who, undefined, note);
    },
    close,
  };
}
