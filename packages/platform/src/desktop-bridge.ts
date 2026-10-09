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
}

export const DESKTOP_BRIDGE_KEY = 'gymDesktop';

/** IPC channels from the preload script to the main process. */
export const DESKTOP_CHANNELS = {
  setTheme: 'gym:set-theme',
  secureGet: 'gym:secure-get',
  secureSet: 'gym:secure-set',
  secureDelete: 'gym:secure-delete',
} as const;

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
