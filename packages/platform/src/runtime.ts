import { Capacitor } from '@capacitor/core';
import type { DesktopBridge } from './desktop-bridge';

/** Where the app runs. iOS isn't built yet (see CLAUDE.md), but the code stays ready for it. */
export type Platform = 'web' | 'android' | 'ios' | 'electron';

export function detectPlatform(
  desktopBridge: DesktopBridge | undefined,
  capacitorPlatform: string,
): Platform {
  if (desktopBridge) return 'electron';
  if (capacitorPlatform === 'android' || capacitorPlatform === 'ios') return capacitorPlatform;
  return 'web';
}

/** The Electron bridge, only present in the Windows app. */
export const desktopBridge: DesktopBridge | undefined =
  typeof window === 'undefined' ? undefined : window.gymDesktop;

export const platform: Platform = detectPlatform(desktopBridge, Capacitor.getPlatform());
