import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { registerTestDevice, TestData, type TestStaff } from './backend';

/**
 * Registers the device of every password login in this page or context first, as a manager would
 * have (step 1e: devices must be registered). The login request carries the device id (X-Device-Id)
 * and the staff member's login address.
 */
export async function autoRegisterDevices(
  target: Page | BrowserContext,
  platform: 'web' | 'windows' = 'web',
): Promise<void> {
  await target.route(
    (url) =>
      url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password',
    async (route) => {
      const request = route.request();
      const deviceId = await request.headerValue('x-device-id');
      const body: unknown = request.postDataJSON();
      const email =
        typeof body === 'object' &&
        body !== null &&
        'email' in body &&
        typeof body.email === 'string'
          ? body.email
          : null;
      if (deviceId && email) await registerTestDevice(deviceId, email, platform);
      await route.continue();
    },
  );
}

/** Each test gets its own gym, branch and staff (removed afterwards). */
export const test = base.extend<{
  data: TestData;
  otherGym: TestData;
  staff: TestStaff;
  /** false: devices stay unregistered (the tests of registration itself). */
  autoRegister: boolean;
}>({
  autoRegister: [true, { option: true }],
  context: async ({ context, autoRegister }, use) => {
    if (autoRegister) await autoRegisterDevices(context);
    await use(context);
  },
  // Playwright reads the fixtures a fixture needs from this destructuring, so it must exist.
  // eslint-disable-next-line no-empty-pattern
  data: async ({}, use) => {
    const data = new TestData();
    await use(data);
    await data.cleanup();
  },
  // A second gym, for tests about what one gym's staff can't do in another.
  // eslint-disable-next-line no-empty-pattern
  otherGym: async ({}, use) => {
    const data = new TestData();
    await use(data);
    await data.cleanup();
  },
  // A receptionist of one branch, with a PIN already set: login goes straight to the app.
  staff: async ({ data }, use) => {
    const branchId = await data.branch();
    await use(await data.staff({ branchIds: [branchId] }));
  },
});

export { expect };

export const HOME_HEADING = { level: 1, name: 'سەرەکی' } as const;

export const LOGIN_HEADING = { level: 1, name: 'چوونەژوورەوە' } as const;
export const GYM_CODE_LABEL = 'کۆدی جیم';

/**
 * Fills in the password login (the screen must be showing). The gym code is asked only on a
 * device's first login; afterwards the device knows its gym.
 */
export async function submitPasswordLogin(
  page: Page,
  staff: Pick<TestStaff, 'gymCode' | 'username' | 'password'>,
): Promise<void> {
  const gymCode = page.getByLabel(GYM_CODE_LABEL);
  if (await gymCode.isVisible()) await gymCode.fill(staff.gymCode);
  await page.getByLabel('ناوی بەکارهێنەر').fill(staff.username);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
}

/** Opens the app on a new device and logs in with the password; ends on the home page. */
export async function signIn(page: Page, staff: TestStaff, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await submitPasswordLogin(page, staff);
  // The login and lock screens are gone: the app itself is showing.
  await expect(page.locator('[data-auth-screen]')).toHaveCount(0);
}

/** Types a PIN into the PIN pad's field, like a keyboard would. */
export async function typePin(page: Page, pin: string): Promise<void> {
  const field = page.locator('input[inputmode="numeric"]');
  await expect(field).toBeEnabled();
  await field.pressSequentially(pin);
}

/** From the lock screen: picks the staff member and enters their PIN. */
export async function unlock(page: Page, staff: TestStaff, pin = staff.pin ?? ''): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await page.getByRole('button', { name: staff.fullName }).click();
  await typePin(page, pin);
}

/** Locks the app from the account menu: the open page (and its loaded data) stays behind the lock. */
export async function lockFromMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'هەژمارەکەم' }).click();
  await page.getByRole('menuitem', { name: /قفڵکردن/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
}

/**
 * Holds a card to a keyboard-type reader: the UID's keys and Enter, 5 ms apart. The keys go through
 * the browser's own input (real key events, typed into a focused field), stamped with the times a
 * reader would type them: a busy test machine may deliver them later, but a reader's keys keep the
 * time they were pressed, and that is what the app measures.
 */
export async function scanCard(page: Page, uid: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const start = Date.now() / 1000;
  const keys = [...Array.from(uid), 'Enter'];
  for (const [index, key] of keys.entries()) {
    const enter = key === 'Enter';
    const code = enter ? 'Enter' : /[0-9]/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`;
    const keyCode = enter ? 13 : key.toUpperCase().charCodeAt(0);
    const timestamp = start + index * 0.005;
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      text: enter ? '\r' : key,
      timestamp,
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      timestamp: timestamp + 0.001,
    });
  }
  await cdp.detach();
}
