import { randomUUID } from 'node:crypto';
import { planEndDate } from '@gym/core';
import { admin, write, type TestData } from './support/backend';
import { addMember } from './support/members';
import { expect, signIn, test } from './support/app';

// Changing subscriptions (step 3f): freezing and unfreezing, renewing, changing the plan with the
// unused part taken off, transferring to another member and cancelling with money back.

const DESKTOP = { width: 1440, height: 900 };
const DAY = 86_400_000;
const dateIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

async function addPlan(data: TestData, nameCkb: string, price: number, months: number) {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('plans').insert({
      id,
      gym_id: gym.id,
      name_ckb: nameCkb,
      kind: 'time',
      duration_unit: 'month',
      duration_count: months,
      price,
      max_freeze_days: 10,
    }),
  );
  return id;
}

/** A month of `planId` from `startedDaysAgo` days ago, paid in full in cash, as a sale leaves it. */
async function addPaidMonth(
  data: TestData,
  memberId: string,
  branchId: string,
  planId: string,
  number: string,
  startedDaysAgo: number,
) {
  const gym = await data.gym();
  const subscriptionId = randomUUID();
  const invoiceId = randomUUID();
  const start = dateIn(-startedDaysAgo);
  await write(
    admin()
      .from('subscriptions')
      .insert({
        id: subscriptionId,
        gym_id: gym.id,
        member_id: memberId,
        plan_id: planId,
        branch_id: branchId,
        name_ckb: 'مانگانە',
        kind: 'time',
        duration_unit: 'month',
        duration_count: 1,
        price: 30_000,
        gender: 'any',
        max_freeze_days: 10,
        start_date: start,
        end_date: planEndDate(start, 'month', 1),
      }),
  );
  await write(
    admin().from('invoices').insert({
      id: invoiceId,
      gym_id: gym.id,
      branch_id: branchId,
      member_id: memberId,
      number,
      subtotal: 30_000,
      total: 30_000,
    }),
  );
  await write(
    admin().from('invoice_items').insert({
      gym_id: gym.id,
      invoice_id: invoiceId,
      kind: 'subscription',
      subscription_id: subscriptionId,
      description_ckb: 'مانگانە',
      unit_price: 30_000,
      total: 30_000,
    }),
  );
  await write(
    admin()
      .from('payments')
      .insert({
        id: randomUUID(),
        gym_id: gym.id,
        branch_id: branchId,
        member_id: memberId,
        invoice_id: invoiceId,
        number: number.replace('-', '-R'),
        method: 'cash',
        amount: 30_000,
      }),
  );
  return subscriptionId;
}

async function statusOf(subscriptionId: string) {
  const { data } = await admin()
    .from('subscriptions')
    .select('status, end_date')
    .eq('id', subscriptionId)
    .single();
  return data;
}

test('a receptionist freezes a subscription and unfreezes it, and renews it', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const planId = await addPlan(data, 'مانگانە', 30_000, 1);
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501260001');
  const subscriptionId = await addPaidMonth(data, memberId, branchId, planId, 'B2-900001', 5);
  const before = await statusOf(subscriptionId);
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}`);
  const row = page.getByTestId('member-subscriptions').locator('[data-subscription="مانگانە"]');
  const dialog = page.getByRole('dialog');

  await row.getByRole('button', { name: 'کارەکانی ئابوونە' }).click();
  await page.getByRole('menuitem', { name: 'وەستاندنی کاتی' }).click();
  await dialog.getByLabel('چەند ڕۆژ').fill('11');
  await dialog.getByRole('button', { name: 'وەستاندن' }).click();
  await expect(dialog.getByText('ژمارەی ڕۆژ دەبێت لە 1 تا 10 بێت.')).toBeVisible();
  await dialog.getByLabel('چەند ڕۆژ').fill('5');
  await dialog.getByRole('button', { name: 'وەستاندن' }).click();
  await expect(row.locator('[data-subscription-state]')).toHaveText('وەستێنراوە');
  expect((await statusOf(subscriptionId))?.end_date).toBe(
    new Date(Date.parse(`${before?.end_date ?? ''}T00:00:00Z`) + 5 * DAY)
      .toISOString()
      .slice(0, 10),
  );

  await row.getByRole('button', { name: 'کارەکانی ئابوونە' }).click();
  await page.getByRole('menuitem', { name: 'دەستپێکردنەوە' }).click();
  await dialog.getByRole('button', { name: 'دەستپێکردنەوە' }).click();
  await expect(row.locator('[data-subscription-state]')).toHaveText('چالاک');
  expect((await statusOf(subscriptionId))?.end_date).toBe(before?.end_date);

  // Renewing opens the sale with the same plan, after the current one.
  await row.getByRole('button', { name: 'کارەکانی ئابوونە' }).click();
  await page.getByRole('menuitem', { name: 'نوێکردنەوە' }).click();
  await expect(page.getByRole('radio', { name: /مانگانە/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'دوای ئابوونەکەی ئێستا' })).toBeChecked();
});

test('a manager changes the plan, with the unused days taken off the new price', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const monthly = await addPlan(data, 'مانگانە', 30_000, 1);
  await addPlan(data, 'سێ مانگ', 81_000, 3);
  const memberId = await addMember(data, branchId, 'شیلان عەلی', '+9647501260002');
  const subscriptionId = await addPaidMonth(data, memberId, branchId, monthly, 'B2-900002', 0);
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, `/members/${memberId}`);
  const dialog = page.getByRole('dialog');

  const row = page.getByTestId('member-subscriptions').locator('[data-subscription="مانگانە"]');
  await row.getByRole('button', { name: 'کارەکانی ئابوونە' }).click();
  await page.getByRole('menuitem', { name: 'گۆڕینی پلان' }).click();
  // Started today and paid: all of it is unused.
  await expect(page.getByTestId('change-preview')).toContainText('بەشی بەکارنەهێنراو: 30,000 د.ع');
  await dialog.getByRole('radio', { name: /سێ مانگ/ }).click();
  await expect(page.getByTestId('change-total')).toHaveText('دەبێت بدرێت: 51,000 د.ع');
  await dialog.getByRole('button', { name: 'گۆڕینی پلان' }).click();
  await expect(page.getByText(/^پلانەکە گۆڕدرا، پسوولەی B2-000001$/)).toBeVisible();

  expect((await statusOf(subscriptionId))?.status).toBe('replaced');
  const card = page.getByTestId('member-subscriptions');
  await expect(card.locator('[data-subscription="سێ مانگ"] [data-subscription-state]')).toHaveText(
    'چالاک',
  );
  const { data: invoice } = await admin()
    .from('invoices')
    .select('discount, total')
    .eq('number', 'B2-000001')
    .eq('member_id', memberId)
    .single();
  expect(invoice).toMatchObject({ discount: 30_000, total: 51_000 });
});

test('a manager transfers a subscription to another member', async ({ page, data }) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const monthly = await addPlan(data, 'مانگانە', 30_000, 1);
  const memberId = await addMember(data, branchId, 'هێمن جەلال', '+9647501260003');
  await addMember(data, branchId, 'دیار حەسەن', '+9647501260004');
  const subscriptionId = await addPaidMonth(data, memberId, branchId, monthly, 'B2-900003', 0);
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, `/members/${memberId}`);
  const dialog = page.getByRole('dialog');
  const row = page.getByTestId('member-subscriptions').locator('[data-subscription="مانگانە"]');

  await row.getByRole('button', { name: 'کارەکانی ئابوونە' }).click();
  await page.getByRole('menuitem', { name: 'گواستنەوە بۆ ئەندامێکی تر' }).click();
  await dialog.getByLabel('بگەڕێ بە ناو، ژمارەی ئەندام یان مۆبایل').fill('دیار');
  await dialog.getByRole('radio', { name: 'دیار حەسەن' }).click();
  await dialog.getByLabel('هۆکار', { exact: true }).fill('براکەی');
  await dialog.getByRole('button', { name: 'گواستنەوە' }).click();
  await expect(page.getByText('ئابوونەکە گوازرایەوە بۆ دیار حەسەن')).toBeVisible();
  expect((await statusOf(subscriptionId))?.status).toBe('transferred');
  await expect(row.locator('[data-subscription-state]')).toHaveText('گوازرایەوە');
});

test('a manager cancels a subscription and gives the money back', async ({ page, data }) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const monthly = await addPlan(data, 'مانگانە', 30_000, 1);
  const memberId = await addMember(data, branchId, 'ڤیان سەردار', '+9647501260005');
  const subscriptionId = await addPaidMonth(data, memberId, branchId, monthly, 'B2-900004', 0);
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, `/members/${memberId}`);
  const dialog = page.getByRole('dialog');
  const row = page.getByTestId('member-subscriptions').locator('[data-subscription="مانگانە"]');

  await row.getByRole('button', { name: 'کارەکانی ئابوونە' }).click();
  await page.getByRole('menuitem', { name: 'هەڵوەشاندنەوە' }).click();
  await expect(page.getByTestId('cancel-preview')).toContainText(
    'دەتوانرێت بگەڕێنرێتەوە: 30,000 د.ع',
  );
  await dialog.getByRole('button', { name: 'هەڵوەشاندنەوە' }).click();
  await expect(dialog.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await dialog.getByLabel('هۆکار', { exact: true }).fill('نەخۆش کەوت');
  await dialog.getByLabel('پارە ئێستا بگەڕێنەرەوە').check();
  await dialog.getByRole('button', { name: 'هەڵوەشاندنەوە' }).click();
  await expect(page.getByText('ئابوونەکە هەڵوەشێنرایەوە')).toBeVisible();
  expect((await statusOf(subscriptionId))?.status).toBe('cancelled');
  const { data: refunds } = await admin()
    .from('payments')
    .select('amount, reason')
    .eq('member_id', memberId)
    .eq('kind', 'refund');
  expect(refunds).toEqual([{ amount: 30_000, reason: 'نەخۆش کەوت' }]);
});
