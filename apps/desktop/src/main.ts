import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DESKTOP_CHANNELS, isThemeSource } from '@gym/platform/desktop-bridge';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  protocol,
  session,
  shell,
  type WebContents,
} from 'electron';
import {
  APP_ORIGIN,
  APP_SCHEME,
  contentType,
  isAppUrl,
  isExternalWebLink,
  resolveAppFile,
} from './app-protocol';
import { nextZoomLevel, shortcutFor } from './shortcuts';

/** Same id as the Android app and the installer (electron-builder.config.mjs). */
const APP_ID = 'io.github.miraann.gymspa';
const DEV_SERVER_URL = 'http://localhost:5173';
/** `electron . --dev` loads the Vite dev server (`pnpm dev`) instead of the built app. */
const devServerUrl = !app.isPackaged && process.argv.includes('--dev') ? DEV_SERVER_URL : undefined;
/** Window permissions the app may use. Everything else (camera, location, ...) is refused. */
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);

// Keep local data in one fixed folder, so renaming the product can never orphan the offline
// database. Tests (unpackaged only) use a throwaway folder instead.
const testUserData = app.isPackaged ? undefined : process.env.GYM_USER_DATA_DIR;
app.setPath('userData', testUserData ?? path.join(app.getPath('appData'), 'gym-spa'));

// A privileged origin gives the app what a website gets: IndexedDB, OPFS, workers, WebAssembly
// and fetch. Must run before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

function webRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'web');
  return process.env.GYM_WEB_ROOT ?? path.resolve(__dirname, '../../app/dist');
}

function serveWebApp(): void {
  const root = webRoot();
  protocol.handle(APP_SCHEME, async (request) => {
    const file = await resolveAppFile(root, request.url);
    if (!file) return new Response(null, { status: 404 });
    return new Response(await readFile(file), {
      headers: { 'content-type': contentType(file) },
    });
  });
}

/** Zoom, full screen and (from source only) reload and DevTools. See shortcuts.ts. */
function handleShortcuts(contents: WebContents): void {
  contents.on('before-input-event', (event, input) => {
    const shortcut = shortcutFor(input, !app.isPackaged);
    if (!shortcut) return;
    event.preventDefault();
    switch (shortcut) {
      case 'zoom-in':
      case 'zoom-out':
        contents.setZoomLevel(nextZoomLevel(contents.getZoomLevel(), shortcut));
        break;
      case 'zoom-reset':
        contents.setZoomLevel(0);
        break;
      case 'toggle-fullscreen': {
        const window = BrowserWindow.fromWebContents(contents);
        window?.setFullScreen(!window.isFullScreen());
        break;
      }
      case 'reload':
        contents.reload();
        break;
      case 'toggle-dev-tools':
        contents.toggleDevTools();
        break;
    }
  });
}

function lockDownWebContents(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );

  app.on('web-contents-created', (_event, contents) => {
    // The window only ever shows the app. Web links open in the user's browser instead.
    contents.setWindowOpenHandler(({ url }) => {
      if (isExternalWebLink(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (isAppUrl(url, devServerUrl)) return;
      event.preventDefault();
      if (isExternalWebLink(url)) void shell.openExternal(url);
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
    handleShortcuts(contents);
  });

  ipcMain.on(DESKTOP_CHANNELS.setTheme, (event, theme: unknown) => {
    const sender = event.senderFrame?.url;
    if (sender === undefined || !isAppUrl(sender, devServerUrl) || !isThemeSource(theme)) return;
    nativeTheme.themeSource = theme;
  });
}

let mainWindow: BrowserWindow | undefined;

function createMainWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 560,
    show: false,
    // Matches the app's background, so there's no white flash in dark mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  window.on('closed', () => {
    mainWindow = undefined;
  });
  void window.loadURL(devServerUrl ?? `${APP_ORIGIN}/`);
  mainWindow = window;
}

// One window only: a second launch (double-clicked shortcut, auto-start) focuses the first one,
// so two copies never write to the same local database.
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('window-all-closed', () => {
    app.quit();
  });

  app.setAppUserModelId(APP_ID);
  void app.whenReady().then(() => {
    // No menu bar: its labels would be English, and the shortcuts above replace it.
    Menu.setApplicationMenu(null);
    serveWebApp();
    lockDownWebContents();
    createMainWindow();
  });
} else {
  app.quit();
}
