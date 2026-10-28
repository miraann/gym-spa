// Runs in the sandboxed renderer before the app loads. It exposes only the small bridge in
// @gym/platform; the web app never gets direct access to Electron or Node.
import {
  DESKTOP_BRIDGE_KEY,
  DESKTOP_CHANNELS,
  type DesktopBridge,
  type PcscCard,
} from '@gym/platform/desktop-bridge';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/** Card listeners of the page; the main process reads cards while there is at least one. */
let cardListeners = 0;

const bridge: DesktopBridge = {
  setTheme: (theme) => {
    ipcRenderer.send(DESKTOP_CHANNELS.setTheme, theme);
  },
  secureGet: (key) => ipcRenderer.invoke(DESKTOP_CHANNELS.secureGet, key) as Promise<string | null>,
  secureSet: (key, value) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.secureSet, key, value) as Promise<void>,
  secureDelete: (key) => ipcRenderer.invoke(DESKTOP_CHANNELS.secureDelete, key) as Promise<void>,
  listenForCards: (onCard) => {
    const listener = (_event: IpcRendererEvent, card: PcscCard) => {
      onCard(card);
    };
    ipcRenderer.on(DESKTOP_CHANNELS.card, listener);
    cardListeners += 1;
    if (cardListeners === 1) ipcRenderer.send(DESKTOP_CHANNELS.cardListen, true);
    let listening = true;
    return () => {
      if (!listening) return;
      listening = false;
      ipcRenderer.removeListener(DESKTOP_CHANNELS.card, listener);
      cardListeners -= 1;
      if (cardListeners === 0) ipcRenderer.send(DESKTOP_CHANNELS.cardListen, false);
    };
  },
  readLyingCards: () => {
    ipcRenderer.send(DESKTOP_CHANNELS.cardReadLying);
  },
  watchCardReaders: (onChange) => {
    const listener = (_event: IpcRendererEvent, readers: readonly string[]) => {
      onChange(readers);
    };
    ipcRenderer.on(DESKTOP_CHANNELS.cardReaders, listener);
    ipcRenderer.send(DESKTOP_CHANNELS.cardReadersGet);
    return () => {
      ipcRenderer.removeListener(DESKTOP_CHANNELS.cardReaders, listener);
    };
  },
  signalCard: (reader, signal) => {
    ipcRenderer.send(DESKTOP_CHANNELS.cardSignal, reader, signal);
  },
  listPrinters: () => ipcRenderer.invoke(DESKTOP_CHANNELS.printersGet) as Promise<string[]>,
  printSilently: (printer) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.printSilent, printer) as Promise<boolean>,
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
