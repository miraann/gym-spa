import { test as base, expect, type Page } from '@playwright/test';
import { TestData, type TestStaff } from './backend';

/** Each test gets its own gym, branch and staff (removed afterwards). */
export const test = base.extend<{ data: TestData; otherGym: TestData; staff: TestStaff }>({
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
export const GYM_CODE_LABEL = 'کۆدی یانە';

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
