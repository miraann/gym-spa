import { mkdtemp, rm } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { TestData, type TestStaff } from '../../app/e2e/support/backend';
import { addMember } from '../../app/e2e/support/members';

// The offline edition's Windows build (steps OF-c, OF-d) against an offline server on this PC
// with one gym. Only `pnpm test:offline --desktop` runs it: that makes the server, builds the app
// for the offline edition (apps/app/dist-offline) and sets GYM_OFFLINE_WEB_ROOT, GYM_SERVER_URL
// (its loopback address), GYM_SERVER_LAN_PORT, GYM_SERVER_SECRET_KEY and GYM_E2E_BACKEND. The page
// talks to app://gym-spa/server/…, which the main process forwards.

const offlineWebRoot = process.env.GYM_OFFLINE_WEB_ROOT;
const serverUrl = process.env.GYM_SERVER_URL;
const lanPort = process.env.GYM_SERVER_LAN_PORT;
const secretKey = process.env.GYM_SERVER_SECRET_KEY;
test.skip(!offlineWebRoot || !serverUrl, 'pnpm test:offline --desktop runs these');
/** This PC's LAN address: the server sees a PC pairing through it as another PC of the LAN. */
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

const desktopDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOGIN_HEADING = { level: 1, name: 'چوونەژوورەوە' } as const;
const CONNECT_HEADING = { level: 1, name: 'بەستنەوە بە سێرڤەرەوە' } as const;
const HOME_HEADING = { level: 1, name: 'سەرەکی' } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

let data: TestData;
let owner: TestStaff;
let userData: string;
let app: ElectronApplication | undefined;

/**
 * A fresh install of the offline edition. `linked: false` is a PC that has no server yet;
 * `serverHere` makes this PC the one the server runs on (its loopback address).
 */
async function launch({
  linked = true,
  serverHere = false,
  localServer = serverUrl,
}: {
  linked?: boolean;
  serverHere?: boolean;
  localServer?: string | undefined;
} = {}): Promise<Page> {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!linked) delete env.GYM_SERVER_URL;
  app = await electron.launch({
    args: [desktopDir],
    env: {
      ...env,
      GYM_USER_DATA_DIR: userData,
      GYM_WEB_ROOT: offlineWebRoot ?? '',
      GYM_FAKE_PCSC: '1',
      ...(serverHere ? { GYM_LOCAL_SERVER_URL: localServer ?? '' } : {}),
    },
  });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', linked ? LOGIN_HEADING : CONNECT_HEADING)).toBeVisible();
  return page;
}

/** A pairing code made on the server, as its screen (or gym-server-admin) makes one. */
async function pairingCode(): Promise<string> {
  const response = await fetch(`${serverUrl ?? ''}/server/v1/admin/pairing-code`, {
    method: 'POST',
    headers: { apikey: secretKey ?? '' },
  });
  return ((await response.json()) as { code: string }).code;
}

/**
 * The first login on a new PC: no gym code, then the Owner registers the PC (Playwright's request
 * routing doesn't reach app:// requests, so this is the real registration screen).
 */
async function signIn(page: Page, staff: TestStaff): Promise<void> {
  await page.getByLabel('ناوی بەکارهێنەر').fill(staff.username);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'تۆمارکردنی ئامێر' })).toBeVisible();
  await page.getByLabel('ناوی ئامێر').fill('کۆمپیوتەری پێشوازی');
  // Chosen by itself only while the gym has one branch.
  await page.getByRole('radio', { name: 'لقی یەکەم B1' }).click();
  await page.getByRole('button', { name: 'تۆمارکردن' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
}

/** Opens a page by its address (which locks the app, like any reload) and unlocks it again. */
async function open(page: Page, route: string, staff: TestStaff): Promise<void> {
  await page.goto(`app://gym-spa${route}`);
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await page.getByRole('button', { name: staff.fullName }).click();
  await page.getByTestId('pin-field').pressSequentially(staff.pin ?? '');
  await expect(page.locator('[data-auth-screen]')).toHaveCount(0);
}

test.beforeAll(async () => {
  data = new TestData();
  owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
});

test.afterAll(async () => {
  await data.cleanup();
});

test.beforeEach(async () => {
  userData = await mkdtemp(path.join(tmpdir(), 'gym-offline-desktop-'));
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(userData, { recursive: true, force: true });
});

test('logs in without a gym code: the server says which gym it is', async () => {
  const page = await launch();
  await expect(page.getByLabel('کۆدی جیم')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'جیمێکی تر' })).toHaveCount(0);
  await signIn(page, owner);
});

test('hides what needs the internet: WhatsApp and Click Group', async () => {
  const page = await launch();
  await signIn(page, owner);

  await open(page, '/settings/display', owner);
  const tabs = page.getByRole('navigation', { name: 'بەشەکانی ڕێکخستن' });
  await expect(tabs.getByRole('link', { name: 'پیشاندان' })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'نامەکان' })).toHaveCount(0);
  await expect(tabs.getByRole('link', { name: 'کلیک گرووپ' })).toHaveCount(0);

  await open(page, '/settings/support', owner);
  await expect(page).toHaveURL(/\/settings\/display$/);

  const member = await addMember(data, await data.branch(), 'ئاری ئەحمەد', '+9647501234567');
  await open(page, `/members/${member}`, owner);
  await expect(page.getByRole('heading', { name: 'ئاری ئەحمەد' })).toBeVisible();
  await expect(page.getByRole('button', { name: /واتسئاپ/ })).toHaveCount(0);
});

test('speaks of the license (مۆڵەت) when the gym is read-only', async () => {
  const page = await launch();
  await signIn(page, owner);
  await data.setGym({ paid_until: new Date(Date.now() - 40 * DAY_MS).toISOString() });
  try {
    // The next check with the server (here: unlocking after a reload) learns the gym's state.
    await open(page, '/', owner);
    const notice = page.locator('[data-billing-notice="read_only"]');
    await expect(notice).toContainText('جیمەکە تەنها بۆ بینینە');
    await expect(notice).toContainText('مۆڵەتی ئەم جیمە تەواو بووە');
  } finally {
    await data.setGym({ paid_until: null });
  }
});

test('a PC without its server asks to be connected to one first', async () => {
  const page = await launch({ linked: false });
  await expect(page.getByLabel('ناونیشانی سێرڤەر')).toBeVisible();
  await expect(page.getByLabel('ناوی بەکارهێنەر')).toHaveCount(0);
});

test('a new PC pairs with the code after checking the identity, then works over HTTPS', async () => {
  test.skip(!lanAddress || !lanPort || !secretKey, 'needs a LAN address and the server settings');
  const page = await launch({ linked: false });
  await page.getByLabel('ناونیشانی سێرڤەر').fill(`${lanAddress ?? ''}:${lanPort ?? ''}`);
  await page.getByRole('button', { name: 'پشکنین' }).click();
  const info = (await (await fetch(`${serverUrl ?? ''}/server/v1/info`)).json()) as {
    identity: string;
  };
  // The identity this PC computed from the certificate it saw is the server's own.
  await expect(page.locator('[data-server-identity]')).toHaveText(info.identity);

  const code = await pairingCode();
  await page.getByLabel('کۆدی بەستنەوە').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'بەستنەوە', exact: true }).click();
  await expect(page.getByText('کۆدەکە هەڵەیە.')).toBeVisible();
  await page.getByLabel('کۆدی بەستنەوە').fill(code);
  await page.getByRole('button', { name: 'بەستنەوە', exact: true }).click();

  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await signIn(page, owner);
});

test('the server PC links to itself, and makes pairing codes on its server page', async () => {
  const page = await launch({ linked: false, serverHere: true });
  await page.getByRole('button', { name: 'ئەم کۆمپیوتەرە سێرڤەرەکەیە' }).click();
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await signIn(page, owner);
  await open(page, '/settings/server', owner);
  await page.getByRole('button', { name: 'کۆدی نوێی بەستنەوە' }).click();
  await expect(page.locator('[data-pairing-code]')).toHaveText(/^\d{6}$/);
  await expect(page.locator('[data-server-identity]')).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

  // Backups (OF-e): one now, then put back, confirmed with the gym code.
  await page.getByRole('button', { name: 'ئێستا کۆپی یەدەگ بکە' }).click();
  await expect(page.getByText('کۆپی یەدەگ دروست کرا.')).toBeVisible();
  await page.getByRole('button', { name: 'گەڕاندنەوە' }).first().click();
  const restore = page.getByRole('dialog');
  await expect(restore.getByRole('button', { name: 'گەڕاندنەوە' })).toBeDisabled();
  await restore.getByLabel(/کۆدی جیم/).fill(owner.gymCode);
  await restore.getByRole('button', { name: 'گەڕاندنەوە' }).click();
  // The data changed under every screen: the app starts again, locked.
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible({
    timeout: 30_000,
  });
});

test("sets up a new server on its own PC: the license, then the gym's first Owner", async () => {
  const setupServer = process.env.GYM_SETUP_SERVER_URL;
  test.skip(!setupServer, 'needs the unlicensed setup server');
  const page = await launch({ linked: false, serverHere: true, localServer: setupServer });
  await page.getByRole('button', { name: 'ئەم کۆمپیوتەرە سێرڤەرەکەیە' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'مۆڵەتی جیم' })).toBeVisible();
  await expect(page.locator('[data-machine-code]')).toHaveText(
    process.env.GYM_SETUP_MACHINE_CODE ?? '',
  );
  await page.getByLabel('کۆدی مۆڵەت').fill('GSL1.not.a-license');
  await page.getByRole('button', { name: 'دانان' }).click();
  await expect(page.getByText('ئەم کۆدی مۆڵەتە دروست نییە.')).toBeVisible();
  await page.getByLabel('کۆدی مۆڵەت').fill(process.env.GYM_SETUP_LICENSE ?? '');
  await page.getByLabel('کۆدی چالاککردن').fill(process.env.GYM_SETUP_ACTIVATION ?? '');
  await page.getByRole('button', { name: 'دانان' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'خاوەنی جیم' })).toBeVisible();
  await page.getByLabel('ناوی بەکارهێنەر').fill('owner');
  await page.getByLabel('ناوی تەواو').fill('خاوەنی جیم');
  await page.getByRole('button', { name: 'دروستکردن' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'وشەی نهێنیی کاتی' })).toBeVisible();
  await page.getByRole('button', { name: 'بڕۆ بۆ چوونەژوورەوە' }).click();
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await expect(page.getByLabel('کۆدی جیم')).toHaveCount(0);
});
