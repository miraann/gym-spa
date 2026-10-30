import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_CHECK_INTERVAL_MS, startUpdates, type Updater } from './updater';

class FakeUpdater extends EventEmitter implements Updater {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  disableWebInstaller = false;
  checks = 0;
  installs: [boolean | undefined, boolean | undefined][] = [];
  failNext = false;

  checkForUpdates(): Promise<unknown> {
    this.checks += 1;
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED'));
    }
    return Promise.resolve(null);
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.installs.push([isSilent, isForceRunAfter]);
  }
}

describe('the Windows app’s updates', () => {
  let updater: FakeUpdater;
  const ready: string[] = [];
  const logs: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    updater = new FakeUpdater();
    ready.length = 0;
    logs.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function start() {
    return startUpdates(updater, {
      onReady: (version) => ready.push(version),
      log: (message) => logs.push(message),
    });
  }

  it('looks at start and every hour, and downloads by itself', () => {
    const service = start();
    expect(updater.autoDownload).toBe(true);
    expect(updater.disableWebInstaller).toBe(true);
    expect(updater.checks).toBe(1);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(updater.checks).toBe(2);
    service.stop();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(updater.checks).toBe(2);
  });

  it('installs only when asked, and only a downloaded version', () => {
    const service = start();
    expect(service.install()).toBe(false);
    expect(updater.installs).toEqual([]);

    updater.emit('update-downloaded', { version: '0.2.0' });
    expect(ready).toEqual(['0.2.0']);
    expect(service.ready()).toBe('0.2.0');
    expect(updater.installs).toEqual([]);
    // A version that waits also installs when the app is closed.
    expect(updater.autoInstallOnAppQuit).toBe(true);

    // Nothing more to look for while it waits.
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(updater.checks).toBe(1);

    expect(service.install()).toBe(true);
    // Silently, then the app starts again.
    expect(updater.installs).toEqual([[true, true]]);
    service.stop();
  });

  it('a failed check is logged and tried again at the next one', async () => {
    updater.failNext = true;
    const service = start();
    await vi.waitFor(() => {
      expect(logs).toEqual(['update check failed: net::ERR_INTERNET_DISCONNECTED']);
    });
    updater.emit('error', new Error('sha512 checksum mismatch'));
    expect(logs.at(-1)).toBe('update check failed: sha512 checksum mismatch');
    expect(ready).toEqual([]);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(updater.checks).toBe(2);
    service.stop();
  });
});
