import type { CardRead, NfcReader } from '@gym/platform';
import { describe, expect, it } from 'vitest';
import { parseCardReaderSettings } from './card-reader-settings';
import { CardScanDispatcher, scanOf, type CardScan } from './card-reader';

describe('scanOf', () => {
  it('turns a reversed keyboard-type reader around, and no other reader', () => {
    expect(scanOf({ uid: '806E5DC13BA204', reader: 'keyboard' }, 'reversed')).toMatchObject({
      uid: '04A23BC15D6E80',
      raw: '806E5DC13BA204',
    });
    expect(scanOf({ uid: '04A23BC15D6E80', reader: 'keyboard' }, 'normal').uid).toBe(
      '04A23BC15D6E80',
    );
    // PC/SC readers give the bytes as the card sends them.
    expect(scanOf({ uid: '04A1C1334F6180', reader: 'pcsc' }, 'reversed').uid).toBe(
      '04A1C1334F6180',
    );
  });

  it('keeps what the reader gave when it is no card UID', () => {
    expect(scanOf({ uid: '1234567890123', reader: 'keyboard' }, 'normal')).toMatchObject({
      uid: null,
      raw: '1234567890123',
    });
  });

  it("passes the reader's signal on, and is quiet for readers without one", () => {
    const signals: string[] = [];
    const read = { uid: '04A1C1334F6180', reader: 'pcsc' as const };
    scanOf({ ...read, signal: (signal) => signals.push(signal) }, 'normal').signal('ok');
    expect(signals).toEqual(['ok']);
    expect(() => {
      scanOf(read, 'normal').signal('error');
    }).not.toThrow();
  });
});

describe('parseCardReaderSettings', () => {
  it('reads saved settings, and falls back to the normal byte order', () => {
    expect(parseCardReaderSettings('{"keyboardByteOrder":"reversed"}')).toEqual({
      keyboardByteOrder: 'reversed',
    });
    expect(parseCardReaderSettings('{"keyboardByteOrder":"sideways"}')).toEqual({
      keyboardByteOrder: 'normal',
    });
    expect(parseCardReaderSettings('not json')).toEqual({ keyboardByteOrder: 'normal' });
    expect(parseCardReaderSettings(null)).toEqual({ keyboardByteOrder: 'normal' });
  });
});

/** A reader the test holds cards to; it counts listeners and requests for a lying card. */
function fakeReader(kind: NfcReader['kind']) {
  const state = {
    listening: 0,
    lyingRequests: 0,
    onRead: null as ((read: CardRead) => void) | null,
  };
  const reader: NfcReader = {
    kind,
    listen(onRead) {
      state.listening += 1;
      state.onRead = onRead;
      return () => {
        state.listening -= 1;
        state.onRead = null;
      };
    },
    readLying() {
      state.lyingRequests += 1;
    },
  };
  const hold = (uid: string) => {
    state.onRead?.({ uid, reader: kind });
  };
  return { reader, state, hold };
}

function collector() {
  const scans: (string | null)[] = [];
  return { scans, ref: { current: (scan: CardScan) => scans.push(scan.uid) } };
}

describe('CardScanDispatcher', () => {
  it('gives cards to the newest card screen, and the rest to the unclaimed handler', () => {
    const { reader, hold } = fakeReader('pcsc');
    const dispatcher = new CardScanDispatcher(
      () => [reader],
      () => 'normal',
    );
    const page = collector();
    const dialog = collector();
    const unclaimed = collector();
    // React mounts children first: the page's screen registers before the app's handler.
    const stopPage = dispatcher.addScreen(page.ref);
    dispatcher.setUnclaimed(unclaimed.ref);
    hold('04A1C1334F6180');
    const stopDialog = dispatcher.addScreen(dialog.ref);
    hold('04112233445566');
    stopDialog();
    stopPage();
    hold('DEADBEEF');

    expect(page.scans).toEqual(['04A1C1334F6180']);
    expect(dialog.scans).toEqual(['04112233445566']);
    expect(unclaimed.scans).toEqual(['DEADBEEF']);
  });

  it('asks for a card lying on the reader only when a card screen opens', () => {
    const { reader, state } = fakeReader('pcsc');
    const dispatcher = new CardScanDispatcher(
      () => [reader],
      () => 'normal',
    );
    dispatcher.setUnclaimed(collector().ref);
    expect(state.lyingRequests).toBe(0);
    const stop = dispatcher.addScreen(collector().ref);
    expect(state.lyingRequests).toBe(1);
    stop();
    dispatcher.addScreen(collector().ref);
    expect(state.lyingRequests).toBe(2);
  });

  it('listens while anyone takes cards, and stops when nobody does', () => {
    const { reader, state } = fakeReader('keyboard');
    const dispatcher = new CardScanDispatcher(
      () => [reader],
      () => 'normal',
    );
    const stopUnclaimed = dispatcher.setUnclaimed(collector().ref);
    const stopScreen = dispatcher.addScreen(collector().ref);
    expect(state.listening).toBe(1);
    stopUnclaimed();
    expect(state.listening).toBe(1);
    stopScreen();
    expect(state.listening).toBe(0);
  });

  it("reads keyboard-type readers in this device's byte order", () => {
    const { reader, hold } = fakeReader('keyboard');
    const dispatcher = new CardScanDispatcher(
      () => [reader],
      () => 'reversed',
    );
    const screen = collector();
    dispatcher.addScreen(screen.ref);
    hold('806E5DC13BA204');
    expect(screen.scans).toEqual(['04A23BC15D6E80']);
  });
});
