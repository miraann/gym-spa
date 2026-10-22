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
   * PC/SC card readers such as the ACR122U, read by the main process (step 2f). Cards are read
   * only while a screen listens; a card already on a reader when it starts listening is read once.
   * Returns the function that stops listening.
   */
  readonly listenForCards: (onCard: (card: PcscCard) => void) => () => void;
  /** Calls `onChange` with the connected PC/SC readers now and whenever they change. */
  readonly watchCardReaders: (onChange: (readers: readonly string[]) => void) => () => void;
  /** Shows on a reader whether the app took the card it read: LED and beep, where it can. */
  readonly signalCard: (reader: string, signal: CardSignal) => void;
}

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
  /** Page → main: whether a screen listens for cards (a boolean). */
  cardListen: 'gym:card-listen',
  /** Main → page: a card read while listening (PcscCard). */
  card: 'gym:card',
  /** Page → main: send the connected readers now. */
  cardReadersGet: 'gym:card-readers-get',
  /** Main → page: the connected readers' names. */
  cardReaders: 'gym:card-readers',
  /** Page → main: a reader's name and a CardSignal. */
  cardSignal: 'gym:card-signal',
} as const;

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
