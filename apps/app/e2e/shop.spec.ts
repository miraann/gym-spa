import { admin, write } from './support/backend';
import { addMember } from './support/members';
import { expect, signIn, test } from './support/app';

// The shop (steps 8c and 8d): the Owner adds a category and a product, receives, counts and takes
// out its stock, and sells at the till to a walk-in and to a member.

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

test('the Owner sells at the till, to a walk-in and to a member', async ({ page, data }) => {
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const gym = await data.gym();
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501480001');
  const water = crypto.randomUUID();
  const towel = crypto.randomUUID();
  await write(
    admin()
      .from('products')
      .insert([
        {
          id: water,
          gym_id: gym.id,
          name_ckb: 'ئاو',
          price: 500,
          barcode: '6260001',
          track_stock: true,
        },
        {
          id: towel,
          gym_id: gym.id,
          name_ckb: 'خاولی',
          price: 1000,
          barcode: null,
          track_stock: false,
        },
      ]),
  );
  // Three bottles in every branch, so the device's branch has them too.
  const { data: branches } = await admin().from('branches').select('id').eq('gym_id', gym.id);
  await write(
    admin()
      .from('stock_movements')
      .insert(
        (branches ?? []).map((branch) => ({
          id: crypto.randomUUID(),
          gym_id: gym.id,
          branch_id: branch.id,
          product_id: water,
          kind: 'receive',
          quantity: 3,
        })),
      ),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/shop');
  const basket = page.getByTestId('basket');
  const waterTile = page.locator('[data-till-product="ئاو"]');

  await waterTile.click();
  await waterTile.click();
  // A scanner types the barcode and Enter.
  await page.getByPlaceholder('گەڕان بە ناو یان بارکۆد').fill('6260001');
  await page.getByPlaceholder('گەڕان بە ناو یان بارکۆد').press('Enter');
  await expect(basket.locator('[data-basket-line="ئاو"] [data-quantity]')).toHaveText('3');
  await waterTile.click();
  await expect(page.getByText('لەوە زیاتر لە کۆگا نییە.')).toBeVisible();
  await page.locator('[data-till-product="خاولی"]').click();
  await expect(page.getByTestId('basket-total')).toContainText('2,500');

  // A walk-in pays it all.
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'پارەدان' }).click();
  await dialog.getByRole('button', { name: 'فرۆشتن', exact: true }).click();
  await expect(page.getByTestId('sold')).toBeVisible();
  await expect(waterTile).toContainText('لە کۆگا نەماوە');
  await expect(waterTile).toBeDisabled();
  const { data: walkIn } = await admin()
    .from('members')
    .select('id')
    .eq('gym_id', gym.id)
    .eq('is_walk_in', true)
    .single();
  const { data: firstSale } = await admin()
    .from('invoices')
    .select('member_id, total, payments (amount)')
    .eq('gym_id', gym.id)
    .single();
  expect(firstSale).toEqual({ member_id: walkIn?.id, total: 2500, payments: [{ amount: 2500 }] });

  // A member may owe it.
  await page.locator('[data-till-product="خاولی"]').click();
  await page.getByRole('button', { name: 'پارەدان' }).click();
  await dialog.getByLabel('ئەندام', { exact: true }).click();
  await dialog.getByLabel('گەڕان بە ناو، ژمارە یان مۆبایل').fill('ئارام');
  await dialog.getByLabel(/ئارام کەریم/).click();
  await dialog.getByLabel('ئێستا پارە دەدات').click();
  await dialog.getByRole('button', { name: 'فرۆشتن', exact: true }).click();
  await expect(page.getByTestId('sold')).toBeVisible();
  const { data: memberSales } = await admin()
    .from('invoices')
    .select('total, payments (amount)')
    .eq('member_id', memberId);
  expect(memberSales).toEqual([{ total: 1000, payments: [] }]);
});
