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
}

export const DESKTOP_BRIDGE_KEY = 'gymDesktop';

/** IPC channels from the preload script to the main process. */
export const DESKTOP_CHANNELS = {
  setTheme: 'gym:set-theme',
} as const;

export function isThemeSource(value: unknown): value is ThemeSource {
  return value === 'light' || value === 'dark' || value === 'system';
}

declare global {
  interface Window {
    readonly gymDesktop?: DesktopBridge;
  }
}
