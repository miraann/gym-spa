import { expect, test } from '@playwright/test';

test('opens in Kurdish, right-to-left, on first launch', async ({ page }) => {
  await page.goto('/');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ckb');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveTitle('جیم و سپا');
  await expect(page.getByRole('heading', { level: 1, name: 'سەرەکی' })).toBeVisible();
});

test('keeps working without internet after the first visit', async ({ page, context }) => {
  await page.goto('/');
  // Wait until the service worker has cached the app and controls this page.
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });

  // Cut the network completely.
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'سەرەکی' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('ئۆفلاین');

  // The Kurdish font comes from the offline cache too.
  const kurdishFontLoaded = await page.evaluate(async () => {
    const faces = await document.fonts.load("16px 'UniSalar'", 'ڕێ');
    return faces.length > 0 && faces.every((face) => face.status === 'loaded');
  });
  expect(kurdishFontLoaded).toBe(true);

  // A page that was never opened online also works: the service worker serves the app.
  await page.goto('/settings/display');
  await expect(page.getByRole('heading', { level: 1, name: 'ڕووکار و زمان' })).toBeVisible();
});

test('switching to English flips to left-to-right and is remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'گۆڕینی زمان' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

  await page.reload();
  await expect(html).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});

test('Arabic is right-to-left', async ({ page }) => {
  await page.goto('/settings/display');
  await page.getByRole('radio', { name: 'العربية' }).click();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ar');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'المظهر واللغة' })).toBeVisible();
});

test('Eastern Arabic digits can be turned on', async ({ page }) => {
  await page.goto('/settings/display');
  await expect(page.getByText('25,000 د.ع')).toBeVisible();

  await page.getByRole('radio', { name: /عەرەبی/ }).click();
  await expect(page.getByText('٢٥٬٠٠٠ د.ع')).toBeVisible();
});

test('Ctrl+K searches pages, also with a Kurdish keyboard layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { level: 1 }).waitFor();
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

test('unknown pages show a friendly message', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByText('ئەم پەڕەیە نەدۆزرایەوە')).toBeVisible();
  await page.getByRole('link', { name: 'گەڕانەوە بۆ سەرەکی' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'سەرەکی' })).toBeVisible();
});
