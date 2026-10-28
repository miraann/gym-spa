import { randomUUID } from 'node:crypto';
import { addDays, baghdadClock, weekStartOf, weekdayOf } from '@gym/core';
import { admin, write, type TestData } from './support/backend';
import { addMember } from './support/members';
import { addPlan, addSale } from './support/sales';
import { expect, signIn, test } from './support/app';

// Classes (step 7e): the Owner adds a class type and a weekly class; reception books one member and
// puts a second on the waitlist; when the first cancels, the second gets the place.

const DESKTOP = { width: 1440, height: 900 };

/** A member with a running month. */
async function memberWithMonth(
  data: TestData,
  branchId: string,
  planId: string,
  name: string,
  phone: string,
  n: number,
) {
  const memberId = await addMember(data, branchId, name, phone);
  await addSale(data, {
    memberId,
    branchId,
    planId,
    nameCkb: 'مانگانە',
    price: 35_000,
    number: `B2-90020${String(n)}`,
    paid: 35_000,
  });
  return memberId;
}

test('the Owner sets up a weekly class', async ({ page, data }) => {
  await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/classes');
  await page.getByRole('link', { name: 'ڕێکخستنی کلاس' }).click();
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'جۆری نوێ' }).click();
  await dialog.getByLabel('ناو بە کوردی').fill('یۆگا');
  await dialog.getByLabel('ژمارەی جێگە').fill('12');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('جۆری کلاسەکە پاشەکەوت کرا.')).toBeVisible();

  await page.getByRole('button', { name: 'کلاسی هەفتانەی نوێ' }).click();
  await dialog.getByLabel('کات').fill('18:30');
  await dialog.getByLabel('شوێن (ئارەزوومەندانە)').fill('هۆڵی ١');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('کلاسەکە پاشەکەوت کرا.', { exact: true })).toBeVisible();
  const gym = await data.gym();
  const { data: schedules } = await admin()
    .from('class_schedules')
    .select('weekday, starts_at, duration_minutes, capacity, place')
    .eq('gym_id', gym.id);
  expect(schedules).toEqual([
    { weekday: 6, starts_at: '18:30:00', duration_minutes: 60, capacity: 12, place: 'هۆڵی ١' },
  ]);
});

test('reception books a full class and the waitlist moves up', async ({ page, data }) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const gym = await data.gym();
  const planId = await addPlan(data, 'مانگانە', 35_000);
  await memberWithMonth(data, branchId, planId, 'ئارام کەریم', '+9647501380001', 1);
  await memberWithMonth(data, branchId, planId, 'هانا عومەر', '+9647501380002', 2);
  const typeId = randomUUID();
  await write(
    admin().from('class_types').insert({ id: typeId, gym_id: gym.id, name_ckb: 'زومبا' }),
  );
  // Tomorrow evening, for one.
  const today = baghdadClock(new Date()).day;
  const tomorrow = addDays(today, 1);
  await write(
    admin()
      .from('class_schedules')
      .insert({
        id: randomUUID(),
        gym_id: gym.id,
        branch_id: branchId,
        class_type_id: typeId,
        weekday: weekdayOf(tomorrow),
        starts_at: '19:00',
        duration_minutes: 60,
        capacity: 1,
        starts_on: today,
      }),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/classes');
  if (weekStartOf(tomorrow) !== weekStartOf(today)) {
    await page.getByRole('button', { name: 'هەفتەی دواتر' }).click();
  }
  const tile = page.locator('[data-class="زومبا"]');
  await tile.click();
  const dialog = page.getByRole('dialog');
  const search = dialog.getByLabel('ئەندام بدۆزەرەوە: ناو، ژمارە یان مۆبایل');

  await search.fill('ئارام');
  await dialog.getByRole('radio', { name: /ئارام کەریم/ }).click();
  await dialog.getByRole('button', { name: 'تۆمارکردن' }).click();
  await expect(page.getByText('ئارام کەریم تۆمار کرا.')).toBeVisible();
  await search.fill('هانا');
  await dialog.getByRole('radio', { name: /هانا عومەر/ }).click();
  await dialog.getByRole('button', { name: 'تۆمارکردن' }).click();
  await expect(page.getByText('هانا عومەر خرایە لیستی چاوەڕوانی، ژمارە 1.')).toBeVisible();
  await expect(dialog.locator('[data-class-booking="هانا عومەر"]')).toHaveAttribute(
    'data-status',
    'waitlisted',
  );

  await dialog
    .locator('[data-class-booking="ئارام کەریم"]')
    .getByRole('button', { name: 'هەڵوەشاندنەوە' })
    .click();
  await expect(page.getByText('تۆمارەکە هەڵوەشێنرایەوە.')).toBeVisible();
  await expect(dialog.locator('[data-class-booking="هانا عومەر"]')).toHaveAttribute(
    'data-status',
    'booked',
  );
  await expect(tile).toContainText('1 لە 1');
});
