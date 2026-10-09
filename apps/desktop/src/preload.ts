// Runs in the sandboxed renderer before the app loads. It exposes only the small bridge in
// @gym/platform; the web app never gets direct access to Electron or Node.
import {
  DESKTOP_BRIDGE_KEY,
  DESKTOP_CHANNELS,
  type DesktopBridge,
} from '@gym/platform/desktop-bridge';
import { contextBridge, ipcRenderer } from 'electron';

const bridge: DesktopBridge = {
  setTheme: (theme) => {
    ipcRenderer.send(DESKTOP_CHANNELS.setTheme, theme);
  },
  secureGet: (key) => ipcRenderer.invoke(DESKTOP_CHANNELS.secureGet, key) as Promise<string | null>,
  secureSet: (key, value) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.secureSet, key, value) as Promise<void>,
  secureDelete: (key) => ipcRenderer.invoke(DESKTOP_CHANNELS.secureDelete, key) as Promise<void>,
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
