import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './support/backend';
import { addMember } from './support/members';
import { expect, signIn, test } from './support/app';

// Selling a subscription (step 3d): paid in full, in part with a discount and installments, and in
// dollars with change; the member's page shows the subscription and what they owe.

const DESKTOP = { width: 1440, height: 900 };

async function addPlan(data: TestData, nameCkb: string, price: number): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('plans').insert({
      id,
      gym_id: gym.id,
      name_ckb: nameCkb,
      kind: 'time',
      duration_unit: 'month',
      duration_count: 1,
      price,
      max_freeze_days: 7,
    }),
  );
  return id;
}

async function salesOf(memberId: string) {
  const { data } = await admin()
    .from('invoices')
    .select(
      'number, subtotal, discount, total, payments (number, amount, currency, foreign_amount, change_given), installments (due_date, amount)',
    )
    .eq('member_id', memberId);
  return data ?? [];
}

test('a receptionist sells a monthly plan paid in full, and the member page shows it', async ({
  page,
  data,
  staff,
}) => {
  const branchId = await data.branch();
  await addPlan(data, 'مانگانە', 35_000);
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501240001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}`);

  const card = page.getByTestId('member-subscriptions');
  await expect(card).toContainText('هێشتا هیچ ئابوونەیەکی نییە.');
  await expect(card.getByTestId('member-debt')).toHaveText('هیچ قەرزێکی لەسەر نییە.');
  await card.getByRole('link', { name: 'فرۆشتنی ئابوونە' }).click();

  await expect(page.getByText('بۆ ئارام کەریم')).toBeVisible();
  await page.getByRole('radio', { name: /مانگانە/ }).click();
  await expect(page.getByTestId('sell-ends')).toContainText('دوا ڕۆژی');
  await expect(page.getByTestId('sell-remaining')).toHaveText('0 د.ع');
  await page.getByRole('button', { name: 'فرۆشتن', exact: true }).click();

  await expect(page.getByTestId('sold')).toContainText('ئابوونەکە فرۆشرا');
  await expect(page.getByTestId('sold-invoice')).toHaveText(/^B2-000001$/);
  await expect(page.getByTestId('sold-receipt')).toHaveText(/^B2-R000001$/);
  expect(await salesOf(memberId)).toMatchObject([
    {
      total: 35_000,
      payments: [{ amount: 35_000, currency: 'IQD' }],
      installments: [],
    },
  ]);

  await page.getByRole('link', { name: 'تەواو' }).click();
  const sold = card.locator('[data-subscription="مانگانە"]');
  await expect(sold).toContainText('چالاک');
  await expect(sold).toContainText('B2-000001');
  await expect(card.getByTestId('member-debt')).toHaveText('هیچ قەرزێکی لەسەر نییە.');
});

test('part paid with a discount and installments leaves a debt on the member page', async ({
  page,
  data,
  staff,
}) => {
  const branchId = await data.branch();
  await addPlan(data, 'مانگانە', 35_000);
  const memberId = await addMember(data, branchId, 'شیلان عەلی', '+9647501240002');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}/sell`);

  await page.getByRole('radio', { name: /مانگانە/ }).click();
  // A receptionist gives at most 10% off, with a reason.
  await page.getByLabel('بڕی داشکاندن (دینار)').fill('4000');
  await page.getByRole('button', { name: 'فرۆشتن', exact: true }).click();
  await expect(page.getByText('ئەم داشکاندنە لە دەسەڵاتی تۆ زیاترە.')).toBeVisible();
  await page.getByLabel('بڕی داشکاندن (دینار)').fill('3500');
  await page.getByLabel('هۆکاری داشکاندن').fill('خوێندکارە');

  await page.getByRole('radio', { name: 'بەشێکی ئێستا' }).click();
  await page.getByLabel('بڕی پارە (دینار)').fill('14,500');
  await page.getByLabel('شێوازی پارەدان').selectOption('fib');
  await page.getByLabel('ژمارەی مامەڵە (بە ئارەزووی خۆت)').fill('FIB-1234');
  await page.getByRole('radio', { name: 'بە قیست' }).click();
  await expect(page.getByTestId('sell-installments').getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('sell-remaining')).toHaveText('17,000 د.ع');
  await page.getByRole('button', { name: 'فرۆشتن', exact: true }).click();

  await expect(page.getByTestId('sold')).toBeVisible();
  const [sale] = await salesOf(memberId);
  expect(sale).toMatchObject({
    subtotal: 35_000,
    discount: 3_500,
    total: 31_500,
    payments: [{ amount: 14_500, currency: 'IQD' }],
  });
  expect(sale?.installments.map((each) => each.amount)).toEqual([8_500, 8_500]);

  await page.getByRole('link', { name: 'تەواو' }).click();
  await expect(page.getByTestId('member-subscriptions').getByTestId('member-debt')).toHaveText(
    'قەرزی لەسەرە: 17,000 د.ع',
  );
});

test('dollars pay it all, and the change is shown in dinars', async ({ page, data, staff }) => {
  const branchId = await data.branch();
  await addPlan(data, 'مانگانە', 35_000);
  const memberId = await addMember(data, branchId, 'هێمن جەلال', '+9647501240003');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}/sell`);

  await page.getByRole('radio', { name: /مانگانە/ }).click();
  await page.getByRole('radio', { name: 'دۆلار' }).click();
  await page.getByLabel('بڕی دۆلار').fill('20');
  await page.getByLabel('نرخی دۆلار (دینار بۆ یەک دۆلار)').fill('1,310');
  await page.getByRole('button', { name: 'فرۆشتن', exact: true }).click();
  await expect(page.getByText('ئەم دۆلارانە بەشی هەمووی ناکەن.', { exact: false })).toBeVisible();

  await page.getByLabel('بڕی دۆلار').fill('30');
  await expect(page.getByTestId('sell-usd-value')).toHaveText(
    'دەکاتە 39,300 د.ع · ئەمەی بگەڕێنەرەوە بۆی: 4,300 د.ع',
  );
  await page.getByRole('button', { name: 'فرۆشتن', exact: true }).click();
  await expect(page.getByTestId('sold')).toContainText('ئەمەی بگەڕێنەرەوە بۆی: 4,300 د.ع');
  expect(await salesOf(memberId)).toMatchObject([
    {
      total: 35_000,
      payments: [{ amount: 35_000, currency: 'USD', foreign_amount: 30, change_given: 4_300 }],
    },
  ]);
});

test('staff who may not sell see no sell button', async ({ page, data }) => {
  const branchId = await data.branch();
  const trainer = await data.staff({ role: 'trainer', branchIds: [branchId] });
  const memberId = await addMember(data, branchId, 'چیا عومەر', '+9647501240004');
  await page.setViewportSize(DESKTOP);
  await signIn(page, trainer, `/members/${memberId}`);
  await expect(page.getByTestId('member-subscriptions')).toContainText(
    'هێشتا هیچ ئابوونەیەکی نییە.',
  );
  await expect(page.getByRole('link', { name: 'فرۆشتنی ئابوونە' })).toHaveCount(0);
});
