import path from 'node:path';
import { DESKTOP_CHANNELS, isCardSignal, type PcscCard } from '@gym/platform/desktop-bridge';
import { app, ipcMain, powerMonitor, type WebContents } from 'electron';
import { FakePcsc } from './pcsc-fake';
import { loadSmartcard } from './pcsc-native';
import { PcscWatcher, type PcscSystem } from './pcsc-watcher';

// PC/SC card readers for the app's pages (spec §1, step 2f). Only card UIDs, reader names and the
// ok / error signal cross the bridge, and every argument from the page is checked here.

type IpcEvent = Electron.IpcMainEvent;

function log(message: string): void {
  console.warn(`[card readers] ${message}`);
}

/**
 * The PC/SC service to use: smartcard's addon next to the main process (dist/native), or, in tests
 * of the unpackaged app (GYM_FAKE_PCSC=1), a fake one the tests reach as `globalThis.gymFakePcsc`.
 */
function pcscSystem(): PcscSystem | null {
  if (!app.isPackaged && process.env.GYM_FAKE_PCSC === '1') {
    const fake = new FakePcsc();
    (globalThis as { gymFakePcsc?: FakePcsc }).gymFakePcsc = fake;
    return fake;
  }
  const loaded = loadSmartcard(path.join(__dirname, 'native'));
  if ('problem' in loaded) {
    log(`PC/SC readers are off in this build: ${loaded.problem}`);
    return null;
  }
  return loaded.system;
}

/** Watches the readers and answers the page. `fromApp` tells the app's own pages apart. */
export function serveCardReaders(fromApp: (event: IpcEvent) => boolean): void {
  const system = pcscSystem();
  /** The page listening for cards; there is one window, so one at most. */
  let listener: WebContents | null = null;
  const readerWatchers = new Set<WebContents>();
  const watched = new WeakSet<WebContents>();

  const watcher = system
    ? new PcscWatcher(system, {
        onReaders: (readers) => {
          log(`connected: ${readers.length > 0 ? readers.join(', ') : 'none'}`);
          for (const contents of readerWatchers) {
            contents.send(DESKTOP_CHANNELS.cardReaders, readers);
          }
        },
        onCard: (reader, uid) => {
          listener?.send(DESKTOP_CHANNELS.card, { reader, uid } satisfies PcscCard);
        },
        log,
      })
    : null;

  /** A page that reloads or closes stops listening: its new page starts afresh. */
  const forgetOnLeave = (contents: WebContents) => {
    if (watched.has(contents)) return;
    watched.add(contents);
    const forget = () => {
      readerWatchers.delete(contents);
      if (listener !== contents) return;
      listener = null;
      log('the page reloaded or closed: no screen is waiting for cards');
      watcher?.setListening(false);
    };
    contents.on('did-navigate', forget);
    contents.on('render-process-gone', forget);
    contents.once('destroyed', forget);
  };

  ipcMain.on(DESKTOP_CHANNELS.cardListen, (event, listening: unknown) => {
    if (!fromApp(event) || typeof listening !== 'boolean') return;
    forgetOnLeave(event.sender);
    if (listening) listener = event.sender;
    else if (listener === event.sender) listener = null;
    else return;
    log(listening ? 'a screen is waiting for cards' : 'no screen is waiting for cards');
    watcher?.setListening(listening);
  });

  ipcMain.on(DESKTOP_CHANNELS.cardReadersGet, (event) => {
    if (!fromApp(event)) return;
    forgetOnLeave(event.sender);
    readerWatchers.add(event.sender);
    event.sender.send(DESKTOP_CHANNELS.cardReaders, watcher?.readerNames() ?? []);
  });

  ipcMain.on(DESKTOP_CHANNELS.cardSignal, (event, reader: unknown, signal: unknown) => {
    if (!fromApp(event) || typeof reader !== 'string' || !isCardSignal(signal)) return;
    // The watcher also checks that the reader is connected and can show it.
    watcher?.signal(reader, signal);
  });

  if (!watcher) return;
  // Waking, the reader finds a card lying on it again: not a new scan (see pcsc-watcher.ts). After
  // sleep, connections to the smart card service may be stale: start a new one.
  powerMonitor.on('suspend', () => {
    log('going to sleep');
    watcher.sleep();
  });
  powerMonitor.on('resume', () => {
    log('woke from sleep: connecting again');
    watcher.restart();
  });
  app.on('will-quit', () => {
    void watcher.stop();
  });
  watcher.start();
}
