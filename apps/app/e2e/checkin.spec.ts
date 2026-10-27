import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './support/backend';
import { addMember } from './support/members';
import { addPlan, addSale } from './support/sales';
import { expect, scanCard, signIn, test } from './support/app';

// Check-in (step 4b): reception holds a member's card to the reader (a keyboard-type reader here)
// and the result fills the screen; a refused member is let in anyway by a manager; members are
// found by hand; the door screen checks members in and locks the app when left.

const DESKTOP = { width: 1440, height: 900 };

async function giveCard(data: TestData, memberId: string, uid: string): Promise<void> {
  const gym = await data.gym();
  await write(
    admin()
      .from('nfc_cards')
      .insert({ id: randomUUID(), gym_id: gym.id, member_id: memberId, uid }),
  );
}

async function visitsOf(memberId: string) {
  const { data } = await admin()
    .from('attendance')
    .select('method, override_reason, override_note')
    .eq('member_id', memberId);
  return data ?? [];
}

test('a card lets a member with a running month in, and a second scan is "already in"', async ({
  page,
  data,
  staff,
}) => {
  const branchId = await data.branch();
  const planId = await addPlan(data, 'مانگانە', 35_000);
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501280001');
  await addSale(data, {
    memberId,
    branchId,
    planId,
    nameCkb: 'مانگانە',
    price: 35_000,
    number: 'B2-900101',
    paid: 35_000,
  });
  await giveCard(data, memberId, '04A1B2C3D4E581');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/checkin');

  await scanCard(page, '04A1B2C3D4E581');
  const result = page.locator('[data-checkin-result]');
  await expect(result).toHaveAttribute('data-checkin-result', 'allowed');
  await expect(result.getByTestId('checkin-name')).toHaveText('ئارام کەریم');
  await expect(result).toContainText('بەخێربێیت');
  await expect(result).toContainText('مانگانە');
  expect(await visitsOf(memberId)).toEqual([
    { method: 'card', override_reason: null, override_note: null },
  ]);

  // It closes by itself after a few seconds.
  await expect(result).toHaveCount(0, { timeout: 8_000 });
  await scanCard(page, '04A1B2C3D4E581');
  await expect(result).toHaveAttribute('data-checkin-result', 'already');
  await expect(result).toContainText('پێشتر هاتووە');
  expect(await visitsOf(memberId)).toHaveLength(1);
});

test('a refused member is let in by a manager, with a reason', async ({ page, data }) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const memberId = await addMember(data, branchId, 'شیلان عەلی', '+9647501280002');
  await giveCard(data, memberId, '04A1B2C3D4E582');
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/checkin');

  await scanCard(page, '04A1B2C3D4E582');
  const result = page.locator('[data-checkin-result]');
  await expect(result).toHaveAttribute('data-checkin-result', 'denied');
  await expect(result).toContainText('هیچ ئابوونەیەکی نییە.');
  await result.getByRole('button', { name: 'ڕێگەی پێبدە' }).click();
  await result.getByRole('button', { name: 'با بێتە ژوورەوە' }).click();
  await expect(result.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await result.getByLabel('هۆکار').fill('ئەمڕۆ ئابوونە دەکڕێت');
  await result.getByRole('button', { name: 'با بێتە ژوورەوە' }).click();

  await expect(result).toHaveAttribute('data-checkin-result', 'allowed');
  await expect(result).toContainText('کارمەند ڕێگەی پێدا.');
  expect(await visitsOf(memberId)).toEqual([
    { method: 'card', override_reason: 'NO_SUBSCRIPTION', override_note: 'ئەمڕۆ ئابوونە دەکڕێت' },
  ]);
});

test('a receptionist finds a member by name and checks them in by hand', async ({
  page,
  data,
  staff,
}) => {
  const branchId = await data.branch();
  const planId = await addPlan(data, 'مانگانە', 35_000);
  const memberId = await addMember(data, branchId, 'هێمن جەلال', '+9647501280003');
  await addSale(data, {
    memberId,
    branchId,
    planId,
    nameCkb: 'مانگانە',
    price: 35_000,
    number: 'B2-900103',
    paid: 35_000,
  });
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/checkin');

  // A receptionist may not let refused members in: no such button.
  await page.getByLabel('ناو، ژمارەی ئەندام یان مۆبایل').fill('هێمن');
  await page.getByRole('button', { name: 'تۆمارکردنی هاتن: هێمن جەلال' }).click();
  const result = page.locator('[data-checkin-result]');
  await expect(result).toHaveAttribute('data-checkin-result', 'allowed');
  await expect(result.getByTestId('checkin-name')).toHaveText('هێمن جەلال');
  expect(await visitsOf(memberId)).toEqual([
    { method: 'manual', override_reason: null, override_note: null },
  ]);
});

test('the door screen checks members in, and leaving it locks the app', async ({
  page,
  data,
  staff,
}) => {
  const branchId = await data.branch();
  const memberId = await addMember(data, branchId, 'چیا عومەر', '+9647501280004');
  await giveCard(data, memberId, '04A1B2C3D4E584');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/checkin');

  await page.getByRole('link', { name: 'شاشەی دەرگا' }).click();
  const door = page.getByTestId('door-screen');
  await expect(door).toContainText('کارتەکەت لە خوێنەرەکە نزیک بکەرەوە');
  await scanCard(page, '04A1B2C3D4E584');
  const result = page.locator('[data-checkin-result]');
  await expect(result).toHaveAttribute('data-checkin-result', 'denied');
  await expect(result.getByTestId('checkin-name')).toHaveText('چیا عومەر');
  // Nothing for staff on the door screen.
  await expect(result.getByRole('button', { name: 'ڕێگەی پێبدە' })).toHaveCount(0);
  await result.getByRole('button', { name: 'داخستن' }).click();

  await door.getByRole('button', { name: 'دەرچوون' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
});

test('a manager sees who is inside, checks a member out and voids a mistaken visit', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const gym = await data.gym();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const planId = await addPlan(data, 'مانگانە', 35_000);
  const first = await addMember(data, branchId, 'ڤیان سەردار', '+9647501280005');
  const second = await addMember(data, branchId, 'دانا ئەحمەد', '+9647501280006');
  const sales = await Promise.all(
    [first, second].map((memberId, index) =>
      addSale(data, {
        memberId,
        branchId,
        planId,
        nameCkb: 'مانگانە',
        price: 35_000,
        number: `B2-90011${String(index)}`,
        paid: 35_000,
      }),
    ),
  );
  await write(
    admin()
      .from('attendance')
      .insert(
        [first, second].map((memberId, index) => ({
          id: randomUUID(),
          gym_id: gym.id,
          branch_id: branchId,
          member_id: memberId,
          subscription_id: sales[index]?.subscriptionId,
          method: 'manual',
        })),
      ),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/checkin');

  await expect(page.getByTestId('occupancy')).toContainText('2');
  await page.getByRole('link', { name: 'هاتنەکانی ئەمڕۆ' }).click();
  await expect(page.locator('[data-visit]')).toHaveCount(2);

  const firstRow = page.locator('[data-visit="ڤیان سەردار"]');
  await firstRow.getByRole('button', { name: 'تۆمارکردنی ڕۆیشتن' }).click();
  await expect(page.getByText('ڕۆیشتنی ڤیان سەردار تۆمار کرا.')).toBeVisible();
  await expect(page.getByTestId('occupancy')).toContainText('1');
  await expect(firstRow).toContainText('ڕۆیشت');

  const secondRow = page.locator('[data-visit="دانا ئەحمەد"]');
  await secondRow.getByRole('button', { name: 'پووچەڵکردنەوە' }).click();
  const dialog = page.getByRole('dialog', { name: 'پووچەڵکردنەوەی هاتنی دانا ئەحمەد' });
  await dialog.getByLabel('هۆکار').fill('بە هەڵە تۆمار کرا');
  await dialog.getByRole('button', { name: 'پووچەڵکردنەوە' }).click();
  await expect(page.getByText('هاتنەکە پووچەڵ کرایەوە.')).toBeVisible();
  await expect(secondRow).toContainText('پووچەڵکراوە: بە هەڵە تۆمار کرا');
  await expect(page.getByTestId('occupancy')).toContainText('0');

  await page.getByRole('button', { name: 'لە ژوورەوە', exact: true }).click();
  await expect(page.getByText('هیچ هاتنێک نییە.')).toBeVisible();
});

test("a member's page lists their last visits", async ({ page, data, staff }) => {
  const branchId = await data.branch();
  const gym = await data.gym();
  const memberId = await addMember(data, branchId, 'سۆزان کامەران', '+9647501280007');
  await write(
    admin().from('attendance').insert({
      id: randomUUID(),
      gym_id: gym.id,
      branch_id: branchId,
      member_id: memberId,
      method: 'manual',
      override_reason: 'NO_SUBSCRIPTION',
      override_note: 'ڕۆژی تاقیکردنەوە',
    }),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}`);

  const visits = page.getByTestId('member-visits');
  await expect(visits.locator('[data-member-visit]')).toHaveCount(1);
  await expect(visits).toContainText('کارمەند ڕێگەی پێدا: ڕۆژی تاقیکردنەوە');
  await expect(visits).toContainText('بە دەست');
});

test("staff without attendance.view see no visits on a member's page", async ({ page, data }) => {
  const branchId = await data.branch();
  const roleId = await data.role('بێ هاتن', ['members.view']);
  const viewer = await data.staff({ roleId, branchIds: [branchId] });
  const memberId = await addMember(data, branchId, 'نەسرین عومەر', '+9647501280008');
  await page.setViewportSize(DESKTOP);
  await signIn(page, viewer, `/members/${memberId}`);
  await expect(page.getByRole('heading', { name: 'نەسرین عومەر' })).toBeVisible();
  await expect(page.getByTestId('member-visits')).toHaveCount(0);
});
