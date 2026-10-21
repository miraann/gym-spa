import { describe, expect, it } from 'vitest';
import {
  CARD_INPUT_ATTRIBUTE,
  KeyboardBurstDetector,
  keyboardCardReader,
  type KeyPress,
} from './keyboard-card-reader';
import type { CardRead } from './nfc';

/** The keys of a text as a US keyboard sends them, `gap` ms apart from `start`, then Enter. */
function typed(text: string, gap: number, start = 1000): KeyPress[] {
  const keys = Array.from(text).map((char, index): KeyPress => {
    const code = /[0-9]/.test(char) ? `Digit${char}` : `Key${char.toUpperCase()}`;
    return { code, key: char, timeStamp: start + index * gap };
  });
  return [...keys, { code: 'Enter', key: 'Enter', timeStamp: start + text.length * gap }];
}

function run(detector: KeyboardBurstDetector, presses: readonly KeyPress[]): string[] {
  return presses.map((press) => detector.press(press)).filter((uid) => uid !== null);
}

describe('KeyboardBurstDetector', () => {
  it('finds a UID a reader types', () => {
    expect(run(new KeyboardBurstDetector(), typed('04A23BC15D6E80', 8))).toEqual([
      '04A23BC15D6E80',
    ]);
    expect(run(new KeyboardBurstDetector(), typed('3735928559', 20))).toEqual(['3735928559']);
  });

  it('leaves people typing alone', () => {
    expect(run(new KeyboardBurstDetector(), typed('04A23BC15D6E80', 120))).toEqual([]);
    // One pause in the middle is enough: what comes after it is too short for a card.
    const presses = typed('04A23BC15D6E80', 8);
    const slowed = presses.map((press, index) =>
      index >= 7 ? { ...press, timeStamp: press.timeStamp + 200 } : press,
    );
    expect(run(new KeyboardBurstDetector(), slowed)).toEqual([]);
  });

  it('needs at least 4 bytes, and the Enter right after', () => {
    expect(run(new KeyboardBurstDetector(), typed('04A23B', 8))).toEqual([]);
    const late = typed('04A23BC15D6E80', 8);
    const enter = late.at(-1);
    if (!enter) throw new Error('no Enter');
    late[late.length - 1] = { ...enter, timeStamp: enter.timeStamp + 500 };
    expect(run(new KeyboardBurstDetector(), late)).toEqual([]);
  });

  it('reads the keys by their place, whatever the keyboard layout types', () => {
    // A Kurdish layout: KeyA types ش, Digit4 types ٤.
    const presses: KeyPress[] = [
      { code: 'Digit0', key: '٠', timeStamp: 0 },
      { code: 'Digit4', key: '٤', timeStamp: 5 },
      { code: 'KeyA', key: 'ش', timeStamp: 10 },
      { code: 'Digit2', key: '٢', timeStamp: 15 },
      { code: 'Digit3', key: '٣', timeStamp: 20 },
      { code: 'KeyB', key: 'ل', timeStamp: 25 },
      { code: 'KeyC', key: 'ء', timeStamp: 30 },
      { code: 'Numpad1', key: '1', timeStamp: 35 },
      { code: 'NumpadEnter', key: 'Enter', timeStamp: 40 },
    ];
    expect(run(new KeyboardBurstDetector(), presses)).toEqual(['04A23BC1']);
  });

  it('uses what was typed when the key has no place (some Android keyboards)', () => {
    const presses: KeyPress[] = Array.from('de٣dbeef').map((key, index) => ({
      code: '',
      key,
      timeStamp: index * 5,
    }));
    presses.push({ code: '', key: 'Enter', timeStamp: 40 });
    expect(run(new KeyboardBurstDetector(), presses)).toEqual(['DE3DBEEF']);
  });

  it('ignores Shift, and starts again after any other key', () => {
    const presses = typed('DEADBEEF', 5).flatMap((press) =>
      press.code.startsWith('Key')
        ? [{ code: 'ShiftLeft', key: 'Shift', timeStamp: press.timeStamp }, press]
        : [press],
    );
    expect(run(new KeyboardBurstDetector(), presses)).toEqual(['DEADBEEF']);
    const broken = typed('DEADBEEF', 5);
    broken.splice(4, 0, { code: 'KeyG', key: 'g', timeStamp: 21 });
    expect(run(new KeyboardBurstDetector(), broken)).toEqual([]);
    const shortcut = typed('DEADBEEF', 5).map((press, index) =>
      index === 3 ? { ...press, ctrlKey: true } : press,
    );
    expect(run(new KeyboardBurstDetector(), shortcut)).toEqual([]);
  });

  it('finds the next card after a pause', () => {
    const detector = new KeyboardBurstDetector();
    expect(run(detector, [...typed('1234', 150, 0), ...typed('DEADBEEF', 5, 5000)])).toEqual([
      'DEADBEEF',
    ]);
    expect(run(detector, typed('CAFEBABE', 5, 9000))).toEqual(['CAFEBABE']);
  });
});

/** A window that only keeps its keydown listener, and fake elements and events. */
function fakeWindow() {
  let listener: ((event: KeyboardEvent) => void) | null = null;
  return {
    target: {
      addEventListener: (_type: string, handler: (event: KeyboardEvent) => void) => {
        listener = handler;
      },
      removeEventListener: () => {
        listener = null;
      },
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>,
    listening: () => listener !== null,
    keys(presses: readonly KeyPress[], on: unknown) {
      const prevented: string[] = [];
      for (const press of presses) {
        listener?.({
          ...press,
          target: on,
          preventDefault: () => prevented.push(press.code),
          stopPropagation: () => undefined,
        } as unknown as KeyboardEvent);
      }
      return prevented;
    },
  };
}

function element(tagName: string, options: { type?: string; cardInput?: boolean } = {}) {
  return {
    tagName,
    isContentEditable: false,
    getAttribute: (name: string) => (name === 'type' ? (options.type ?? null) : null),
    closest: (selector: string) =>
      selector === `[${CARD_INPUT_ATTRIBUTE}]` && options.cardInput ? {} : null,
  };
}

describe('keyboardCardReader', () => {
  it('reads cards typed anywhere but in text fields, and keeps their Enter from the page', () => {
    const window = fakeWindow();
    const reads: CardRead[] = [];
    const stop = keyboardCardReader(window.target).listen((read) => reads.push(read));

    expect(window.keys(typed('04A23BC15D6E80', 5), element('BUTTON'))).toEqual(['Enter']);
    expect(window.keys(typed('DEADBEEF', 5), element('INPUT', { cardInput: true }))).toEqual([
      'Enter',
    ]);
    expect(window.keys(typed('CAFEBABE', 5), element('INPUT', { type: 'search' }))).toEqual([]);
    expect(window.keys(typed('CAFEBABE', 5), element('TEXTAREA'))).toEqual([]);
    expect(window.keys(typed('12345678', 5), element('INPUT', { type: 'checkbox' }))).toEqual([
      'Enter',
    ]);
    expect(reads).toEqual([
      { uid: '04A23BC15D6E80', reader: 'keyboard' },
      { uid: 'DEADBEEF', reader: 'keyboard' },
      { uid: '12345678', reader: 'keyboard' },
    ]);

    // An Enter people press stays theirs.
    expect(window.keys(typed('1234', 200), element('BUTTON'))).toEqual([]);

    stop();
    expect(window.listening()).toBe(false);
  });
});
