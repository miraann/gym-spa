import { admin } from './support/backend';
import { expect, signIn, test } from './support/app';

// The shop (steps 8c and 8d): the Owner adds a category and a product, then receives, counts and
// takes out its stock.

const DESKTOP = { width: 1440, height: 900 };

test('the Owner adds a product and keeps its stock', async ({ page, data }) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/shop/products');
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'پۆلی نوێ' }).click();
  await dialog.getByLabel('ناو بە کوردی').fill('خواردنەوە');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('پۆلەکە پاشەکەوت کرا.')).toBeVisible();

  await page.getByRole('button', { name: 'کاڵای نوێ' }).click();
  await dialog.getByLabel('ناو بە کوردی').fill('ئاو');
  await dialog.getByLabel('پۆل', { exact: true }).selectOption({ label: 'خواردنەوە' });
  await dialog.getByLabel('نرخ (دینار)').fill('500');
  await dialog.getByLabel('بارکۆد (ئارەزوومەندانە)').fill('6260001');
  await dialog.getByLabel('ئاستی کەمی کۆگا (ئارەزوومەندانە)').fill('5');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('کاڵاکە پاشەکەوت کرا.')).toBeVisible();
  await expect(page.locator('[data-product="ئاو"]')).toContainText('500');

  // The stock: none yet, so it is low.
  await page.getByRole('link', { name: 'کۆگا' }).click();
  const row = page.locator('[data-stock="ئاو"]');
  await expect(row.locator('[data-stock-count]')).toHaveText('0');
  await expect(row).toContainText('کەمە لە کۆگا');

  await row.getByRole('button', { name: 'وەرگرتنی کاڵا' }).click();
  await dialog.getByLabel('ژمارە', { exact: true }).fill('24');
  await dialog.getByLabel('نرخی کڕینی دانەیەک (دینار، ئارەزوومەندانە)').fill('300');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('کۆگاکە نوێ کرایەوە: 24 ماوە.')).toBeVisible();
  await expect(row.locator('[data-stock-count]')).toHaveText('24');
  await expect(row).not.toContainText('کەمە لە کۆگا');

  await row.getByRole('button', { name: 'ژماردن' }).click();
  await dialog.getByLabel('ئەوەی لە ڕەفەکەیە').fill('22');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(row.locator('[data-stock-count]')).toHaveText('22');

  await row.getByRole('button', { name: 'دەرکردن لە کۆگا' }).click();
  await dialog.getByLabel('ژمارە', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(row.locator('[data-stock-count]')).toHaveText('20');

  const history = page.getByTestId('stock-history');
  await expect(history).toContainText('وەرگیرا');
  await expect(history).toContainText('ژمێردرا');
  await expect(history).toContainText('دەرکرا · تێکچوو');
  const gym = await data.gym();
  const { data: movements } = await admin()
    .from('stock_movements')
    .select('kind, quantity, unit_cost')
    .eq('gym_id', gym.id)
    .order('created_at');
  expect(movements).toEqual([
    { kind: 'receive', quantity: 24, unit_cost: 300 },
    { kind: 'count', quantity: -2, unit_cost: null },
    { kind: 'adjust', quantity: -2, unit_cost: null },
  ]);
});
