import { formatMemberNumber } from '@gym/core';
import { openFromMenu, expect, scanCard, signIn, test } from './support/app';
import { addCard, addMember, memberNumberOf } from './support/members';

// Step 2h: the search (Ctrl+K, and the search button on phones) finds members by name, phone or
// member number next to the pages, and a card held to a reader on a screen that doesn't wait for
// one opens its member. Card screens keep their cards (cards.spec.ts).

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

test('Ctrl+K finds members by name, phone and member number, and pages', async ({
  page,
  staff,
  data,
}) => {
  const branchId = await data.branch();
  const aram = await addMember(data, branchId, 'ئارام کەریم', '+9647501230201');
  await addMember(data, branchId, 'هانا عومەر', '+9647501230202');
  // Named like the home page, سەرەکی: the search finds both.
  const sarakiy = await addMember(data, branchId, 'سەرەکی ئەحمەد', '+9647501230203');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff);

  const dialog = page.getByRole('dialog');
  await page.keyboard.press('Control+k');
  await expect(dialog.getByText('ناو، ژمارەی مۆبایل یان ژمارەی ئەندام بنووسە')).toBeVisible();
  const input = dialog.getByRole('combobox');

  // By name, with an Arabic keyboard's letters (ك, ي for ک, ی).
  await input.fill('كەري');
  const members = dialog.getByTestId('search-members');
  await expect(members.getByRole('option')).toHaveCount(1);
  await expect(members.getByRole('option')).toContainText('ئارام کەریم');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/members/${aram}$`));
  await expect(dialog).toHaveCount(0);

  // By phone, typed the way people say it.
  await page.keyboard.press('Control+k');
  await input.fill('0750 123 0202');
  await expect(members.getByRole('option')).toContainText('هانا عومەر');

  // By member number: that member comes first.
  const number = await memberNumberOf(aram);
  await input.fill(String(number));
  await expect(members.getByRole('option').first()).toHaveAttribute(
    'data-member',
    formatMemberNumber(number),
  );

  // Pages still come up.
  await input.fill('ڕێکخستن');
  await expect(dialog.getByRole('option', { name: 'ڕێکخستنەکان' })).toBeVisible();

  // A member and a page: Enter opens the member, the first row, even though the page came first.
  await input.fill('سەرەکی');
  await expect(members.getByRole('option')).toContainText('سەرەکی ئەحمەد');
  await expect(dialog.getByRole('option', { name: 'سەرەکی', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/members/${sarakiy}$`));
});

test('more members than fit lead to the members list', async ({ page, staff, data }) => {
  const branchId = await data.branch();
  for (let index = 0; index < 7; index += 1) {
    await addMember(
      data,
      branchId,
      `دڵنیا ${String(index)}`,
      `+96475012303${String(index).padStart(2, '0')}`,
    );
  }
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').fill('دڵنیا');
  await expect(dialog.getByTestId('search-members').locator('[data-member]')).toHaveCount(6);
  await dialog.getByRole('option', { name: 'هەموو ئەنجامەکان لە لیستی ئەندامان' }).click();
  await expect(page).toHaveURL(/\/members\?q=/);
  await expect(page.locator('[data-member]')).toHaveCount(7);
});

test('the search button on phones finds a member', async ({ page, staff, data }) => {
  const branchId = await data.branch();
  const id = await addMember(data, branchId, 'شوان ڕەشید', '+9647501230211');
  await page.setViewportSize(PHONE);
  await signIn(page, staff);
  await page.getByRole('button', { name: 'گەڕان' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').fill('شوان');
  await dialog.getByRole('option', { name: /شوان ڕەشید/ }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${id}$`));
});

test('a card held to the reader on any screen opens its member', async ({ page, staff, data }) => {
  const branchId = await data.branch();
  const id = await addMember(data, branchId, 'لاڤین قادر', '+9647501230221');
  await addCard(data, id, '04A23BC15D6E80');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/settings/display');
  await expect(page.getByRole('heading', { level: 1, name: 'پیشاندان' })).toBeVisible();

  await scanCard(page, '04A23BC15D6E80');
  await expect(page).toHaveURL(new RegExp(`/members/${id}$`));
  await expect(page.getByTestId('member-cards')).toContainText('04 A2 3B C1 5D 6E 80');

  // Nobody's card: it says so, and stays on the page.
  await openFromMenu(page, 'سەرەکی');
  await scanCard(page, '04112233445566');
  await expect(page.getByText('ئەم کارتە ئێستا هی هیچ ئەندامێک نییە.')).toBeVisible();
  await expect(page).not.toHaveURL(/\/members\//);

  // Typed into the search box, the card is a scan too.
  await page.keyboard.press('Control+k');
  await scanCard(page, '04A23BC15D6E80');
  await expect(page).toHaveURL(new RegExp(`/members/${id}$`));
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a card held to the reader never throws away unsaved changes', async ({
  page,
  staff,
  data,
}) => {
  const branchId = await data.branch();
  const aram = await addMember(data, branchId, 'ئارام کەریم', '+9647501230231');
  const hana = await addMember(data, branchId, 'هانا عومەر', '+9647501230232');
  await addCard(data, hana, '04A23BC15D6E80');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${aram}/edit`);

  await page.getByLabel('ناوی تەواو').fill('ئارام کەریم ئەحمەد');
  // A reader typing into a text field is typing (step 2e): the card is held with no field focused.
  await page.getByLabel('ناوی تەواو').blur();
  await scanCard(page, '04A23BC15D6E80');
  const notice = page.getByText('گۆڕانکارییەکانی ئەم پەڕەیە هێشتا پاشەکەوت نەکراون');
  await expect(notice).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/members/${aram}/edit$`));
  await expect(page.getByLabel('ناوی تەواو')).toHaveValue('ئارام کەریم ئەحمەد');

  // Staff choose to open the member anyway.
  // The toast keeps sliding while a busy test machine renders, so a click at its position can
  // miss it: the click goes to the button itself, as a person's would.
  await page.getByRole('button', { name: 'کردنەوە', exact: true }).dispatchEvent('click');
  await expect(page).toHaveURL(new RegExp(`/members/${hana}$`));
});
