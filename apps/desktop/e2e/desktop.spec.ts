import { existsSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
// Test staff in local Supabase (`pnpm db:start`), shared with the web tests.
import { autoRegisterDevices, lockFromMenu } from '../../app/e2e/support/app';
import { TestData, type TestStaff } from '../../app/e2e/support/backend';
import { addCard, addMember } from '../../app/e2e/support/members';
import { DESKTOP_CHANNELS } from '@gym/platform/desktop-bridge';
import type { FakePcsc } from '../src/pcsc-fake';

// path.resolve drops the trailing backslash: on Windows, `"...\desktop\"` would escape the quote.
const desktopDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const webBuild = path.resolve(desktopDir, '../app/dist');

let webRoot: string;
let userData: string;
/** Unset when no app is running, e.g. when the launch itself failed. */
let app: ElectronApplication | undefined;

function running(): ElectronApplication {
  if (!app) throw new Error('The desktop app is not running');
  return app;
}

/** Starts the desktop app on a throwaway data folder, like a fresh install. */
async function launch(): Promise<ElectronApplication> {
  // Set when started from VS Code; it would make Electron run as plain Node.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    // Chromium's fake camera, so the camera test works on machines without one.
    args: [desktopDir, '--use-fake-device-for-media-stream'],
    // A fake PC/SC service (src/pcsc-fake.ts), so a real reader on this PC never gets in the way.
    env: { ...env, GYM_USER_DATA_DIR: userData, GYM_WEB_ROOT: webRoot, GYM_FAKE_PCSC: '1' },
  });
}

const READER = 'ACS ACR122 0';
/** A card a reader finds this soon after it is plugged in was already lying there (pcsc-watcher.ts). */
const SETTLE_MS = 2000;
type WithFakePcsc = typeof globalThis & { gymFakePcsc: FakePcsc };
type WithSaved = typeof globalThis & { gymSaved?: { url: string; options: unknown } };

/** The app's fake PC/SC service: plug readers in and out, place and lift cards. */
const pcsc = {
  plugIn: (reader: string) =>
    running().evaluate((_electron, name) => {
      (globalThis as WithFakePcsc).gymFakePcsc.plugIn(name);
    }, reader),
  unplug: (reader: string) =>
    running().evaluate((_electron, name) => {
      (globalThis as WithFakePcsc).gymFakePcsc.unplug(name);
    }, reader),
  place: (reader: string, uid: string) =>
    running().evaluate(
      (_electron, [name, card]) => {
        (globalThis as WithFakePcsc).gymFakePcsc.place(name, card);
      },
      [reader, uid] as const,
    ),
  lift: (reader: string) =>
    running().evaluate((_electron, name) => {
      (globalThis as WithFakePcsc).gymFakePcsc.lift(name);
    }, reader),
  /** What the readers got: Get UID commands, LED and beep commands, service connections. */
  seen: () =>
    running().evaluate(() => {
      const fake = (globalThis as WithFakePcsc).gymFakePcsc;
      return {
        reads: fake.uidReads.length,
        signals: [...fake.signals],
        connections: fake.connections,
      };
    }),
};

async function mainWindow(): Promise<Page> {
  const page = await running().firstWindow();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return page;
}

const LOGIN_HEADING = { level: 1, name: 'چوونەژوورەوە' } as const;
const HOME_HEADING = { level: 1, name: 'سەرەکی' } as const;

let data: TestData;
/** A receptionist of a new branch, with a PIN already set. */
async function newStaff(): Promise<TestStaff> {
  return data.staff({ branchIds: [await data.branch()] });
}

/** Password login on a fresh install (so it asks for the gym code); ends on the home page. */
async function signIn(page: Page, staff: TestStaff): Promise<void> {
  // Devices must be registered (step 1e): as a manager would have, before the login.
  await autoRegisterDevices(page, 'windows');
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await page.getByLabel('کۆدی جیم').fill(staff.gymCode);
  await page.getByLabel('ناوی بەکارهێنەر').fill(staff.username);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
}

async function unlock(page: Page, staff: TestStaff): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await page.getByRole('button', { name: staff.fullName }).click();
  await page.getByTestId('pin-field').pressSequentially(staff.pin ?? '');
}

test.beforeAll(async () => {
  if (!existsSync(path.join(webBuild, 'index.html'))) {
    throw new Error(
      'Build the web app first (pnpm build), or run pnpm test:e2e from the repo root.',
    );
  }
  // The real web build, plus small probes for browser storage and workers.
  webRoot = await mkdtemp(path.join(tmpdir(), 'gym-desktop-web-'));
  await cp(webBuild, webRoot, { recursive: true });
  await writeFile(
    path.join(webRoot, 'probe-worker.js'),
    'onmessage = (event) => postMessage(event.data * 2);',
  );
  await writeFile(
    path.join(webRoot, 'probe-shared-worker.js'),
    'onconnect = (event) => event.ports[0].postMessage("connected");',
  );
});

test.afterAll(async () => {
  await rm(webRoot, { recursive: true, force: true });
});

test.beforeEach(async () => {
  data = new TestData();
  userData = await mkdtemp(path.join(tmpdir(), 'gym-desktop-data-'));
  app = await launch();
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(userData, { recursive: true, force: true });
  await data.cleanup();
});

test('opens in Kurdish from its own app:// origin', async () => {
  const page = await mainWindow();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ckb');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveTitle('جیم و سپا');
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();

  const runtime = await page.evaluate(async () => ({
    origin: location.origin,
    bridge: typeof window.gymDesktop?.setTheme,
    secureStorage: typeof window.gymDesktop?.secureGet,
    // The page must never reach Node or Electron directly.
    nodeRequire: typeof (globalThis as { require?: unknown }).require,
    nodeProcess: typeof (globalThis as { process?: unknown }).process,
    // The Windows app carries its own files: no service worker. (app:// can't even have one, so
    // the lookup itself may refuse.)
    serviceWorkers: await navigator.serviceWorker.getRegistrations().then(
      (registrations) => registrations.length,
      () => 0,
    ),
  }));
  expect(runtime).toEqual({
    origin: 'app://gym-spa',
    bridge: 'function',
    secureStorage: 'function',
    nodeRequire: 'undefined',
    nodeProcess: 'undefined',
    serviceWorkers: 0,
  });
});

test('reloading an inner page works', async () => {
  const staff = await newStaff();
  const page = await mainWindow();
  await signIn(page, staff);
  await page.goto('app://gym-spa/settings/display');
  // A reload locks the app; the PIN opens the same page.
  await unlock(page, staff);
  await expect(page.getByRole('heading', { level: 1, name: 'پیشاندان' })).toBeVisible();
});

test('keeps staff logged in across a restart, encrypted with Windows', async () => {
  const staff = await newStaff();
  let page = await mainWindow();
  await signIn(page, staff);

  await running().close();
  app = await launch();
  page = await mainWindow();
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  // Sessions and PIN hashes are in files Windows encrypted (DPAPI), never in plain text.
  const folder = path.join(userData, 'secure');
  const files = await readdir(folder);
  expect(files).toContain('accounts.bin');
  expect(files).toContain(`auth.${staff.id}.bin`);
  for (const file of files) {
    const content = await readFile(path.join(folder, file), 'latin1');
    expect(content).not.toContain(staff.username);
    expect(content).not.toContain('refresh_token');
  }
});

test('has browser storage and workers on its app:// origin', async () => {
  const page = await mainWindow();

  const result = await page.evaluate(async () => {
    const indexedDb = await new Promise<boolean>((resolve) => {
      const request = indexedDB.open('probe', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('rows');
      };
      request.onsuccess = () => {
        request.result.close();
        resolve(true);
      };
      request.onerror = () => {
        resolve(false);
      };
    });

    const opfsFile = await (
      await navigator.storage.getDirectory()
    ).getFileHandle('probe.txt', { create: true });
    const writable = await opfsFile.createWritable();
    await writable.write('ok');
    await writable.close();
    const opfs = await (await opfsFile.getFile()).text();

    const worker = new Worker('/probe-worker.js');
    const workerReply = await new Promise<unknown>((resolve) => {
      worker.onmessage = (event: MessageEvent<unknown>) => {
        resolve(event.data);
      };
      worker.postMessage(21);
    });
    worker.terminate();

    const sharedWorker = new SharedWorker('/probe-shared-worker.js');
    const sharedWorkerReply = await new Promise<unknown>((resolve) => {
      sharedWorker.port.onmessage = (event: MessageEvent<unknown>) => {
        resolve(event.data);
      };
    });

    return {
      indexedDb,
      opfs,
      workerReply,
      sharedWorkerReply,
    };
  });

  expect(result).toEqual({
    indexedDb: true,
    opfs: 'ok',
    workerReply: 42,
    sharedWorkerReply: 'connected',
  });
});

test('logs in and connects to the server', async () => {
  const page = await mainWindow();
  await signIn(page, await newStaff());
  await expect(page.getByRole('status')).toContainText('پەیوەندی هەیە');
});

test('keeps settings after a restart', async () => {
  let page = await mainWindow();
  await page.getByRole('button', { name: 'گۆڕینی زمان' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await running().close();
  app = await launch();
  page = await mainWindow();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
});

test('a downloaded update shows the notice, and only pressing it installs (step 11c)', async () => {
  const staff = await newStaff();
  const page = await mainWindow();
  await signIn(page, staff);
  const notice = page.getByTestId('update-notice');
  // From source the app looks for no updates (no app-update.yml): the main process says a version
  // was downloaded, as electron-updater's event does in an installed app.
  await expect(notice).toHaveCount(0);
  await running().evaluate(({ BrowserWindow }, channel) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send(channel, '0.2.0');
  }, DESKTOP_CHANNELS.updateReady);
  await expect(notice).toContainText('وەشانێکی نوێی ئەپەکە ئامادەیە');
  await expect(notice).toContainText('ئەپەکە دادەخرێت، وەشانە نوێیەکە دادەمەزرێت');
  // Without a downloaded version the main process installs nothing: the app keeps running.
  await notice.getByRole('button', { name: 'نوێکردنەوە' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  expect(await running().evaluate(({ app: electronApp }) => electronApp.getVersion())).toBeTruthy();
});

test('the window never leaves the app', async () => {
  const page = await mainWindow();

  await page.evaluate(() => {
    window.open('http://example.com/');
    location.href = 'file:///C:/Windows/win.ini';
  });

  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  expect(await page.evaluate(() => location.origin)).toBe('app://gym-spa');
  expect(running().windows()).toHaveLength(1);
});

test('a file the app saves goes through the save dialog, titled with its name', async () => {
  const page = await mainWindow();
  const target = path.join(userData, 'saved.csv');
  const content = 'ناو,هۆکار\n';
  // Stands in for the person at the dialog: records what it would show, and saves without it.
  await running().evaluate(({ session }, savePath) => {
    session.defaultSession.on('will-download', (_event, item) => {
      (globalThis as WithSaved).gymSaved = {
        url: item.getURL(),
        options: item.getSaveDialogOptions(),
      };
      item.setSavePath(savePath);
    });
  }, target);

  await page.evaluate((text) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    link.download = 'ڕیزەکان.csv';
    link.click();
  }, content);

  await expect
    .poll(() => running().evaluate(() => (globalThis as WithSaved).gymSaved))
    .toMatchObject({
      url: expect.stringMatching(/^blob:app:\/\/gym-spa\//),
      options: {
        title: 'ڕیزەکان.csv',
        defaultPath: expect.stringMatching(/[\\/]Downloads[\\/]ڕیزەکان\.csv$/),
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      },
    });
  await expect.poll(() => (existsSync(target) ? readFile(target, 'utf8') : '')).toBe(content);
});

test('the app may use the camera for photos, but never the microphone', async () => {
  const page = await mainWindow();
  const result = (constraints: MediaStreamConstraints) =>
    page.evaluate(async (asked) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(asked);
        for (const track of stream.getTracks()) track.stop();
        return 'allowed';
      } catch (error) {
        return error instanceof DOMException ? error.name : 'failed';
      }
    }, constraints);

  expect(await result({ video: true })).toBe('allowed');
  expect(await result({ audio: true })).toBe('NotAllowedError');
  expect(await result({ video: true, audio: true })).toBe('NotAllowedError');
});

test('the title bar follows the app theme', async () => {
  const page = await mainWindow();
  const themeSource = () => running().evaluate(({ nativeTheme }) => nativeTheme.themeSource);
  await expect.poll(themeSource).toBe('system');

  await page.getByRole('button', { name: 'گۆڕینی ڕووناک یان تاریک' }).click();
  await page.getByRole('menuitemradio', { name: 'تاریک' }).click();
  await expect.poll(themeSource).toBe('dark');

  // The main process ignores values the bridge doesn't allow.
  await page.evaluate(() => {
    const bridge = window.gymDesktop as { setTheme: (theme: unknown) => void } | undefined;
    bridge?.setTheme('purple');
  });
  await page.waitForTimeout(200);
  expect(await themeSource()).toBe('dark');
});

test('lists the printers and refuses a printer name that is not one (step 8f)', async () => {
  const page = await mainWindow();
  const printing = await page.evaluate(async () => {
    const bridge = window.gymDesktop as
      | { listPrinters: () => Promise<unknown>; printSilently: (name: unknown) => Promise<unknown> }
      | undefined;
    const printers = await bridge?.listPrinters();
    const refused = await bridge?.printSilently('').then(
      () => false,
      () => true,
    );
    return { isList: Array.isArray(printers), refused };
  });
  expect(printing).toEqual({ isList: true, refused: true });
});

test('zooms with Ctrl and the =, - and 0 keys', async () => {
  await mainWindow();
  // Sent through Electron like real key presses. Playwright's keyboard goes through DevTools,
  // which skips the before-input-event hook that handles the shortcuts.
  const pressCtrl = (keyCode: string) =>
    running().evaluate(({ BrowserWindow }, key) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      contents?.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: ['control'] });
      contents?.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: ['control'] });
    }, keyCode);
  const zoomLevel = () =>
    running().evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getZoomLevel(),
    );

  await pressCtrl('=');
  await expect.poll(zoomLevel).toBe(0.5);
  await pressCtrl('-');
  await pressCtrl('-');
  await expect.poll(zoomLevel).toBe(-0.5);
  await pressCtrl('0');
  await expect.poll(zoomLevel).toBe(0);
});

test('reads a PC/SC reader (ACR122U) on the reader test page, and signals on it', async () => {
  const staff = await newStaff();
  const page = await mainWindow();
  await pcsc.plugIn(READER);
  const pluggedIn = Date.now();
  await signIn(page, staff);
  await page.goto('app://gym-spa/settings/card-reader');
  await unlock(page, staff);

  const readers = page.getByTestId('pcsc-readers');
  await expect(readers.getByText(READER)).toBeVisible();
  await expect(readers.getByText('بەستراوە', { exact: true })).toBeVisible();

  const tester = page.getByTestId('reader-test');
  await page.waitForTimeout(Math.max(0, pluggedIn + SETTLE_MS - Date.now()));
  await pcsc.place(READER, '04A1C1334F6180');
  await expect(tester.locator('[data-card-uid="04A1C1334F6180"]')).toHaveText(
    '04 A1 C1 33 4F 61 80',
  );
  // Green with one beep, through the card while it is there.
  await expect
    .poll(async () => (await pcsc.seen()).signals)
    .toEqual([{ reader: READER, signal: 'ok', via: 'card' }]);

  // A card held there is read once; lifted and placed again, it is read again.
  await page.waitForTimeout(300);
  expect((await pcsc.seen()).reads).toBe(1);
  await pcsc.lift(READER);
  await pcsc.place(READER, '04112233445566');
  await expect(tester.locator('[data-card-uid="04112233445566"]')).toBeVisible();
  expect((await pcsc.seen()).reads).toBe(2);

  // After the PC wakes from sleep, the card still on the reader is not a new scan, even though the
  // reader finds it again before Windows tells the app the PC woke.
  const { connections } = await pcsc.seen();
  await running().evaluate(({ powerMonitor }) => {
    powerMonitor.emit('suspend');
  });
  await pcsc.lift(READER);
  await pcsc.place(READER, '04112233445566');
  await page.waitForTimeout(300);
  await running().evaluate(({ powerMonitor }) => {
    powerMonitor.emit('resume');
  });
  await expect.poll(async () => (await pcsc.seen()).connections).toBe(connections + 1);
  await page.waitForTimeout(300);
  expect((await pcsc.seen()).reads).toBe(2);

  // Opening the reader test again reads the card already on the reader, once.
  const tabs = page.getByRole('navigation', { name: 'بەشەکانی ڕێکخستن' });
  await tabs.getByRole('link', { name: 'پیشاندان' }).click();
  await tabs.getByRole('link', { name: 'خوێنەری کارت' }).click();
  await expect(tester.locator('[data-card-uid="04112233445566"]')).toBeVisible();
  expect((await pcsc.seen()).reads).toBe(3);

  // Plugged in again with a card lying on it, the reader finds the card a moment later: not a scan.
  await pcsc.unplug(READER);
  await expect(readers.getByText('هیچ خوێنەرێک نەبەستراوە.')).toBeVisible();
  await pcsc.plugIn(READER);
  const pluggedInAgain = Date.now();
  await expect(readers.getByText(READER)).toBeVisible();
  await pcsc.place(READER, '04112233445566');
  await page.waitForTimeout(300);
  expect((await pcsc.seen()).reads).toBe(3);
  await pcsc.lift(READER);
  await page.waitForTimeout(Math.max(0, pluggedInAgain + SETTLE_MS - Date.now()));

  // The page gets only the reader's name and the UID.
  await page.evaluate(() => {
    const probe = window as unknown as { probedCard?: unknown };
    const stop = window.gymDesktop?.listenForCards((card) => {
      probe.probedCard = card;
      stop?.();
    });
  });
  await pcsc.place(READER, 'DEADBEEF');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { probedCard?: unknown }).probedCard))
    .toEqual({ reader: READER, uid: 'DEADBEEF' });

  // The main process takes only a connected reader's name and ok or error.
  const signals = (await pcsc.seen()).signals.length;
  await page.evaluate((reader) => {
    const bridge = window.gymDesktop as unknown as { signalCard: (...args: unknown[]) => void };
    bridge.signalCard('No such reader', 'ok');
    bridge.signalCard(reader, 'purple');
    bridge.signalCard(42, 'ok');
    bridge.signalCard(reader);
  }, READER);
  await page.waitForTimeout(300);
  expect((await pcsc.seen()).signals).toHaveLength(signals);
});

test('a card dialog reads the card already on the reader, and the reader shows the result', async () => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const aram = await addMember(data, branchId, 'ئارام کەریم', '+9647501230101');
  const shwan = await addMember(data, branchId, 'شوان ڕەشید', '+9647501230102');
  const page = await mainWindow();
  await pcsc.plugIn(READER);
  await pcsc.place(READER, '04A1C1334F6180');
  await signIn(page, staff);
  await page.goto(`app://gym-spa/members/${aram}`);
  await unlock(page, staff);

  // Staff opened the dialog for the card on the reader: it is read once, and given.
  const cards = page.getByTestId('member-cards');
  await cards.getByRole('button', { name: 'پێدانی کارت' }).click();
  await expect(page.getByText('کارتەکە درا بە ئارام کەریم')).toBeVisible();
  await expect(cards.getByTestId('member-card')).toContainText('04 A1 C1 33 4F 61 80');
  await expect
    .poll(async () => (await pcsc.seen()).signals)
    .toEqual([{ reader: READER, signal: 'ok', via: 'card' }]);

  // The same card for another member is refused: red twice with two beeps.
  await page.goto(`app://gym-spa/members/${shwan}`);
  await unlock(page, staff);
  await cards.getByRole('button', { name: 'پێدانی کارت' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('ئەم کارتە ئێستا کارتی ئەندامێکە.')).toBeVisible();
  await expect(dialog.getByTestId('card-holder')).toContainText('ئارام کەریم');
  await expect
    .poll(async () => (await pcsc.seen()).signals.at(-1))
    .toEqual({ reader: READER, signal: 'error', via: 'card' });
});

test('a locked app reads no card, and reads the card on the reader once after unlocking', async () => {
  const staff = await newStaff();
  const page = await mainWindow();
  await pcsc.plugIn(READER);
  await signIn(page, staff);
  await page.goto('app://gym-spa/settings/card-reader');
  await unlock(page, staff);
  await expect(page.getByTestId('pcsc-readers').getByText(READER)).toBeVisible();

  await lockFromMenu(page);
  await pcsc.place(READER, '04A1C1334F6180');
  await page.waitForTimeout(300);
  expect((await pcsc.seen()).reads).toBe(0);

  // The reader test is in front again, with a card on the reader: it is read once.
  await unlock(page, staff);
  await expect(
    page.getByTestId('reader-test').locator('[data-card-uid="04A1C1334F6180"]'),
  ).toBeVisible();
  await page.waitForTimeout(300);
  expect((await pcsc.seen()).reads).toBe(1);
});

test('a card placed on any screen opens its member; one left on the reader does not', async () => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const lana = await addMember(data, branchId, 'لانا ئەحمەد', '+9647501230111');
  await addCard(data, lana, '04A1C1334F6180');
  const page = await mainWindow();
  await pcsc.plugIn(READER);
  const pluggedIn = Date.now();
  await signIn(page, staff);
  await page.waitForTimeout(Math.max(0, pluggedIn + SETTLE_MS - Date.now()));

  await pcsc.place(READER, '04A1C1334F6180');
  await expect(page).toHaveURL(new RegExp(`/members/${lana}$`));
  await expect
    .poll(async () => (await pcsc.seen()).signals.at(-1))
    .toEqual({ reader: READER, signal: 'ok', via: 'card' });

  // Back home with the card left lying there: locking and unlocking doesn't read it again.
  await page.getByRole('link', { name: 'سەرەکی' }).first().click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await lockFromMenu(page);
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await page.waitForTimeout(300);
  expect((await pcsc.seen()).reads).toBe(1);

  // Lifted and placed again, it opens the member again.
  await pcsc.lift(READER);
  await pcsc.place(READER, '04A1C1334F6180');
  await expect(page).toHaveURL(new RegExp(`/members/${lana}$`));
});
