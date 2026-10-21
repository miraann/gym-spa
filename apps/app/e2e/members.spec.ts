import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './support/backend';
import { expect, signIn, test } from './support/app';

// Members (step 2b): the list with its search, adding and changing a member, the duplicate
// warnings, and the status actions.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** A member added straight in the database, as if made earlier; returns its id. */
async function addMember(
  data: TestData,
  branchId: string,
  member: { fullName: string; gender: 'male' | 'female'; phone: string },
): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('members').insert({
      id,
      gym_id: gym.id,
      branch_id: branchId,
      full_name: member.fullName,
      gender: member.gender,
      phone: member.phone,
      // The server numbers members, whatever the row says.
      member_number: 0,
    }),
  );
  return id;
}

async function memberRow(id: string) {
  const { data: row } = await admin()
    .from('members')
    .select('full_name, gender, phone, member_number, status, status_reason')
    .eq('id', id)
    .single();
  if (!row) throw new Error(`No member ${id}`);
  return row;
}

test('a receptionist adds a member, and finds them by a name typed with Arabic letters', async ({
  page,
  staff,
  data,
}) => {
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff);
  await page.getByRole('link', { name: 'ئەندامان', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ئەندامان' })).toBeVisible();
  await expect(page.getByText('هێشتا هیچ ئەندامێک تۆمار نەکراوە.')).toBeVisible();

  await page.getByRole('link', { name: 'ئەندامی نوێ' }).first().click();
  await page.getByLabel('ناوی تەواو').fill('  ژیلا   کەریم ');
  await page.getByRole('radio', { name: 'مێ' }).click();
  await page.getByRole('textbox', { name: 'ژمارەی مۆبایل', exact: true }).fill('٠٧٥٠ ١٢٣ ٤٥٦٧');
  await page.getByRole('button', { name: 'تۆمارکردنی ئەندام' }).click();

  await expect(page.getByText('ژیلا کەریم تۆمار کرا. ژمارەی ئەندام: 000001')).toBeVisible();
  await expect(page.locator('[data-member-page="000001"]')).toBeVisible();
  // The new member has no photo yet: their page points to the photo card, and taking one is the
  // focused main action.
  await expect(page).toHaveURL(/#photo$/);
  await expect(page.locator('[data-photo-prompt]')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'گرتنی وێنە' })).toBeFocused();
  const gym = await data.gym();
  const { data: rows } = await admin()
    .from('members')
    .select('full_name, gender, phone, member_number, status')
    .eq('gym_id', gym.id);
  expect(rows).toEqual([
    {
      full_name: 'ژیلا کەریم',
      gender: 'female',
      phone: '+9647501234567',
      member_number: 1,
      status: 'active',
    },
  ]);

  // Typed with the Arabic keyboard's ي and ك instead of ی and ک.
  const search = page.getByRole('searchbox');
  await search.fill('ژيلا كەريم');
  await expect(page.locator('[data-member="000001"]')).toBeVisible();
  await search.fill('هێمن');
  await expect(page.getByText('هیچ ئەندامێک بەم گەڕانە نەدۆزرایەوە.')).toBeVisible();
  await expect(page.locator('[data-member="000001"]')).toHaveCount(0);
});

test('the same phone and a similar name are pointed out while typing', async ({
  page,
  staff,
  data,
}) => {
  await addMember(data, await data.branch(), {
    fullName: 'ئارام کەریم',
    gender: 'male',
    phone: '+9647701112233',
  });
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/members/new');

  await page.getByLabel('ناوی تەواو').fill('ئارام کەریم');
  const phone = page.getByRole('textbox', { name: 'ژمارەی مۆبایل', exact: true });
  await phone.fill('0770 111 2233');
  const duplicates = page.getByTestId('member-duplicates');
  await expect(duplicates.getByText('ئەم ژمارەیە هی ئەندامێکی ترە')).toBeVisible();

  // Another number: only the name is left, as a warning.
  await phone.fill('0750 999 8877');
  await expect(duplicates.getByText('لەوانەیە ئەم کەسە پێشتر تۆمار کرابێت')).toBeVisible();
  await expect(duplicates.getByText('ئەم ژمارەیە هی ئەندامێکی ترە')).toHaveCount(0);
});

test('a branch manager changes a member, suspends, archives and reactivates them', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const id = await addMember(data, branchId, {
    fullName: 'هێمن سەلیم',
    gender: 'male',
    phone: '+9647501230003',
  });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, `/members/${id}`);
  await expect(page.getByRole('heading', { name: 'هێمن سەلیم' })).toBeVisible();

  await page.getByRole('link', { name: 'دەستکاری', exact: true }).click();
  await page.getByRole('textbox', { name: 'ژمارەی مۆبایل', exact: true }).fill('0770 555 1234');
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('گۆڕانکارییەکان پاشەکەوت کران')).toBeVisible();
  expect((await memberRow(id)).phone).toBe('+9647705551234');

  // Suspending needs a reason.
  await page.getByRole('button', { name: 'ڕاگرتن' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'ڕاگرتن' }).click();
  await expect(dialog.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await dialog.getByLabel('هۆکار').fill('پارەی نەداوە');
  await dialog.getByRole('button', { name: 'ڕاگرتن' }).click();
  await expect(page.getByText('هێمن سەلیم ڕاگیرا')).toBeVisible();
  await expect(page.getByTestId('member-status-reason')).toHaveText('پارەی نەداوە');
  expect(await memberRow(id)).toMatchObject({ status: 'suspended', status_reason: 'پارەی نەداوە' });

  // Archived members leave the list, and can't be changed until they are active again.
  await page.getByRole('button', { name: 'ئەرشیفکردن' }).click();
  await dialog.getByLabel('هۆکار').fill('ڕۆیشت');
  await dialog.getByRole('button', { name: 'ئەرشیفکردن' }).click();
  await expect(page.getByText('هێمن سەلیم ئەرشیف کرا')).toBeVisible();
  await expect(
    page.getByText('ئەم ئەندامە ئەرشیفکراوە. بۆ گۆڕینی زانیارییەکانی، سەرەتا چالاکی بکەرەوە.'),
  ).toBeVisible();
  await expect(page.locator('[data-member="000001"]')).toHaveCount(0);
  // A filter goes back to the whole list; the member is found among the archived ones.
  await page.getByRole('button', { name: 'ئەرشیفکراو', exact: true }).click();
  await page.locator('[data-member="000001"]').click();

  await page.getByRole('button', { name: 'چالاککردنەوە' }).click();
  await dialog.getByRole('button', { name: 'چالاککردنەوە' }).click();
  await expect(page.getByText('هێمن سەلیم چالاک کرایەوە')).toBeVisible();
  expect((await memberRow(id)).status).toBe('active');
});

test("a receptionist can't change a member's status or read their health notes", async ({
  page,
  staff,
  data,
}) => {
  const id = await addMember(data, await data.branch(), {
    fullName: 'شنۆ عەلی',
    gender: 'female',
    phone: '+9647501230004',
  });
  const gym = await data.gym();
  await write(admin().from('member_health').insert({ id, gym_id: gym.id, medical_notes: 'شەکرە' }));
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${id}`);

  await expect(page.getByRole('heading', { name: 'شنۆ عەلی' })).toBeVisible();
  await expect(page.getByText('تێبینیی تەندروستیی هەیە').first()).toBeVisible();
  await expect(page.getByText('شەکرە')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'دەستکاری', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ڕاگرتن' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ئەرشیفکردن' })).toHaveCount(0);
});

test('on a phone the list and a member open one at a time', async ({ page, staff, data }) => {
  await addMember(data, await data.branch(), {
    fullName: 'دیار حەسەن',
    gender: 'male',
    phone: '+9647501230005',
  });
  await page.setViewportSize(PHONE);
  await signIn(page, staff, '/members');

  await page.locator('[data-member="000001"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'دیار حەسەن' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'ئەندامان' })).toHaveCount(0);
  await page.getByRole('link', { name: 'گەڕانەوە بۆ ئەندامان' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ئەندامان' })).toBeVisible();
});
