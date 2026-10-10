import { HOME_HEADING, expect, signIn, test, unlock } from './support/app';

const LOGIN_HEADING = { level: 1, name: 'چوونەژوورەوە' } as const;

test('opens in Kurdish, right-to-left, on first launch', async ({ page }) => {
  await page.goto('/');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ckb');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveTitle('جیم و سپا');
  // Nobody has logged in on this device yet.
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
});

test('opens without a connection, and says the server is needed', async ({
  page,
  context,
  staff,
}) => {
  await signIn(page, staff);
  // Wait until the service worker has cached the app and controls this page.
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });

  // Cut the network completely.
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);

  // The service worker still opens the app, but the PIN needs the server.
  await page.reload();
  await unlock(page, staff);
  await expect(page.getByRole('alert')).toHaveText(
    'پەیوەندی بە سێرڤەرەوە نەکرا. ئینتەرنێتەکەت بپشکنە و دووبارە هەوڵ بدەرەوە.',
  );

  // The Kurdish font comes from the cache too.
  const kurdishFontLoaded = await page.evaluate(async () => {
    const faces = await document.fonts.load("16px 'UniSalar'", 'ڕێ');
    return faces.length > 0 && faces.every((face) => face.status === 'loaded');
  });
  expect(kurdishFontLoaded).toBe(true);

  // Back online, the same PIN opens the app.
  await context.unrouteAll();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'گەڕانەوە' }).click();
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  await expect(page.getByRole('status')).toContainText('پەیوەندی هەیە');
});

test('switching to English flips to left-to-right and is remembered', async ({ page }) => {
  // The login screen has the language menu too.
  await page.goto('/');
  await page.getByRole('button', { name: 'گۆڕینی زمان' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();

  await page.reload();
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
});

test('Arabic is right-to-left', async ({ page, staff }) => {
  await signIn(page, staff, '/settings/display');
  await page.getByRole('radio', { name: 'العربية' }).click();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ar');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'المظهر واللغة' })).toBeVisible();
});

test('Eastern Arabic digits can be turned on', async ({ page, staff }) => {
  await signIn(page, staff, '/settings/display');
  await expect(page.getByText('25,000 د.ع')).toBeVisible();

  await page.getByRole('radio', { name: '١٢٣' }).click();
  await expect(page.getByText('٢٥٬٠٠٠ د.ع')).toBeVisible();
});

test('Ctrl+K searches pages, also with a Kurdish keyboard layout', async ({ page, staff }) => {
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  // What a Sorani keyboard sends for Ctrl+K: the letter ک on the physical K key.
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ک', code: 'KeyK', ctrlKey: true, bubbles: true }),
    );
  });
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.type('ڕێکخستن');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings\/display$/);
});

test('keeps content clear of the system bars on edge-to-edge screens', async ({ page, staff }) => {
  // What the Android app gets when it draws behind the status bar, the navigation bar and a
  // camera cutout on the right (the side the Kurdish sidebar is on).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 24, bottom: 16, left: 0, right: 32 },
  });

  // Desktop: the sidebar is always shown.
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  const header = page.locator('header');
  await expect(header).toHaveCSS('padding-top', '24px');
  // The top bar starts at the very top, so its background fills the strip behind the status bar.
  expect((await header.boundingBox())?.y).toBe(0);
  const searchTop = (await page.getByRole('button', { name: 'گەڕان' }).boundingBox())?.y;
  expect(searchTop).toBeGreaterThanOrEqual(24);
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  await expect(sidebar).toHaveCSS('padding-top', '24px');
  await expect(sidebar).toHaveCSS('padding-bottom', '16px');
  await expect(sidebar).toHaveCSS('padding-right', '32px');
  await expect(page.locator('[data-slot="sidebar-inset"]')).toHaveCSS('padding-bottom', '16px');

  // Tablet: the rail runs from the status bar to the navigation bar; the body keeps it out of
  // the cutout.
  await page.setViewportSize({ width: 1024, height: 768 });
  const rail = page.locator('[data-slot="nav-rail"]');
  await expect(rail).toHaveCSS('padding-top', '32px');
  await expect(rail).toHaveCSS('padding-bottom', '24px');
  expect(await rail.evaluate((element) => element.getBoundingClientRect().right)).toBe(1024 - 32);

  // Phone: the tab bar floats above the navigation bar and keeps out of the cutout.
  await page.setViewportSize({ width: 390, height: 844 });
  const tabBar = page.locator('[data-slot="tab-bar"]');
  await expect(tabBar).toHaveCSS('padding-bottom', '28px');
  await expect(tabBar).toHaveCSS('padding-right', '44px');
  // "More" opens as a bottom sheet, clear of the navigation bar.
  await page.getByRole('button', { name: 'زیاتر' }).click();
  const sheet = page.locator('[data-slot="sheet-content"][data-side="bottom"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS('padding-bottom', '16px');
  await expect(sheet).toHaveCSS('padding-right', '32px');
});

test('the login screen also stays clear of the system bars', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 24, bottom: 16, left: 0, right: 0 },
  });
  await page.goto('/');
  await expect(page.locator('[data-auth-screen]')).toHaveCSS('padding-top', '24px');
  await expect(page.locator('[data-auth-screen]')).toHaveCSS('padding-bottom', '16px');
});

test('unknown pages show a friendly message', async ({ page, staff }) => {
  await signIn(page, staff, '/no-such-page');
  await expect(page.getByText('ئەم پەڕەیە نەدۆزرایەوە')).toBeVisible();
  await page.getByRole('link', { name: 'گەڕانەوە بۆ سەرەکی' }).click();
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
});

test('shows the connection to the server', async ({ page, context, staff }) => {
  await signIn(page, staff);

  const indicator = page.getByRole('status');
  await expect(indicator).toContainText('پەیوەندی هەیە');
  await indicator.click();
  await expect(page.getByText(/^دوایین پشکنین:/)).toBeVisible();
  await page.keyboard.press('Escape');

  await context.setOffline(true);
  await expect(indicator).toContainText('پەیوەندی نییە');
  await context.setOffline(false);
  await expect(indicator).toContainText('پەیوەندی هەیە');
});
