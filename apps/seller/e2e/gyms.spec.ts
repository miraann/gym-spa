import { addMonthsToDate, baghdadDateOf, paidUntilFromDate } from '@gym/core';
import type { Database } from '@gym/db';
import {
  TestGym,
  adminClient,
  loginResult,
  signIn as staffSignIn,
} from '../../../packages/staff-admin/test/fixture.ts';
import { backend, expect, run, signInReady, test } from './support/panel';

// Gyms in the seller panel (spec §2.6): created with their first Owner, then subscription,
// limits, suspend, lock and reactivate, and what the gym's own staff see of it.

const GYM_LOCKED = 'ئەم جیمە قفڵ کراوە و بەکارناهێنرێت. پەیوەندی بە کلیک گرووپەوە بکە.';

test('creates a gym with its Owner, who then logs in to the gym app', async ({
  page,
  context,
  made,
}) => {
  const admin = await made.admin('e2e-create');
  await admin.ready();
  await signInReady(page, admin);
  const code = `e2e-g-${run()}`;

  await page.getByRole('link', { name: 'جیمی نوێ' }).click();
  await expect(
    page.getByText('ئاگاداربە: کۆدی جیم هەرگیز ناگۆڕدرێت.', { exact: false }).first(),
  ).toBeVisible();

  // A reserved code is refused before anything is sent.
  await page.getByLabel('کۆدی جیم').fill('Admin');
  await page.getByLabel('ناوی جیم بە کوردی').click();
  await expect(page.getByText('ئەم کۆدە بۆ سیستەمەکە پارێزراوە.')).toBeVisible();

  await page.getByLabel('کۆدی جیم').fill(code.toUpperCase());
  await page.getByLabel('ناوی جیم بە کوردی').fill('جیمی تاقیکردنەوە');
  await page.getByLabel('ناوی تەواوی خاوەن').fill('خاوەنی تاقیکردنەوە');
  await page.getByRole('button', { name: 'دروستکردنی جیم' }).click();

  // The code is confirmed, big, with the warning again.
  await expect(page.getByTestId('confirm-code')).toHaveText(code);
  await page.getByRole('button', { name: 'بەڵێ، دروستی بکە' }).click();

  await expect(page.getByRole('heading', { name: 'جیمەکە دروست کرا' })).toBeVisible();
  const link = (await page.getByTestId('gym-link').textContent()) ?? '';
  expect(link).toBe(`${new URL(page.url()).origin}/?gym=${code}`);
  await expect(page.getByTestId('owner-username')).toHaveText('owner');
  const password = (await page.locator('output').textContent()) ?? '';
  expect(password).toMatch(/^[a-z2-9]{14}$/);
  const href = await page.getByRole('link', { name: 'کردنەوەی جیمەکە' }).getAttribute('href');
  const gymId = href?.split('/').pop() ?? '';
  made.gym(gymId, code);

  // The Owner, on a device of the gym: the link fills in the gym code.
  const gymApp = await context.newPage();
  await gymApp.goto(link);
  await expect(gymApp.getByLabel('کۆدی جیم')).toHaveValue(code);
  await gymApp.getByLabel('ناوی بەکارهێنەر').fill('owner');
  await gymApp.getByLabel('وشەی نهێنی', { exact: true }).fill(password);
  await gymApp.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(gymApp.getByRole('heading', { name: 'وشەی نهێنیی نوێ دابنێ' })).toBeVisible();
});

test("suspend, lock and reactivate: what the gym's staff see, and the gym's log", async ({
  page,
  context,
  made,
}) => {
  const gym = await TestGym.create(backend, 'e2e-st');
  made.gyms.push(gym);
  const owner = await gym.addStaff('owner', 'owner', { allBranches: true });
  const admin = await made.admin('e2e-state');
  await admin.ready();
  await signInReady(page, admin);

  await page.getByLabel('گەڕان بە کۆد یان ناو').fill(gym.code);
  await page.getByRole('link', { name: gym.code }).click();
  await expect(page.locator('[data-gym-state]')).toHaveAttribute('data-gym-state', 'active');

  // Suspend: read-only, but they still log in.
  await page.getByRole('button', { name: 'ڕاگرتن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ڕاگرتن' }).click();
  await expect(page.locator('[data-gym-state]')).toHaveAttribute('data-gym-state', 'suspended');
  const signedIn = await staffSignIn(backend, owner.email, owner.password);
  expect((await signedIn.client.rpc('my_gym').single()).data).toMatchObject({
    access: 'read_only',
    suspended: true,
  });

  // Lock: a reason is required; then the gym app refuses the login itself.
  await page.getByRole('button', { name: 'قفڵکردن' }).click();
  const lockDialog = page.getByRole('dialog');
  await lockDialog.getByRole('button', { name: 'قفڵکردن' }).click();
  await expect(lockDialog.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await lockDialog.getByLabel('هۆکار (پێویستە)').fill('هەژماری دزراو');
  await lockDialog.getByRole('button', { name: 'قفڵکردن' }).click();
  await expect(page.locator('[data-gym-state]')).toHaveAttribute('data-gym-state', 'locked');
  await expect(page.getByRole('alert').filter({ hasText: 'هۆکار: هەژماری دزراو' })).toBeVisible();
  expect(await loginResult(backend, owner.email, owner.password)).not.toBe('ok');

  const gymApp = await context.newPage();
  await gymApp.goto(`/?gym=${gym.code}`);
  await gymApp.getByLabel('ناوی بەکارهێنەر').fill(owner.username);
  await gymApp.getByLabel('وشەی نهێنی', { exact: true }).fill(owner.password);
  await gymApp.getByRole('button', { name: 'چوونەژوورەوە' }).click();
  await expect(gymApp.getByRole('alert')).toHaveText(GYM_LOCKED);

  // Reactivate: back to normal.
  await page.getByRole('button', { name: 'چالاککردنەوە' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'چالاککردنەوە' }).click();
  await expect(page.locator('[data-gym-state]')).toHaveAttribute('data-gym-state', 'active');
  expect(await loginResult(backend, owner.email, owner.password)).toBe('ok');

  // Each change is in the gym's log.
  for (const action of ['gym_suspended', 'gym_locked', 'gym_reactivated']) {
    await expect(page.locator(`[data-log-action="${action}"]`)).toBeVisible();
  }
});

test('the subscription date and the limits', async ({ page, made }) => {
  const gym = await TestGym.create(backend, 'e2e-sub');
  made.gyms.push(gym);
  const admin = await made.admin('e2e-sub');
  await admin.ready();
  await signInReady(page, admin);
  await page.getByLabel('گەڕان بە کۆد یان ناو').fill(gym.code);
  await page.getByRole('link', { name: gym.code }).click();

  await page.getByRole('button', { name: 'گۆڕینی بەرواری ئابوونە' }).click();
  await page.getByRole('button', { name: '+3 مانگ' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const expected = paidUntilFromDate(addMonthsToDate(baghdadDateOf(Date.now()), 3));
  const row = await adminClient(backend)
    .from('gyms')
    .select('paid_until, max_branches')
    .eq('id', gym.id)
    .single();
  expect(new Date(row.data?.paid_until ?? '').toISOString()).toBe(expected);

  await page.getByRole('button', { name: 'گۆڕینی سنوورەکان' }).click();
  await page.getByLabel('زۆرترین لق').fill('0');
  await page.getByRole('dialog').getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('سنوور دەبێت لانیکەم 1 بێت، یان بەتاڵ.')).toBeVisible();
  await page.getByLabel('زۆرترین لق').fill('3');
  await page.getByRole('dialog').getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const limited = await adminClient(backend)
    .from('gyms')
    .select('max_branches')
    .eq('id', gym.id)
    .single();
  expect(limited.data?.max_branches).toBe(3);
});

test('the list finds a gym by its name typed with Arabic letters', async ({ page, made }) => {
  const gym = await TestGym.create(backend, 'e2e-find');
  made.gyms.push(gym);
  const admin = await made.admin('e2e-find');
  await admin.ready();
  await signInReady(page, admin);
  // Its Kurdish name is "جیمی تاقیکردنەوە …": typed with Arabic ي and ك it still matches.
  await page.getByLabel('گەڕان بە کۆد یان ناو').fill(`جيمي تاقيكردنەوە ${gym.code}`);
  await expect(page.getByRole('link', { name: gym.code })).toBeVisible();
  await page.getByLabel('گەڕان بە کۆد یان ناو').fill('no-such-gym-anywhere');
  await expect(page.getByText('هیچ جیمێک نەدۆزرایەوە.')).toBeVisible();
});

test("a gym's member counts: numbers only, archived members left out", async ({ page, made }) => {
  const gym = await TestGym.create(backend, 'e2e-count');
  made.gyms.push(gym);
  const db = adminClient(backend);
  const branchId = await gym.branchId('B1');
  const member = (
    fullName: string,
    phone: string,
    status: string,
    reason: string | null,
  ): Database['public']['Tables']['members']['Insert'] => ({
    id: crypto.randomUUID(),
    gym_id: gym.id,
    branch_id: branchId,
    full_name: fullName,
    gender: 'male',
    phone,
    status,
    status_reason: reason,
    member_number: 0,
  });
  const inserted = await db
    .from('members')
    .insert([
      member('ئارام کەریم', '+9647501239001', 'active', null),
      member('هانا عومەر', '+9647501239002', 'active', null),
      member('دانا سەلیم', '+9647501239003', 'suspended', 'تاقیکردنەوە'),
      member('شوان ڕەشید', '+9647501239004', 'archived', 'تاقیکردنەوە'),
    ]);
  expect(inserted.error).toBeNull();
  try {
    const admin = await made.admin('e2e-count');
    await admin.ready();
    await signInReady(page, admin);
    await page.getByLabel('گەڕان بە کۆد یان ناو').fill(gym.code);
    await expect(page.getByText('3 ئەندام ·', { exact: false })).toBeVisible();

    await page.getByRole('link', { name: gym.code }).click();
    const fact = (label: string) => page.locator('dt', { hasText: label }).locator('xpath=..');
    await expect(fact('ئەندامان')).toContainText('3');
    await expect(fact('ئەندامە چالاکەکان')).toContainText('2');
    await expect(
      page.getByText('ئەندامە ئەرشیفکراوەکان ناژمێردرێن.', { exact: false }),
    ).toBeVisible();
    // Never a member's name.
    await expect(page.getByText('ئارام کەریم')).toHaveCount(0);
  } finally {
    await db.from('members').delete().eq('gym_id', gym.id);
  }
});
