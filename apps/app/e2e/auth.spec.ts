// Login, PIN and lock, and the gym at login, against local Supabase (`pnpm db:start`).
import type { Page } from '@playwright/test';
import { admin, write, type TestStaff } from './support/backend';
import {
  GYM_CODE_LABEL,
  HOME_HEADING,
  LOGIN_HEADING,
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
  await expect(page.getByRole('alert')).toHaveText(WRONG_LOGIN);

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
  const pin = await admin().from('staff_pins').select('pin_hash').eq('staff_id', staff.id).single();
  // Hashed by the server (bcrypt), never sent back to the app.
  expect(pin.data?.pin_hash).toMatch(/^\$2[abxy]\$/);

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

  // The server keeps the lockout, for every device.
  const { data: pin } = await admin()
    .from('staff_pins')
    .select('locked_at')
    .eq('staff_id', staff.id)
    .single();
  expect(pin?.locked_at).not.toBeNull();
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

test('locks itself when idle, and keeps the page that was open', async ({ page, staff, data }) => {
  // A branch setting of 2 minutes (the default is 10).
  await write(
    admin()
      .from('settings')
      .insert({
        gym_id: (await data.gym()).id,
        branch_id: await branchOf(staff),
        key: 'security.idle_lock_minutes',
        value: 2,
      }),
  );

  await page.clock.install();
  // The app reads the setting from the server once someone is using it.
  const settingRead = page.waitForResponse(
    (response) =>
      response.url().includes('/rest/v1/settings') &&
      response.url().includes('security.idle_lock_minutes') &&
      response.ok(),
  );
  await signIn(page, staff, '/settings/display');
  await expect(page.getByRole('heading', { level: 1, name: 'پیشاندان' })).toBeVisible();
  await settingRead;

  await page.clock.fastForward('01:30');
  await expect(page.getByRole('heading', { level: 1, name: 'پیشاندان' })).toBeVisible();
  await page.clock.fastForward('01:00');
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();

  await unlock(page, staff);
  await expect(page.getByRole('heading', { level: 1, name: 'پیشاندان' })).toBeVisible();
});

test('without a connection neither the PIN nor the password works, and the app says so', async ({
  page,
  context,
  staff,
}) => {
  await signIn(page, staff);
  await expect(page.getByRole('status')).toContainText('پەیوەندی هەیە');
  await lockFromMenu(page);

  await context.setOffline(true);
  await unlock(page, staff);
  await expect(page.getByRole('alert')).toHaveText(
    'پەیوەندی بە سێرڤەرەوە نەکرا. ئینتەرنێتەکەت بپشکنە و دووبارە هەوڵ بدەرەوە.',
  );

  await page.getByRole('button', { name: 'گەڕانەوە' }).click();
  await page.getByRole('button', { name: 'کارمەندێکی تر' }).click();
  await expect(page.getByText('بۆ چوونەژوورەوە پەیوەندی بە سێرڤەرەوە پێویستە.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'چوونەژوورەوە' })).toBeDisabled();

  // Once the connection is back, the PIN works (and no try was used up).
  await context.setOffline(false);
  await page.getByRole('button', { name: 'گەڕانەوە بۆ لیستی کارمەندان' }).click();
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
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

test('a PIN removed by a manager stops working at once', async ({ page, staff }) => {
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await lockFromMenu(page);

  await write(admin().from('staff_pins').delete().eq('staff_id', staff.id));
  await unlock(page, staff);
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

test("staff who lose access to the device's branch can't unlock it", async ({ page, staff }) => {
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  await write(admin().from('staff_branches').delete().eq('staff_id', staff.id));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  // Locked at the next check, and the PIN no longer opens this device.
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await expect(page.getByRole('button', { name: staff.fullName })).toContainText(
    'دەستی بەم لقە ناگات',
  );
  await page.getByRole('button', { name: staff.fullName }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'دەستت بەم لقە ناگات. پەیوەندی بە بەڕێوەبەر بکە.',
  );
  await expect(page.locator('input[inputmode="numeric"]')).toHaveCount(0);

  // Their password doesn't get them in either.
  await page.getByRole('button', { name: 'گەڕانەوە' }).click();
  await page.getByRole('button', { name: 'کارمەندێکی تر' }).click();
  await submitPasswordLogin(page, staff);
  await expect(page.getByRole('alert')).toHaveText(
    'دەستت بەم لقە ناگات. پەیوەندی بە بەڕێوەبەر بکە.',
  );
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

// The gym at login (spec §2.6) ------------------------------------------------------------------

const WRONG_LOGIN = 'کۆدی جیم، ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە.';
const GYM_LOCKED = 'ئەم جیمە قفڵ کراوە و بەکارناهێنرێت. پەیوەندی بە کلیک گرووپ بکە.';
const GYM_READ_ONLY = 'ئەم جیمە تەنها بۆ بینینە';
const USE_ANOTHER_GYM = { name: 'جیمێکی تر' } as const;

test('the first login asks for the gym code, and the device remembers the gym', async ({
  page,
  staff,
  data,
}) => {
  const gym = await data.gym();
  await page.goto('/');
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await expect(page.getByText('کۆدی جیم، ناوی بەکارهێنەر و وشەی نهێنیت بنووسە.')).toBeVisible();

  // The code is required.
  await page.getByLabel('ناوی بەکارهێنەر').fill(staff.username);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(page.getByText('کۆدی جیم بنووسە.')).toBeVisible();

  // Typed the way a Kurdish keyboard might: uppercase, spaces.
  await page.getByLabel(GYM_CODE_LABEL).fill(`  ${staff.gymCode.toUpperCase()} `);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  // From now on the device shows its gym and asks only for username and password.
  await lockFromMenu(page);
  await expect(page.getByTestId('device-gym')).toHaveText(gym.nameCkb);
  await page.getByRole('button', { name: 'کارمەندێکی تر' }).click();
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await expect(page.getByLabel(GYM_CODE_LABEL)).toHaveCount(0);
  // Someone is logged in on the device, so it stays with its gym.
  await expect(page.getByRole('button', USE_ANOTHER_GYM)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('device-gym')).toHaveText(gym.nameCkb);
});

test('a ?gym= link fills in the gym code', async ({ page, staff }) => {
  await page.goto(`/?gym=${staff.gymCode}`);
  await expect(page.getByLabel(GYM_CODE_LABEL)).toHaveValue(staff.gymCode);
  await page.getByLabel('ناوی بەکارهێنەر').fill(staff.username);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(staff.password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
});

test('a wrong gym code, username or password all get the same message', async ({
  page,
  staff,
  otherGym,
}) => {
  const other = await otherGym.staff({ branchIds: [await otherGym.branch()] });
  await page.goto('/');
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();

  const attempts = [
    // A gym that doesn't exist.
    { ...staff, gymCode: 'no-such-gym' },
    // The right gym, a wrong password.
    { ...staff, password: 'wrong-password' },
    // Someone of another gym, with this gym's code.
    { ...other, gymCode: staff.gymCode },
    // This gym's staff member, with the other gym's code.
    { ...staff, gymCode: other.gymCode },
  ];
  for (const attempt of attempts) {
    await submitPasswordLogin(page, attempt);
    await expect(page.getByRole('alert')).toHaveText(WRONG_LOGIN);
  }
  // Nothing was remembered: the next login still asks for the code.
  await expect(page.getByLabel(GYM_CODE_LABEL)).toBeVisible();
});

test('"use another gym" is offered only when nobody is logged in on the device', async ({
  page,
  staff,
}) => {
  await signIn(page, staff);
  await page.getByRole('button', { name: 'هەژمارەکەم' }).click();
  await page.getByRole('menuitem', { name: 'چوونەدەرەوە لەم ئامێرە' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'چوونەدەرەوە' }).click();

  // Nobody is left on the device: it still knows its gym, and can be given another.
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await expect(page.getByLabel(GYM_CODE_LABEL)).toHaveCount(0);
  await page.getByRole('button', USE_ANOTHER_GYM).click();
  await expect(page.getByLabel(GYM_CODE_LABEL)).toHaveValue('');
  await expect(page.getByTestId('device-gym')).toHaveCount(0);
});

test("a locked gym can't be used, and the app says why", async ({ page, staff, data }) => {
  await signIn(page, staff);
  await data.setGym({ locked_at: new Date().toISOString() });
  // The device checks when the network comes back (and every few minutes): it locks at once.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(GYM_LOCKED);
  await unlock(page, staff);
  await expect(page.getByRole('alert')).toHaveText(GYM_LOCKED);

  // The password doesn't open it either.
  await page.getByRole('button', { name: 'گەڕانەوە' }).click();
  await page.getByRole('button', { name: 'کارمەندێکی تر' }).click();
  await submitPasswordLogin(page, staff);
  await expect(page.getByRole('alert')).toHaveText(GYM_LOCKED);
});

test('staff of a read-only gym can still log in and look, and see that it is view-only', async ({
  page,
  staff,
  data,
}) => {
  await data.setGym({ suspended_at: new Date().toISOString() });
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  await lockFromMenu(page);
  await expect(page.getByRole('alert')).toContainText(GYM_READ_ONLY);
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
});
