import { describe, expect, it } from 'vitest';
import { detectPlatform } from './runtime';
import type { DesktopBridge } from './desktop-bridge';

const bridge: DesktopBridge = {
  setTheme: () => undefined,
  secureGet: () => Promise.resolve(null),
  secureSet: () => Promise.resolve(),
  secureDelete: () => Promise.resolve(),
  listenForCards: () => () => undefined,
  readLyingCards: () => undefined,
  watchCardReaders: () => () => undefined,
  signalCard: () => undefined,
  listPrinters: () => Promise.resolve([]),
  printSilently: () => Promise.resolve(true),
  serverStatus: () => Promise.resolve({ linked: false, local: false, computerName: 'PC' }),
  findServers: () => Promise.resolve([]),
  probeServer: () => Promise.resolve(null),
  pairWithServer: () => Promise.resolve({ ok: true }),
  linkThisPc: () => Promise.resolve(false),
  watchUpdate: () => () => undefined,
  installUpdate: () => undefined,
};

describe('detectPlatform', () => {
  it('is the web app in a normal browser', () => {
    expect(detectPlatform(undefined, 'web')).toBe('web');
  });

  it('is the Android app inside Capacitor', () => {
    expect(detectPlatform(undefined, 'android')).toBe('android');
  });

  it('keeps iOS apart for later', () => {
    expect(detectPlatform(undefined, 'ios')).toBe('ios');
  });

  it('is the Windows app when the Electron bridge is present', () => {
    // Capacitor sees Electron as a plain browser, so the bridge must win.
    expect(detectPlatform(bridge, 'web')).toBe('electron');
  });

  it('treats unknown platforms as the web', () => {
    expect(detectPlatform(undefined, 'something-new')).toBe('web');
  });
});
