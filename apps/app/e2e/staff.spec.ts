import { admin, type TestData } from './support/backend';
import {
  autoRegisterDevices,
  expect,
  lockFromMenu,
  signIn,
  submitPasswordLogin,
  test,
  typePin,
} from './support/app';

// Staff (step 1e-2): the list, adding a staff member through the staff module, changing their
// access, and the account actions. Needs the local Edge Functions (`pnpm db:functions`).

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function staffRow(data: TestData, username: string) {
  const gym = await data.gym();
  const { data: row } = await admin()
    .from('staff_users')
    .select('id, full_name, phone, is_active, all_branches, role_id')
    .eq('gym_id', gym.id)
    .eq('username', username)
    .single();
  if (!row) throw new Error(`No staff member ${username}`);
  return row;
}

async function roleId(data: TestData, key: string): Promise<string> {
  const gym = await data.gym();
  const { data: role } = await admin()
    .from('roles')
    .select('id')
    .eq('gym_id', gym.id)
    .eq('key', key)
    .single();
  if (!role) throw new Error(`No role ${key}`);
  return role.id;
}

test('an Owner adds a staff member, who logs in with the temporary password', async ({
  page,
  browser,
  data,
}) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/staff');
  await expect(page.getByRole('heading', { level: 1, name: 'کارمەندان' })).toBeVisible();

  await page.getByRole('link', { name: 'کارمەندی نوێ' }).click();
  await page.getByLabel('ناوی تەواو').fill('  ئارام   کەریم ');
  // Typed with capitals: saved in lowercase.
  await page.getByRole('textbox', { name: 'ناوی بەکارهێنەر' }).fill('Aram.K');
  await page.getByRole('textbox', { name: /ژمارەی مۆبایل/ }).fill('٠٧٥٠ ١٢٣ ٤٥٦٧');
  await page.getByRole('radio', { name: /کارمەندی پێشوازی/ }).click();
  // The device's branch (B1) is chosen already.
  await expect(page.getByRole('checkbox', { name: /لقی یەکەم/ })).toBeChecked();
  await page.getByRole('button', { name: 'دروستکردنی هەژمار' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('وشەی نهێنیی کاتی').first()).toBeVisible();
  const password = (await dialog.locator('output').textContent()) ?? '';
  expect(password).toMatch(/^[a-z2-9]{14}$/);

  const row = await staffRow(data, 'aram.k');
  expect(row).toMatchObject({
    full_name: 'ئارام کەریم',
    phone: '0750 123 4567',
    is_active: true,
    all_branches: false,
    role_id: await roleId(data, 'receptionist'),
  });

  // Closing the password opens the new staff member's page.
  await dialog.getByRole('button', { name: 'تەواو' }).click();
  await expect(page.getByRole('heading', { name: 'ئارام کەریم' })).toBeVisible();
  await expect(page.locator('[data-staff="aram.k"]')).toBeVisible();

  // On another device they log in with it, and must choose their own password first.
  const other = await browser.newPage();
  await autoRegisterDevices(other);
  await other.goto('/');
  await submitPasswordLogin(other, { gymCode: owner.gymCode, username: 'aram.k', password });
  await expect(
    other.getByRole('heading', { level: 1, name: 'وشەی نهێنیی نوێ دابنێ' }),
  ).toBeVisible();
  await other.close();
});

test('a branch manager changes a staff member, removes their PIN, and deactivates them', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const target = await data.staff({ branchIds: [branchId], fullName: 'هێمن ئەحمەد' });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/staff');

  await page.locator(`[data-staff="${target.username}"]`).click();
  await expect(page.getByRole('heading', { name: 'هێمن ئەحمەد' })).toBeVisible();
  // Only roles the manager may give are offered: never the Owner or Admin.
  await expect(page.getByRole('radio', { name: /کارمەندی پێشوازی/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^خاوەن/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /^بەڕێوەبەر\s/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: /ژمارەی مۆبایل/ }).fill('0770 555 1234');
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('گۆڕانکارییەکان پاشەکەوت کران')).toBeVisible();
  expect((await staffRow(data, target.username)).phone).toBe('0770 555 1234');

  // Their PIN goes; they set a new one at their next password login.
  await page.getByRole('button', { name: 'سڕینەوەی پین' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'سڕینەوەی پین' }).click();
  await expect(page.getByText(`پینی ${target.fullName} سڕایەوە`)).toBeVisible();
  const { data: pins } = await admin()
    .from('staff_pins')
    .select('staff_id')
    .eq('staff_id', target.id);
  expect(pins).toEqual([]);

  await page.getByRole('button', { name: 'ناچالاککردن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ناچالاککردن' }).click();
  await expect(page.getByText(`${target.fullName} ناچالاک کرا`)).toBeVisible();
  expect((await staffRow(data, target.username)).is_active).toBe(false);
  // Deactivated staff leave the default list.
  await expect(page.locator(`[data-staff="${target.username}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'ناچالاک', exact: true }).click();
  await expect(page.locator(`[data-staff="${target.username}"]`)).toBeVisible();

  await page.getByRole('button', { name: 'چالاککردنەوە' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'چالاککردنەوە' }).click();
  await expect(page.getByText(`${target.fullName} چالاک کرایەوە`)).toBeVisible();
  expect((await staffRow(data, target.username)).is_active).toBe(true);
});

test('nobody changes their own account, or someone with more access', async ({ page, data }) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, `/staff/${manager.id}`);

  await expect(page.getByText('ئەمە تۆیت')).toBeVisible();
  await expect(
    page.getByText('ناتوانیت هەژمار و دەسەڵاتەکانی خۆت بگۆڕیت. بەڕێوەبەرێکی تر ئەم کارە دەکات.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'پاشەکەوتکردن' })).toHaveCount(0);

  await page.locator(`[data-staff="${owner.username}"]`).click();
  await expect(page.locator(`[data-staff-detail="${owner.username}"]`)).toBeVisible();
  await expect(
    page.getByText('ئەم کارمەندە ڕۆڵ یان لقێکی هەیە کە تۆ نیتە، بۆیە تەنها دەتوانیت بیبینیت.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'ناچالاککردن' })).toHaveCount(0);
});

test('without staff.view the staff page is closed and not in the menu', async ({ page, staff }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/staff');
  await expect(page.getByTestId('no-access')).toBeVisible();
  await expect(page.getByRole('link', { name: 'کارمەندان' })).toHaveCount(0);
});

test('on a phone the list and a staff member open one at a time', async ({ page, data }) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const target = await data.staff({ branchIds: [branchId], fullName: 'شنۆ عەلی' });
  await page.setViewportSize(PHONE);
  await signIn(page, manager, '/staff');

  await page.locator(`[data-staff="${target.username}"]`).click();
  await expect(page.getByRole('heading', { level: 1, name: 'شنۆ عەلی' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'کارمەندان' })).toHaveCount(0);
  await page.getByRole('link', { name: 'گەڕانەوە بۆ کارمەندان' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'کارمەندان' })).toBeVisible();
});

test('switching staff with a PIN never shows the previous staff member their lists', async ({
  page,
  data,
}) => {
  // Two managers share this device (registered in B2): the Owner sees every branch, the branch
  // manager only B2. A receptionist of B3 is visible to the Owner only.
  const b2 = await data.branch();
  const b3 = await data.branch();
  const manager = await data.staff({
    role: 'branch_manager',
    branchIds: [b2],
    fullName: 'شنۆ عەلی',
  });
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const hidden = await data.staff({ branchIds: [b3], fullName: 'هێمن ئەحمەد' });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager);
  await lockFromMenu(page);
  await page.getByRole('button', { name: 'کارمەندێکی تر' }).click();
  await submitPasswordLogin(page, owner);
  await expect(page.locator('[data-auth-screen]')).toHaveCount(0);

  // The Owner opens the staff list (in the app, so its data stays in memory).
  await page.getByRole('link', { name: 'کارمەندان' }).click();
  await expect(page.locator(`[data-staff="${hidden.username}"]`)).toBeVisible();

  // Locking keeps the page open behind the lock; the manager unlocks with their PIN.
  await lockFromMenu(page);
  await page.getByRole('button', { name: manager.fullName }).click();
  await typePin(page, manager.pin ?? '');
  await expect(page.locator(`[data-staff="${manager.username}"]`)).toBeVisible();
  await expect(page.locator(`[data-staff="${owner.username}"]`)).toBeVisible();
  await expect(page.locator(`[data-staff="${hidden.username}"]`)).toHaveCount(0);
});
