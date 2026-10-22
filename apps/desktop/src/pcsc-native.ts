import path from 'node:path';
import type { PcscContext, PcscSystem, ReaderState } from './pcsc-watcher';

// smartcard 3.7.2's native part (Node-API, MIT). The app ships without node_modules, so the build
// copies smartcard_napi.node into dist/native (scripts/build.mjs) and the installer keeps it outside
// app.asar (electron-builder.config.mjs). smartcard is an optional dependency: a build made where it
// couldn't be compiled has no file, and the app then works without PC/SC readers.

interface NativeCard {
  transmit(command: number[]): Promise<Uint8Array>;
  control(code: number, data: number[]): Promise<Uint8Array>;
  disconnect(disposition: number): void;
}

interface NativeReader {
  readonly name: string;
  connect(shareMode: number, protocol: number): Promise<NativeCard>;
}

interface NativeContext {
  listReaders(): NativeReader[];
  waitForChange(readers: ReaderState[], timeout: number): Promise<ReaderState[] | null>;
  cancel(): void;
  close(): void;
}

/** The parts of the addon the app uses. */
interface Smartcard {
  readonly Context: new () => NativeContext;
  readonly SCARD_SHARE_SHARED: number;
  readonly SCARD_SHARE_DIRECT: number;
  readonly SCARD_PROTOCOL_T0: number;
  readonly SCARD_PROTOCOL_T1: number;
  readonly SCARD_PROTOCOL_UNDEFINED: number;
  readonly SCARD_LEAVE_CARD: number;
}

/** IOCTL_CCID_ESCAPE, SCARD_CTL_CODE(3500): commands for the reader itself. */
const ESCAPE_CODE = process.platform === 'win32' ? 0x31_0000 | (3500 << 2) : 0x4200_0000 + 3500;

/** smartcard's addon in `directory`; null when this build has none or it can't load. */
export function loadSmartcard(directory: string): { system: PcscSystem } | { problem: string } {
  const loaded = { exports: {} };
  try {
    process.dlopen(loaded, path.join(directory, 'smartcard_napi.node'));
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
  const addon = loaded.exports as Smartcard;
  return { system: { connect: () => smartcardContext(addon, new addon.Context()) } };
}

function smartcardContext(addon: Smartcard, context: NativeContext): PcscContext {
  const reader = (name: string): NativeReader => {
    const found = context.listReaders().find((each) => each.name === name);
    if (!found) throw new Error(`No reader "${name}"`);
    return found;
  };
  /** Connects, runs one command, and always disconnects, leaving the card as it is. */
  const once = async (
    name: string,
    shareMode: number,
    protocol: number,
    command: (card: NativeCard) => Promise<Uint8Array>,
  ): Promise<Uint8Array> => {
    const card = await reader(name).connect(shareMode, protocol);
    try {
      return new Uint8Array(await command(card));
    } finally {
      try {
        card.disconnect(addon.SCARD_LEAVE_CARD);
      } catch {
        // The card or the reader is already gone.
      }
    }
  };

  return {
    readerNames: () => context.listReaders().map((each) => each.name),
    waitForChange: (readers, timeoutMs) =>
      context.waitForChange(
        readers.map(({ name, state }) => ({ name, state })),
        timeoutMs,
      ),
    transmit: (name, command) =>
      once(
        name,
        addon.SCARD_SHARE_SHARED,
        addon.SCARD_PROTOCOL_T0 | addon.SCARD_PROTOCOL_T1,
        (card) => card.transmit([...command]),
      ),
    control: (name, command) =>
      once(name, addon.SCARD_SHARE_DIRECT, addon.SCARD_PROTOCOL_UNDEFINED, (card) =>
        card.control(ESCAPE_CODE, [...command]),
      ),
    cancel: () => {
      context.cancel();
    },
    close: () => {
      context.close();
    },
  };
}
