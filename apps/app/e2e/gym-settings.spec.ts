import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { admin } from './support/backend';
import { addMember } from './support/members';
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

test("the Owner exports all the gym's data as a zip of CSV files", async ({ page, data }) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const branchId = await data.branch();
  await addMember(data, branchId, 'ئارام کەریم', '+9647501630001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/settings/gym');

  const download = page.waitForEvent('download');
  await page.getByTestId('export-all').getByRole('button').click();
  const file = await download;
  const gym = await data.gym();
  expect(file.suggestedFilename()).toBe(
    `${gym.code}-${new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)}.zip`,
  );
  await expect(page.getByText('زانیارییەکان دەرهێنران.')).toBeVisible();

  const files = unzipSync(new Uint8Array(readFileSync(await file.path())));
  expect(Object.keys(files)).toContain('members.csv');
  expect(Object.keys(files)).toContain('payments.csv');
  expect(Object.keys(files)).not.toContain('member_photos.csv');
  const bytes = files['members.csv'] ?? new Uint8Array();
  // A byte order mark first, so Excel reads it as UTF-8 (the decoder below drops it).
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const members = strFromU8(bytes);
  expect(members.startsWith('id,')).toBe(true);
  expect(members).toContain('ئارام کەریم');
});
