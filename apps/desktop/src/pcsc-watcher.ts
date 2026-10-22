import type { CardSignal } from '@gym/platform/desktop-bridge';

// PC/SC card readers such as the ACR122U (spec §1, step 2f). The main process watches Windows'
// smart card service with SCardGetStatusChange (PcscContext.waitForChange) and reads a card's UID
// with Get UID. Only UIDs and reader names leave this file.
//
// Rules (decided by the user on 2026-10-22):
// - A card counts when it is placed on a reader while a screen listens. Holding it there longer
//   sends nothing more; lifting it and placing it again is a new read.
// - A card already on a reader after the app starts, the PC wakes, the reader is plugged in again or
//   the service recovers is not new: the first state seen after (re)connecting only sets what is
//   on the reader. A reader just plugged in reports itself empty at first and finds a card lying
//   on it about half a second later (seen with the ACR122U), so a card it finds within `settleMs`
//   of appearing counts as already there too. On waking, the reader also finds the card lying on
//   it again before Windows tells the app the PC woke, so from going to sleep (sleep()) until the
//   new connection after waking (restart()) no card is new. When a screen starts listening, a card
//   already on a reader is read once: staff opened that screen for it.
// - Any service error closes the connection and opens a new one after a short pause; waking from
//   sleep does the same (restart). A reader in use by another connection, such as our own LED and
//   beep, is "unavailable" for a moment: that is a pause, not a removed reader or a moved card.
// - Reads and LED/beep commands run one at a time per reader, so two readers work side by side. A
//   read that fails, e.g. because the card was pulled away mid-read, is logged and dropped.

/** Reader state flags (SCARD_STATE_*), the same in Windows and pcsc-lite. */
export const STATE = {
  changed: 0x2,
  unknown: 0x4,
  unavailable: 0x8,
  empty: 0x10,
  present: 0x20,
} as const;

/** The special entry whose state changes when a reader is plugged in or out. */
export const PNP_NOTIFICATION = '\\\\?PnP?\\Notification';

export interface ReaderState {
  readonly name: string;
  readonly state: number;
}

/** What the watcher needs of PC/SC: smartcard's native addon (pcsc-native.ts), or a fake. */
export interface PcscSystem {
  /** A new connection to the smart card service (SCardEstablishContext); throws if it can't. */
  connect(): PcscContext;
}

export interface PcscContext {
  readerNames(): readonly string[];
  /**
   * Waits until a state differs from the one given, then resolves with every entry's state. [] when
   * the time is up, null when cancelled.
   */
  waitForChange(
    readers: readonly ReaderState[],
    timeoutMs: number,
  ): Promise<readonly ReaderState[] | null>;
  /** Sends one command to the card on a reader (shared connection; the card is left as it is). */
  transmit(reader: string, command: readonly number[]): Promise<Uint8Array>;
  /** Sends one command to the reader itself, with or without a card (direct connection). */
  control(reader: string, command: readonly number[]): Promise<Uint8Array>;
  /** Ends a pending waitForChange (it resolves with null). */
  cancel(): void;
  close(): void;
}

export interface PcscEvents {
  /** The connected readers changed. */
  readonly onReaders: (readers: readonly string[]) => void;
  /** A card's UID (uppercase hex), read while a screen listens. */
  readonly onCard: (reader: string, uid: string) => void;
  readonly log: (message: string) => void;
}

export interface PcscWatcherOptions {
  /** The longest single wait; then the reader list is checked again. */
  readonly waitMs?: number;
  /** Pauses before connecting again after failures in a row; the last one repeats. */
  readonly retryDelaysMs?: readonly number[];
  /** How long after a reader appears (or the watcher connects) a card it finds was already there. */
  readonly settleMs?: number;
}

const GET_UID = [0xff, 0xca, 0x00, 0x00, 0x00];

/**
 * ACR122U LED and buzzer: FF 00 40 <LEDs> 04 <T1> <T2> <repeats> <buzzer>, times in 100 ms. The LED
 * state masks are 0, so the LEDs go back to how they were afterwards.
 */
const SIGNALS: Readonly<Record<CardSignal, readonly number[]>> = {
  // Green for 300 ms with one beep.
  ok: [0xff, 0x00, 0x40, 0xa0, 0x04, 0x03, 0x01, 0x01, 0x01],
  // Red twice with two beeps.
  error: [0xff, 0x00, 0x40, 0x50, 0x04, 0x02, 0x02, 0x02, 0x01],
};

/** Readers that understand the LED and buzzer command above; others get no signal. */
const SIGNAL_READER = /ACR122/i;

/** The UID in a Get UID answer (4 to 10 bytes, then 90 00), in uppercase hex; else null. */
export function uidFromAnswer(answer: Uint8Array): string | null {
  const length = answer.length - 2;
  if (length < 4 || length > 10 || answer[length] !== 0x90 || answer[length + 1] !== 0x00) {
    return null;
  }
  return Array.from(answer.subarray(0, length), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Reader {
  /** Its last state (without CHANGED), given back to waitForChange. */
  state: number;
  /** Whether a card is on it; null until the first state after (re)connecting. */
  card: boolean | null;
  /** Until then (Date.now()), a card it finds was already on it (settleMs). */
  settledAt: number;
  /** Reads and signals of this reader, one at a time. */
  queue: Promise<void>;
  /** Reads waiting or running. */
  reads: number;
  /** A signal is waiting (at most one waits; more are dropped). */
  signalWaiting: boolean;
}

export class PcscWatcher {
  private readonly readers = new Map<string, Reader>();
  private readonly waitMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly settleMs: number;
  private context: PcscContext | null = null;
  private notificationState = 0;
  private listening = false;
  private asleep = false;
  private running = false;
  private restartWanted = false;
  private failures = 0;
  private lastProblem: string | null = null;
  private endPause: (() => void) | null = null;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly system: PcscSystem,
    private readonly events: PcscEvents,
    options: PcscWatcherOptions = {},
  ) {
    this.waitMs = options.waitMs ?? 2000;
    this.retryDelaysMs = options.retryDelaysMs ?? [500, 1000, 2000, 5000];
    this.settleMs = options.settleMs ?? 2000;
  }

  start(): void {
    if (this.loop) return;
    this.running = true;
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.interrupt();
    await this.loop;
    this.loop = null;
  }

  /** The PC is going to sleep: until restart(), every card a reader finds was already there. */
  sleep(): void {
    this.asleep = true;
    for (const reader of this.readers.values()) reader.settledAt = this.settledAt();
  }

  /** Connects again, e.g. after the PC woke up. Cards already on the readers are not new. */
  restart(): void {
    this.asleep = false;
    this.restartWanted = true;
    this.interrupt();
  }

  readerNames(): readonly string[] {
    return [...this.readers.keys()];
  }

  /** Whether a screen listens. When one starts, a card already on a reader is read once. */
  setListening(listening: boolean): void {
    const started = listening && !this.listening;
    this.listening = listening;
    if (!started) return;
    for (const [name, reader] of this.readers) {
      if (reader.card === true && reader.reads === 0) this.read(name, reader);
    }
  }

  /** Shows on a reader whether the app took the card: LED and beep, on readers that can. */
  signal(name: string, signal: CardSignal): void {
    const reader = this.readers.get(name);
    if (!reader || !SIGNAL_READER.test(name) || reader.signalWaiting) return;
    reader.signalWaiting = true;
    this.enqueue(reader, async () => {
      reader.signalWaiting = false;
      const context = this.context;
      if (!context || this.readers.get(name) !== reader) return;
      const command = SIGNALS[signal];
      try {
        // Through the card while it is there (any driver passes that on); else to the reader itself.
        const answer =
          reader.card === true
            ? await context.transmit(name, command).catch(() => context.control(name, command))
            : await context.control(name, command);
        this.events.log(
          answer[0] === 0x90
            ? `"${name}": showed ${signal}`
            : `"${name}" refused the LED and beep command`,
        );
      } catch (error) {
        this.events.log(`"${name}": the LED and beep failed: ${messageOf(error)}`);
      }
    });
  }

  private async run(): Promise<void> {
    while (this.running) {
      if (this.restartWanted) {
        this.restartWanted = false;
        this.disconnect();
      }
      const context = this.context ?? this.connect();
      if (!context) {
        await this.pause();
        continue;
      }
      try {
        const answer = await context.waitForChange(this.entries(), this.waitMs);
        // Null: cancelled, to stop or restart.
        if (answer === null) continue;
        if (answer.length === 0) this.updateReaders(context);
        else this.apply(context, answer);
        this.failures = 0;
        this.lastProblem = null;
      } catch (error) {
        this.failed(error);
        this.disconnect();
        await this.pause();
      }
    }
    this.disconnect();
  }

  /** A new connection; every reader's first state after it only sets what is on the reader. */
  private connect(): PcscContext | null {
    try {
      const context = this.system.connect();
      this.context = context;
      this.notificationState = 0;
      for (const reader of this.readers.values()) {
        reader.state = 0;
        reader.card = null;
        reader.settledAt = this.settledAt();
      }
      this.updateReaders(context);
      return context;
    } catch (error) {
      this.failed(error);
      this.disconnect();
      if (this.readers.size > 0) {
        this.readers.clear();
        this.events.onReaders([]);
      }
      return null;
    }
  }

  private disconnect(): void {
    const context = this.context;
    this.context = null;
    try {
      context?.close();
    } catch {
      // Already gone.
    }
  }

  /** Ends a pending wait or pause, so the loop sees a stop or restart at once. */
  private interrupt(): void {
    try {
      this.context?.cancel();
    } catch {
      // The connection is broken: the wait ends with an error instead.
    }
    this.endPause?.();
  }

  private pause(): Promise<void> {
    const delay =
      this.retryDelaysMs[Math.min(this.failures, this.retryDelaysMs.length) - 1] ?? 1000;
    return new Promise((resolve) => {
      const end = () => {
        clearTimeout(timer);
        this.endPause = null;
        resolve();
      };
      const timer = setTimeout(end, delay);
      this.endPause = end;
    });
  }

  private failed(error: unknown): void {
    this.failures += 1;
    const problem = messageOf(error);
    // A service that stays away fails the same way every few seconds: log it once.
    if (problem !== this.lastProblem) this.events.log(`smart card service: ${problem}`);
    this.lastProblem = problem;
  }

  /** From when a card a reader finds is new again (Reader.settledAt). */
  private settledAt(): number {
    return this.asleep ? Number.POSITIVE_INFINITY : Date.now() + this.settleMs;
  }

  private entries(): ReaderState[] {
    const entries = [...this.readers].map(([name, reader]) => ({ name, state: reader.state }));
    return [...entries, { name: PNP_NOTIFICATION, state: this.notificationState }];
  }

  private updateReaders(context: PcscContext): void {
    const names = new Set(context.readerNames());
    let changed = false;
    for (const name of names) {
      if (this.readers.has(name)) continue;
      this.readers.set(name, {
        state: 0,
        card: null,
        settledAt: this.settledAt(),
        queue: Promise.resolve(),
        reads: 0,
        signalWaiting: false,
      });
      changed = true;
    }
    for (const name of this.readers.keys()) {
      if (names.has(name)) continue;
      this.readers.delete(name);
      changed = true;
    }
    if (changed) this.events.onReaders(this.readerNames());
  }

  private apply(context: PcscContext, answer: readonly ReaderState[]): void {
    for (const entry of answer) {
      // Windows doesn't always set CHANGED, so states are compared instead.
      const state = entry.state & ~STATE.changed;
      if (entry.name === PNP_NOTIFICATION) {
        if (state === this.notificationState) continue;
        this.notificationState = state;
        this.updateReaders(context);
        continue;
      }
      const reader = this.readers.get(entry.name);
      if (!reader || reader.state === state) continue;
      reader.state = state;
      if (state & STATE.unknown) {
        this.readers.delete(entry.name);
        this.events.onReaders(this.readerNames());
        continue;
      }
      if (state & STATE.unavailable) continue;
      const card = (state & STATE.present) !== 0;
      const placed = card && reader.card === false && Date.now() >= reader.settledAt;
      reader.card = card;
      if (placed && this.listening) this.read(entry.name, reader);
    }
  }

  private read(name: string, reader: Reader): void {
    reader.reads += 1;
    this.enqueue(reader, async () => {
      try {
        const context = this.context;
        if (!context || this.readers.get(name) !== reader) return;
        const uid = uidFromAnswer(await context.transmit(name, GET_UID));
        if (uid === null) {
          this.events.log(`"${name}": the card gave no UID`);
        } else if (this.listening) {
          this.events.log(`"${name}": card read`);
          this.events.onCard(name, uid);
        }
      } catch (error) {
        this.events.log(`"${name}": reading the card failed: ${messageOf(error)}`);
      } finally {
        reader.reads -= 1;
      }
    });
  }

  private enqueue(reader: Reader, task: () => Promise<void>): void {
    reader.queue = reader.queue.then(task);
  }
}
