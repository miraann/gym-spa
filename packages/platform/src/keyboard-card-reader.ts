import type { NfcReader } from './nfc';

// Keyboard-type card readers (spec §1): USB readers that type a card's UID and Enter, like a very
// fast keyboard. A burst of hex keys less than 50 ms apart, ended by Enter, is a card; people never
// type that fast, so their typing is left alone.
//
// The keys are read by where they are on the keyboard (KeyboardEvent.code), not by what they type:
// with a Kurdish or Arabic keyboard layout, the reader's A key types ش, but its code is still KeyA.

/** The longest pause between two keys of a card's UID. */
export const KEY_BURST_GAP_MS = 50;
/** The shortest UID: 4 bytes in hex. */
const MIN_LENGTH = 8;
/** Longer than any UID with room to spare: the burst is something else. */
const MAX_LENGTH = 32;

const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'NumLock',
]);

/** What the detector needs of a keydown event. */
export interface KeyPress {
  readonly code: string;
  readonly key: string;
  readonly timeStamp: number;
  readonly repeat?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}

/** The hex digit a key types, by its place on the keyboard; null for any other key. */
function hexDigitOf(press: KeyPress): string | null {
  const byCode = /^(?:Digit|Numpad)([0-9])$|^Key([A-F])$/.exec(press.code);
  if (byCode) return byCode[1] ?? byCode[2] ?? null;
  // No physical key (some Android keyboards): what it typed.
  if (press.code === '' || press.code === 'Unidentified') {
    if (/^[0-9A-Fa-f]$/.test(press.key)) return press.key.toUpperCase();
    const eastern = EASTERN_DIGITS.indexOf(press.key);
    if (eastern >= 0) return String(eastern % 10);
  }
  return null;
}

function isEnter(press: KeyPress): boolean {
  return press.code === 'Enter' || press.code === 'NumpadEnter' || press.key === 'Enter';
}

/** Finds the UIDs a keyboard-type reader types among the keys pressed. */
export class KeyboardBurstDetector {
  private typed = '';
  private lastAt = 0;

  /** Feeds one keydown; returns the UID as typed when an Enter ends a reader's burst. */
  press(press: KeyPress): string | null {
    if (MODIFIER_KEYS.has(press.key)) return null;
    if (isEnter(press)) {
      const done =
        this.typed.length >= MIN_LENGTH && press.timeStamp - this.lastAt <= KEY_BURST_GAP_MS
          ? this.typed
          : null;
      this.reset();
      return done;
    }
    const digit =
      press.repeat || press.ctrlKey || press.altKey || press.metaKey ? null : hexDigitOf(press);
    if (digit === null) {
      this.reset();
      return null;
    }
    if (this.typed !== '' && press.timeStamp - this.lastAt > KEY_BURST_GAP_MS) this.typed = '';
    this.typed = this.typed.length >= MAX_LENGTH ? digit : this.typed + digit;
    this.lastAt = press.timeStamp;
    return null;
  }

  reset(): void {
    this.typed = '';
    this.lastAt = 0;
  }
}

/** Marks a text field that a reader may type into, such as a dialog's card number field. */
export const CARD_INPUT_ATTRIBUTE = 'data-card-input';

const TEXT_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'tel',
  'number',
  'email',
  'password',
  'url',
]);

/** Whether keys typed here are text someone is writing (a search box): never a card then. */
function isOtherTextField(target: EventTarget | null): boolean {
  if (typeof target !== 'object' || target === null || !('tagName' in target)) return false;
  const element = target as HTMLElement;
  if (element.closest(`[${CARD_INPUT_ATTRIBUTE}]`)) return false;
  if (element.tagName === 'INPUT') {
    return TEXT_INPUT_TYPES.has((element.getAttribute('type') ?? '').toLowerCase());
  }
  return (
    element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable
  );
}

/**
 * The keyboard-type readers: listens to the keys pressed anywhere in the window, except in text
 * fields other than card number fields. The Enter that ends a card is kept from the page, so it
 * neither presses a button nor sends a form.
 */
export function keyboardCardReader(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
): NfcReader {
  return {
    kind: 'keyboard',
    listen(onRead) {
      const detector = new KeyboardBurstDetector();
      const onKeyDown = (event: KeyboardEvent) => {
        if (isOtherTextField(event.target)) {
          detector.reset();
          return;
        }
        const uid = detector.press(event);
        if (uid === null) return;
        event.preventDefault();
        event.stopPropagation();
        onRead({ uid, reader: 'keyboard' });
      };
      target.addEventListener('keydown', onKeyDown, { capture: true });
      return () => {
        target.removeEventListener('keydown', onKeyDown, { capture: true });
      };
    },
  };
}
