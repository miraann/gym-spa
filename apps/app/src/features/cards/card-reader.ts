import { normalizeCardUid, type CardByteOrder } from '@gym/core';
import {
  cardReaders,
  watchPcscReaders,
  type CardRead,
  type CardReaderKind,
  type CardSignal,
} from '@gym/platform';
import { useEffect, useRef, useState } from 'react';
import { useAuthState } from '@/features/auth/auth-context';
import { getCardReaderSettings } from './card-reader-settings';

// Cards read by any of the device's readers (spec §1, @gym/platform). The readers listen only
// while a screen wants cards, and only the newest such screen gets them: a dialog opened over a
// page takes the cards until it closes. While the app is locked no screen gets cards: the lock
// screen only covers the open page, and a card held to the reader then isn't meant for it.

/** A card a reader read. */
export interface CardScan {
  /** As stored (normalizeCardUid); null when what the reader gave is no card UID. */
  readonly uid: string | null;
  /** What the reader gave, to show when it is no UID. */
  readonly raw: string;
  /**
   * Shows on the reader whether the app took the card: green, or red twice with two beeps. Only
   * PC/SC readers that can (the ACR122U); nothing on others.
   */
  readonly signal: (signal: CardSignal) => void;
}

/**
 * Which readers may give a UID's bytes reversed. Keyboard-type readers differ; PC/SC readers and
 * phones give them as the card sends them.
 */
const MAY_REVERSE: Readonly<Record<CardReaderKind, boolean>> = { keyboard: true, pcsc: false };

/** A reader's UID as stored: keyboard-type readers in this device's byte order. */
export function scanOf(read: CardRead, keyboardByteOrder: CardByteOrder): CardScan {
  return {
    uid: normalizeCardUid(read.uid, MAY_REVERSE[read.reader] ? keyboardByteOrder : 'normal'),
    raw: read.uid,
    signal: read.signal ?? (() => undefined),
  };
}

type ScanHandler = (scan: CardScan) => void;

const handlers: { current: ScanHandler }[] = [];
let stopReaders: (() => void) | null = null;

function dispatch(read: CardRead): void {
  handlers.at(-1)?.current(scanOf(read, getCardReaderSettings().keyboardByteOrder));
}

function register(handler: { current: ScanHandler }): () => void {
  handlers.push(handler);
  if (stopReaders === null) {
    const stops = cardReaders().map((reader) => reader.listen(dispatch));
    stopReaders = () => {
      for (const stop of stops) stop();
    };
  }
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
    if (handlers.length === 0 && stopReaders !== null) {
      stopReaders();
      stopReaders = null;
    }
  };
}

/** Calls `onScan` for every card read while the screen is shown, `enabled` and not locked. */
export function useCardScans(onScan: ScanHandler, enabled = true): void {
  const handler = useRef(onScan);
  const unlocked = useAuthState().activeId !== null;
  useEffect(() => {
    handler.current = onScan;
  });
  useEffect(() => (enabled && unlocked ? register(handler) : undefined), [enabled, unlocked]);
}

/** The PC/SC readers plugged into this PC (Windows app only); undefined until known. */
export function usePcscReaders(): readonly string[] | undefined {
  const [readers, setReaders] = useState<readonly string[]>();
  useEffect(() => watchPcscReaders(setReaders), []);
  return readers;
}
