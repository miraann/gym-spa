import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './support/backend';
import { addPlan } from './support/sales';
import { expect, signIn, test } from './support/app';

// The spa's setup (step 6d): the Owner adds services, rooms, a spa staff member with their services
// and hours, and a package; a plan includes spa sessions; reception can't open the setup.

const DESKTOP = { width: 1440, height: 900 };

async function rows(
  data: TestData,
  table: 'spa_services' | 'spa_rooms' | 'spa_packages',
  columns: string,
) {
  const gym = await data.gym();
  const { data: found } = await admin()
    .from(table)
    .select(columns)
    .eq('gym_id', gym.id)
    .order('name_ckb');
  return found;
}

test('the Owner sets up the spa: services, rooms, staff and a package', async ({ page, data }) => {
  await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/spa/setup');
  await expect(page.getByRole('heading', { level: 1, name: 'ڕێکخستنی سپا' })).toBeVisible();
  const dialog = page.getByRole('dialog');

  // Services.
  await expect(page.getByText('هێشتا هیچ خزمەتگوزارییەک زیاد نەکراوە.')).toBeVisible();
  await page.getByRole('button', { name: 'خزمەتگوزاریی نوێ' }).click();
  await dialog.getByLabel('ناو بە کوردی').fill('مەساژی تەواوی لەش');
  await dialog.getByLabel('نرخ (دینار)').fill('30,000');
  await dialog.getByLabel('کاتی پاککردنەوە (خولەک)').fill('15');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('خزمەتگوزارییەکە پاشەکەوت کرا.')).toBeVisible();
  await page.getByRole('button', { name: 'خزمەتگوزاریی نوێ' }).click();
  await dialog.getByLabel('ناو بە کوردی').fill('ساونا');
  await dialog.getByLabel('جۆر').selectOption('sauna');
  await dialog.getByLabel('ماوە (خولەک)').fill('30');
  await dialog.getByLabel('نرخ (دینار)').fill('10000');
  await dialog.getByLabel('کارمەندی سپای پێویستە').click();
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.locator('[data-spa-service="ساونا"]')).toContainText('بێ کارمەند');
  expect(
    await rows(
      data,
      'spa_services',
      'name_ckb, kind, duration_minutes, cleanup_minutes, price, needs_therapist',
    ),
  ).toEqual([
    {
      name_ckb: 'ساونا',
      kind: 'sauna',
      duration_minutes: 30,
      cleanup_minutes: 0,
      price: 10_000,
      needs_therapist: false,
    },
    {
      name_ckb: 'مەساژی تەواوی لەش',
      kind: 'massage',
      duration_minutes: 60,
      cleanup_minutes: 15,
      price: 30_000,
      needs_therapist: true,
    },
  ]);

  // A wrong value is caught before anything is sent.
  await page.locator('[data-spa-service="ساونا"]').click();
  await dialog.getByLabel('ماوە (خولەک)').fill('600');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(dialog.getByText('لە 5 تا 480 خولەک.')).toBeVisible();
  await dialog.getByRole('button', { name: 'پاشگەزبوونەوە' }).click();

  // Rooms.
  await page.getByRole('link', { name: 'ژوور' }).click();
  await page.getByRole('button', { name: 'ژووری نوێ' }).click();
  await dialog.getByLabel('ناوی ژوور').fill('ژووری مەساژ ١');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('ژوورەکە پاشەکەوت کرا.')).toBeVisible();
  await page.getByRole('button', { name: 'ژووری نوێ' }).click();
  await dialog.getByLabel('ناوی ژوور').fill('ساونای گەورە');
  await dialog.getByLabel('جۆر').selectOption('sauna');
  await dialog.getByLabel('ژمارەی جێگە').fill('6');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.locator('[data-spa-room="ساونای گەورە"]')).toContainText('6 جێگە');
  await page.getByRole('button', { name: 'ژووری نوێ' }).click();
  await dialog.getByLabel('ناوی ژوور').fill('ژووری مەساژ ١');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(dialog.getByText('ژوورێکی تر لەم لقەدا ئەم ناوەی هەیە.')).toBeVisible();
  await dialog.getByRole('button', { name: 'پاشگەزبوونەوە' }).click();
  expect(await rows(data, 'spa_rooms', 'name_ckb, kind, capacity')).toEqual(
    expect.arrayContaining([
      { name_ckb: 'ساونای گەورە', kind: 'sauna', capacity: 6 },
      { name_ckb: 'ژووری مەساژ ١', kind: 'massage', capacity: 1 },
    ]),
  );

  // Spa staff: what they do and when they work (two windows on Monday).
  await page.getByRole('link', { name: 'کارمەندانی سپا' }).click();
  await page.getByRole('button', { name: 'کارمەندی سپای نوێ' }).click();
  await dialog.getByLabel('ناوی تەواو').fill('ڕۆژان عەلی');
  await dialog.getByLabel('ژمارەی مۆبایل (ئارەزوومەندانە)').fill('0750 444 1122');
  await dialog.getByLabel('کۆمیسیۆن (لەسەدا)').fill('12.5');
  await dialog.getByLabel('مەساژی تەواوی لەش').click();
  await dialog.getByRole('button', { name: 'زیادکردنی کات بۆ دووشەممە' }).click();
  await dialog.getByRole('button', { name: 'زیادکردنی کات بۆ دووشەممە' }).click();
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('زانیارییەکانی ڕۆژان عەلی پاشەکەوت کران.')).toBeVisible();
  await expect(page.locator('[data-spa-therapist="ڕۆژان عەلی"]')).toContainText('12.5%');
  const gym = await data.gym();
  const { data: therapist } = await admin()
    .from('spa_therapists')
    .select(
      'phone, commission_percent, spa_therapist_services (service_id), spa_therapist_hours (weekday, starts_at, ends_at)',
    )
    .eq('gym_id', gym.id)
    .single();
  expect(therapist).toMatchObject({ phone: '+9647504441122', commission_percent: 12.5 });
  expect(therapist?.spa_therapist_services).toHaveLength(1);
  expect(
    therapist?.spa_therapist_hours
      .map((each) => `${String(each.weekday)} ${each.starts_at}-${each.ends_at}`)
      .sort(),
  ).toEqual(['1 09:00:00-17:00:00', '1 17:00:00-24:00:00']);

  // A package of five massages.
  await page.getByRole('link', { name: 'پاکێج' }).click();
  await page.getByRole('button', { name: 'پاکێجی نوێ' }).click();
  await dialog.getByLabel('ناو بە کوردی').fill('پێنج مەساژ');
  await dialog
    .getByLabel('خزمەتگوزاری', { exact: true })
    .selectOption({ label: 'مەساژی تەواوی لەش' });
  await dialog.getByLabel('نرخ (دینار)').fill('120000');
  await dialog.getByLabel('ماوەی بەکارهێنان (ڕۆژ)').fill('90');
  await dialog.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.locator('[data-spa-package="پێنج مەساژ"]')).toContainText('5 دانیشتن');
  expect(await rows(data, 'spa_packages', 'name_ckb, session_count, price, valid_days')).toEqual([
    { name_ckb: 'پێنج مەساژ', session_count: 5, price: 120_000, valid_days: 90 },
  ]);
});

test('a plan includes spa sessions', async ({ page, data }) => {
  await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const gym = await data.gym();
  const serviceId = randomUUID();
  await write(
    admin().from('spa_services').insert({
      id: serviceId,
      gym_id: gym.id,
      name_ckb: 'ساونا',
      kind: 'sauna',
      duration_minutes: 30,
      price: 10_000,
      needs_therapist: false,
    }),
  );
  const planId = await addPlan(data, 'مانگانەی زێڕین', 50_000);
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, `/plans/${planId}`);

  const card = page.getByTestId('plan-spa-sessions');
  await expect(card).toContainText('هیچ دانیشتنێکی سپا لەگەڵ ئەم پلانە نییە.');
  await card.getByRole('button', { name: 'زیادکردنی خزمەتگوزاری' }).click();
  await card.getByLabel('ساونا ژمارە').fill('4');
  await card.getByRole('button', { name: 'پاشەکەوتکردنی دانیشتنەکان' }).click();
  await expect(page.getByText('دانیشتنەکانی سپا پاشەکەوت کران.')).toBeVisible();
  const { data: sessions } = await admin()
    .from('plan_spa_sessions')
    .select('service_id, session_count')
    .eq('plan_id', planId);
  expect(sessions).toEqual([{ service_id: serviceId, session_count: 4 }]);
});

test('reception can’t open the spa setup', async ({ page, data }) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/spa/setup/services');
  await expect(page.getByText('ناتوانیت ئەم پەڕەیە بکەیتەوە')).toBeVisible();
  await expect(page.getByRole('button', { name: 'خزمەتگوزاریی نوێ' })).toHaveCount(0);
});
