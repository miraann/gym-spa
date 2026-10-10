import type { Page } from '@playwright/test';
import { admin, type TestData, type TestStaff } from './support/backend';
import { expect, signIn, test, unlock } from './support/app';

// Settings → Appearance (spec §6.1): the gym's look (brand color, corners, logo), each staff
// member's own look, and the gym's logo and name on the lock screen.

const PAGE = '/settings/appearance';
const PHONE = { width: 390, height: 844 };

async function owner(data: TestData): Promise<TestStaff> {
  return data.staff({ role: 'owner', branchIds: [], allBranches: true });
}

function rootVariable(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    name,
  );
}

async function settingValue(data: TestData, key: string): Promise<unknown> {
  const gym = await data.gym();
  const { data: row } = await admin()
    .from('settings')
    .select('value')
    .eq('gym_id', gym.id)
    .eq('key', key)
    .maybeSingle();
  return row?.value ?? null;
}

/** A noisy PNG far over 300 KB, drawn by the browser itself. */
async function largePng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    const image = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 1) {
      image.data[index] = index % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

test('the gym look applies at once, is saved for the gym, and survives a restart', async ({
  page,
  data,
}) => {
  const staff = await owner(data);
  await signIn(page, staff, PAGE);
  await expect(page.getByRole('heading', { level: 1, name: 'ڕووکار' })).toBeVisible();
  expect(await rootVariable(page, '--brand-h')).toBe('277');

  // A preset previews without a reload; nothing is saved yet.
  await page.getByRole('button', { name: 'شین', exact: true }).click();
  await expect.poll(() => rootVariable(page, '--brand-h')).toBe('256');
  await page.getByRole('radio', { name: 'تیژ' }).click();
  await expect.poll(() => rootVariable(page, '--radius')).toBe('0.25rem');
  expect(await settingValue(data, 'appearance.brand_color')).toBeNull();

  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('ڕووکاری جیم پاشەکەوت کرا')).toBeVisible();
  expect(await settingValue(data, 'appearance.brand_color')).toBe('blue');
  expect(await settingValue(data, 'appearance.corner_style')).toBe('sharp');

  // After a restart the look is there before anyone unlocks (cached), and after.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' })).toBeVisible();
  expect(await rootVariable(page, '--brand-h')).toBe('256');
  expect(await rootVariable(page, '--radius')).toBe('0.25rem');
  await unlock(page, staff);
  await expect(page.getByRole('heading', { level: 1, name: 'ڕووکار' })).toBeVisible();
  expect(await rootVariable(page, '--brand-h')).toBe('256');
});

test('leaving without saving goes back to the saved look', async ({ page, data }) => {
  await signIn(page, await owner(data), PAGE);
  await page.getByRole('button', { name: 'مۆر', exact: true }).click();
  await expect.poll(() => rootVariable(page, '--brand-h')).toBe('303');

  await page.getByRole('link', { name: 'پیشاندان' }).first().click();
  await expect(page).toHaveURL(/\/settings\/display$/);
  // The old page unmounts (and restores the look) just after the address changes.
  await expect.poll(() => rootVariable(page, '--brand-h')).toBe('277');
  expect(await settingValue(data, 'appearance.brand_color')).toBeNull();
});

test('a custom color that is hard to read or looks like a status color warns before saving', async ({
  page,
  data,
}) => {
  await signIn(page, await owner(data), PAGE);
  await page.getByRole('button', { name: 'ڕەنگی دڵخواز' }).click();
  await page.getByLabel('کۆدی ڕەنگ').fill('#16a34a');

  await expect(page.getByText(/لە ڕەنگی دۆخەکان دەچێت/)).toBeVisible();
  await expect(page.getByText('ئەم ڕەنگە باش ناخوێنرێتەوە')).toBeVisible();
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  const confirm = page.getByRole('dialog', { name: 'ئەم ڕەنگە پاشەکەوت بکرێت؟' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'گەڕانەوە' }).click();
  expect(await settingValue(data, 'appearance.brand_color')).toBeNull();

  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await confirm.getByRole('button', { name: 'هەر پاشەکەوتی بکە' }).click();
  await expect(page.getByText('ڕووکاری جیم پاشەکەوت کرا')).toBeVisible();
  expect(await settingValue(data, 'appearance.brand_color')).toBe('#16a34a');
});

test('the logo is resized to at most 300 KB and shows on the lock screen', async ({
  page,
  data,
}) => {
  const staff = await owner(data);
  await signIn(page, staff, PAGE);
  const png = await largePng(page);
  expect(png.length).toBeGreaterThan(300 * 1024);

  // An SVG is refused, even named .png.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9"/></svg>',
    ),
  });
  await expect(page.getByText('تەنها وێنەی PNG، JPEG یان WebP.')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: png,
  });
  const confirm = page.getByRole('dialog', { name: 'ئەم لۆگۆیە دابنرێت؟' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'دانانی لۆگۆ' }).click();
  await expect(page.getByText('لۆگۆکە پاشەکەوت کرا')).toBeVisible();

  const stored = (await settingValue(data, 'appearance.logo')) as { type: string; data: string };
  expect(stored.type).toBe('image/webp');
  expect(Buffer.from(stored.data, 'base64').length).toBeLessThanOrEqual(300 * 1024);
  const size = await page
    .getByRole('img', { name: 'لۆگۆی ئێستای جیم' })
    .evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]);
  expect(Math.max(...size)).toBeLessThanOrEqual(512);

  // The lock screen shows the gym's logo and name.
  await page.getByRole('button', { name: 'هەژمارەکەم' }).click();
  await page.getByRole('menuitem', { name: /قفڵکردن/ }).click();
  const lockScreen = page.locator('[data-auth-screen]');
  await expect(lockScreen.getByTestId('device-gym')).toHaveText((await data.gym()).nameCkb);
  await expect(lockScreen.locator('header img')).toBeVisible();

  // Removed again: the app's mark comes back.
  await unlock(page, staff);
  await page.getByRole('button', { name: 'لابردنی لۆگۆ' }).click();
  await page
    .getByRole('dialog', { name: 'لۆگۆ لابدرێت؟' })
    .getByRole('button', { name: 'لابردن' })
    .click();
  await expect(page.getByText('لۆگۆکە لابرا')).toBeVisible();
  expect(await settingValue(data, 'appearance.logo')).toBeNull();
  await expect(page.locator('header img')).toHaveCount(0);
});

test('staff without the right see the gym look as a note, and set their own look', async ({
  page,
  browser,
  staff,
}) => {
  await signIn(page, staff, PAGE);
  await expect(page.getByText(/ڕووکاری جیم تەنها کارمەندێک دەیگۆڕێت/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ڕووکاری جیم' })).toHaveCount(0);

  await page.getByRole('radio', { name: 'تاریک' }).click();
  await page.getByRole('radio', { name: 'گەورە' }).click();
  const html = page.locator('html');
  await expect(html).toHaveClass(/dark/);
  await expect(html).toHaveCSS('font-size', '18px');
  await expect
    .poll(async () => {
      const { data } = await admin()
        .from('staff_users')
        .select('theme_preference, text_size')
        .eq('id', staff.id)
        .single();
      return data;
    })
    .toEqual({ theme_preference: 'dark', text_size: 'large' });

  // Their look follows them to another device.
  const otherDevice = await browser.newContext({ colorScheme: 'light' });
  const otherPage = await otherDevice.newPage();
  await signIn(otherPage, staff);
  await expect(otherPage.locator('html')).toHaveClass(/dark/);
  await expect(otherPage.locator('html')).toHaveCSS('font-size', '18px');
  await otherDevice.close();
});

test('on phones the brand chips scroll edge to edge and the save bar keeps clear of content', async ({
  page,
  data,
}) => {
  await page.setViewportSize(PHONE);
  await signIn(page, await owner(data), PAGE);

  // The settings tabs sit on the page: their row reaches both screen edges.
  const tabsRow = await page.locator('[data-slot="chip-row"]').first().boundingBox();
  expect(tabsRow?.x).toBe(0);
  expect((tabsRow?.x ?? 0) + (tabsRow?.width ?? 0)).toBe(PHONE.width);

  // The brand chips sit in a card: their row reaches the card's edges, and scrolls.
  const row = page.locator('[data-slot="chip-row"]').nth(1);
  const card = await page.locator('#main [data-slot="card"]').first().boundingBox();
  const rowBox = await row.boundingBox();
  expect(rowBox?.x).toBe(card?.x);
  expect(rowBox?.width).toBe(card?.width);
  expect(await row.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  // Kurdish reads from the right: the first chip starts 16px inside the row, and the last one
  // scrolls fully into view with 16px after it.
  const rowRight = (rowBox?.x ?? 0) + (rowBox?.width ?? 0);
  const first = await row.getByRole('button').first().boundingBox();
  expect(rowRight - ((first?.x ?? 0) + (first?.width ?? 0))).toBeGreaterThanOrEqual(16);
  await row.evaluate((element) => {
    element.scrollTo({ left: -element.scrollWidth });
  });
  const lastBox = await row.getByRole('button').last().boundingBox();
  expect((lastBox?.x ?? 0) - (rowBox?.x ?? 0)).toBeGreaterThanOrEqual(15); // sub-pixel scroll

  // The save bar floats above the tab bar, and the page ends above the save bar.
  const bar = page.locator('[data-slot="sticky-action-bar"] > div');
  await expect(bar).toBeVisible();
  const barBox = await bar.boundingBox();
  const tabs = await page.locator('[data-slot="tab-bar"] ul').boundingBox();
  expect((barBox?.y ?? 0) + (barBox?.height ?? 0)).toBeLessThanOrEqual(tabs?.y ?? 0);
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const lastCard = await page.locator('#main [data-slot="card"]').last().boundingBox();
  const barAfter = await bar.boundingBox();
  expect((lastCard?.y ?? 0) + (lastCard?.height ?? 0)).toBeLessThanOrEqual(barAfter?.y ?? 0);
});
