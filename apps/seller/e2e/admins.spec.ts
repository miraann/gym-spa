import type { Page } from '@playwright/test';
import { adminClient } from '../../../packages/staff-admin/test/fixture.ts';
import { PANEL, backend, expect, run, signInReady, submitLogin, test } from './support/panel';

// Click Group's platform admins in the panel (spec §2.6): add one, deactivate and reactivate,
// reset another's two-step login. Nobody changes their own account here.

async function adminIds(email: string): Promise<string[]> {
  const found = await adminClient(backend).rpc('platform_script_find_admin', { p_email: email });
  return (found.data ?? []).map((row) => row.user_id);
}

/** A second browser (another person's computer): its own storage. */
async function otherBrowser(page: Page): Promise<Page> {
  const browser = page.context().browser();
  if (!browser) throw new Error('no browser');
  return browser.newPage({ baseURL: new URL(page.url()).origin });
}

test('adds an admin, who gets a temporary password shown once', async ({ page, made }) => {
  const admin = await made.admin('e2e-adm');
  await admin.ready();
  await signInReady(page, admin);
  await page.getByRole('link', { name: 'بەڕێوەبەرانی پانێڵ' }).click();
  // No action menu on one's own row.
  await expect(page.locator(`[data-admin="${admin.email}"] button`)).toHaveCount(0);

  const email = `e2e-new-${run()}@clickgroup.example`;
  await page.getByRole('button', { name: 'زیادکردنی بەڕێوەبەر' }).click();
  await page.getByLabel('ئیمەیڵ').fill(email.toUpperCase());
  await page.getByLabel('ناوی تەواو').fill('هاوکاری نوێ');
  await page.getByRole('dialog').getByRole('button', { name: 'زیادکردن' }).click();
  const password = (await page.getByRole('dialog').locator('output').textContent()) ?? '';
  expect(password).toMatch(/^[a-z2-9]{14}$/);
  made.admins.push(...(await adminIds(email)));
  await page.getByRole('button', { name: 'تەواو' }).click();
  await expect(page.locator(`[data-admin="${email}"]`)).toContainText('دەبێت وشەی نهێنی بگۆڕێت');
  // Two active admins at least: no warning.
  await expect(page.getByTestId('only-one-admin')).toHaveCount(0);

  // They log in with it, and must choose their own password first.
  const other = await otherBrowser(page);
  await other.goto(PANEL);
  await submitLogin(other, email, password);
  await expect(other.getByRole('heading', { name: 'وشەی نهێنیی خۆت هەڵبژێرە' })).toBeVisible();
  await other.close();
});

test("deactivates and reactivates an admin, and resets another's two-step login", async ({
  page,
  made,
}) => {
  const admin = await made.admin('e2e-boss');
  await admin.ready();
  const colleague = await made.admin('e2e-col');
  await colleague.ready();
  await signInReady(page, admin);
  await page.getByRole('link', { name: 'بەڕێوەبەرانی پانێڵ' }).click();
  const row = page.locator(`[data-admin="${colleague.email}"]`);

  await row.getByRole('button', { name: 'کارەکان' }).click();
  await page.getByRole('menuitem', { name: 'ناچالاککردن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ناچالاککردن' }).click();
  await expect(row).toContainText('ناچالاک');
  await expect(colleague.signIn()).rejects.toThrow();

  await row.getByRole('button', { name: 'کارەکان' }).click();
  await page.getByRole('menuitem', { name: 'چالاککردنەوە' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'چالاککردنەوە' }).click();
  await expect(row.getByText('ناچالاک')).toHaveCount(0);

  await row.getByRole('button', { name: 'کارەکان' }).click();
  await page.getByRole('menuitem', { name: 'سڕینەوەی ئامێری دوو هەنگاوی' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'سڕینەوەی ئامێری دوو هەنگاوی' })
    .click();
  await expect(row).toContainText('ڕێک نەخراوە');

  // At their next login they set up a new device.
  const other = await otherBrowser(page);
  await other.goto(PANEL);
  await submitLogin(other, colleague.email, colleague.password);
  await expect(
    other.getByRole('heading', { name: 'چوونەژوورەوەی دوو هەنگاوی ڕێک بخە' }),
  ).toBeVisible();
  await other.close();
});
