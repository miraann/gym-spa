import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './support/backend';
import { addCard, addMember } from './support/members';
import { expect, scanCard, signIn, test } from './support/app';

// Payments and debts (step 3e): paying what is owed (dinars, then dollars with change), voiding
// today's mistakes and giving money back, the card replacement fee, and the payments page.

const DESKTOP = { width: 1440, height: 900 };

/** An invoice for a monthly plan sold on credit, in two installments: as a sale leaves it. */
async function addDebt(data: TestData, memberId: string, branchId: string, number: string) {
  const gym = await data.gym();
  const planId = randomUUID();
  const subscriptionId = randomUUID();
  const invoiceId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const inDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  await write(
    admin().from('plans').insert({
      id: planId,
      gym_id: gym.id,
      name_ckb: 'مانگانە',
      kind: 'time',
      duration_unit: 'month',
      duration_count: 1,
      price: 40_000,
    }),
  );
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
        price: 40_000,
        gender: 'any',
        max_freeze_days: 0,
        start_date: today,
        end_date: inDays(29),
      }),
  );
  await write(
    admin().from('invoices').insert({
      id: invoiceId,
      gym_id: gym.id,
      branch_id: branchId,
      member_id: memberId,
      number,
      subtotal: 40_000,
      total: 40_000,
    }),
  );
  await write(
    admin().from('invoice_items').insert({
      gym_id: gym.id,
      invoice_id: invoiceId,
      kind: 'subscription',
      subscription_id: subscriptionId,
      description_ckb: 'مانگانە',
      unit_price: 40_000,
      total: 40_000,
    }),
  );
  await write(
    admin()
      .from('installments')
      .insert([
        {
          id: randomUUID(),
          gym_id: gym.id,
          invoice_id: invoiceId,
          due_date: inDays(30),
          amount: 20_000,
        },
        {
          id: randomUUID(),
          gym_id: gym.id,
          invoice_id: invoiceId,
          due_date: inDays(60),
          amount: 20_000,
        },
      ]),
  );
  return invoiceId;
}

async function paymentsOf(invoiceId: string) {
  const { data } = await admin()
    .from('payments')
    .select(
      'number, kind, amount, currency, foreign_amount, change_given, voided_at, void_reason, reason',
    )
    .eq('invoice_id', invoiceId)
    .order('created_at');
  return data ?? [];
}

test('a receptionist takes what is owed, in dinars and then dollars with change', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501250001');
  const invoiceId = await addDebt(data, memberId, branchId, 'B2-900001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}`);

  const money = page.getByTestId('member-money');
  const invoice = money.locator('[data-invoice="B2-900001"]');
  await expect(invoice.locator('[data-invoice-state]')).toHaveText('نەدراوە');
  await invoice.locator('summary').click();
  await invoice.getByRole('button', { name: 'پارەدان' }).click();
  const dialog = page.getByTestId('pay-dialog');
  // The next installment is the amount at first.
  await expect(dialog.getByLabel('بڕی پارە (دینار)')).toHaveValue('20000');
  await dialog.getByLabel('بڕی پارە (دینار)').fill('15,000');
  await page.getByRole('dialog').getByRole('button', { name: 'وەرگرتنی پارە' }).click();
  await expect(page.getByText('پارەکە وەرگیرا، وەسڵی B2-R000001')).toBeVisible();
  await expect(invoice.locator('[data-invoice-state]')).toHaveText('بەشێکی دراوە');
  await expect(invoice.getByTestId('invoice-due')).toHaveText('25,000 د.ع');

  await invoice.getByRole('button', { name: 'پارەدان' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'دۆلار' }).click();
  await page.getByRole('dialog').getByLabel('بڕی دۆلار').fill('20');
  await page.getByRole('dialog').getByLabel('نرخی دۆلار (دینار بۆ یەک دۆلار)').fill('1310');
  await expect(page.getByTestId('payment-usd-value')).toHaveText(
    'دەکاتە 26,200 د.ع · ئەمەی بگەڕێنەرەوە بۆی: 1,200 د.ع',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'وەرگرتنی پارە' }).click();
  await expect(invoice.locator('[data-invoice-state]')).toHaveText('دراوە');
  expect(await paymentsOf(invoiceId)).toMatchObject([
    { number: 'B2-R000001', amount: 15_000, currency: 'IQD' },
    {
      number: 'B2-R000002',
      amount: 25_000,
      currency: 'USD',
      foreign_amount: 20,
      change_given: 1_200,
    },
  ]);
});

test("a manager voids today's payment, gives money back and voids an invoice", async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const memberId = await addMember(data, branchId, 'شیلان عەلی', '+9647501250002');
  const invoiceId = await addDebt(data, memberId, branchId, 'B2-900002');
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, `/members/${memberId}`);
  const dialog = page.getByRole('dialog');

  const invoice = page.getByTestId('member-money').locator('[data-invoice="B2-900002"]');
  await invoice.locator('summary').click();
  await invoice.getByRole('button', { name: 'پارەدان' }).click();
  await dialog.getByRole('button', { name: 'وەرگرتنی پارە' }).click();
  await expect(invoice.locator('[data-payment="B2-R000001"]')).toBeVisible();

  // Today's payment is voided, with a reason.
  await invoice
    .locator('[data-payment="B2-R000001"]')
    .getByRole('button', { name: 'پووچەڵکردنەوە' })
    .click();
  await dialog.getByRole('button', { name: 'پووچەڵکردنەوە' }).click();
  await expect(dialog.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await dialog.getByLabel('هۆکار').fill('بڕەکە هەڵە بوو');
  await dialog.getByRole('button', { name: 'پووچەڵکردنەوە' }).click();
  await expect(invoice.locator('[data-payment="B2-R000001"]')).toContainText(
    'پووچەڵ کراوەتەوە: بڕەکە هەڵە بوو',
  );
  await expect(invoice.getByTestId('invoice-due')).toHaveText('40,000 د.ع');

  // Paid again, then part of it given back: the member owes no more for it.
  await invoice.getByRole('button', { name: 'پارەدان' }).click();
  await dialog.getByLabel('بڕی پارە (دینار)').fill('20000');
  await dialog.getByRole('button', { name: 'وەرگرتنی پارە' }).click();
  await expect(invoice.getByTestId('invoice-due')).toHaveText('20,000 د.ع');
  await invoice.getByRole('button', { name: 'گەڕاندنەوەی پارە' }).click();
  await dialog.getByLabel('بڕی پارە (دینار)').fill('25000');
  await dialog.getByLabel('هۆکار').fill('نەخۆش کەوت');
  await dialog.getByRole('button', { name: 'گەڕاندنەوە' }).click();
  await expect(
    dialog.getByText('بڕێکی دروست بنووسە، بە دیناری تەواو، کە لە 20,000 د.ع زیاتر نەبێت.'),
  ).toBeVisible();
  await dialog.getByLabel('بڕی پارە (دینار)').fill('5000');
  await dialog.getByRole('button', { name: 'گەڕاندنەوە' }).click();
  await expect(invoice.locator('[data-payment="B2-R000003"]')).toContainText(
    'گەڕاندنەوە: نەخۆش کەوت',
  );
  await expect(invoice.getByTestId('invoice-due')).toHaveText('20,000 د.ع');

  // The invoice itself was made today: voided with its payments.
  await invoice.getByRole('button', { name: 'پووچەڵکردنەوە' }).last().click();
  await dialog.getByLabel('هۆکار').fill('ئەندامی هەڵە');
  await dialog.getByRole('button', { name: 'پووچەڵکردنەوە' }).click();
  await expect(invoice.locator('[data-invoice-state]')).toHaveText('پووچەڵ کراوەتەوە');
  expect((await paymentsOf(invoiceId)).every((payment) => payment.voided_at !== null)).toBe(true);
});

test('the card replacement fee is offered after a lost card is replaced', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const memberId = await addMember(data, branchId, 'هێمن جەلال', '+9647501250003');
  await addCard(data, memberId, '04A23BC15D6E80');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}`);
  const dialog = page.getByRole('dialog');

  await page.getByTestId('member-cards').getByRole('button', { name: 'گۆڕینی کارت' }).click();
  await dialog.getByRole('radio', { name: 'ونبوو' }).click();
  await scanCard(page, '04B1B2B3B4B5B6');
  const fee = page.getByTestId('charge-dialog');
  await expect(fee.getByLabel('نووسینی سەر پسوولە')).toHaveValue('کرێی گۆڕینی کارت');
  await fee.getByLabel('نرخ (دینار)').fill('5000');
  await dialog.getByRole('button', { name: 'دروستکردنی پسوولە' }).click();
  await expect(page.getByText(/^پسوولەکە دروست کرا، B2-000001$/)).toBeVisible();

  const invoice = page.getByTestId('member-money').locator('[data-invoice="B2-000001"]');
  await expect(invoice).toContainText('کرێی گۆڕینی کارت');
  await expect(invoice.locator('[data-invoice-state]')).toHaveText('دراوە');
});

test("the payments page lists who owes and today's money", async ({ page, data }) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const memberId = await addMember(data, branchId, 'ڤیان سەردار', '+9647501250004');
  await addDebt(data, memberId, branchId, 'B2-900003');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/payments');

  const debts = page.getByRole('list', { name: 'قەرزەکان' });
  await expect(debts.locator(`[data-debt="${memberId}"]`)).toContainText('ڤیان سەردار');
  await expect(debts.locator(`[data-debt="${memberId}"]`)).toContainText('40,000 د.ع');
  await expect(debts.locator(`[data-debt="${memberId}"]`)).toContainText('دواتر: 40,000 د.ع');
  await expect(page.getByText('ئەمڕۆ هیچ پارەیەک وەرنەگیراوە.')).toBeVisible();

  await debts.locator(`[data-debt="${memberId}"]`).click();
  const invoice = page.getByTestId('member-money').locator('[data-invoice="B2-900003"]');
  await invoice.locator('summary').click();
  await invoice.getByRole('button', { name: 'پارەدان' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'وەرگرتنی پارە' }).click();
  await expect(invoice.getByTestId('invoice-due')).toHaveText('20,000 د.ع');

  // In the app (a reload would lock it).
  await page.getByRole('link', { name: 'پارەدانەکان' }).first().click();
  await expect(page.getByTestId('today-total')).toHaveText('کۆی ئەمڕۆ: 20,000 د.ع');
  await expect(page.getByRole('list', { name: 'پارەدانەکانی ئەمڕۆ' })).toContainText('B2-R000001');
});
