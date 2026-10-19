import type { Page } from '@playwright/test';
import pkg from '../package.json' with { type: 'json' };
import { admin, type TestData } from './support/backend';
import {
  HOME_HEADING,
  LOGIN_HEADING,
  expect,
  signIn,
  submitPasswordLogin,
  test,
  typePin,
  unlock,
} from './support/app';

// Devices (step 1e-3, decided by the user on 2026-10-11): a device must be registered before staff
// work on it; a manager registers it at their first login there, and every device counts toward
// the gym's limit. The devices screen renames, moves, and deactivates them.

const DESKTOP = { width: 1440, height: 900 };
const REGISTER_HEADING = { level: 1, name: 'تۆمارکردنی ئامێر' } as const;
const NOT_REGISTERED =
  'ئەم ئامێرە هێشتا تۆمار نەکراوە. با بەڕێوەبەرێک کە دەسەڵاتی ئامێرەکانی هەیە جارێک لێرە بچێتە ژوورەوە و تۆماری بکات.';
const DEVICE_INACTIVE = 'ئەم ئامێرە لەلایەن بەڕێوەبەرەوە ناچالاک کراوە. پەیوەندی بە بەڕێوەبەر بکە.';

async function gymDevices(data: TestData) {
  const gym = await data.gym();
  const { data: rows } = await admin()
    .from('devices')
    .select('id, code, name, platform, branch_id, is_active, default_language')
    .eq('gym_id', gym.id)
    .order('created_at');
  return rows ?? [];
}

async function firstBranchId(data: TestData): Promise<string> {
  const gym = await data.gym();
  const { data: branch } = await admin()
    .from('branches')
    .select('id')
    .eq('gym_id', gym.id)
    .eq('code', 'B1')
    .single();
  if (!branch) throw new Error('No branch B1');
  return branch.id;
}

/** A device registered in the gym's branch B1 as if from another PC. */
async function otherDevice(data: TestData, name: string): Promise<string> {
  const gym = await data.gym();
  const id = crypto.randomUUID();
  const { error } = await admin()
    .from('devices')
    .insert({
      id,
      gym_id: gym.id,
      branch_id: await firstBranchId(data),
      code: 'D50',
      name,
      platform: 'android',
    });
  if (error) throw new Error(error.message);
  return id;
}

async function owner(data: TestData) {
  return data.staff({ role: 'owner', branchIds: [], allBranches: true });
}

async function thisDeviceId(data: TestData): Promise<string> {
  const [device] = await gymDevices(data);
  if (!device) throw new Error('No device');
  return device.id;
}

async function lockAndUnlock(page: Page, staff: Parameters<typeof unlock>[1]): Promise<void> {
  await page.reload();
  await unlock(page, staff);
}

test.describe('registration', () => {
  test.use({ autoRegister: false });

  test('a manager registers a new device at their first login on it', async ({ page, data }) => {
    const manager = await owner(data);
    await page.goto('/');
    await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
    await submitPasswordLogin(page, manager);
    await expect(page.getByRole('heading', REGISTER_HEADING)).toBeVisible();
    await expect(page.getByText('مۆبایلی خۆشت', { exact: false })).toBeVisible();

    // Nothing typed yet: the form says what is missing.
    await page.getByRole('button', { name: 'تۆمارکردن' }).click();
    await expect(page.getByText('ناوێک بۆ ئامێرەکە بنووسە، با زۆر درێژ نەبێت.')).toBeVisible();
    await page.getByLabel('ناوی ئامێر').fill('  کۆمپیوتەری   پێشوازی ');
    // The gym has one branch: it is chosen already.
    await expect(page.getByRole('radio', { name: /لقی یەکەم/ })).toBeChecked();
    await page.getByRole('button', { name: 'تۆمارکردن' }).click();
    await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

    expect(await gymDevices(data)).toMatchObject([
      {
        code: 'D01',
        name: 'کۆمپیوتەری پێشوازی',
        platform: 'web',
        branch_id: await firstBranchId(data),
        is_active: true,
      },
    ]);

    // It reported at once: the devices screen shows when it was last seen, and its version.
    const [registered] = await gymDevices(data);
    await expect
      .poll(async () => {
        const { data: status } = await admin()
          .from('device_status')
          .select('app_version, last_seen_by')
          .eq('device_id', registered?.id ?? '')
          .maybeSingle();
        return status;
      })
      .toEqual({ app_version: pkg.version, last_seen_by: manager.id });

    // After a restart the lock screen names the device and its branch.
    await page.reload();
    await expect(page.getByText('ئەم ئامێرە: کۆمپیوتەری پێشوازی · لقی یەکەم')).toBeVisible();
    await unlock(page, manager);
    await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  });

  test('staff without devices.manage cannot start on an unregistered device', async ({
    page,
    staff,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
    await submitPasswordLogin(page, staff);
    await expect(page.getByRole('alert')).toHaveText(NOT_REGISTERED);
    await expect(page.getByRole('heading', { level: 1, name: 'چوونەژوورەوە' })).toBeVisible();
    // Nothing of them stays on the device: after a restart it still asks for a login.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'چوونەژوورەوە' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toHaveCount(0);
  });

  test('every device counts toward the limit, a manager phone too', async ({ page, data }) => {
    const manager = await owner(data);
    await otherDevice(data, 'مۆبایلی خاوەن');
    await data.setGym({ max_devices: 1 });

    await page.goto('/');
    await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
    await submitPasswordLogin(page, manager);
    await expect(page.getByRole('heading', REGISTER_HEADING)).toBeVisible();
    await expect(page.getByText('ئامێری چالاک: 1 لە 1.', { exact: false })).toBeVisible();
    await page.getByLabel('ناوی ئامێر').fill('کۆمپیوتەری پێشوازی');
    await page.getByRole('button', { name: 'تۆمارکردن' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'ئەم جیمە گەیشتووەتە زۆرترین ژمارەی ئامێر.',
    );
    expect(await gymDevices(data)).toHaveLength(1);
  });
});

test('a deactivated device opens for nobody until a manager reactivates it', async ({
  page,
  data,
  staff,
}) => {
  await signIn(page, staff);
  const deviceId = await thisDeviceId(data);
  await admin().from('devices').update({ is_active: false }).eq('id', deviceId);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await page.getByRole('button', { name: staff.fullName }).click();
  await typePin(page, staff.pin ?? '');
  await expect(page.getByText(DEVICE_INACTIVE)).toBeVisible();

  await admin().from('devices').update({ is_active: true }).eq('id', deviceId);
  await page.getByRole('button', { name: 'گەڕانەوە' }).click();
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
});

test('the devices page renames, sets the language of, moves and deactivates a device', async ({
  page,
  data,
}) => {
  const manager = await owner(data);
  const tabletId = await otherDevice(data, 'تابلێتی دەرگا');
  const secondBranch = await data.branch();
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/devices');
  await expect(page.getByRole('heading', { level: 1, name: 'ئامێرەکان' })).toBeVisible();
  await expect(page.locator('[data-device-row]')).toHaveCount(2);
  await expect(page.getByText('ئەم ئامێرە').first()).toBeVisible();

  await page.locator('[data-device-row="تابلێتی دەرگا"]').click();
  await expect(page.locator('[data-device-detail="تابلێتی دەرگا"]')).toBeVisible();
  await page.getByLabel('ناوی ئامێر').fill('تابلێتی هۆڵ');
  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('ئامێرەکە پاشەکەوت کرا')).toBeVisible();
  await expect
    .poll(async () => (await gymDevices(data)).find((device) => device.id === tabletId))
    .toMatchObject({ name: 'تابلێتی هۆڵ', default_language: 'en' });

  await page.getByRole('radio', { name: /لقی تاقیکردنەوە B2/ }).click();
  await page.getByRole('button', { name: 'گواستنەوە' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'گواستنەوە' }).click();
  await expect(page.getByText('ئامێرەکە گوازرایەوە')).toBeVisible();
  await expect
    .poll(async () => (await gymDevices(data)).find((device) => device.id === tabletId))
    .toMatchObject({ branch_id: secondBranch, code: 'D01' });

  await page.getByRole('button', { name: 'ناچالاککردن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ناچالاککردن' }).click();
  await expect(page.getByText('تابلێتی هۆڵ ناچالاک کرا')).toBeVisible();
  await expect
    .poll(async () => (await gymDevices(data)).find((device) => device.id === tabletId)?.is_active)
    .toBe(false);
  // Deactivated devices leave the default list.
  await expect(page.locator('[data-device-row]')).toHaveCount(1);
});

test('deactivating this device locks the app at once', async ({ page, data }) => {
  const manager = await owner(data);
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/devices');
  await page.locator('[data-device-row]').first().click();
  await expect(
    page.getByText('ئەمە ئەم ئامێرەیە: دوای ناچالاککردن، لێرە کەس ناتوانێت کار بکات.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'ناچالاککردن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ناچالاککردن' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  await expect(page.getByText(DEVICE_INACTIVE)).toBeVisible();
  await lockAndUnlock(page, manager);
  await expect(page.getByText(DEVICE_INACTIVE)).toBeVisible();
});
