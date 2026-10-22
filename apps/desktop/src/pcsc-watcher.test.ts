import { afterEach, describe, expect, it } from 'vitest';
import { FakePcsc } from './pcsc-fake';
import { PcscWatcher, uidFromAnswer, type PcscWatcherOptions } from './pcsc-watcher';

const ACR = 'ACS ACR122 0';
const SECOND = 'ACS ACR122 1';
const CARD = '04A1C1334F6180';
const OTHER_CARD = '04112233445566';

let watcher: PcscWatcher | undefined;

afterEach(async () => {
  await watcher?.stop();
  watcher = undefined;
});

function setup(options: PcscWatcherOptions = {}) {
  const pcsc = new FakePcsc();
  const cards: { reader: string; uid: string }[] = [];
  const readerLists: (readonly string[])[] = [];
  const logs: string[] = [];
  watcher = new PcscWatcher(
    pcsc,
    {
      onReaders: (readers) => readerLists.push(readers),
      onCard: (reader, uid) => cards.push({ reader, uid }),
      log: (message) => logs.push(message),
    },
    { waitMs: 50, retryDelaysMs: [10, 20], settleMs: 0, ...options },
  );
  return { pcsc, watcher, cards, readerLists, logs };
}

/** Long enough for the watcher to have seen every change (each step is a few ms). */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}

describe('PcscWatcher', () => {
  it('lists the readers as they are plugged in and out, also after the service stops', async () => {
    const { pcsc, watcher, readerLists } = setup();
    watcher.start();
    pcsc.plugIn(ACR);
    await expect.poll(() => readerLists.at(-1)).toEqual([ACR]);
    pcsc.plugIn(SECOND);
    await expect.poll(() => readerLists.at(-1)).toEqual([ACR, SECOND]);
    pcsc.unplug(ACR);
    await expect.poll(() => readerLists.at(-1)).toEqual([SECOND]);
    // The last reader: Windows stops its service, and the watcher connects again.
    pcsc.unplug(SECOND);
    await expect.poll(() => readerLists.at(-1)).toEqual([]);
    pcsc.plugIn(ACR);
    await expect.poll(() => readerLists.at(-1)).toEqual([ACR]);
  });

  it('reads a card placed while a screen listens, once while it stays there', async () => {
    const { pcsc, watcher, cards } = setup();
    pcsc.plugIn(ACR);
    watcher.start();
    watcher.setListening(true);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toEqual([{ reader: ACR, uid: CARD }]);
    await settle();
    expect(pcsc.uidReads).toHaveLength(1);

    pcsc.lift(ACR);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toHaveLength(2);
  });

  it('reads nothing while no screen listens', async () => {
    const { pcsc, watcher, cards } = setup();
    pcsc.plugIn(ACR);
    watcher.start();
    await settle();
    pcsc.place(ACR, CARD);
    await settle();
    expect(pcsc.uidReads).toEqual([]);
    expect(cards).toEqual([]);
  });

  it('reads a card already on the reader once when a screen starts listening', async () => {
    const { pcsc, watcher, cards } = setup();
    pcsc.plugIn(ACR);
    pcsc.place(ACR, CARD);
    watcher.start();
    await settle();
    expect(pcsc.uidReads).toEqual([]);

    watcher.setListening(true);
    await expect.poll(() => cards).toEqual([{ reader: ACR, uid: CARD }]);
    watcher.setListening(true);
    await settle();
    expect(cards).toHaveLength(1);

    // Another screen opened for it later reads it again.
    watcher.setListening(false);
    watcher.setListening(true);
    await expect.poll(() => cards).toHaveLength(2);
  });

  it('after waking from sleep, a card already on the reader is not new', async () => {
    const { pcsc, watcher, cards } = setup();
    pcsc.plugIn(ACR);
    watcher.start();
    watcher.setListening(true);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toHaveLength(1);
    const connections = pcsc.connections;

    watcher.restart();
    await expect.poll(() => pcsc.connections).toBe(connections + 1);
    await settle();
    expect(cards).toHaveLength(1);
    expect(pcsc.uidReads).toHaveLength(1);

    pcsc.lift(ACR);
    await settle();
    pcsc.place(ACR, OTHER_CARD);
    await expect.poll(() => cards.at(-1)).toEqual({ reader: ACR, uid: OTHER_CARD });
  });

  it('a card the reader finds again while the PC sleeps and wakes is not new', async () => {
    const { pcsc, watcher, cards } = setup();
    pcsc.plugIn(ACR);
    watcher.start();
    watcher.setListening(true);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toHaveLength(1);

    // On waking, the reader finds the card again before the app hears that the PC woke.
    watcher.sleep();
    pcsc.lift(ACR);
    await settle();
    pcsc.place(ACR, CARD);
    await settle();
    watcher.restart();
    await settle();
    expect(cards).toHaveLength(1);

    pcsc.lift(ACR);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toHaveLength(2);
  });

  it('after the service recovers, a card already on the reader is not new', async () => {
    const { pcsc, watcher, cards, readerLists, logs } = setup();
    pcsc.plugIn(ACR);
    pcsc.place(ACR, CARD);
    watcher.start();
    await settle();
    watcher.setListening(true);
    await expect.poll(() => cards).toHaveLength(1);
    const connections = pcsc.connections;

    pcsc.breakConnections('PC/SC service stopped');
    await expect.poll(() => pcsc.connections).toBe(connections + 1);
    await settle();
    expect(cards).toHaveLength(1);
    expect(logs).toContain('smart card service: PC/SC service stopped');
    // The reader stayed in the list throughout.
    expect(readerLists).toEqual([[ACR]]);

    pcsc.lift(ACR);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toHaveLength(2);
  });

  it('a reader plugged in again with a card on it gives no read until the card is placed again', async () => {
    const { pcsc, watcher, cards, readerLists } = setup();
    pcsc.plugIn(ACR);
    watcher.start();
    watcher.setListening(true);
    await settle();
    pcsc.unplug(ACR);
    await expect.poll(() => readerLists.at(-1)).toEqual([]);

    pcsc.plugIn(ACR);
    pcsc.place(ACR, CARD);
    await expect.poll(() => readerLists.at(-1)).toEqual([ACR]);
    await settle();
    expect(cards).toEqual([]);

    pcsc.lift(ACR);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toEqual([{ reader: ACR, uid: CARD }]);
  });

  it('a reader plugged in that finds the card on it a moment later gives no read', async () => {
    const { pcsc, watcher, cards, readerLists } = setup({ settleMs: 100 });
    watcher.start();
    watcher.setListening(true);
    pcsc.plugIn(ACR);
    await expect.poll(() => readerLists.at(-1)).toEqual([ACR]);
    // Seen empty first, then the card lying on it: as the ACR122U does about 0.5 s after plugging in.
    pcsc.place(ACR, CARD);
    await settle();
    expect(pcsc.uidReads).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 100));
    pcsc.lift(ACR);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toEqual([{ reader: ACR, uid: CARD }]);
  });

  it('a card pulled away mid-read sends nothing, and the next card is read', async () => {
    const { pcsc, watcher, cards, logs } = setup();
    pcsc.plugIn(ACR);
    watcher.start();
    watcher.setListening(true);
    await settle();
    const release = pcsc.holdNextRead(ACR);
    pcsc.place(ACR, CARD);
    await expect.poll(() => pcsc.uidReads).toHaveLength(1);
    pcsc.lift(ACR);
    release();
    await expect.poll(() => logs).toContain(`"${ACR}": reading the card failed: Card was removed`);
    expect(cards).toEqual([]);

    pcsc.place(ACR, OTHER_CARD);
    await expect.poll(() => cards).toEqual([{ reader: ACR, uid: OTHER_CARD }]);
  });

  it('reads two readers side by side, and a second reader plugged in later', async () => {
    const { pcsc, watcher, cards, readerLists } = setup();
    pcsc.plugIn(ACR);
    watcher.start();
    watcher.setListening(true);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toHaveLength(1);

    pcsc.plugIn(SECOND);
    await expect.poll(() => readerLists.at(-1)).toEqual([ACR, SECOND]);
    pcsc.place(SECOND, OTHER_CARD);
    await expect.poll(() => cards).toHaveLength(2);
    expect(cards).toEqual([
      { reader: ACR, uid: CARD },
      { reader: SECOND, uid: OTHER_CARD },
    ]);
  });

  it('signals through the card while it is there, else to the reader, which moves no card', async () => {
    const { pcsc, watcher, cards } = setup();
    pcsc.plugIn(ACR);
    watcher.start();
    watcher.setListening(true);
    await settle();
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toHaveLength(1);

    watcher.signal(ACR, 'ok');
    await expect.poll(() => pcsc.signals).toEqual([{ reader: ACR, signal: 'ok', via: 'card' }]);
    pcsc.lift(ACR);
    await settle();
    watcher.signal(ACR, 'error');
    await expect.poll(() => pcsc.signals).toHaveLength(2);
    expect(pcsc.signals[1]).toEqual({ reader: ACR, signal: 'error', via: 'reader' });

    // The reader was "unavailable" during the direct signal: not removed, and no card was placed.
    await settle();
    expect(pcsc.uidReads).toHaveLength(1);
    pcsc.place(ACR, CARD);
    await expect.poll(() => cards).toHaveLength(2);
  });

  it('signals only connected ACR122 readers, with at most one waiting', async () => {
    const { pcsc, watcher } = setup();
    pcsc.plugIn(ACR);
    pcsc.plugIn('Another Reader 0');
    watcher.start();
    await settle();

    watcher.signal('No such reader', 'ok');
    watcher.signal('Another Reader 0', 'ok');
    watcher.signal(ACR, 'ok');
    watcher.signal(ACR, 'error');
    watcher.signal(ACR, 'error');
    await settle();
    expect(pcsc.signals).toEqual([{ reader: ACR, signal: 'ok', via: 'reader' }]);
  });

  it('keeps trying while the service is down, and logs the problem once', async () => {
    const { pcsc, watcher, readerLists, logs } = setup();
    pcsc.setServiceDown(true);
    watcher.start();
    await expect.poll(() => pcsc.connections).toBeGreaterThan(3);
    expect(logs).toEqual(['smart card service: PC/SC service not running']);

    pcsc.setServiceDown(false);
    pcsc.plugIn(ACR);
    await expect.poll(() => readerLists.at(-1)).toEqual([ACR]);
  });

  it('stops', async () => {
    const { pcsc, watcher } = setup();
    watcher.start();
    await settle();
    await watcher.stop();
    const connections = pcsc.connections;
    await settle();
    expect(pcsc.connections).toBe(connections);
  });
});

describe('uidFromAnswer', () => {
  it('takes 4 to 10 UID bytes followed by 90 00', () => {
    expect(uidFromAnswer(Uint8Array.of(0x04, 0xa1, 0xc1, 0x33, 0x4f, 0x61, 0x80, 0x90, 0x00))).toBe(
      CARD,
    );
    expect(uidFromAnswer(Uint8Array.of(0xde, 0xad, 0xbe, 0xef, 0x90, 0x00))).toBe('DEADBEEF');
  });

  it('refuses failed reads and odd lengths', () => {
    expect(uidFromAnswer(Uint8Array.of(0x63, 0x00))).toBeNull();
    expect(uidFromAnswer(Uint8Array.of(0x01, 0x02, 0x03, 0x04, 0x63, 0x00))).toBeNull();
    expect(uidFromAnswer(Uint8Array.of(0x01, 0x02, 0x03, 0x90, 0x00))).toBeNull();
    expect(uidFromAnswer(new Uint8Array([...Array<number>(11).fill(1), 0x90, 0x00]))).toBeNull();
  });
});
