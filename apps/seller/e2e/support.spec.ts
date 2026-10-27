import { TestGym, adminClient } from '../../../packages/staff-admin/test/fixture.ts';
import { backend, expect, signInReady, test } from './support/panel';

// Support access in the seller panel (MT-4c): a gym that let Click Group in shows its members,
// read through the audited functions, and every read is listed; a gym that didn't shows nothing.

test('a gym that let Click Group in: its members are read, and every read is listed', async ({
  page,
  made,
}) => {
  const gym = await TestGym.create(backend, 'e2e-sup');
  made.gyms.push(gym);
  const db = adminClient(backend);
  const branchId = await gym.branchId('B1');
  const memberId = crypto.randomUUID();
  try {
    expect(
      (
        await db.from('members').insert({
          id: memberId,
          gym_id: gym.id,
          branch_id: branchId,
          full_name: 'ئارام کەریم',
          gender: 'male',
          phone: '+9647501239101',
          member_number: 0,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from('support_grants').insert({
          id: crypto.randomUUID(),
          gym_id: gym.id,
          reason: 'کێشەی پسوولە',
          ends_at: new Date(Date.now() + 3_600_000 * 3).toISOString(),
        })
      ).error,
    ).toBeNull();

    const admin = await made.admin('e2e-sup');
    await admin.ready();
    await signInReady(page, admin);
    await page.getByLabel('گەڕان بە کۆد یان ناو').fill(gym.code);
    await page.getByRole('link', { name: gym.code }).click();

    const card = page.getByTestId('support-card');
    await expect(card).toContainText('هۆکاری جیم: کێشەی پسوولە');
    // The gym page itself still shows no member.
    await expect(page.getByText('ئارام کەریم')).toHaveCount(0);
    await card.getByRole('link', { name: 'بینینی ئەندامان' }).click();

    // Nothing is read before a search is sent.
    await expect(page.getByText('هێشتا هیچ شتێک نەبینراوە.')).toBeVisible();
    await page.getByLabel('ناو، ژمارەی ئەندام یان مۆبایل').fill('ئارام');
    await page.getByRole('button', { name: 'گەڕان' }).click();
    await page
      .getByTestId('support-members')
      .getByRole('link', { name: /ئارام کەریم/ })
      .click();
    await expect(page.getByTestId('support-member-name')).toHaveText('ئارام کەریم');

    await page.getByRole('link', { name: 'گەڕانەوە بۆ ئەندامان' }).click();
    const reads = page.getByTestId('support-reads');
    await expect(reads.getByRole('listitem')).toHaveCount(2);
    await expect(reads).toContainText('گەڕان بۆ «ئارام»');
    await expect(reads).toContainText('زانیاریی ئەندامێک');

    const { data: rows } = await db
      .from('support_reads')
      .select('what, admin_email')
      .eq('gym_id', gym.id);
    expect(rows).toHaveLength(2);
  } finally {
    await db.from('support_reads').delete().eq('gym_id', gym.id);
    await db.from('members').delete().eq('gym_id', gym.id);
  }
});

test("a gym that didn't let Click Group in shows no way to its members", async ({ page, made }) => {
  const gym = await TestGym.create(backend, 'e2e-nosup');
  made.gyms.push(gym);
  const admin = await made.admin('e2e-nosup');
  await admin.ready();
  await signInReady(page, admin);
  await page.getByLabel('گەڕان بە کۆد یان ناو').fill(gym.code);
  await page.getByRole('link', { name: gym.code }).click();
  await expect(page.getByTestId('support-card')).toContainText('ئەم جیمە ڕێگەی نەداوە');
  await expect(page.getByRole('link', { name: 'بینینی ئەندامان' })).toHaveCount(0);

  // Going straight to the address (inside the panel: a reload signs out) reads nothing either.
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/seller/gyms/${gym.id}/support`);
  await page.getByRole('button', { name: 'هەموو ئەندامان' }).click();
  await expect(
    page.getByText('ئەم جیمە ڕێگەی نەداوە زانیارییەکانی ببینیت، یان کاتەکەی تەواو بووە.'),
  ).toBeVisible();
});
