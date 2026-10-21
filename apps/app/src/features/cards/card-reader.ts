import { normalizeCardUid, type CardByteOrder } from '@gym/core';
import { cardReaders, type CardRead, type CardReaderKind } from '@gym/platform';
import { useEffect, useRef } from 'react';
import { getCardReaderSettings } from './card-reader-settings';

// Cards read by any of the device's readers (spec §1, @gym/platform). The readers listen only
// while a screen wants cards, and only the newest such screen gets them: a dialog opened over a
// page takes the cards until it closes.

/** A card a reader read. */
export interface CardScan {
  /** As stored (normalizeCardUid); null when what the reader gave is no card UID. */
  readonly uid: string | null;
  /** What the reader gave, to show when it is no UID. */
  readonly raw: string;
}

/**
 * Which readers may give a UID's bytes reversed. Keyboard-type readers differ; PC/SC readers and
 * phones give them as the card sends them.
 */
const MAY_REVERSE: Readonly<Record<CardReaderKind, boolean>> = { keyboard: true };

/** A reader's UID as stored: keyboard-type readers in this device's byte order. */
export function scanOf(read: CardRead, keyboardByteOrder: CardByteOrder): CardScan {
  return {
    uid: normalizeCardUid(read.uid, MAY_REVERSE[read.reader] ? keyboardByteOrder : 'normal'),
    raw: read.uid,
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

/** Calls `onScan` for every card read while the screen is shown and `enabled`. */
export function useCardScans(onScan: ScanHandler, enabled = true): void {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  });
  useEffect(() => (enabled ? register(handler) : undefined), [enabled]);
}
