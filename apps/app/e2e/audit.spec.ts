import { addMember } from './support/members';
import { expect, signIn, test } from './support/app';

// Step 10e: the activity log: who changed what, filtered by table, with before and after.

const DESKTOP = { width: 1440, height: 900 };

test('the Owner reads who added a member, and what it held', async ({ page, data }) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const branchId = await data.branch();
  await addMember(data, branchId, 'ئارام کەریم', '+9647501620001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/audit');

  await expect(page.getByRole('heading', { name: 'تۆماری چالاکییەکان' })).toBeVisible();
  await page.getByLabel('خشتە').selectOption('members');
  const entry = page.locator('[data-audit-table="members"]').first();
  await expect(entry).toContainText('زیادکرا');
  // Added straight in the database, so nobody did it: the system.
  await expect(entry).toContainText('سیستەم');
  await entry.getByRole('button').click();
  await expect(entry.getByRole('cell', { name: 'ئارام کەریم', exact: true })).toBeVisible();
  await expect(entry.getByRole('columnheader', { name: 'دوای گۆڕان' })).toBeVisible();
});

test('reception has no activity log', async ({ page, data }) => {
  const branchId = await data.branch();
  const reception = await data.staff({ role: 'receptionist', branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, reception, '/audit');
  await expect(page.getByRole('heading', { name: 'تۆماری چالاکییەکان' })).toHaveCount(0);
});
