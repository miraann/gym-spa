import { isTestLicenseKid, readActivationCode, readLicenseCode } from '@gym/core';
import { expect, run, signInReady, test } from './support/panel';

// Offline gyms in the seller panel (spec §2.6, step MT-5): the gym's record, a license signed by
// the seller-admin function with the local test key (`pnpm db:functions` makes it), the server
// PC's activation, and revoking and deactivating as records with a reason.

test('an offline gym gets a license and a server PC, then both are ended with a reason', async ({
  page,
  made,
}) => {
  const admin = await made.admin('e2e-license');
  await admin.ready();
  await signInReady(page, admin);
  const code = `e2e-off-${run()}`;

  // The record: the edition first; an offline gym needs only its code and names.
  await page.getByRole('link', { name: 'جیمی نوێ' }).click();
  await page.getByRole('radio', { name: 'ئۆفلاین' }).check();
  await expect(page.getByLabel('ناوی تەواوی خاوەن')).toHaveCount(0);
  await page.getByLabel('کۆدی جیم').fill(code);
  await page.getByLabel('ناوی جیم بە کوردی').fill('جیمی ئۆفلاین');
  await page.getByRole('button', { name: 'دروستکردنی جیم' }).click();
  await expect(page.getByTestId('confirm-code')).toHaveText(code);
  await page.getByRole('button', { name: 'بەڵێ، دروستی بکە' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'جیمی ئۆفلاین' })).toBeVisible();
  const gymId = new URL(page.url()).pathname.split('/').pop() ?? '';
  made.offlineGym(gymId);
  await expect(page.locator('[data-license-state]').first()).toHaveAttribute(
    'data-license-state',
    'none',
  );
  await expect(page.getByRole('button', { name: 'چالاککردنی کۆمپیوتەر' })).toBeDisabled();

  // A yearly license, signed and stored before it is shown.
  await page.getByRole('button', { name: 'دەرکردنی لایسنس' }).click();
  const issue = page.getByRole('dialog');
  await issue.getByLabel('دوایین ڕۆژی کارکردن').fill('2099-01-01');
  await expect(issue.getByText('لایسنسی ساڵانە زۆرترین 2 ساڵ دەبێت.')).toBeVisible();
  await issue.getByRole('button', { name: '+12 مانگ' }).click();
  await issue.getByRole('button', { name: 'دەرکردن' }).click();
  const licenseCode = (await page.getByTestId('issued-license').textContent()) ?? '';
  const license = readLicenseCode(licenseCode);
  expect(license).toMatchObject({ gymId, gymCode: code, gymName: 'جیمی ئۆفلاین', maxBranches: 1 });
  expect(isTestLicenseKid(license?.kid ?? '')).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'تەواو' }).click();

  await expect(page.getByTestId('license-code')).toHaveText(licenseCode);
  await expect(page.locator('[data-license-state]').first()).toHaveAttribute(
    'data-license-state',
    'active',
  );
  await expect(page.getByText('بە کلیلی تاقیکردنەوە واژۆ کراوە', { exact: false })).toBeVisible();

  // The server PC: a typo in the machine code is caught at once.
  await page.getByRole('button', { name: 'چالاککردنی کۆمپیوتەر' }).click();
  const activate = page.getByRole('dialog');
  await activate.getByLabel('کۆدی ئامێر').fill('0V5Q-1BD4-TS11-N9TC-9403');
  await expect(activate.getByText('ئەم کۆدە ناتەواوە', { exact: false })).toBeVisible();
  await activate.getByLabel('کۆدی ئامێر').fill('ov5q-1bd4-ts11-n9tc-94o2');
  await expect(activate.getByText('0V5Q-1BD4-TS11-N9TC-9402')).toBeVisible();
  await activate.getByRole('button', { name: 'چالاککردن', exact: true }).click();
  const activationCode = (await page.getByTestId('issued-activation').textContent()) ?? '';
  expect(readActivationCode(activationCode)).toMatchObject({
    gymId,
    machineCode: '0V5Q1BD4TS11N9TC9402',
  });
  await page.getByRole('dialog').getByRole('button', { name: 'تەواو' }).click();
  await expect(page.getByTestId('active-activation')).toContainText('0V5Q-1BD4-TS11-N9TC-9402');

  // Deactivating needs a reason, and frees the gym for a new PC.
  await page.getByRole('button', { name: 'ناچالاککردن' }).click();
  const deactivate = page.getByRole('dialog');
  await deactivate.getByRole('button', { name: 'ناچالاککردن' }).click();
  await expect(deactivate.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await deactivate.getByLabel('هۆکار').fill('کۆمپیوتەری نوێ');
  await deactivate.getByRole('button', { name: 'ناچالاککردن' }).click();
  await expect(page.getByTestId('past-activation')).toContainText('کۆمپیوتەری نوێ');
  await expect(page.getByRole('button', { name: 'چالاککردنی کۆمپیوتەر' })).toBeEnabled();

  // Revoking is a record too: the license stays, marked, with its reason.
  await page.getByRole('button', { name: 'هەڵوەشاندنەوە' }).click();
  const revoke = page.getByRole('dialog');
  await revoke.getByLabel('هۆکار').fill('بەرواری هەڵە');
  await revoke.getByRole('button', { name: 'هەڵوەشاندنەوە' }).click();
  await expect(page.getByTestId('license')).toContainText('بەرواری هەڵە');
  await expect(page.locator('[data-license-state]').first()).toHaveAttribute(
    'data-license-state',
    'none',
  );

  // The gym's log has all of it; the list finds it under offline.
  for (const action of [
    'license_issued',
    'activation_issued',
    'activation_deactivated',
    'license_revoked',
  ]) {
    await expect(page.locator(`[data-log-action="${action}"]`)).toHaveCount(1);
  }
  await page.getByRole('link', { name: 'گەڕانەوە بۆ جیمەکان' }).click();
  await page.getByRole('button', { name: 'ئۆفلاین' }).click();
  await page.getByLabel('گەڕان بە کۆد یان ناو').fill(code);
  await expect(page.getByRole('link', { name: code })).toBeVisible();
});
