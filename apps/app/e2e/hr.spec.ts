import { randomUUID } from 'node:crypto';
import { admin, write } from './support/backend';
import { expect, scanCard, signIn, test } from './support/app';

// Staff HR (step 7d): the Owner sets a staff member's pay and gives them a card; their card at the
// check-in screen clocks them in; the Owner plans a shift.

const DESKTOP = { width: 1440, height: 900 };

test('the Owner sets a staff member’s pay and gives them a card', async ({ page, data }) => {
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const trainer = await data.staff({ role: 'trainer', branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, `/staff/${trainer.id}`);
  const dialog = page.getByRole('dialog');

  const pay = page.getByTestId('staff-pay');
  await expect(pay).toContainText('هێشتا زانیاریی مووچەی نییە.');
  await pay.getByRole('button', { name: 'دانانی مووچە' }).click();
  await dialog.getByLabel('مووچەی مانگانە (دینار)').fill('750,000');
  await dialog.getByLabel('بەشی ڕاهێنانی تایبەت (لەسەدا)').fill('20');
  await dialog.getByLabel('ڕاهێنەرە').click();
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('زانیارییەکانی مووچە پاشەکەوت کران.')).toBeVisible();
  await expect(pay).toContainText('750,000');
  const { data: profile } = await admin()
    .from('staff_profiles')
    .select('salary_type, monthly_salary, pt_percent, teaches')
    .eq('id', trainer.id)
    .single();
  expect(profile).toEqual({
    salary_type: 'fixed',
    monthly_salary: 750_000,
    pt_percent: 20,
    teaches: true,
  });

  const card = page.getByTestId('staff-card');
  await card.getByRole('button', { name: 'پێدانی کارت' }).click();
  await dialog.getByLabel('ژمارەی کارت').fill('04 C1 D2 E3 F4 A5 06');
  await dialog.getByRole('button', { name: 'پێدان' }).click();
  await expect(page.getByText('کارتەکە درا.')).toBeVisible();
  await expect(card.locator('[data-card-uid="04C1D2E3F4A506"]')).toBeVisible();
});

test('a staff card at the check-in screen clocks its owner in', async ({ page, data, staff }) => {
  const branchId = await data.branch();
  const gym = await data.gym();
  // Working in every branch, so also in the one of the check-in device.
  const trainer = await data.staff({ role: 'trainer', branchIds: [branchId], allBranches: true });
  await write(
    admin().from('staff_cards').insert({
      id: randomUUID(),
      gym_id: gym.id,
      staff_id: trainer.id,
      uid: '04C1D2E3F4A507',
    }),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/checkin');

  await scanCard(page, '04C1D2E3F4A507');
  const notice = page.getByTestId('staff-clock-notice');
  await expect(notice).toHaveAttribute('data-result', 'in');
  await expect(notice).toContainText('هاتنی کارمەند');
  await expect(notice).toContainText(trainer.fullName);
  await expect(page.locator('[data-checkin-result]')).toHaveCount(0);
  const { data: clock } = await admin()
    .from('staff_clock')
    .select('method, clocked_out_at')
    .eq('staff_id', trainer.id);
  expect(clock).toEqual([{ method: 'card', clocked_out_at: null }]);
});

test('the Owner plans a shift for the week', async ({ page, data }) => {
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const reception = await data.staff({ branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/staff');
  await page.getByRole('link', { name: 'دەوامەکان' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'دەوامەکان' })).toBeVisible();
  await page.getByLabel('لق').selectOption(branchId);

  await page
    .getByRole('button', { name: new RegExp(`^دەوامی نوێ: ${reception.fullName}`) })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('دەستپێک')).toHaveValue('08:00');
  await dialog.getByLabel('کۆتایی').fill('15:30');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('دەوامەکە پاشەکەوت کرا.')).toBeVisible();
  await expect(page.getByTestId('shifts-week')).toContainText(reception.fullName);
  const { data: shifts } = await admin()
    .from('staff_shifts')
    .select('starts_at, ends_at')
    .eq('staff_id', reception.id);
  expect(shifts).toHaveLength(1);
  const [shift] = shifts ?? [];
  expect(
    new Date(shift?.ends_at ?? '').getTime() - new Date(shift?.starts_at ?? '').getTime(),
  ).toBe(7.5 * 3_600_000);
});
