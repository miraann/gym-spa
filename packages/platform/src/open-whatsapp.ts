import { platform, type Platform } from './runtime';

/** Where a WhatsApp link is opened, per platform. */
export type WhatsAppOpener = 'new-tab' | 'navigate';

/**
 * Web and the Windows app open a new window: the browser makes it a tab, and the Windows app's main
 * process hands the link to Windows (shell.openExternal), which opens WhatsApp or the browser; it
 * refuses every link that isn't WhatsApp's. On Android the page navigates to it, which Capacitor
 * hands to the system, so the WhatsApp app takes it.
 */
export function whatsAppOpener(on: Platform): WhatsAppOpener {
  return on === 'android' || on === 'ios' ? 'navigate' : 'new-tab';
}

/**
 * Opens a `wa.me` link built with `whatsAppLink()` (packages/core). Call it straight from a click:
 * a browser blocks a new tab opened after waiting for something. Returns false when the browser
 * blocked it anyway.
 */
export function openWhatsApp(url: string): boolean {
  if (!url.startsWith('https://wa.me/')) return false;
  if (whatsAppOpener(platform) === 'navigate') {
    window.location.assign(url);
    return true;
  }
  // The Windows app's main process denies the window and opens the link itself, so nothing comes
  // back there. ("noopener" would make every browser return nothing too, so it is cut by hand.)
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  return opened !== null || platform === 'electron';
}
