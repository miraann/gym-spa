import { formatCardUid, normalizeCardUid } from '@gym/core';
import type { CardSignal } from '@gym/platform';
import { useRef, useState } from 'react';
import { useCardScans, type CardScan } from './card-reader';

export type CardNumberProblem = 'required' | 'invalid';

/** Shows on the reader that read a card whether the app took it (CardScan.signal). */
export type SignalCard = (signal: CardSignal) => void;

export interface CardNumber {
  readonly typed: string;
  readonly setTyped: (typed: string) => void;
  readonly problem: CardNumberProblem | null;
  readonly setProblem: (problem: CardNumberProblem | null) => void;
  /** The typed number as stored, or null (with the problem shown) when it isn't one. */
  readonly readTyped: () => string | null;
  /** The signal of the reader that read `uid` last, for a number sent by hand after a scan. */
  readonly signalFor: (uid: string) => SignalCard | undefined;
}

/**
 * The card number a dialog gives or replaces: a scan from any reader fills it in and calls
 * `onCard` at once, with the reader's signal for the result; a number typed by hand is read when
 * the form is sent (`readTyped`). A keyboard-type reader may type into the card number field too:
 * it is marked as a card field, so that still counts as a scan (in this device's byte order), not
 * as typing. A scan that is no card number shows the error signal on the reader at once.
 */
export function useCardNumber(onCard: (uid: string, signal: SignalCard) => void): CardNumber {
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<CardNumberProblem | null>(null);
  const lastScan = useRef<CardScan | null>(null);

  useCardScans((scan: CardScan) => {
    setTyped(scan.uid === null ? scan.raw : formatCardUid(scan.uid));
    setProblem(scan.uid === null ? 'invalid' : null);
    if (scan.uid === null) {
      scan.signal('error');
      return;
    }
    lastScan.current = scan;
    onCard(scan.uid, scan.signal);
  });

  const readTyped = (): string | null => {
    if (typed.trim() === '') {
      setProblem('required');
      return null;
    }
    const uid = normalizeCardUid(typed);
    setProblem(uid === null ? 'invalid' : null);
    return uid;
  };

  const signalFor = (uid: string): SignalCard | undefined =>
    lastScan.current?.uid === uid ? lastScan.current.signal : undefined;

  return { typed, setTyped, problem, setProblem, readTyped, signalFor };
}
