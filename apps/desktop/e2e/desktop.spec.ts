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
// Test staff in local Supabase (`pnpm db:start`, `pnpm sync:start`), shared with the web tests.
import { TestData, type TestStaff } from '../../app/e2e/support/backend';

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
    args: [desktopDir],
    env: { ...env, GYM_USER_DATA_DIR: userData, GYM_WEB_ROOT: webRoot },
  });
}

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

/** Password login on a fresh install; ends on the home page. */
async function signIn(page: Page, staff: TestStaff): Promise<void> {
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await page.getByLabel('ناوی بەکارهێنەر').fill(staff.username);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
}

async function unlock(page: Page, staff: TestStaff): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await page.getByRole('button', { name: staff.fullName }).click();
  await page.locator('input[inputmode="numeric"]').pressSequentially(staff.pin ?? '');
}

test.beforeAll(async () => {
  if (!existsSync(path.join(webBuild, 'index.html'))) {
    throw new Error(
      'Build the web app first (pnpm build), or run pnpm test:e2e from the repo root.',
    );
  }
  // The real web build, plus small probes for what the local database (PowerSync) will need.
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
  // The smallest valid WebAssembly module: magic number and version.
  await writeFile(
    path.join(webRoot, 'probe.wasm'),
    new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
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
  await expect(page.getByRole('heading', { level: 1, name: 'ڕووکار و زمان' })).toBeVisible();
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

test('has what the local database needs: storage, workers and WebAssembly', async () => {
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

    // Streaming compilation needs the application/wasm content type.
    const wasm = await WebAssembly.instantiateStreaming(fetch('/probe.wasm'));

    return {
      indexedDb,
      opfs,
      workerReply,
      sharedWorkerReply,
      wasm: wasm.module instanceof WebAssembly.Module,
    };
  });

  expect(result).toEqual({
    indexedDb: true,
    opfs: 'ok',
    workerReply: 42,
    sharedWorkerReply: 'connected',
    wasm: true,
  });
});

test('opens the local database and syncs', async () => {
  const page = await mainWindow();
  await signIn(page, await newStaff());
  const indicator = page.getByRole('status');
  await expect(indicator).toContainText('ئۆنلاین');
  // These counts come from the local database (SQLite on OPFS, in a worker).
  await indicator.click();
  await expect(page.getByText('گۆڕانکارییە نەنێردراوەکان: 0')).toBeVisible();
  await page.keyboard.press('Escape');
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

test('the title bar follows the app theme', async () => {
  const page = await mainWindow();
  const themeSource = () => running().evaluate(({ nativeTheme }) => nativeTheme.themeSource);
  await expect.poll(themeSource).toBe('system');

  await page.getByRole('button', { name: 'گۆڕینی ڕووکار' }).click();
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
