import { admin } from './support/backend';
import { expect, signIn, test } from './support/app';

// Step 10d: Settings → جیم, the receipt's bottom line per language and the usual dollar rate.

const DESKTOP = { width: 1440, height: 900 };

test('the Owner sets the receipt footer and the usual dollar rate, and empties a line again', async ({
  page,
  data,
}) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/settings/gym');

  await page.getByLabel('کوردی').fill('سوپاس بۆ هاتنت، بەردەوام بە!');
  await page.getByLabel('English').fill('Thank you, keep going!');
  await page.getByLabel('نرخی ئاسایی دۆلار (دینار)').fill('1480');
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('پاشەکەوت کرا.')).toBeVisible();

  const gym = await data.gym();
  const read = async () => {
    const { data: rows } = await admin()
      .from('settings')
      .select('key, value')
      .eq('gym_id', gym.id)
      .in('key', [
        'receipts.footer_ckb',
        'receipts.footer_en',
        'receipts.footer_ar',
        'payments.usd_rate',
      ])
      .order('key');
    return rows;
  };
  expect(await read()).toEqual([
    { key: 'payments.usd_rate', value: 1480 },
    { key: 'receipts.footer_ckb', value: 'سوپاس بۆ هاتنت، بەردەوام بە!' },
    { key: 'receipts.footer_en', value: 'Thank you, keep going!' },
  ]);

  await page.getByLabel('English').fill('');
  await page.getByLabel('نرخی ئاسایی دۆلار (دینار)').fill('12.5');
  await expect(page.getByText('ژمارەیەکی تەواو بنووسە، لە 0 تا 10,000,000.')).toBeVisible();
  await page.getByLabel('نرخی ئاسایی دۆلار (دینار)').fill('1500');
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('پاشەکەوت کرا.').last()).toBeVisible();
  await expect.poll(read).toEqual([
    { key: 'payments.usd_rate', value: 1500 },
    { key: 'receipts.footer_ckb', value: 'سوپاس بۆ هاتنت، بەردەوام بە!' },
  ]);
});
