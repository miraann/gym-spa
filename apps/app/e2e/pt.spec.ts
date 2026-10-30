import { admin, write } from './support/backend';
import { addMember } from './support/members';
import { openFromMenu, expect, signIn, test } from './support/app';

// Personal training (step 7f): the Owner adds a package, sells it on a member's page with their
// trainer, logs a session from the trainers' page, and reads the trainers' report.

const DESKTOP = { width: 1440, height: 900 };

test('the Owner sells personal training, logs a session and reads the report', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const trainer = await data.staff({ role: 'trainer', branchIds: [branchId] });
  const gym = await data.gym();
  await write(
    admin().from('staff_profiles').insert({
      id: trainer.id,
      gym_id: gym.id,
      salary_type: 'commission',
      pt_percent: 20,
      teaches: true,
    }),
  );
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501390001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/trainers');
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'پاکێجی نوێ' }).click();
  await dialog.getByLabel('ناو بە کوردی').fill('دە دانیشتن');
  await dialog.getByLabel('ژمارەی دانیشتن').fill('10');
  await dialog.getByLabel('نرخ (دینار)').fill('200000');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('پاکێجەکە پاشەکەوت کرا.')).toBeVisible();

  // Sold on the member's page, reached from the search.
  await openFromMenu(page, 'ئەندامان');
  await page.getByText('ئارام کەریم').first().click();
  const card = page.getByTestId('member-pt');
  await card.getByRole('button', { name: 'فرۆشتنی پاکێج' }).click();
  await expect(dialog.getByLabel('ڕاهێنەر')).toContainText(trainer.fullName);
  await dialog.getByRole('button', { name: 'فرۆشتن' }).click();
  await expect(page.getByText(/پاکێجەکە فرۆشرا\. پسوولە/)).toBeVisible();
  await expect(card.locator('[data-pt-package="دە دانیشتن"]')).toContainText('10 لە 10 ماوە');

  // A session, from the member's page.
  await card.getByRole('button', { name: 'تۆمارکردنی دانیشتن' }).click();
  await dialog.getByLabel('تێبینی (ئارەزوومەندانە)').fill('قاچ');
  await dialog.getByRole('button', { name: 'تۆمارکردن' }).click();
  await expect(page.getByText('دانیشتنەکە تۆمار کرا. 9 ماوە.')).toBeVisible();
  const { data: sessions } = await admin()
    .from('pt_sessions')
    .select('status, note, earning, trainer_id')
    .eq('member_id', memberId);
  expect(sessions).toEqual([
    { status: 'done', note: 'قاچ', earning: 4000, trainer_id: trainer.id },
  ]);

  // The trainers' report.
  await openFromMenu(page, 'ڕاهێنەران');
  await expect(page.locator('[data-pt-client="ئارام کەریم"]')).toContainText('9 لە 10 ماوە');
  await page.getByRole('link', { name: 'ڕاپۆرتی ڕاهێنەران' }).click();
  // The device's branch, where the session was logged.
  const report = page.getByTestId('trainer-report');
  await expect(report.getByRole('row', { name: new RegExp(trainer.fullName) })).toContainText(
    '4,000',
  );
});
