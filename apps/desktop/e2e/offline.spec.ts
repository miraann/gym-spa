import { mkdtemp, rm } from 'node:fs/promises';
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
import { TestData, type TestStaff } from '../../app/e2e/support/backend';
import { addMember } from '../../app/e2e/support/members';

// The offline edition's Windows build (step OF-c) against an offline server on this PC with one
// gym. Only `pnpm test:offline --desktop` runs it: that makes the server, builds the app for the
// offline edition (apps/app/dist-offline) and sets GYM_OFFLINE_WEB_ROOT, GYM_SERVER_URL and
// GYM_E2E_BACKEND. The page talks to app://gym-spa/server/…, which the main process forwards.

const offlineWebRoot = process.env.GYM_OFFLINE_WEB_ROOT;
const serverUrl = process.env.GYM_SERVER_URL;
test.skip(!offlineWebRoot || !serverUrl, 'pnpm test:offline --desktop runs these');

const desktopDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOGIN_HEADING = { level: 1, name: 'چوونەژوورەوە' } as const;
const HOME_HEADING = { level: 1, name: 'سەرەکی' } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

let data: TestData;
let owner: TestStaff;
let userData: string;
let app: ElectronApplication | undefined;

/** A fresh install of the offline edition; `linked: false` is a PC that has no server yet. */
async function launch(linked = true): Promise<Page> {
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
    },
  });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  return page;
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

test('a PC without its server says it can not reach it, and logs nobody in', async () => {
  const page = await launch(false);
  await expect(page.getByText('بۆ چوونەژوورەوە پەیوەندی بە سێرڤەرەوە پێویستە.')).toBeVisible();
});
