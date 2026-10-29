import { expect, signIn, test } from './support/app';

// Step 10c: the reports page: the reports a staff member may see, a range, the table with a chart,
// and the Excel download. The numbers themselves are tested in supabase/tests/520-reports.test.sql.

const DESKTOP = { width: 1440, height: 900 };

test("the Owner reads this month's attendance and downloads it as Excel", async ({
  page,
  data,
}) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/reports');

  await expect(page.getByRole('heading', { name: 'ڕاپۆرتەکان' })).toBeVisible();
  // Money reports first for staff who may see money.
  await expect(page.getByRole('button', { name: 'داهات بەپێی سەرچاوە' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('لەم ماوەیەدا هیچ نییە.')).toBeVisible();

  await page.getByRole('button', { name: 'هاتنەکان' }).click();
  const report = page.locator('[data-report="attendance"]');
  await expect(report.getByTestId('report-chart')).toBeVisible();
  const today = Number(new Date(Date.now() + 3 * 3_600_000).toISOString().slice(8, 10));
  // A row for every day of the month so far, and the total.
  await expect(report.getByTestId('report-table').locator('tbody tr')).toHaveCount(today);
  await expect(report.locator('[data-total]').first()).toHaveText('کۆی گشتی');

  const download = page.waitForEvent('download');
  await report.getByRole('button', { name: 'داگرتن بە ئێکسڵ' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^attendance-\d{4}-\d{2}-01-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  await page.getByRole('button', { name: 'ئەمڕۆ', exact: true }).click();
  await expect(report.getByTestId('report-table').locator('tbody tr')).toHaveCount(1);
});

test('reception has no reports', async ({ page, data }) => {
  const branchId = await data.branch();
  const reception = await data.staff({ role: 'receptionist', branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, reception, '/reports');
  await expect(page.getByRole('heading', { name: 'ڕاپۆرتەکان' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'هاتنەکان' })).toHaveCount(0);
});
