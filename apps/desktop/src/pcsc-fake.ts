import type { CardSignal } from '@gym/platform/desktop-bridge';
import {
  PNP_NOTIFICATION,
  STATE,
  type PcscContext,
  type PcscSystem,
  type ReaderState,
} from './pcsc-watcher';

// A pretend smart card service with readers and cards, for the watcher's unit tests and the
// desktop e2e tests (GYM_FAKE_PCSC=1, never in the installed app). It behaves like Windows did with
// the ACR122U in step 2f's hardware tests: unplugging the last reader stops the service, which
// breaks every open connection (new ones still work); a direct connection makes the reader
// "unavailable" while it lasts; the high word of a state counts the changes.

interface FakeReader {
  uid: string | null;
  changes: number;
  direct: boolean;
}

interface Waiter {
  readonly check: () => void;
  readonly fail: (error: Error) => void;
  readonly cancel: () => void;
}

/** A LED and beep command a reader got: through the card, or to the reader itself. */
export interface FakeSignal {
  readonly reader: string;
  readonly signal: CardSignal | 'unknown';
  readonly via: 'card' | 'reader';
}

const SIGNAL_LEDS: Readonly<Record<number, CardSignal>> = { 0xa0: 'ok', 0x50: 'error' };

function isGetUid(command: readonly number[]): boolean {
  return command.join() === [0xff, 0xca, 0x00, 0x00, 0x00].join();
}

function signalOf(command: readonly number[]): CardSignal | 'unknown' {
  const isLeds = command[0] === 0xff && command[1] === 0x00 && command[2] === 0x40;
  return (isLeds ? SIGNAL_LEDS[command[3] ?? 0] : undefined) ?? 'unknown';
}

function hexBytes(hex: string): number[] {
  return (hex.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16));
}

export class FakePcsc implements PcscSystem {
  /** Get UID commands, by reader name, in order. */
  readonly uidReads: string[] = [];
  readonly signals: FakeSignal[] = [];
  /** Connections made, including failed attempts. */
  connections = 0;
  private readonly readers = new Map<string, FakeReader>();
  private readonly contexts = new Set<FakeContext>();
  private plugChanges = 0;
  private down = false;
  private readonly heldReads = new Map<string, Promise<void>>();

  connect(): PcscContext {
    this.connections += 1;
    if (this.down) throw new Error('PC/SC service not running');
    const context = new FakeContext(this);
    this.contexts.add(context);
    return context;
  }

  plugIn(name: string): void {
    this.readers.set(name, { uid: null, changes: 0, direct: false });
    this.plugChanges += 1;
    this.changed();
  }

  unplug(name: string): void {
    this.readers.delete(name);
    this.plugChanges += 1;
    // Windows stops its smart card service when the last reader goes.
    if (this.readers.size === 0) this.breakConnections('PC/SC service stopped');
    else this.changed();
  }

  place(name: string, uid: string): void {
    this.update(name, (reader) => {
      reader.uid = uid;
    });
  }

  lift(name: string): void {
    this.update(name, (reader) => {
      reader.uid = null;
    });
  }

  /** Every open connection fails, as after some sleeps; new connections work. */
  breakConnections(message: string): void {
    for (const context of this.contexts) context.fail(new Error(message));
    this.contexts.clear();
  }

  /** While down, no connection can be made. */
  setServiceDown(down: boolean): void {
    this.down = down;
    if (down) this.breakConnections('PC/SC service stopped');
  }

  /** The next Get UID on the reader waits until the returned function is called. */
  holdNextRead(name: string): () => void {
    let release: () => void = () => undefined;
    this.heldReads.set(
      name,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return () => {
      release();
    };
  }

  readerNames(): string[] {
    return [...this.readers.keys()];
  }

  stateOf(name: string): number {
    if (name === PNP_NOTIFICATION) return this.plugChanges << 16;
    const reader = this.readers.get(name);
    if (!reader) return STATE.unknown;
    const flags = reader.direct
      ? STATE.unavailable
      : reader.uid === null
        ? STATE.empty
        : STATE.present;
    return (reader.changes << 16) | flags;
  }

  forget(context: FakeContext): void {
    this.contexts.delete(context);
  }

  async transmit(name: string, command: readonly number[]): Promise<Uint8Array> {
    const reader = this.reader(name);
    if (reader.direct) throw new Error('Sharing violation');
    if (reader.uid === null) throw new Error('No smart card present');
    if (!isGetUid(command)) {
      this.signals.push({ reader: name, signal: signalOf(command), via: 'card' });
      return Uint8Array.of(0x90, 0x00);
    }
    this.uidReads.push(name);
    const uid = reader.uid;
    const held = this.heldReads.get(name);
    if (held) {
      this.heldReads.delete(name);
      await held;
      if (this.readers.get(name)?.uid !== uid) throw new Error('Card was removed');
    }
    return Uint8Array.from([...hexBytes(uid), 0x90, 0x00]);
  }

  async control(name: string, command: readonly number[]): Promise<Uint8Array> {
    const reader = this.reader(name);
    reader.direct = true;
    this.changed();
    this.signals.push({ reader: name, signal: signalOf(command), via: 'reader' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    reader.direct = false;
    this.changed();
    return Uint8Array.of(0x90, 0x01);
  }

  private reader(name: string): FakeReader {
    const reader = this.readers.get(name);
    if (!reader) throw new Error('Unknown reader');
    return reader;
  }

  private update(name: string, change: (reader: FakeReader) => void): void {
    const reader = this.reader(name);
    change(reader);
    reader.changes += 1;
    this.changed();
  }

  private changed(): void {
    for (const context of this.contexts) context.check();
  }
}

class FakeContext implements PcscContext {
  private readonly waiters = new Set<Waiter>();
  private failure: Error | null = null;
  private closed = false;

  constructor(private readonly service: FakePcsc) {}

  readerNames(): readonly string[] {
    this.usable();
    return this.service.readerNames();
  }

  waitForChange(
    readers: readonly ReaderState[],
    timeoutMs: number,
  ): Promise<readonly ReaderState[] | null> {
    this.usable();
    return new Promise((resolve, reject) => {
      const answer = () => {
        const states = readers.map(({ name, state }) => {
          const now = this.service.stateOf(name);
          return { name, state: now === state ? now : now | STATE.changed };
        });
        return states.some((each) => each.state & STATE.changed) ? states : null;
      };
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
      };
      const waiter: Waiter = {
        check: () => {
          const states = answer();
          if (!states) return;
          done();
          resolve(states);
        },
        fail: (error) => {
          done();
          reject(error);
        },
        cancel: () => {
          done();
          resolve(null);
        },
      };
      const timer = setTimeout(() => {
        done();
        resolve([]);
      }, timeoutMs);
      this.waiters.add(waiter);
      waiter.check();
    });
  }

  transmit(reader: string, command: readonly number[]): Promise<Uint8Array> {
    this.usable();
    return this.service.transmit(reader, command);
  }

  control(reader: string, command: readonly number[]): Promise<Uint8Array> {
    this.usable();
    return this.service.control(reader, command);
  }

  cancel(): void {
    for (const waiter of this.waiters) waiter.cancel();
  }

  close(): void {
    this.closed = true;
    this.service.forget(this);
    this.fail(new Error('Context is not valid'));
  }

  check(): void {
    for (const waiter of this.waiters) waiter.check();
  }

  fail(error: Error): void {
    this.failure ??= error;
    for (const waiter of this.waiters) waiter.fail(error);
  }

  private usable(): void {
    if (this.closed) throw new Error('Context is not valid');
    if (this.failure) throw this.failure;
  }
}
