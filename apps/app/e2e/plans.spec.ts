import { admin, type TestData } from './support/backend';
import { expect, signIn, test } from './support/app';

// Plans (step 3b): adding a monthly plan and a hybrid one with rules, changing a price, taking a
// plan off sale, and who sees the plans page.

const DESKTOP = { width: 1440, height: 900 };

async function planRow(data: TestData, nameCkb: string) {
  const gym = await data.gym();
  const { data: row } = await admin()
    .from('plans')
    .select(
      'id, kind, duration_unit, duration_count, visit_count, price, gender, all_branches, allowed_days, allowed_from, allowed_until, daily_visit_limit, max_freeze_days, is_active, plan_branches (branch_id)',
    )
    .eq('gym_id', gym.id)
    .eq('name_ckb', nameCkb)
    .maybeSingle();
  return row;
}

test('an Owner adds plans with their rules, changes a price and takes one off sale', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/plans');
  await expect(page.getByRole('heading', { level: 1, name: 'پلانەکان' })).toBeVisible();
  await expect(page.getByText('هێشتا هیچ پلانێک نییە')).toBeVisible();

  // A monthly plan: the form starts as one.
  await page.getByRole('link', { name: 'پلانی نوێ' }).first().click();
  await page.getByLabel('ناو بە کوردی').fill('مانگانە');
  await expect(page.getByTestId('plan-ends-preview')).toContainText('ئەگەر ئەمڕۆ دەست پێ بکات');
  await page.getByLabel('نرخ (دینار)').fill('35,000');
  await page.getByLabel('زۆرترین ڕۆژی وەستاندنی کاتی').fill('7');
  await page.getByRole('button', { name: 'زیادکردنی پلان' }).click();
  await expect(page.getByText('پلانە نوێیەکە زیاد کرا')).toBeVisible();
  await expect(page.locator('[data-plan-editor="مانگانە"]')).toBeVisible();
  expect(await planRow(data, 'مانگانە')).toMatchObject({
    kind: 'time',
    duration_unit: 'month',
    duration_count: 1,
    visit_count: null,
    price: 35_000,
    gender: 'any',
    all_branches: true,
    max_freeze_days: 7,
    is_active: true,
  });
  const list = page.getByRole('list', { name: 'پلانەکان' });
  await expect(list.locator('[data-plan="مانگانە"]')).toContainText('مانگێک');

  // A hybrid plan for women, three mornings a week, in one branch.
  await page.getByRole('link', { name: 'پلانی نوێ' }).click();
  await expect(page.locator('[data-plan-editor="new"]')).toBeVisible();
  await page.getByLabel('ناو بە کوردی').fill('بیست جار لە دوو مانگدا');
  await page.getByRole('radio', { name: 'ماوە و ژمارەی هاتن' }).click();
  await page.getByLabel('ژمارە', { exact: true }).fill('2');
  await page.getByRole('textbox', { name: 'ژمارەی هاتن' }).fill('20');
  await page.getByLabel('نرخ (دینار)').fill('60000');
  await page.getByRole('radio', { name: 'ئافرەتان' }).click();
  await page.getByRole('radio', { name: 'تەنها ئەم لقانە' }).click();
  // Nothing chosen yet: the form says so.
  await page.getByRole('radio', { name: 'تەنها ئەم ڕۆژانە' }).click();
  await page.getByRole('button', { name: 'زیادکردنی پلان' }).click();
  await expect(page.getByText('لانیکەم یەک لق هەڵبژێرە.')).toBeVisible();
  await expect(page.getByText('لانیکەم یەک ڕۆژ هەڵبژێرە.')).toBeVisible();
  // The test's own branch, B2 (the gym's first is B1).
  await page
    .getByRole('group', { name: 'تەنها ئەم لقانە' })
    .getByLabel('لقی تاقیکردنەوە B2')
    .check();
  for (const day of ['شەممە', 'دووشەممە', 'چوارشەممە']) {
    await page.getByRole('button', { name: day, exact: true }).click();
  }
  await page.getByRole('radio', { name: 'تەنها لەم کاتەدا' }).click();
  await page.getByLabel('لە', { exact: true }).fill('08:00');
  await page.getByLabel('تا', { exact: true }).fill('12:00');
  await page.getByRole('button', { name: 'زیادکردنی پلان' }).click();
  await expect(page.locator('[data-plan-editor="بیست جار لە دوو مانگدا"]')).toBeVisible();
  expect(await planRow(data, 'بیست جار لە دوو مانگدا')).toMatchObject({
    kind: 'hybrid',
    duration_unit: 'month',
    duration_count: 2,
    visit_count: 20,
    price: 60_000,
    gender: 'female',
    all_branches: false,
    allowed_days: [1, 3, 6],
    allowed_from: '08:00:00',
    allowed_until: '12:00:00',
    plan_branches: [{ branch_id: branchId }],
  });
  await expect(list.locator('[data-plan="بیست جار لە دوو مانگدا"]')).toContainText(
    '20 جار لە 2 مانگدا',
  );

  // The monthly plan gets dearer, then goes off sale.
  await list.locator('[data-plan="مانگانە"]').click();
  await expect(page.locator('[data-plan-editor="مانگانە"]')).toBeVisible();
  await page.getByLabel('نرخ (دینار)').fill('40000');
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('پلانەکە پاشەکەوت کرا')).toBeVisible();
  await page.getByLabel('ئەم پلانە دەفرۆشرێت').uncheck();
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  // The first save's message may still be showing: wait for the row itself.
  await expect
    .poll(() => planRow(data, 'مانگانە'))
    .toMatchObject({ price: 40_000, is_active: false });
  await expect(
    page.getByRole('list', { name: 'ئەوانەی نافرۆشرێن' }).locator('[data-plan="مانگانە"]'),
  ).toContainText('نافرۆشرێت');
});

test('a receptionist has no plans page', async ({ page, staff }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff);
  await expect(page.getByRole('link', { name: 'پلانەکان' })).toHaveCount(0);
});
