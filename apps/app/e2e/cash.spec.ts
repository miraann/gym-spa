import { admin, write } from './support/backend';
import { addMember } from './support/members';
import { openFromMenu, HOME_HEADING, expect, signIn, test } from './support/app';

// The cash register (step 8e): reception opens the drawer with its float, counts blind, takes
// cash out, and closes it; the shift's report shows the difference.

const DESKTOP = { width: 1440, height: 900 };

test('reception opens the cash register, takes cash out and closes it', async ({ page, data }) => {
  const branchId = await data.branch();
  const reception = await data.staff({ role: 'receptionist', branchIds: [branchId] });
  const gym = await data.gym();
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501490001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, reception, '/cash');
  const dialog = page.getByRole('dialog');

  await expect(page.getByTestId('cash-closed')).toContainText('قاسەکە داخراوە.');
  await page.getByRole('button', { name: 'کردنەوەی قاسە' }).click();
  await dialog.getByLabel('پارەی سەرەتا (دینار)').fill('50000');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('قاسەکە کرایەوە.')).toBeVisible();
  const open = page.getByTestId('cash-open');
  await expect(open).toContainText('ئەوەی دەبێت لە قاسەدا هەبێت دوای داخستن پیشان دەدرێت.');

  // 10,000 in cash taken at the branch while it is open.
  const invoiceId = crypto.randomUUID();
  await write(
    admin().from('invoices').insert({
      id: invoiceId,
      gym_id: gym.id,
      branch_id: branchId,
      member_id: memberId,
      number: 'B9-000001',
      subtotal: 10000,
      total: 10000,
    }),
  );
  await write(
    admin().from('payments').insert({
      id: crypto.randomUUID(),
      gym_id: gym.id,
      branch_id: branchId,
      member_id: memberId,
      invoice_id: invoiceId,
      number: 'B9-R000001',
      method: 'cash',
      amount: 10000,
    }),
  );
  // Away and back (a reload would lock the app), so the report is read again.
  await openFromMenu(page, 'سەرەکی');
  await expect(page).toHaveURL(/\/$/);
  // The home page is on screen, so the cash page has really gone (under load the URL changes
  // first, and a page that never left reads nothing again).
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await openFromMenu(page, 'قاسە');
  await expect(page).toHaveURL(/\/cash$/);
  await expect(open.getByTestId('cash-methods')).toContainText('کاش (1)');

  await open.getByRole('button', { name: 'دەرهێنان لە قاسە' }).click();
  await dialog.getByLabel('بڕ').fill('5000');
  await dialog.getByLabel('هۆکار').fill('کڕینی پاککەرەوە');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('تۆمار کرا.')).toBeVisible();

  // 50,000 + 10,000 - 5,000 should be there; 54,000 is counted.
  await open.getByRole('button', { name: 'داخستنی قاسە' }).click();
  await dialog.getByLabel('دیناری ژمێردراو').fill('54000');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('قاسەکە داخرا.')).toBeVisible();
  const report = dialog.getByTestId('cash-report');
  await expect(report.locator('[data-expected-iqd]')).toContainText('55,000');
  await expect(report.locator('[data-difference-iqd]')).toContainText('کەمە');
  await expect(report.locator('[data-difference-iqd]')).toContainText('1,000');
  await dialog.getByRole('button', { name: 'تەواو' }).click();

  await expect(page.getByTestId('cash-closed')).toBeVisible();
  await expect(page.locator('[data-cash-shift]')).toContainText('کەمە');
  const { data: shifts } = await admin()
    .from('cash_shifts')
    .select('opening_iqd, expected_iqd, counted_iqd')
    .eq('gym_id', gym.id);
  expect(shifts).toEqual([{ opening_iqd: 50000, expected_iqd: 55000, counted_iqd: 54000 }]);
});
