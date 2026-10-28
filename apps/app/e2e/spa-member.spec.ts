import { randomUUID } from 'node:crypto';
import { admin, write } from './support/backend';
import { addMember } from './support/members';
import { addSpaRoom, addSpaService, addSpaTherapist } from './support/spa';
import { expect, signIn, test } from './support/app';

// A member's spa (step 6f): reception sells a package on the member's page; a guest is left out of
// the members list until asked for and becomes a member; the Owner reads the commissions.

const DESKTOP = { width: 1440, height: 900 };

test('reception sells a spa package on the member’s page', async ({ page, data }) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const gym = await data.gym();
  const massage = await addSpaService(data, {
    nameCkb: 'مەساژ',
    kind: 'massage',
    minutes: 60,
    price: 30_000,
    needsTherapist: true,
  });
  await write(
    admin().from('spa_packages').insert({
      id: randomUUID(),
      gym_id: gym.id,
      name_ckb: 'پێنج مەساژ',
      service_id: massage,
      session_count: 5,
      price: 120_000,
      valid_days: 90,
    }),
  );
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501370001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${memberId}`);

  const card = page.getByTestId('member-spa');
  await card.getByRole('button', { name: 'فرۆشتنی پاکێج' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('پاکێج')).toContainText('پێنج مەساژ');
  await dialog.getByRole('button', { name: 'فرۆشتن' }).click();
  await expect(page.getByText(/پاکێجەکە فرۆشرا\. پسوولە/)).toBeVisible();
  await expect(card.locator('[data-spa-balance="پێنج مەساژ"]')).toContainText('5 لە 5 ماوە');

  const { data: sold } = await admin()
    .from('member_spa_packages')
    .select('session_count, invoices (total, payments (amount))')
    .eq('member_id', memberId)
    .single();
  expect(sold).toMatchObject({
    session_count: 5,
    invoices: { total: 120_000, payments: [{ amount: 120_000 }] },
  });
});

test('a guest is left out of the members list until asked for, and becomes a member', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const gym = await data.gym();
  await addMember(data, branchId, 'ئارام کەریم', '+9647501370002');
  const guestId = randomUUID();
  await write(
    admin().from('members').insert({
      id: guestId,
      gym_id: gym.id,
      branch_id: branchId,
      full_name: 'میوانی سپا',
      gender: 'female',
      phone: '+9647501370003',
      is_guest: true,
      // The database gives the number.
      member_number: 0,
    }),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/members');

  await expect(page.getByText('ئارام کەریم')).toBeVisible();
  await expect(page.getByText('میوانی سپا')).toHaveCount(0);
  await page.getByRole('button', { name: 'میوانەکان' }).click();
  await expect(page.getByText('میوانی سپا')).toBeVisible();
  await expect(page.getByText('ئارام کەریم')).toHaveCount(0);

  await page.getByText('میوانی سپا').click();
  await expect(page.getByText('میوان', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'کردن بە ئەندام' }).click();
  await expect(page.getByText('میوانی سپا بوو بە ئەندام.')).toBeVisible();
  const { data: row } = await admin().from('members').select('is_guest').eq('id', guestId).single();
  expect(row).toEqual({ is_guest: false });
});

test('the Owner reads the spa staff’s commissions', async ({ page, data }) => {
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const gym = await data.gym();
  const massage = await addSpaService(data, {
    nameCkb: 'مەساژ',
    kind: 'massage',
    minutes: 60,
    price: 30_000,
    needsTherapist: true,
  });
  const roomId = await addSpaRoom(data, branchId, {
    nameCkb: 'ژووری مەساژ',
    kind: 'massage',
    capacity: 1,
  });
  const therapistId = await addSpaTherapist(data, branchId, 'ڕۆژان عەلی', [massage], 10);
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501370004');
  // A massage completed an hour ago, with its commission.
  const start = new Date(Date.now() - 2 * 3_600_000);
  const end = new Date(start.getTime() + 3_600_000);
  await write(
    admin().from('spa_bookings').insert({
      id: randomUUID(),
      gym_id: gym.id,
      branch_id: branchId,
      member_id: memberId,
      service_id: massage,
      room_id: roomId,
      place: 1,
      therapist_id: therapistId,
      name_ckb: 'مەساژ',
      price: 30_000,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      room_free_at: end.toISOString(),
      paid_with: 'pay',
      status: 'completed',
      completed_at: end.toISOString(),
      commission_amount: 3_000,
    }),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/spa');
  await page.getByRole('link', { name: 'کۆمیسیۆن' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'کۆمیسیۆنی کارمەندانی سپا' }),
  ).toBeVisible();
  await page.getByLabel('لق').selectOption(branchId);
  const table = page.getByTestId('spa-commissions');
  await expect(table.getByRole('row', { name: /ڕۆژان عەلی/ })).toContainText('3,000');
  await expect(table.getByRole('row', { name: /ڕۆژان عەلی/ })).toContainText('30,000');
});
