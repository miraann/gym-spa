import { keyboardCardReader } from './keyboard-card-reader';

// Card readers (spec §1): every kind of reader is an NfcReader, so the screens never know which one
// read a card. Step 2e has the keyboard-type readers (they type the UID and Enter), which work in
// every target. The PC/SC readers in the Windows app (ACR122U, step 2f) and the phone's own NFC
// (step 2g) are added here as more readers.

/** Which kind of reader read a card. */
export type CardReaderKind = 'keyboard';

/** A card a reader read: its UID as the reader gave it (the app normalizes it). */
export interface CardRead {
  readonly uid: string;
  readonly reader: CardReaderKind;
}

export interface NfcReader {
  readonly kind: CardReaderKind;
  /** Starts listening for cards; returns the function that stops it. */
  listen(onRead: (read: CardRead) => void): () => void;
}

/** The readers this device can use. */
export function cardReaders(): readonly NfcReader[] {
  return [keyboardCardReader(window)];
}
