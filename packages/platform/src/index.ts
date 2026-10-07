// Platform adapters. The React app reaches Capacitor and Electron only through this package.
export { detectPlatform, platform, type Platform } from './runtime';
export { minimizeApp, onBackButton } from './back-button';
export { applyNativeTheme } from './theme';
export { openLocalDatabase, type LocalDatabaseOptions } from './database';
export type { ThemeSource } from './desktop-bridge';
