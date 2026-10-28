import { admin, write, type TestData } from './support/backend';
import { addMember } from './support/members';
import { addPlan, addSale } from './support/sales';
import { expect, signIn, test } from './support/app';

// Lockers (Phase 5): the owner adds lockers and sets the rent, a locker is rented and released, a
// receptionist gives a daily locker, and the end-of-day list releases yesterday's.

const DESKTOP = { width: 1440, height: 900 };

/** Daily lockers 1 to `count` for men in the branch, added directly. */
async function addLockers(data: TestData, branchId: string, count: number) {
  const gym = await data.gym();
  await write(
    admin()
      .from('lockers')
      .insert(
        Array.from({ length: count }, (_, index) => ({
          id: crypto.randomUUID(),
          gym_id: gym.id,
          branch_id: branchId,
          number: String(index + 1),
          zone: 'men',
          kind: 'daily',
        })),
      ),
  );
}

test('the owner adds lockers, sets the rent, rents one out and releases it', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await addMember(data, branchId, 'ئارام کەریم', '+9647501260001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/lockers');
  const dialog = page.getByRole('dialog');

  await expect(page.getByText('هێشتا هیچ دۆڵابێک لەم لقەدا زیاد نەکراوە.')).toBeVisible();
  await page.getByRole('button', { name: 'زیادکردنی دۆڵاب' }).first().click();
  await dialog.getByRole('radio', { name: 'تێکەڵ' }).click();
  await dialog.getByRole('radio', { name: 'بەکرێ' }).click();
  await dialog.getByLabel('پیت لە پێش ژمارە (ئارەزوومەندانە)').fill('r');
  await dialog.getByLabel('لە ژمارە').fill('1');
  await dialog.getByLabel('تا ژمارە').fill('3');
  await expect(dialog.getByText('R1 تا R3، 3 دۆڵاب')).toBeVisible();
  await dialog.getByRole('button', { name: 'زیادکردن' }).click();
  await expect(page.getByText('3 دۆڵاب زیاد کران.')).toBeVisible();
  await expect(page.locator('[data-locker]')).toHaveCount(3);

  // Renting needs the month's price first.
  await page.getByRole('button', { name: 'دۆڵابی R1، بەتاڵ' }).click();
  await dialog.getByRole('button', { name: 'بەکرێدان' }).click();
  await expect(dialog.getByText(/هێشتا کرێی دۆڵاب دانەنراوە/)).toBeVisible();
  await dialog.getByRole('button', { name: 'گەڕانەوە' }).click();
  await dialog.getByRole('button', { name: 'داخستن' }).first().click();
  await page.getByRole('button', { name: 'نرخەکان' }).click();
  await dialog.getByLabel('کرێی مانگانە (دینار)').fill('20,000');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('نرخەکان پاشەکەوت کران.')).toBeVisible();

  await page.getByRole('button', { name: 'دۆڵابی R1، بەتاڵ' }).click();
  await dialog.getByRole('button', { name: 'بەکرێدان' }).click();
  await dialog.getByLabel('ئەندام بدۆزەرەوە: ناو، ژمارە یان مۆبایل').fill('ئارام');
  await dialog.getByRole('radio', { name: /ئارام کەریم/ }).click();
  await dialog.getByLabel('چەند مانگ').selectOption('2');
  await expect(dialog.getByText('40,000 د.ع')).toBeVisible();
  await dialog.getByRole('button', { name: 'بەکرێدان' }).click();
  await expect(page.getByText(/دۆڵابی R1 بەکرێ درا\. پسوولە B\d+-\d{6}\./)).toBeVisible();
  await expect(page.locator('[data-locker="R1"]')).toHaveAttribute('data-status', 'occupied');

  const { data: invoices } = await admin()
    .from('invoice_items')
    .select('kind, total, invoices!inner (gym_id)')
    .eq('invoices.gym_id', (await data.gym()).id);
  expect(invoices).toMatchObject([{ kind: 'locker', total: 40_000 }]);

  await page.getByRole('button', { name: 'دۆڵابی R1، گیراو' }).click();
  await expect(dialog.getByText('ئارام کەریم')).toBeVisible();
  await dialog.getByRole('button', { name: 'بەتاڵکردنەوە' }).click();
  await expect(page.getByText('دۆڵابی R1 بەتاڵ کرایەوە.')).toBeVisible();
  await expect(page.locator('[data-locker="R1"]')).toHaveAttribute('data-status', 'free');
});

test('a receptionist gives a daily locker, and the end-of-day list releases yesterday’s', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const gym = await data.gym();
  await addLockers(data, branchId, 4);
  const memberId = await addMember(data, branchId, 'شوان ئەحمەد', '+9647501260002');
  const lateId = await addMember(data, branchId, 'دلێر حەسەن', '+9647501260003');
  // Locker 4 was given yesterday and never given back.
  const { data: four } = await admin()
    .from('lockers')
    .select('id')
    .eq('branch_id', branchId)
    .eq('number', '4')
    .single();
  const yesterday = new Date(Date.now() - 86_400_000);
  await write(
    admin()
      .from('locker_assignments')
      .insert({
        id: crypto.randomUUID(),
        gym_id: gym.id,
        branch_id: branchId,
        locker_id: four?.id ?? '',
        member_id: lateId,
        kind: 'daily',
        starts_on: yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }),
        assigned_at: yesterday.toISOString(),
      }),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/lockers');
  const dialog = page.getByRole('dialog');

  // Reception neither adds lockers nor sets prices.
  await expect(page.locator('[data-locker]')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'زیادکردنی دۆڵاب' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'نرخەکان' })).toHaveCount(0);

  await page.getByRole('button', { name: 'دۆڵابی 1، بەتاڵ' }).click();
  await dialog.getByRole('button', { name: 'پێدانی دۆڵاب' }).click();
  await dialog.getByLabel('ئەندام بدۆزەرەوە: ناو، ژمارە یان مۆبایل').fill('شوان');
  await dialog.getByRole('radio', { name: /شوان ئەحمەد/ }).click();
  await dialog.getByRole('button', { name: 'پێدان', exact: true }).click();
  await expect(page.getByText('دۆڵابی 1 درا بە شوان ئەحمەد.')).toBeVisible();
  await expect(page.locator('[data-locker="1"]')).toHaveAttribute('data-status', 'occupied');
  const { data: given } = await admin()
    .from('locker_assignments')
    .select('member_id, kind, released_at')
    .eq('member_id', memberId);
  expect(given).toMatchObject([{ kind: 'daily', released_at: null }]);

  const notReturned = page.getByTestId('not-returned');
  await expect(notReturned).toContainText('نەگەڕێنراوەتەوە: 1');
  await expect(notReturned).toContainText('دلێر حەسەن');
  await expect(page.locator('[data-locker="4"]')).toHaveAttribute('data-status', 'overdue');
  await notReturned.getByRole('button', { name: 'بەتاڵکردنەوەی دۆڵابە ڕۆژانەکان (1)' }).click();
  await expect(page.getByText('1 دۆڵاب بەتاڵ کرانەوە.')).toBeVisible();
  await expect(notReturned).toHaveCount(0);
  await expect(page.locator('[data-locker="4"]')).toHaveAttribute('data-status', 'free');
  await expect(page.locator('[data-locker="1"]')).toHaveAttribute('data-status', 'occupied');
});

test('the check-in result gives the member a daily locker, shown on their page', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  await addLockers(data, branchId, 2);
  const planId = await addPlan(data, 'مانگانە', 35_000);
  const memberId = await addMember(data, branchId, 'هێمن جەلال', '+9647501260004');
  await addSale(data, {
    memberId,
    branchId,
    planId,
    nameCkb: 'مانگانە',
    price: 35_000,
    number: 'B2-900601',
    paid: 35_000,
  });
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/checkin');

  await page.getByLabel('ناو، ژمارەی ئەندام یان مۆبایل').fill('هێمن');
  await page.getByRole('button', { name: 'تۆمارکردنی هاتن: هێمن جەلال' }).click();
  const result = page.locator('[data-checkin-result]');
  await expect(result).toHaveAttribute('data-checkin-result', 'allowed');
  await result.getByRole('button', { name: 'پێدانی دۆڵابی 1' }).click();
  await expect(result.getByTestId('checkin-locker')).toHaveText('دۆڵابی 1 درا.');
  const { data: given } = await admin()
    .from('locker_assignments')
    .select('kind, attendance_id')
    .eq('member_id', memberId);
  expect(given).toHaveLength(1);
  expect(given?.[0]?.attendance_id).not.toBeNull();

  // The member's page, through today's visits (a reload would lock the app).
  await result.getByRole('button', { name: 'داخستن' }).click();
  await page.getByRole('link', { name: 'هاتنەکانی ئەمڕۆ' }).click();
  await page.getByRole('link', { name: 'هێمن جەلال' }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${memberId}$`));
  await expect(page.getByTestId('member-lockers')).toContainText('دۆڵابی 1');
});
