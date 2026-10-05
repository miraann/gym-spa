import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import type { ThemeSource } from './desktop-bridge';
import { desktopBridge, platform } from './runtime';

const SYSTEM_BARS_STYLES = {
  // "Dark" means light icons, for a dark background.
  dark: SystemBarsStyle.Dark,
  light: SystemBarsStyle.Light,
  system: SystemBarsStyle.Default,
} as const;

/** First Android WebView that reports correct safe-area insets (https://issues.chromium.org/issues/40699457). */
const EDGE_TO_EDGE_WEBVIEW_VERSION = 140;

/**
 * Whether the page itself is drawn behind the Android status and navigation bars. Capacitor
 * (SystemBars with viewport-fit=cover) only does that from WebView 140. On older WebViews it pads
 * the WebView instead, and the strip behind the bars keeps the device's light or dark color.
 */
export function drawsBehindSystemBars(userAgent: string): boolean {
  const major = /Chrome\/(\d+)/.exec(userAgent)?.[1];
  return major !== undefined && Number(major) >= EDGE_TO_EDGE_WEBVIEW_VERSION;
}

/**
 * Makes what the operating system draws match the app's theme setting: the status and navigation
 * bar icons on Android, and the window title bar on Windows. Pass the setting, not the resolved
 * theme, so "system" keeps following the device.
 */
export async function applyNativeTheme(theme: ThemeSource): Promise<void> {
  if (platform === 'electron') {
    desktopBridge?.setTheme(theme);
  } else if (platform === 'ios' || platform === 'android') {
    // The icons sit on the app's own top bar only when the page draws behind the bars. Otherwise
    // they sit on the device-colored strip, so they must follow the device to stay readable.
    const followsApp = platform === 'ios' || drawsBehindSystemBars(navigator.userAgent);
    await SystemBars.setStyle({
      style: followsApp ? SYSTEM_BARS_STYLES[theme] : SystemBarsStyle.Default,
    });
  }
}
