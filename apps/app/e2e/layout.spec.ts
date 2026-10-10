import type { Locator, Page } from '@playwright/test';
import { admin } from './support/backend';
import { HOME_HEADING, expect, signIn, test } from './support/app';

// Navigation by width (CLAUDE.md → Design): desktop sidebar, tablet rail, phone tab bar, and the
// layout guards (rail labels, bottom padding).

const PHONE = { width: 390, height: 844 };
// Short enough that the rail has to scroll, like a landscape tablet with a long menu.
const TABLET = { width: 1024, height: 600 };
const DESKTOP = { width: 1440, height: 900 };

const SIDEBAR = '[data-slot="sidebar-container"]';
const RAIL = '[data-slot="nav-rail"]';
const TAB_BAR = '[data-slot="tab-bar"]';

/** The accessible names of the tab bar's items, in order. */
async function tabNames(page: Page): Promise<string[]> {
  return page
    .locator(`${TAB_BAR} li > *`)
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute('aria-label') ?? item.textContent),
    );
}

function tabEditor(page: Page): Locator {
  return page.getByRole('dialog', { name: 'تابەکانم' });
}

test('desktops get the full sidebar', async ({ page, staff }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  await expect(page.locator(SIDEBAR)).toBeVisible();
  await expect(page.locator(RAIL)).toHaveCount(0);
  await expect(page.locator(TAB_BAR)).toHaveCount(0);
  // Kurdish reads right to left: the sidebar is on the right.
  const box = await page.locator(SIDEBAR).boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(DESKTOP.width);
});

test('tablets get an icon rail whose labels never overflow', async ({ page, staff }) => {
  await page.setViewportSize(TABLET);
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();

  const rail = page.locator(RAIL);
  await expect(rail).toBeVisible();
  await expect(page.locator(SIDEBAR)).toHaveCount(0);
  await expect(page.locator(TAB_BAR)).toHaveCount(0);
  const box = await rail.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(TABLET.width);
  // Nothing shrinks when the rail scrolls.
  expect(await rail.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const badge = await rail.getByRole('link').first().boundingBox();
  expect(badge?.height).toBe(badge?.width);

  // The long name is the accessible name and the tooltip; the rail shows the short one.
  const settings = rail.getByRole('link', { name: 'ڕێکخستنەکان' });
  await expect(settings).toContainText('ڕێکخستن');
  await settings.hover();
  await expect(page.getByRole('tooltip')).toHaveText('ڕێکخستنەکان');

  for (const language of ['کوردی', 'English', 'العربية']) {
    if (language !== 'کوردی') {
      await page.getByRole('button', { name: /گۆڕینی زمان|Change language/ }).click();
      await page.getByRole('menuitemradio', { name: language }).click();
    }
    // Every label fits in at most two lines, so the two-line clamp never cuts one. Measured on
    // an unclamped copy, in lines of the same font (the Kurdish font is taller than its
    // line-height, so pixel heights don't divide evenly).
    const problems = await rail.locator('[data-slot="rail-label"]').evaluateAll((labels) =>
      labels
        .filter((label) => {
          const probe = label.cloneNode(true) as HTMLElement;
          probe.classList.remove('line-clamp-2');
          Object.assign(probe.style, {
            position: 'absolute',
            visibility: 'hidden',
            width: `${String(label.clientWidth)}px`,
          });
          label.after(probe);
          const height = probe.getBoundingClientRect().height;
          const tooWide = probe.scrollWidth > probe.clientWidth;
          probe.textContent = label.textContent.slice(0, 1);
          const lines = Math.round(height / probe.getBoundingClientRect().height);
          probe.remove();
          return lines > 2 || tooWide;
        })
        .map((label) => label.textContent),
    );
    expect(problems, language).toEqual([]);
  }
});

test("phones get a bottom tab bar with the role's tabs, and pages end above it", async ({
  page,
  staff,
}) => {
  await page.setViewportSize(PHONE);
  await signIn(page, staff, '/settings/display');
  await expect(page.locator(SIDEBAR)).toHaveCount(0);
  await expect(page.locator(RAIL)).toHaveCount(0);

  // A receptionist's default tabs; check-in is the raised one in the middle. Pages not built
  // yet keep their place.
  await expect
    .poll(() => tabNames(page))
    .toEqual([
      'سەرەکی',
      'ئەندامان (بەم زووانە)',
      'تۆمارکردنی هاتن (بەم زووانە)',
      'قاسە (بەم زووانە)',
      'زیاتر',
    ]);

  // The last card of a long page scrolls clear of the bar.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const lastCard = await page.locator('#main [data-slot="card"]').last().boundingBox();
  const bar = await page.locator(`${TAB_BAR} ul`).boundingBox();
  expect((lastCard?.y ?? 0) + (lastCard?.height ?? 0)).toBeLessThanOrEqual(bar?.y ?? 0);

  // "More" has the whole menu.
  await page.getByRole('link', { name: 'سەرەکی' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await page.getByRole('button', { name: 'زیاتر' }).click();
  const more = page.getByRole('dialog', { name: 'هەموو بەشەکان' });
  await more.getByRole('link', { name: 'ڕێکخستنەکان' }).click();
  await expect(more).toBeHidden();
  await expect(page).toHaveURL(/\/settings\/display$/);
});

test('staff choose their own tabs, which follow them to other devices', async ({
  page,
  browser,
  staff,
}) => {
  await page.setViewportSize(PHONE);
  await signIn(page, staff);
  await page.getByRole('button', { name: 'زیاتر' }).click();
  await page.getByRole('button', { name: 'گۆڕینی تابەکانم' }).click();
  const editor = tabEditor(page);

  // It starts from the role's tabs.
  for (const name of ['سەرەکی', 'ئەندامان', 'تۆمارکردنی هاتن', 'قاسە']) {
    await editor.getByRole('button', { name, exact: true, pressed: true }).click();
  }
  await expect(editor.getByRole('button', { name: 'پاشەکەوتکردن' })).toBeDisabled();
  // Tapped in this order; check-in still goes to the middle.
  for (const name of ['ڕێکخستنەکان', 'تۆمارکردنی هاتن', 'سەرەکی', 'دۆڵابەکان']) {
    await editor.getByRole('button', { name, exact: true }).click();
  }
  // A fifth one can't be added.
  await expect(editor.getByRole('button', { name: 'سپا', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('تابەکانت پاشەکەوت کران')).toBeVisible();
  await page.keyboard.press('Escape');

  const chosen = [
    'ڕێکخستنەکان',
    'سەرەکی',
    'تۆمارکردنی هاتن (بەم زووانە)',
    'دۆڵابەکان (بەم زووانە)',
    'زیاتر',
  ];
  await expect.poll(() => tabNames(page)).toEqual(chosen);
  const { data } = await admin().from('staff_users').select('nav_tabs').eq('id', staff.id).single();
  expect(data?.nav_tabs).toEqual(['settings', 'home', 'checkin', 'lockers']);

  // Another device: the same tabs after logging in.
  const otherDevice = await browser.newContext({ viewport: PHONE });
  const otherPage = await otherDevice.newPage();
  await signIn(otherPage, staff);
  await expect.poll(() => tabNames(otherPage)).toEqual(chosen);
  await otherDevice.close();

  // Back to the role's tabs.
  await page.getByRole('button', { name: 'زیاتر' }).click();
  await page.getByRole('button', { name: 'گۆڕینی تابەکانم' }).click();
  await tabEditor(page).getByRole('button', { name: 'گەڕانەوە بۆ تابە بنەڕەتییەکان' }).click();
  await expect(page.getByText('تابەکانت پاشەکەوت کران')).toBeVisible();
  await page.keyboard.press('Escape');
  // The toast of the first save may still be showing: wait for the tabs themselves.
  await expect
    .poll(() => tabNames(page))
    .toEqual([
      'سەرەکی',
      'ئەندامان (بەم زووانە)',
      'تۆمارکردنی هاتن (بەم زووانە)',
      'قاسە (بەم زووانە)',
      'زیاتر',
    ]);
});
