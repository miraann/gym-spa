import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './support/backend';
import { expect, scanCard, signIn, test } from './support/app';

// NFC cards (step 2e): keyboard-type readers and the card screens on a member's page. A
// keyboard-type reader is played by typing the UID and Enter as fast as a reader does.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** A member added straight in the database; returns its id. */
async function addMember(data: TestData, branchId: string, fullName: string, phone: string) {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('members').insert({
      id,
      gym_id: gym.id,
      branch_id: branchId,
      full_name: fullName,
      gender: 'male',
      phone,
      member_number: 0,
    }),
  );
  return id;
}

/** A card the member was given earlier. */
async function addCard(data: TestData, memberId: string, uid: string) {
  const gym = await data.gym();
  await write(
    admin()
      .from('nfc_cards')
      .insert({ id: randomUUID(), gym_id: gym.id, member_id: memberId, uid }),
  );
}

async function cardsOf(memberId: string) {
  const { data } = await admin()
    .from('nfc_cards')
    .select('uid, status, end_reason, block_reason, replaces_id')
    .eq('member_id', memberId)
    .order('created_at');
  return data ?? [];
}

test('a receptionist gives a member a card by holding it to a keyboard-type reader', async ({
  page,
  staff,
  data,
}) => {
  const branchId = await data.branch();
  const aram = await addMember(data, branchId, 'ئارام کەریم', '+9647501230001');
  const shwan = await addMember(data, branchId, 'شوان ڕەشید', '+9647501230002');
  await addCard(data, shwan, '04112233445566');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${aram}`);

  const cards = page.getByTestId('member-cards');
  await expect(cards.getByText('ئەم ئەندامە کارتی نییە.')).toBeVisible();
  await cards.getByRole('button', { name: 'پێدانی کارت' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('کارتەکە لە خوێنەری کارت نزیک بکەرەوە')).toBeVisible();
  // The browser can't use PC/SC readers, and says so.
  await expect(dialog.getByText(/ACR122U/)).toBeVisible();

  // Someone else's card: refused, and the dialog says whose it is.
  await scanCard(page, '04112233445566');
  await expect(dialog.getByText('ئەم کارتە ئێستا کارتی ئەندامێکە.')).toBeVisible();
  await expect(dialog.getByTestId('card-holder')).toContainText('شوان ڕەشید');
  await expect(dialog).toBeVisible();

  await scanCard(page, '04A23BC15D6E80');
  await expect(page.getByText('کارتەکە درا بە ئارام کەریم')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(cards.getByTestId('member-card')).toContainText('04 A2 3B C1 5D 6E 80');
  await expect(cards.locator('[data-card-state="active"]')).toBeVisible();
  expect(await cardsOf(aram)).toEqual([
    {
      uid: '04A23BC15D6E80',
      status: 'active',
      end_reason: null,
      block_reason: null,
      replaces_id: null,
    },
  ]);

  // A receptionist can't block cards.
  await expect(cards.getByRole('button', { name: 'بلۆککردن' })).toHaveCount(0);
});

test('a number typed by hand is not a scan: it is given with the button', async ({
  page,
  staff,
  data,
}) => {
  const id = await addMember(data, await data.branch(), 'هێمن سەلیم', '+9647501230003');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${id}`);
  await page.getByRole('button', { name: 'پێدانی کارت' }).click();
  const dialog = page.getByRole('dialog');
  const field = dialog.getByRole('textbox', { name: 'ژمارەی کارت' });

  // People type far slower than a reader: nothing happens until they say so.
  await field.pressSequentially('12345', { delay: 120 });
  await dialog.getByRole('button', { name: 'پێدانی کارت' }).click();
  await expect(
    dialog.getByText('ئەمە ژمارەی کارت نییە. کارتەکە دووبارە نزیک بکەرەوە یان ژمارەکە بپشکنە.'),
  ).toBeVisible();
  await field.fill('');
  await field.pressSequentially('de:ad:be:ef', { delay: 80 });
  await expect(dialog).toBeVisible();
  expect(await cardsOf(id)).toEqual([]);
  await dialog.getByRole('button', { name: 'پێدانی کارت' }).click();
  await expect(page.getByText('کارتەکە درا بە هێمن سەلیم')).toBeVisible();
  expect((await cardsOf(id)).map((card) => card.uid)).toEqual(['DEADBEEF']);
});

test('a receptionist replaces a lost card and takes a card back', async ({ page, staff, data }) => {
  const branchId = await data.branch();
  const id = await addMember(data, branchId, 'ژیلا عەلی', '+9647501230004');
  const other = await addMember(data, branchId, 'دیار حەسەن', '+9647501230005');
  await addCard(data, id, '04A23BC15D6E80');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${id}`);
  const cards = page.getByTestId('member-cards');

  await cards.getByRole('button', { name: 'گۆڕینی کارت' }).click();
  const dialog = page.getByRole('dialog');
  // Only a manager reports a card stolen (that blocks it).
  await expect(dialog.getByRole('radio', { name: 'دزراو' })).toHaveCount(0);
  // Scanned before saying what happened: the card waits for the reason.
  await scanCard(page, '04B1B2B3B4B5B6');
  await expect(dialog.getByText('هەڵبژێرە چی بەسەر کارتەکە هات.')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'ژمارەی کارتی نوێ' })).toHaveValue(
    '04 B1 B2 B3 B4 B5 B6',
  );
  await dialog.getByRole('radio', { name: 'ونبوو' }).click();
  await dialog.getByRole('button', { name: 'گۆڕینی کارت' }).click();
  await expect(page.getByText('کارتی ژیلا عەلی گۆڕدرا')).toBeVisible();
  await expect(cards.getByTestId('member-card')).toContainText('04 B1 B2 B3 B4 B5 B6');
  const lost = cards.locator('[data-card="04A23BC15D6E80"]');
  await expect(lost.locator('[data-card-reason="lost"]')).toHaveText('ونبوو');

  await cards.getByRole('button', { name: 'وەرگرتنەوەی کارت' }).click();
  await dialog.getByRole('button', { name: 'وەرگرتنەوەی کارت' }).click();
  await expect(page.getByText('کارتەکە وەرگیرایەوە')).toBeVisible();
  await expect(cards.getByText('ئەم ئەندامە کارتی نییە.')).toBeVisible();
  await expect(
    cards.locator('[data-card="04B1B2B3B4B5B6"] [data-card-reason="returned"]'),
  ).toHaveText('گەڕێنراوە');

  const rows = await cardsOf(id);
  expect(rows.map(({ uid, status, end_reason }) => [uid, status, end_reason])).toEqual([
    ['04A23BC15D6E80', 'ended', 'lost'],
    ['04B1B2B3B4B5B6', 'ended', 'returned'],
  ]);

  // A returned card can be given to someone else, here on a phone (a bottom sheet).
  await page.setViewportSize(PHONE);
  await page.getByRole('link', { name: 'گەڕانەوە بۆ ئەندامان' }).click();
  await page.locator('[data-member="000002"]').click();
  await page.getByRole('button', { name: 'پێدانی کارت' }).click();
  await scanCard(page, '04B1B2B3B4B5B6');
  await expect(page.getByText('کارتەکە درا بە دیار حەسەن')).toBeVisible();
  expect((await cardsOf(other)).map((card) => card.uid)).toEqual(['04B1B2B3B4B5B6']);
});

test('a manager reports a card stolen, and blocks and unblocks cards', async ({ page, data }) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const id = await addMember(data, branchId, 'سەردار جەلال', '+9647501230006');
  await addCard(data, id, 'DEADBEEF');
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, `/members/${id}`);
  const cards = page.getByTestId('member-cards');
  const dialog = page.getByRole('dialog');

  await cards.getByRole('button', { name: 'گۆڕینی کارت' }).click();
  await dialog.getByRole('radio', { name: 'دزراو' }).click();
  await expect(dialog.getByText(/کارتی دزراو بلۆک دەکرێت/)).toBeVisible();
  await scanCard(page, 'CAFEBABE');
  await expect(page.getByText('کارتی سەردار جەلال گۆڕدرا')).toBeVisible();
  const stolen = cards.locator('[data-card="DEADBEEF"]');
  await expect(stolen.locator('[data-card-reason="stolen"]')).toHaveText('دزراو');
  await expect(stolen.locator('[data-card-state="blocked"]')).toHaveText('بلۆککراو');

  // Blocking the working card needs a reason, and stops it.
  await cards.getByRole('button', { name: 'بلۆککردن' }).first().click();
  await dialog.getByRole('button', { name: 'بلۆککردن' }).click();
  await expect(dialog.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await dialog.getByLabel('هۆکار').fill('کارتەکە کۆپی کراوە');
  await dialog.getByRole('button', { name: 'بلۆککردن' }).click();
  await expect(page.getByText('کارتەکە بلۆک کرا')).toBeVisible();
  await expect(cards.getByText('ئەم ئەندامە کارتی نییە.')).toBeVisible();
  await expect(cards.locator('[data-card="CAFEBABE"]')).toContainText(
    'هۆکاری بلۆککردن: کارتەکە کۆپی کراوە',
  );

  await stolen.getByRole('button', { name: 'لابردنی بلۆک' }).click();
  await dialog.getByRole('button', { name: 'لابردنی بلۆک' }).click();
  await expect(page.getByText('بلۆکی کارتەکە لابرا')).toBeVisible();
  await expect(stolen.locator('[data-card-state="blocked"]')).toHaveCount(0);
  await expect(stolen).toContainText('بلۆکەکەی لابرا لە');

  const rows = await cardsOf(id);
  expect(rows.map(({ uid, status, end_reason }) => [uid, status, end_reason])).toEqual([
    ['DEADBEEF', 'ended', 'stolen'],
    ['CAFEBABE', 'blocked', 'blocked'],
  ]);
});

test('the card reader page tests a reader, and turns a reversed reader around', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  const id = await addMember(data, branchId, 'ڕێباز عومەر', '+9647501230007');
  await addCard(data, id, '04A23BC15D6E80');
  await page.setViewportSize(PHONE);
  await signIn(page, manager, '/settings/card-reader');

  // Three settings tabs fit on a phone.
  const tabs = page.getByRole('navigation', { name: 'بەشەکانی ڕێکخستن' });
  await expect(tabs.getByRole('link', { name: 'خوێنەری کارت' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(await tabs.evaluate((nav) => nav.scrollWidth <= nav.clientWidth)).toBe(true);

  const tester = page.getByTestId('reader-test');
  await scanCard(page, '04A23BC15D6E80');
  await expect(tester.locator('[data-card-uid="04A23BC15D6E80"]')).toHaveText(
    '04 A2 3B C1 5D 6E 80',
  );
  await expect(tester.getByTestId('card-holder')).toContainText('ڕێباز عومەر');

  // This reader types the bytes the other way round.
  await scanCard(page, '806E5DC13BA204');
  await expect(tester.getByTestId('card-holder')).toContainText(
    'ئەم کارتە ئێستا هی هیچ ئەندامێک نییە.',
  );
  await page.getByRole('radio', { name: 'پێچەوانە' }).click();
  await scanCard(page, '806E5DC13BA204');
  await expect(tester.locator('[data-card-uid="04A23BC15D6E80"]')).toBeVisible();
  await expect(tester.getByTestId('card-holder')).toContainText('ڕێباز عومەر');

  // Something that isn't a card UID (a barcode, say).
  await scanCard(page, '1234567890123');
  await expect(tester.getByTestId('reader-raw')).toHaveText('1234567890123');
});

test('only staff who manage devices change the reader', async ({ page, staff }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/settings/card-reader');
  await expect(page.getByRole('heading', { level: 1, name: 'خوێنەری کارت' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'پێچەوانە' })).toHaveCount(0);
  await expect(
    page.getByText('تەنها کارمەندێک کە دەسەڵاتی بەڕێوەبردنی ئامێرەکانی هەیە دەتوانێت ئەمە بگۆڕێت.'),
  ).toBeVisible();
});
