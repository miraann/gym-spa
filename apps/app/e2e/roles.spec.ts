import { admin, type TestData } from './support/backend';
import { expect, signIn, test } from './support/app';

// Roles and permissions (step 1e-2): the permission table (خشتەی دەسەڵاتەکان), custom roles, and
// the roles nobody may change here.

const DESKTOP = { width: 1440, height: 900 };

async function rolePermissions(data: TestData, nameCkb: string) {
  const gym = await data.gym();
  const { data: role } = await admin()
    .from('roles')
    .select('id, deleted_at, role_permissions(permission_key)')
    .eq('gym_id', gym.id)
    .eq('name_ckb', nameCkb)
    .single();
  if (!role) throw new Error(`No role ${nameCkb}`);
  return {
    deletedAt: role.deleted_at,
    keys: role.role_permissions.map((row) => row.permission_key).sort(),
  };
}

async function builtInKeys(data: TestData, key: string): Promise<string[]> {
  const gym = await data.gym();
  const { data: role } = await admin()
    .from('roles')
    .select('role_permissions(permission_key)')
    .eq('gym_id', gym.id)
    .eq('key', key)
    .single();
  return (role?.role_permissions ?? []).map((row) => row.permission_key).sort();
}

test('an Admin makes a role from another role, changes it, and deletes it', async ({
  page,
  data,
}) => {
  const manager = await data.staff({ role: 'admin', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/roles');
  await expect(page.getByRole('heading', { level: 1, name: 'ڕۆڵ و دەسەڵاتەکان' })).toBeVisible();

  await page.getByRole('link', { name: 'ڕۆڵی نوێ' }).click();
  await page.getByLabel('ناو بە کوردی').fill('یارمەتیدەر');
  await page.getByRole('button', { name: 'کارمەندی پێشوازی' }).click();
  await expect(page.getByRole('checkbox', { name: 'بینینی ئەندامان' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'گەڕاندنەوەی پارە' }).click();
  await page.getByRole('button', { name: 'دروستکردنی ڕۆڵ' }).click();
  await expect(page.getByText('ڕۆڵەکە پاشەکەوت کرا')).toBeVisible();

  const receptionist = await builtInKeys(data, 'receptionist');
  expect((await rolePermissions(data, 'یارمەتیدەر')).keys).toEqual(
    [...receptionist, 'payments.refund'].sort(),
  );

  // Its page opened; a whole module can be switched off at once.
  await expect(page.locator('[data-role-editor="یارمەتیدەر"]')).toBeVisible();
  await page.getByRole('checkbox', { name: 'هەموو دەسەڵاتەکانی پارەدانەکان' }).click();
  await page.getByRole('checkbox', { name: 'هەموو دەسەڵاتەکانی پارەدانەکان' }).click();
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  // The first save's message may still be showing: wait for the database itself.
  await expect
    .poll(async () => (await rolePermissions(data, 'یارمەتیدەر')).keys)
    .toEqual(receptionist.filter((key) => !key.startsWith('payments.')));

  await page.getByRole('button', { name: 'سڕینەوەی ڕۆڵ' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'سڕینەوەی ڕۆڵ' }).click();
  await expect(page.getByText('ڕۆڵی یارمەتیدەر سڕایەوە')).toBeVisible();
  expect((await rolePermissions(data, 'یارمەتیدەر')).deletedAt).not.toBeNull();
  await expect(page.locator('[data-role="یارمەتیدەر"]')).toHaveCount(0);
});

test('the Owner role and your own role say why they cannot change', async ({ page, data }) => {
  const manager = await data.staff({ role: 'admin', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/roles');

  await page.locator('[data-role="owner"]').click();
  await expect(
    page.getByText('خاوەن هەموو دەسەڵاتەکانی هەیە، ئەوانەش کە دواتر زیاد دەکرێن.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'گەڕاندنەوەی پارە' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'گەڕاندنەوەی پارە' })).toBeDisabled();

  await page.locator('[data-role="admin"]').click();
  await expect(
    page.getByText('ناتوانیت دەسەڵاتەکانی ڕۆڵی خۆت بگۆڕیت. بەڕێوەبەرێکی تر ئەم کارە دەکات.'),
  ).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'بینینی ئەندامان' })).toBeDisabled();
});

test('only permissions you have can be given', async ({ page, data }) => {
  const keeperRole = await data.role('ڕێکخەری ڕۆڵ', ['roles.manage', 'members.view']);
  const keeper = await data.staff({ roleId: keeperRole, branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, keeper, '/roles/new');

  await expect(page.getByRole('checkbox', { name: 'بینینی ئەندامان' })).toBeEnabled();
  const refund = page.getByRole('checkbox', { name: 'گەڕاندنەوەی پارە' });
  await expect(refund).toBeDisabled();
  await expect(page.locator('[data-permission="payments.refund"]')).toContainText('خۆت نیتە');
});

test('without roles.manage the roles page is closed', async ({ page, data }) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/roles');
  await expect(page.getByTestId('no-access')).toBeVisible();
});
