import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './support/backend';
import { addMember } from './support/members';
import { expect, signIn, test } from './support/app';

// Support access (MT-4b): the Owner lets Click Group in for a while and ends it again; everyone
// sees the notice while it runs; the gym sees what Click Group read.

const DESKTOP = { width: 1440, height: 900 };

async function addGrant(data: TestData): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin()
      .from('support_grants')
      .insert({
        id,
        gym_id: gym.id,
        reason: 'کێشەی پسوولە',
        ends_at: new Date(Date.now() + 3 * 3_600_000).toISOString(),
      }),
  );
  return id;
}

test('the Owner lets Click Group in for a day, sees the notice, and ends it', async ({
  page,
  data,
}) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/settings/support');

  await expect(page.getByText('ئێستا کلیک گرووپ ناتوانێت زانیارییەکانتان ببینێت.')).toBeVisible();
  await page.getByRole('button', { name: 'یەک ڕۆژ' }).click();
  await page.getByRole('button', { name: 'ڕێگەدان' }).click();
  await expect(page.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await page.getByLabel('هۆکار').fill('کێشەی پسوولە');
  await page.getByRole('button', { name: 'ڕێگەدان' }).click();

  await expect(page.getByTestId('support-running')).toContainText('هۆکار: کێشەی پسوولە');
  await expect(page.locator('[data-support-notice]')).toContainText('کلیک گرووپ تا');
  const gym = await data.gym();
  const { data: rows } = await admin()
    .from('support_grants')
    .select('reason, starts_at, ends_at, revoked_at')
    .eq('gym_id', gym.id);
  expect(rows).toHaveLength(1);
  const [grant] = rows ?? [];
  expect(Date.parse(grant?.ends_at ?? '') - Date.parse(grant?.starts_at ?? '')).toBe(
    24 * 3_600_000,
  );

  await page.getByRole('button', { name: 'کۆتاییپێهێنان' }).click();
  await expect(page.getByText('ئێستا کلیک گرووپ ناتوانێت زانیارییەکانتان ببینێت.')).toBeVisible();
  await expect(page.locator('[data-support-notice]')).toHaveCount(0);
  await expect(page.getByText('زووتر کۆتایی پێهێنرا')).toBeVisible();
});

test('a receptionist sees the notice but not the page', async ({ page, data, staff }) => {
  await addGrant(data);
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/settings/display');
  await expect(page.locator('[data-support-notice]')).toContainText('کلیک گرووپ تا');
  await expect(page.locator('[data-support-notice]').getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'کلیک گرووپ' })).toHaveCount(0);
});

test('the Owner sees what Click Group read', async ({ page, data }) => {
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501290001');
  const grantId = await addGrant(data);
  const gym = await data.gym();
  await write(
    admin()
      .from('support_reads')
      .insert([
        {
          gym_id: gym.id,
          grant_id: grantId,
          admin_id: randomUUID(),
          admin_email: 'ali@clickgroup.example',
          what: 'members',
          details: { search: 'ئارام' },
        },
        {
          gym_id: gym.id,
          grant_id: grantId,
          admin_id: randomUUID(),
          admin_email: 'ali@clickgroup.example',
          what: 'member',
          member_id: memberId,
          details: {},
        },
      ]),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/settings/support');

  const reads = page.getByTestId('support-reads');
  await expect(reads.locator('[data-support-read]')).toHaveCount(2);
  await expect(reads).toContainText('گەڕان بۆ «ئارام»');
  await expect(reads).toContainText('زانیاریی ئەندام: ئارام کەریم');
  await expect(reads).toContainText('ali@clickgroup.example');
});
