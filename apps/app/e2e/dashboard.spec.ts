import { addMember } from './support/members';
import { expect, signIn, test } from './support/app';

// Step 10a: the home page's dashboard, with each number only for staff who may see it.

const DESKTOP = { width: 1440, height: 900 };

test('the Owner sees today on the dashboard: members, check-ins by hour and the takings', async ({
  page,
  data,
}) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const branchId = await data.branch();
  await addMember(data, branchId, 'ئارام کەریم', '+9647501610001');
  await addMember(data, branchId, 'شیلان عەلی', '+9647501610002');
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/');

  await expect(page.getByTestId('stat-active-members')).toContainText('2');
  await expect(page.getByTestId('stat-active-members')).toContainText('2 ئەندامی نوێ لەم مانگەدا');
  await expect(page.getByTestId('stat-checkins').locator('[data-value]')).toHaveText('0');
  await expect(page.getByTestId('stat-takings').locator('[data-value]')).toHaveText('0 د.ع');
  await expect(page.getByRole('heading', { name: 'هاتنەکانی ئەمڕۆ بەپێی کاتژمێر' })).toBeVisible();
});

test('a trainer has no dashboard, only the shortcuts', async ({ page, data }) => {
  const branchId = await data.branch();
  const trainer = await data.staff({ role: 'trainer', branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, trainer, '/');
  await expect(page.getByRole('heading', { name: 'کارە خێراکان' })).toBeVisible();
  await expect(page.getByTestId('stat-active-members')).toHaveCount(0);
  await expect(page.getByTestId('stat-takings')).toHaveCount(0);
});
