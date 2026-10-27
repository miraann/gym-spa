import { addMember } from './support/members';
import { addPlan, addSale } from './support/sales';
import { expect, signIn, test } from './support/app';

// Receipts and memberships (step 3g): printing an invoice on an 80mm roll in the member's language,
// and members whose subscriptions ended shown and found as expired.

const DESKTOP = { width: 1440, height: 900 };

declare global {
  interface Window {
    /** What the print dialog was opened for (window.print is replaced in these tests). */
    printed?: { text: string; page: string };
  }
}

test('an invoice prints on an 80mm roll, in the member’s language', async ({ page, data }) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const planId = await addPlan(data, 'مانگانە', 35_000);
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501270001');
  await addSale(data, {
    memberId,
    branchId,
    planId,
    nameCkb: 'مانگانە',
    price: 35_000,
    number: 'B2-900001',
    paid: 20_000,
  });
  // The print dialog can't be driven in a test: record what it was opened for instead.
  await page.addInitScript(() => {
    window.print = () => {
      const root = document.getElementById('print-root');
      window.printed = {
        text: root?.innerText ?? '',
        page: root?.querySelector('style')?.textContent ?? '',
      };
    };
  });
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}`);

  const invoice = page.getByTestId('member-money').locator('[data-invoice="B2-900001"]');
  await invoice.locator('summary').click();
  await invoice.getByRole('button', { name: 'چاپکردن' }).click();
  await page.getByRole('menuitem', { name: 'پسوولەی بچووک (80mm)' }).click();
  await expect.poll(() => page.evaluate(() => window.printed?.page ?? '')).toContain('80mm');
  const text = await page.evaluate(() => window.printed?.text ?? '');
  for (const part of [
    'B2-900001',
    'ئارام کەریم',
    'مانگانە',
    '35,000',
    '20,000',
    '15,000',
    'سوپاس',
  ]) {
    expect(text).toContain(part);
  }
});

test('members whose subscriptions ended are expired, and can be listed', async ({ page, data }) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const planId = await addPlan(data, 'مانگانە', 35_000);
  const expired = await addMember(data, branchId, 'شیلان عەلی', '+9647501270002');
  const current = await addMember(data, branchId, 'هێمن جەلال', '+9647501270003');
  await addSale(data, {
    memberId: expired,
    branchId,
    planId,
    nameCkb: 'مانگانە',
    price: 35_000,
    number: 'B2-900002',
    startedDaysAgo: 45,
    paid: 35_000,
  });
  await addSale(data, {
    memberId: current,
    branchId,
    planId,
    nameCkb: 'مانگانە',
    price: 35_000,
    number: 'B2-900003',
    paid: 35_000,
  });
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members?membership=expired`);

  await expect(page.getByTestId('members-total')).toHaveText('1 ئەندام');
  await expect(page.getByText('شیلان عەلی').first()).toBeVisible();
  await expect(page.getByText('هێمن جەلال')).toHaveCount(0);
  await expect(page.locator('[data-membership="expired"]').first()).toHaveText(
    'ئابوونەکەی بەسەرچووە',
  );
});
