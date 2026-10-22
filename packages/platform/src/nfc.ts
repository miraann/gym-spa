import type { CardSignal } from './desktop-bridge';
import { keyboardCardReader } from './keyboard-card-reader';
import { pcscCardReader } from './pcsc-card-reader';
import { desktopBridge } from './runtime';

// Card readers (spec §1): every kind of reader is an NfcReader, so the screens never know which one
// read a card. Keyboard-type readers (they type the UID and Enter, step 2e) work in every target;
// PC/SC readers such as the ACR122U (step 2f) only in the Windows app. The phone's own NFC (step
// 2g) is added here as another reader.

/** Which kind of reader read a card. */
export type CardReaderKind = 'keyboard' | 'pcsc';

/** A card a reader read: its UID as the reader gave it (the app normalizes it). */
export interface CardRead {
  readonly uid: string;
  readonly reader: CardReaderKind;
  /** Shows on the reader whether the app took the card (LED, beep); missing where it can't. */
  readonly signal?: (signal: CardSignal) => void;
}

export interface NfcReader {
  readonly kind: CardReaderKind;
  /** Starts listening for cards placed on the reader; returns the function that stops it. */
  listen(onRead: (read: CardRead) => void): () => void;
  /**
   * While listening, reads a card already lying on the reader once (spec §1): a screen that waits
   * for a card just opened. Missing on readers that only ever report new cards (keyboard-type).
   */
  readLying?(): void;
}

/** The readers this device can use. */
export function cardReaders(): readonly NfcReader[] {
  const readers = [keyboardCardReader(window)];
  return desktopBridge ? [...readers, pcscCardReader(desktopBridge)] : readers;
}

/** Whether this app can use PC/SC readers: only the Windows app can. */
export const canUsePcscReaders = desktopBridge !== undefined;

/**
 * Calls `onChange` with the PC/SC readers plugged into this PC, now and whenever they change (never
 * where they can't be used). Returns the function that stops watching.
 */
export function watchPcscReaders(onChange: (readers: readonly string[]) => void): () => void {
  return desktopBridge ? desktopBridge.watchCardReaders(onChange) : () => undefined;
}
