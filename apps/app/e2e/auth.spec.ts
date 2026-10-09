// Login, PIN and lock against local Supabase + PowerSync (`pnpm db:start`, `pnpm sync:start`).
import type { Page } from '@playwright/test';
import { admin, write, type TestStaff } from './support/backend';
import {
  HOME_HEADING,
  expect,
  signIn,
  submitPasswordLogin,
  test,
  typePin,
  unlock,
} from './support/app';

// Console errors fail the test (CSP violations, React errors). Failed requests are left out:
// a wrong password or going offline logs one by design.
let consoleErrors: string[] = [];
test.beforeEach(({ page }) => {
  consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });
});
test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('first login: new password, then a PIN, then the app', async ({ page, data }) => {
  const branchId = await data.branch();
  const staff = await data.staff({
    branchIds: [branchId],
    mustChangePassword: true,
    withPin: false,
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'چوونەژوورەوە' })).toBeVisible();

  // Wrong password first.
  await submitPasswordLogin(page, { ...staff, password: 'wrong-password' });
  await expect(page.getByRole('alert')).toHaveText('ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە.');

  await submitPasswordLogin(page, staff);
  await expect(
    page.getByRole('heading', { level: 1, name: 'وشەی نهێنیی نوێ دابنێ' }),
  ).toBeVisible();
  await page.getByLabel('وشەی نهێنیی نوێ', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('وشەی نهێنی دەبێت لانیکەم 8 پیت یان ژمارە بێت.')).toBeVisible();
  await page.getByLabel('وشەی نهێنیی نوێ', { exact: true }).fill('New-pass-2026');
  await page.getByLabel('دووبارە نووسینەوەی وشەی نهێنیی نوێ').fill('New-pass-2026');
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'پینێک دابنێ' })).toBeVisible();
  await typePin(page, '123456');
  await expect(page.getByRole('alert')).toContainText('ئەم پینە زۆر ئاسانە');
  await typePin(page, '482917');
  await expect(
    page.getByRole('heading', { level: 1, name: 'پینەکە دووبارە بنووسەوە' }),
  ).toBeVisible();
  await typePin(page, '482917');

  // One branch, so it is chosen for the device without asking.
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  const server = await admin()
    .from('staff_users')
    .select('must_change_password')
    .eq('id', staff.id)
    .single();
  expect(server.data?.must_change_password).toBe(false);
  const pin = await admin()
    .from('staff_pins')
    .select('iterations')
    .eq('staff_id', staff.id)
    .single();
  expect(pin.data?.iterations).toBe(600_000);

  // Reloading locks the app; the PIN opens it.
  await page.reload();
  await unlock(page, staff, '482917');
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
});

/** Locks the app from the account menu (to let someone else in). */
async function lockFromMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'هەژمارەکەم' }).click();
  await page.getByRole('menuitem', { name: /قفڵکردن/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
}

/** The one branch a test staff member works in. */
async function branchOf(staff: TestStaff): Promise<string> {
  const { data } = await admin()
    .from('staff_branches')
    .select('branch_id')
    .eq('staff_id', staff.id)
    .single();
  if (!data) throw new Error('Staff member without a branch');
  return data.branch_id;
}

test('five wrong PINs lock the staff member out until they use their password', async ({
  page,
  staff,
}) => {
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await lockFromMenu(page);

  await page.getByRole('button', { name: staff.fullName }).click();
  for (const left of [4, 3, 2, 1]) {
    await typePin(page, '111222');
    await expect(page.getByRole('alert')).toHaveText(`پینەکە هەڵەیە. هەوڵی ماوە: ${String(left)}`);
  }
  await typePin(page, '111222');
  await expect(page.getByRole('alert')).toHaveText(
    'پین چەند جار بە هەڵە نووسرا. بۆ کردنەوە، بە وشەی نهێنی بچۆ ژوورەوە.',
  );
  await expect(page.locator('input[inputmode="numeric"]')).toHaveCount(0);

  // Still locked out after a reload: the count is kept on the device.
  await page.reload();
  await page.getByRole('button', { name: staff.fullName }).click();
  await page.getByRole('button', { name: 'چوونەژوورەوە بە وشەی نهێنی' }).click();
  // The username is filled in already.
  await expect(page.getByLabel('ناوی بەکارهێنەر')).toHaveValue(staff.username);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  // The PIN works again.
  await lockFromMenu(page);
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
});

test('locks itself when idle, and keeps the page that was open', async ({ page, staff }) => {
  // A branch setting of 2 minutes (the default is 10).
  await write(
    admin()
      .from('settings')
      .insert({ branch_id: await branchOf(staff), key: 'security.idle_lock_minutes', value: 2 }),
  );

  await page.clock.install();
  await signIn(page, staff, '/settings/display');
  await expect(page.getByRole('heading', { level: 1, name: 'ڕووکار و زمان' })).toBeVisible();
  // Wait until the branch's setting has reached the device's local database.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = (
          window as unknown as {
            gymTestDatabase: { getOptional(sql: string): Promise<{ value: string } | null> };
          }
        ).gymTestDatabase;
        const row = await db.getOptional(
          "SELECT value FROM settings WHERE key = 'security.idle_lock_minutes'",
        );
        return row?.value ?? null;
      }),
    )
    .toBe('2');

  await page.clock.fastForward('01:30');
  await expect(page.getByRole('heading', { level: 1, name: 'ڕووکار و زمان' })).toBeVisible();
  await page.clock.fastForward('01:00');
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();

  await unlock(page, staff);
  await expect(page.getByRole('heading', { level: 1, name: 'ڕووکار و زمان' })).toBeVisible();
});

test('unlocks with the PIN without internet', async ({ page, context, staff }) => {
  await signIn(page, staff);
  await expect(page.getByRole('status')).toContainText('ئۆنلاین');
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });

  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);
  await page.reload();

  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await expect(page.getByRole('status')).toContainText('ئۆفلاین');

  // Password login needs the internet, and says so.
  await lockFromMenu(page);
  await page.getByRole('button', { name: 'کارمەندێکی تر' }).click();
  await expect(
    page.getByText('بۆ چوونەژوورەوە بە وشەی نهێنی ئینتەرنێت پێویستە.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'چوونەژوورەوە' })).toBeDisabled();
});

test('two staff members share a device; logging out removes only one', async ({
  page,
  staff,
  data,
}) => {
  const second = await data.staff({ branchIds: [await branchOf(staff)] });

  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await lockFromMenu(page);
  await page.getByRole('button', { name: 'کارمەندێکی تر' }).click();
  await submitPasswordLogin(page, second);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await expect(page.getByRole('button', { name: 'هەژمارەکەم' })).toContainText(second.fullName);

  await lockFromMenu(page);
  await expect(page.getByRole('button', { name: staff.fullName })).toBeVisible();
  await unlock(page, second);

  await page.getByRole('button', { name: 'هەژمارەکەم' }).click();
  await page.getByRole('menuitem', { name: 'چوونەدەرەوە لەم ئامێرە' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'چوونەدەرەوە' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await expect(page.getByRole('button', { name: staff.fullName })).toBeVisible();
  await expect(page.getByRole('button', { name: second.fullName })).toHaveCount(0);
});

test('a PIN removed by a manager stops working at the next online check', async ({
  page,
  staff,
}) => {
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await lockFromMenu(page);

  await write(admin().from('staff_pins').delete().eq('staff_id', staff.id));
  // The old PIN still opens the app (the device didn't know yet); the check runs right after.
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await lockFromMenu(page);
  await page.getByRole('button', { name: staff.fullName }).click();
  await expect(page.getByRole('alert')).toContainText('بەڕێوەبەر پینەکەتی سڕییەوە.');

  // Password login asks for a new PIN.
  await page.getByRole('button', { name: 'چوونەژوورەوە بە وشەی نهێنی' }).click();
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'پینێک دابنێ' })).toBeVisible();
});

test('a deactivated staff member is locked out as soon as the device checks', async ({
  page,
  staff,
}) => {
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  await write(admin().from('staff_users').update({ is_active: false }).eq('id', staff.id));
  // The device checks when the network comes back (and every few minutes).
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await page.getByRole('button', { name: staff.fullName }).click();
  await expect(page.getByRole('alert')).toContainText('ئەم هەژمارە ناچالاک کراوە.');
});

test('the menu shows only what the role allows', async ({ page, staff, data }) => {
  await signIn(page, staff);
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  await expect(sidebar.getByText('ئەندامان', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('ڕۆڵ و دەسەڵاتەکان')).toHaveCount(0);

  const manager = await data.staff({ role: 'admin', branchIds: [await branchOf(staff)] });
  await lockFromMenu(page);
  await page.getByRole('button', { name: 'کارمەندێکی تر' }).click();
  await submitPasswordLogin(page, manager);
  await expect(sidebar.getByText('ڕۆڵ و دەسەڵاتەکان')).toBeVisible();
});
