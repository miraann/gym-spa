import { normalizeCardUid, type CardByteOrder } from '@gym/core';
import {
  cardReaders,
  watchPcscReaders,
  type CardRead,
  type CardReaderKind,
  type CardSignal,
  type NfcReader,
} from '@gym/platform';
import { useEffect, useRef, useState } from 'react';
import { useAuthState } from '@/features/auth/auth-context';
import { getCardReaderSettings } from './card-reader-settings';

// Cards read by any of the device's readers (spec §1, @gym/platform). Screens that wait for a card
// (a card dialog, the reader test) get them first: the newest such screen, so a dialog opened over
// a page takes the cards until it closes. A card read while no screen waits for one goes to the
// app's own handler, which opens that card's member (step 2h). While the app is locked nobody gets
// cards: the lock screen only covers the open page, and a card held to the reader then isn't
// meant for it.
//
// A card already lying on a PC/SC reader is read only when a screen that waits for a card opens
// (staff opened it for that card). It never opens a member by itself (spec §1).

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

export type ScanHandler = (scan: CardScan) => void;

/** A handler that may change between renders (a ref): the latest one is called. */
export interface ScanHandlerRef {
  readonly current: ScanHandler;
}

/** Who gets the cards the readers read; the readers listen while anyone takes cards. */
export class CardScanDispatcher {
  private readonly screens: ScanHandlerRef[] = [];
  private unclaimed: ScanHandlerRef | null = null;
  private readers: readonly NfcReader[] = [];
  private stops: (() => void)[] | null = null;

  constructor(
    private readonly connectReaders: () => readonly NfcReader[],
    private readonly keyboardByteOrder: () => CardByteOrder,
  ) {}

  /**
   * A screen that waits for a card: it gets every card until it closes or a newer one opens. A card
   * already lying on a reader is read for it once.
   */
  addScreen(handler: ScanHandlerRef): () => void {
    this.screens.push(handler);
    this.update();
    for (const reader of this.readers) reader.readLying?.();
    return () => {
      const index = this.screens.lastIndexOf(handler);
      if (index >= 0) this.screens.splice(index, 1);
      this.update();
    };
  }

  /** The handler of cards read while no screen waits for one (there is one at a time). */
  setUnclaimed(handler: ScanHandlerRef): () => void {
    this.unclaimed = handler;
    this.update();
    return () => {
      if (this.unclaimed === handler) this.unclaimed = null;
      this.update();
    };
  }

  private readonly dispatch = (read: CardRead): void => {
    const handler = this.screens.at(-1) ?? this.unclaimed;
    handler?.current(scanOf(read, this.keyboardByteOrder()));
  };

  private update(): void {
    const wanted = this.screens.length > 0 || this.unclaimed !== null;
    if (wanted && this.stops === null) {
      this.readers = this.connectReaders();
      this.stops = this.readers.map((reader) => reader.listen(this.dispatch));
    } else if (!wanted && this.stops !== null) {
      for (const stop of this.stops) stop();
      this.stops = null;
      this.readers = [];
    }
  }
}

const dispatcher = new CardScanDispatcher(
  cardReaders,
  () => getCardReaderSettings().keyboardByteOrder,
);

/**
 * Calls `onScan` for every card read while the screen is shown, `enabled` and the app unlocked.
 * When it starts, a card already lying on a PC/SC reader is read once.
 */
export function useCardScans(onScan: ScanHandler, enabled = true): void {
  const handler = useRef(onScan);
  const unlocked = useAuthState().activeId !== null;
  useEffect(() => {
    handler.current = onScan;
  });
  useEffect(
    () => (enabled && unlocked ? dispatcher.addScreen(handler) : undefined),
    [enabled, unlocked],
  );
}

/**
 * Calls `onScan` for the cards read while no screen waits for one, while `enabled` and the app is
 * unlocked: only newly placed cards, never one left lying on a reader.
 */
export function useUnclaimedCardScans(onScan: ScanHandler, enabled = true): void {
  const handler = useRef(onScan);
  const unlocked = useAuthState().activeId !== null;
  useEffect(() => {
    handler.current = onScan;
  });
  useEffect(
    () => (enabled && unlocked ? dispatcher.setUnclaimed(handler) : undefined),
    [enabled, unlocked],
  );
}

/** The PC/SC readers plugged into this PC (Windows app only); undefined until known. */
export function usePcscReaders(): readonly string[] | undefined {
  const [readers, setReaders] = useState<readonly string[]>();
  useEffect(() => watchPcscReaders(setReaders), []);
  return readers;
}
