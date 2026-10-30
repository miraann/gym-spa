import { admin, type TestData } from './support/backend';
import { expect, signIn, test } from './support/app';

// Branches (step 1e-3): adding one (the server gives its code), changing it, deactivating and
// reactivating it, the last active branch, and the gym's branch limit.

const DESKTOP = { width: 1440, height: 900 };

async function branchRow(data: TestData, code: string) {
  const gym = await data.gym();
  const { data: row } = await admin()
    .from('branches')
    .select('id, name_ckb, name_en, phone, is_active')
    .eq('gym_id', gym.id)
    .eq('code', code)
    .maybeSingle();
  return row;
}

test('an Owner adds a branch, changes it, and keeps one branch active', async ({ page, data }) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/branches');
  await expect(page.getByRole('heading', { level: 1, name: 'لقەکان' })).toBeVisible();

  await page.getByRole('link', { name: 'لقی نوێ' }).click();
  await page.getByLabel('ناو بە کوردی').fill('لقی ئازادی');
  await page.getByLabel(/ناو بە ئینگلیزی/).fill('Azadi');
  await page.getByRole('button', { name: 'دروستکردنی لق' }).click();
  await expect(page.getByText('لقە نوێیەکە دروست کرا')).toBeVisible();
  await expect(page.locator('[data-branch-editor="B2"]')).toBeVisible();
  expect(await branchRow(data, 'B2')).toMatchObject({
    name_ckb: 'لقی ئازادی',
    name_en: 'Azadi',
    is_active: true,
  });

  await page.getByLabel(/ژمارەی تەلەفۆن/).fill('0750 111 2222');
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('لقەکە پاشەکەوت کرا')).toBeVisible();
  await expect.poll(async () => (await branchRow(data, 'B2'))?.phone).toBe('0750 111 2222');

  await page.getByRole('button', { name: 'ناچالاککردن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ناچالاککردن' }).click();
  await expect(page.getByText('لقی ئازادی ناچالاک کرا')).toBeVisible();
  await expect.poll(async () => (await branchRow(data, 'B2'))?.is_active).toBe(false);

  // B1 is now the only active branch: the server keeps it.
  await page.locator('[data-branch="B1"]').click();
  await page.getByRole('button', { name: 'ناچالاککردن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ناچالاککردن' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    'جیمەکە دەبێت لانیکەم یەک لقی چالاکی هەبێت.',
  );
  expect((await branchRow(data, 'B1'))?.is_active).toBe(true);
});

test('the branch limit is shown and kept', async ({ page, data }) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await data.setGym({ max_branches: 1 });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/branches/new');
  await expect(page.getByTestId('branches-limit')).toHaveText('لقی چالاک: 1 لە 1');
  await page.getByLabel('ناو بە کوردی').fill('لقی ئازادی');
  await page.getByRole('button', { name: 'دروستکردنی لق' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'ئەم جیمە گەیشتووەتە زۆرترین ژمارەی لق. بۆ زیادکردن، پەیوەندی بە کلیک گرووپەوە بکە.',
  );
  expect(await branchRow(data, 'B2')).toBeNull();
});

test('without access to all branches, branches are only shown', async ({ page, data }) => {
  const branchId = await data.branch();
  const roleId = await data.role('بەڕێوەبەری لقەکان', ['branches.manage']);
  const manager = await data.staff({ roleId, branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/branches');
  await expect(page.getByRole('link', { name: 'لقی نوێ' })).toHaveCount(0);
  await page.locator('[data-branch="B2"]').click();
  await expect(
    page.getByText('تەنها کەسێک کە دەستی بە هەموو لقەکان دەگات دەتوانێت لق زیاد بکات یان بیگۆڕێت.'),
  ).toBeVisible();
  await expect(page.getByLabel('ناو بە کوردی')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'پاشەکەوتکردن' })).toHaveCount(0);
});
