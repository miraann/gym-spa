import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { DESKTOP_CHANNELS, isServerAddress, isThemeSource } from '@gym/platform/desktop-bridge';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  safeStorage,
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
import { serveCardReaders } from './card-readers';
import { servePrinting } from './printing';
import { createSecureStore } from './secure-store';
import {
  findServers,
  localServerAnswers,
  pairWithServer,
  parseServerAddress,
  probeServer,
} from './server-pairing';
import {
  checkServerLink,
  forwardedHeaders,
  isPairedCertificate,
  isServerRequest,
  parseServerLink,
  serverTarget,
  type ServerLink,
} from './server-link';
import { nextZoomLevel, shortcutFor } from './shortcuts';
import { startUpdates, type UpdateService } from './updater';

/** Same id as the Android app and the installer (electron-builder.config.mjs). */
const APP_ID = 'site.clickgroup.gymspa';
const DEV_SERVER_URL = 'http://localhost:5173';
/** `electron . --dev` loads the Vite dev server (`pnpm dev`) instead of the built app. */
const devServerUrl = !app.isPackaged && process.argv.includes('--dev') ? DEV_SERVER_URL : undefined;
/**
 * Window permissions the app may use. The camera is allowed only as video for the app itself
 * (member photos, isAppCamera); everything else (microphone, location, ...) is refused.
 */
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

// The offline edition's server (see server-link.ts). Its own encrypted store, which the page's
// secure-storage bridge can't reach, so the pairing token never gets to the page.
const serverLinkStore = createSecureStore(
  path.join(app.getPath('userData'), 'server-link'),
  safeStorage,
);
let serverLink: ServerLink | null = null;

/** The link to the server: GYM_SERVER_URL when run from source (tests), else the stored one. */
async function readServerLink(): Promise<ServerLink | null> {
  const fromEnvironment = app.isPackaged ? undefined : process.env.GYM_SERVER_URL;
  if (fromEnvironment) {
    return checkServerLink({
      url: fromEnvironment,
      fingerprint: process.env.GYM_SERVER_FINGERPRINT ?? null,
      token: process.env.GYM_SERVER_TOKEN ?? null,
    });
  }
  try {
    return parseServerLink(await serverLinkStore.get('link'));
  } catch {
    return null;
  }
}

/** The server running on this PC, for the server PC's own app (gym-server's loopback port). */
function localServerUrl(): string {
  const fromEnvironment = app.isPackaged ? undefined : process.env.GYM_LOCAL_SERVER_URL;
  return fromEnvironment ?? 'http://127.0.0.1:47213';
}

async function saveServerLink(link: ServerLink): Promise<void> {
  await serverLinkStore.set('link', JSON.stringify(link));
  serverLink = link;
}

/** Finding, checking and pairing with the server (step OF-d); the page gets no token or key. */
function serveServerLink(): void {
  ipcMain.handle(DESKTOP_CHANNELS.serverStatus, (event) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    const link = serverLink;
    return {
      linked: link !== null,
      local: link !== null && new URL(link.url).hostname === '127.0.0.1',
      computerName: hostname(),
    };
  });
  ipcMain.handle(DESKTOP_CHANNELS.serverFind, (event) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return findServers();
  });
  ipcMain.handle(DESKTOP_CHANNELS.serverProbe, (event, address: unknown) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return isServerAddress(address) ? probeServer(address) : null;
  });
  ipcMain.handle(
    DESKTOP_CHANNELS.serverPair,
    async (event, server: unknown, code: unknown, name: unknown) => {
      if (!fromApp(event)) throw new Error('Not allowed');
      const record = (typeof server === 'object' && server !== null ? server : {}) as Record<
        string,
        unknown
      >;
      const address =
        typeof record.address === 'string' && typeof record.port === 'number'
          ? parseServerAddress(`${record.address}:${String(record.port)}`)
          : null;
      const fingerprint = typeof record.fingerprint === 'string' ? record.fingerprint : '';
      if (address === null || typeof code !== 'string' || typeof name !== 'string') {
        return { ok: false, error: 'unreachable' };
      }
      const paired = await pairWithServer(
        { address: address.host, port: address.port, fingerprint },
        code,
        name.slice(0, 60),
      );
      if (!paired.ok) return paired;
      const link = checkServerLink({
        url: `https://${address.host}:${String(address.port)}`,
        fingerprint,
        token: paired.token,
      });
      if (link === null) return { ok: false, error: 'unreachable' };
      await saveServerLink(link);
      return { ok: true };
    },
  );
  ipcMain.handle(DESKTOP_CHANNELS.serverUseLocal, async (event) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    const url = localServerUrl();
    if (!(await localServerAnswers(url))) return false;
    const link = checkServerLink({ url });
    if (link === null) return false;
    await saveServerLink(link);
    return true;
  });
}

/** A request for app://gym-spa/server/…, sent on to the server. */
async function forwardToServer(request: Request): Promise<Response> {
  const link = serverLink;
  if (link === null) return Response.json({ message: 'server_not_linked' }, { status: 503 });
  const withBody = request.method !== 'GET' && request.method !== 'HEAD';
  try {
    return await net.fetch(serverTarget(request.url, link), {
      method: request.method,
      headers: forwardedHeaders(request.headers, link),
      ...(withBody ? { body: request.body, duplex: 'half' } : {}),
      bypassCustomProtocolHandlers: true,
    });
  } catch {
    return Response.json({ message: 'server_unreachable' }, { status: 502 });
  }
}

/**
 * The server's certificate is its own (no authority signs it): it is accepted only when it is
 * the one this PC paired with, and only for the server's address. Everything else is checked as
 * Chromium always does.
 */
function pinServerCertificate(): void {
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    const link = serverLink;
    if (link?.fingerprint && new URL(link.url).hostname === request.hostname) {
      callback(isPairedCertificate(request.certificate.data, link.fingerprint) ? 0 : -2);
      return;
    }
    callback(-3);
  });
}

function serveWebApp(): void {
  const root = webRoot();
  protocol.handle(APP_SCHEME, async (request) => {
    if (isServerRequest(request.url)) return forwardToServer(request);
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

/** A camera request of the app's own page, for video only (never the microphone). */
function isAppCamera(url: string, mediaTypes: readonly string[]): boolean {
  const origins = [APP_ORIGIN, devServerUrl].filter((origin) => origin !== undefined);
  return (
    mediaTypes.length > 0 &&
    mediaTypes.every((type) => type === 'video') &&
    origins.some((origin) => url === origin || url.startsWith(`${origin}/`))
  );
}

function lockDownWebContents(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    if (permission === 'media') {
      callback(
        isAppCamera(
          details.requestingUrl,
          'mediaTypes' in details ? (details.mediaTypes ?? []) : [],
        ),
      );
      return;
    }
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin, details) => {
      if (permission === 'media') {
        return isAppCamera(requestingOrigin, details.mediaType ? [details.mediaType] : []);
      }
      return ALLOWED_PERMISSIONS.has(permission);
    },
  );

  // Files the app's page saves itself (the import page's rows left out, step 2j) go through Windows'
  // save dialog, in the Downloads folder and titled with the file's name (by default the title is
  // the page's blob: address). The app downloads nothing else.
  session.defaultSession.on('will-download', (_event, item) => {
    const url = item.getURL();
    if (!url.startsWith('blob:') || !isAppUrl(url.slice('blob:'.length), devServerUrl)) {
      item.cancel();
      return;
    }
    const name = item.getFilename();
    const extension = path.extname(name).slice(1).toLowerCase();
    item.setSaveDialogOptions({
      title: name,
      defaultPath: path.join(app.getPath('downloads'), name),
      filters: extension === '' ? [] : [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
  });

  app.on('web-contents-created', (_event, contents) => {
    // The window only ever shows the app. WhatsApp links (Phase 9) open in WhatsApp or the browser;
    // every other link is refused.
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
    if (!fromApp(event) || !isThemeSource(theme)) return;
    nativeTheme.themeSource = theme;
  });

  // Staff sessions and PIN hashes (see @gym/platform secure-storage).
  const secureStore = createSecureStore(path.join(app.getPath('userData'), 'secure'), safeStorage);
  ipcMain.handle(DESKTOP_CHANNELS.secureGet, (event, key: unknown) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return secureStore.get(key);
  });
  ipcMain.handle(DESKTOP_CHANNELS.secureSet, (event, key: unknown, value: unknown) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return secureStore.set(key, value);
  });
  ipcMain.handle(DESKTOP_CHANNELS.secureDelete, (event, key: unknown) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return secureStore.delete(key);
  });

  // PC/SC card readers such as the ACR122U (see card-readers.ts).
  serveCardReaders(fromApp);
  // Printing receipts without the dialog (see printing.ts).
  servePrinting(fromApp);
  // The offline edition's server (see server-pairing.ts).
  serveServerLink();
  // The online edition's own updates (see updater.ts).
  serveUpdates();
}

let updates: UpdateService | null = null;

function serveUpdates(): void {
  ipcMain.on(DESKTOP_CHANNELS.updateGet, (event) => {
    if (fromApp(event) && updates !== null && updates.ready() !== null) {
      event.sender.send(DESKTOP_CHANNELS.updateReady);
    }
  });
  ipcMain.on(DESKTOP_CHANNELS.updateInstall, (event) => {
    if (fromApp(event)) updates?.install();
  });
  // Only an installed build made with an update address has app-update.yml (update-feed.mjs).
  if (!app.isPackaged || !existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return;
  void import('electron-updater').then(({ autoUpdater }) => {
    updates = startUpdates(autoUpdater, {
      onReady: () => {
        mainWindow?.webContents.send(DESKTOP_CHANNELS.updateReady);
      },
      log: (message) => {
        console.warn(message);
      },
    });
  });
}

/** Only the app's own pages may use the bridge. */
function fromApp(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  const sender = event.senderFrame?.url;
  return sender !== undefined && isAppUrl(sender, devServerUrl);
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e0f15' : '#f5f5fa',
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
  void app.whenReady().then(async () => {
    // No menu bar: its labels would be English, and the shortcuts above replace it.
    Menu.setApplicationMenu(null);
    serverLink = await readServerLink();
    pinServerCertificate();
    serveWebApp();
    lockDownWebContents();
    createMainWindow();
  });
} else {
  app.quit();
}
