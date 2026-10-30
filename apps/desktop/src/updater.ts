// The online edition's Windows app updates itself (spec §8, step 11c). electron-updater reads the
// address from resources\app-update.yml, which electron-builder writes only when the installer is
// built with GYM_UPDATE_URL (update-feed.mjs); without that file (the offline edition, a build for
// testing) there are no updates. A new version is downloaded in the background; the page then
// shows the same notice as the web app (step 3a), and only staff pressing it closes the app,
// installs the new version silently (per user, no administrator) and starts it again. A version
// already downloaded also installs when the app is closed.

/** Look this often (and once at start): reception and kiosk PCs stay on for days. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** What this module uses of electron-updater's autoUpdater (a fake in the tests). */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  /** Our installer is the full one, never NSIS's small web installer. */
  disableWebInstaller: boolean;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export interface UpdateService {
  /** The version downloaded and waiting, or null. */
  readonly ready: () => string | null;
  /** Closes the app and installs the waiting version; false when none is waiting. */
  readonly install: () => boolean;
  readonly stop: () => void;
}

export function startUpdates(
  updater: Updater,
  options: {
    /** A version was downloaded: tell the page. */
    readonly onReady: (version: string) => void;
    readonly log: (message: string) => void;
    readonly interval?: number;
  },
): UpdateService {
  let ready: string | null = null;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.disableWebInstaller = true;
  updater.on('update-downloaded', ({ version }) => {
    ready = version;
    options.onReady(version);
  });
  // No connection, the address is down, a broken download: try again at the next check. The page
  // shows nothing; staff can't do anything about it.
  updater.on('error', (error) => {
    options.log(`update check failed: ${error.message}`);
  });
  const check = () => {
    // Nothing more to look for once a version waits: it installs when staff press the notice.
    if (ready !== null) return;
    updater.checkForUpdates().catch((error: unknown) => {
      options.log(`update check failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  };
  check();
  const timer = setInterval(check, options.interval ?? UPDATE_CHECK_INTERVAL_MS);
  return {
    ready: () => ready,
    install: () => {
      if (ready === null) return false;
      // Silent: the installer shows no pages; then it starts the app again.
      updater.quitAndInstall(true, true);
      return true;
    },
    stop: () => {
      clearInterval(timer);
    },
  };
}
