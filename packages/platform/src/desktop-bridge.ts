/** The app's theme setting: a fixed theme, or follow the device. */
export type ThemeSource = 'light' | 'dark' | 'system';

/**
 * What the Electron preload script (apps/desktop/src/preload.ts) gives the web app as
 * `window.gymDesktop`. Everything here can be called by the web page, so keep it small and have
 * the main process validate every argument.
 */
export interface DesktopBridge {
  /** Makes the window frame (title bar) follow the app's theme setting. */
  readonly setTheme: (theme: ThemeSource) => void;
  /** Encrypted with Windows' own encryption (DPAPI, through Electron safeStorage). */
  readonly secureGet: (key: string) => Promise<string | null>;
  readonly secureSet: (key: string, value: string) => Promise<void>;
  readonly secureDelete: (key: string) => Promise<void>;
  /**
   * PC/SC card readers such as the ACR122U, read by the main process (step 2f): cards placed on a
   * reader while the page listens. Returns the function that stops listening.
   */
  readonly listenForCards: (onCard: (card: PcscCard) => void) => () => void;
  /** Reads a card already lying on a reader once: a screen that waits for a card just opened. */
  readonly readLyingCards: () => void;
  /** Calls `onChange` with the connected PC/SC readers now and whenever they change. */
  readonly watchCardReaders: (onChange: (readers: readonly string[]) => void) => () => void;
  /** Shows on a reader whether the app took the card it read: LED and beep, where it can. */
  readonly signalCard: (reader: string, signal: CardSignal) => void;
  /** The printers Windows knows (step 8f), by name. */
  readonly listPrinters: () => Promise<readonly string[]>;
  /**
   * Prints the page to the named printer without the print dialog (receipts on an 80mm printer).
   * Resolves false when it couldn't (the printer is gone, out of paper, ...).
   */
  readonly printSilently: (printer: string) => Promise<boolean>;
  /** The offline edition's link to the gym's server (step OF-d). */
  readonly serverStatus: () => Promise<ServerLinkStatus>;
  /** Asks the network which offline servers there are (UDP broadcast, about 1.5 s). */
  readonly findServers: () => Promise<readonly FoundServer[]>;
  /** Connects to a server by address and says which it is and what its certificate is; null: none. */
  readonly probeServer: (address: string) => Promise<ProbedServer | null>;
  /** Pairs this PC with a probed server using the code on the server's screen. */
  readonly pairWithServer: (
    server: Pick<ProbedServer, 'address' | 'port' | 'fingerprint'>,
    code: string,
    name: string,
  ) => Promise<PairResult>;
  /** Links this PC to the server running on it (the server PC itself); false: none runs here. */
  readonly linkThisPc: () => Promise<boolean>;
}

/** Whether this PC is linked to a server, and whether that server runs on this PC. */
export interface ServerLinkStatus {
  readonly linked: boolean;
  readonly local: boolean;
  /** Windows' name for this PC, the default name it pairs under. */
  readonly computerName: string;
}

/** The gym of a server, as it says. */
export interface ServerGym {
  readonly code: string;
  readonly name: string;
}

/** A server that answered on the network. */
export interface FoundServer {
  readonly address: string;
  readonly port: number;
  readonly identity: string;
  readonly gym: ServerGym | null;
  readonly version: string;
}

/** A server reached by its address, with the certificate it showed. */
export interface ProbedServer extends FoundServer {
  /** SHA-256 of its certificate (AB:CD:…): what this PC pins once paired. */
  readonly fingerprint: string;
}

export type PairError =
  | 'code_wrong'
  | 'code_expired'
  | 'no_code'
  | 'too_many_tries'
  | 'invalid_name'
  /** The server showed another certificate than when it was checked: someone may be in between. */
  | 'certificate_changed'
  | 'unreachable';

export type PairResult = { readonly ok: true } | { readonly ok: false; readonly error: PairError };

/** A card a PC/SC reader read: its UID in hex, as the card gave it, and the reader's name. */
export interface PcscCard {
  readonly reader: string;
  readonly uid: string;
}

/** What a reader shows after a read: the app took the card (ok) or refused it (error). */
export type CardSignal = 'ok' | 'error';

export const DESKTOP_BRIDGE_KEY = 'gymDesktop';

/** IPC channels between the preload script and the main process. */
export const DESKTOP_CHANNELS = {
  setTheme: 'gym:set-theme',
  secureGet: 'gym:secure-get',
  secureSet: 'gym:secure-set',
  secureDelete: 'gym:secure-delete',
  /** Page → main: whether the page listens for cards (a boolean). */
  cardListen: 'gym:card-listen',
  /** Main → page: a card read while listening (PcscCard). */
  card: 'gym:card',
  /** Page → main: read a card already lying on a reader once. */
  cardReadLying: 'gym:card-read-lying',
  /** Page → main: send the connected readers now. */
  cardReadersGet: 'gym:card-readers-get',
  /** Main → page: the connected readers' names. */
  cardReaders: 'gym:card-readers',
  /** Page → main: a reader's name and a CardSignal. */
  cardSignal: 'gym:card-signal',
  /** Page → main: the printers' names. */
  printersGet: 'gym:printers-get',
  /** Page → main: print the page to a printer, without the dialog. */
  printSilent: 'gym:print-silent',
  /** Page → main: the offline edition's server link (OF-d). */
  serverStatus: 'gym:server-status',
  serverFind: 'gym:server-find',
  serverProbe: 'gym:server-probe',
  serverPair: 'gym:server-pair',
  serverUseLocal: 'gym:server-use-local',
} as const;

/** A server's address as typed: a host name or IPv4 address, with an optional port. */
export function isServerAddress(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/i.test(
      value.trim(),
    )
  );
}

/** A printer's name as Windows gives it: 1 to 256 characters, no control characters. */
export function isPrinterName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

export function isCardSignal(value: unknown): value is CardSignal {
  return value === 'ok' || value === 'error';
}

/** Names the secure store accepts; they become file names in the main process. */
export const SECURE_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;

export function isSecureKey(value: unknown): value is string {
  return typeof value === 'string' && SECURE_KEY_PATTERN.test(value);
}

/** Largest value the secure store keeps (sessions and PIN hashes are a few kB). */
export const SECURE_VALUE_MAX_LENGTH = 256 * 1024;

export function isThemeSource(value: unknown): value is ThemeSource {
  return value === 'light' || value === 'dark' || value === 'system';
}

declare global {
  interface Window {
    readonly gymDesktop?: DesktopBridge;
  }
}
