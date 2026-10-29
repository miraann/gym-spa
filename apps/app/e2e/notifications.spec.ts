import { admin } from './support/backend';
import { expect, signIn, test } from './support/app';

// Phase 9: the message templates (Settings → نامەکان), the reminders list and opening WhatsApp.

const DESKTOP = { width: 1440, height: 900 };

test('the Owner rewrites the welcome message with a placeholder, sees the preview, and goes back to the default', async ({
  page,
  data,
}) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/settings/messages');

  await expect(page.getByRole('heading', { name: 'دەقەکانی نامە' })).toBeVisible();
  await page.locator('[data-template="welcome"]').click();
  const text = page.getByLabel('دەقی نامە');
  await expect(text).toHaveValue(/^سڵاو \{name\}، بەخێربێیت بۆ \{gym\}!/);
  await text.fill('بەخێربێیت ');
  await page.getByRole('button', { name: 'ناوی ئەندام' }).click();
  await expect(text).toHaveValue('بەخێربێیت {name}');
  await expect(page.getByTestId('template-preview')).toHaveText('بەخێربێیت ئارام کەریم');
  await text.fill('بەخێربێیت {nme}');
  await expect(page.getByText('ئەمانە ناناسرێنەوە و بەتاڵ دەمێننەوە: {nme}')).toBeVisible();
  await text.fill('بەخێربێیت {name}');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(text).toHaveValue(/^Hi \{name\}, welcome to \{gym\}!/);
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();
  await expect(page.getByText('دەقەکە پاشەکەوت کرا.')).toBeVisible();

  const gym = await data.gym();
  const { data: saved } = await admin()
    .from('message_templates')
    .select('key, body_ckb, body_en, body_ar')
    .eq('gym_id', gym.id);
  // English and Arabic were left as the default, so they stay "the default".
  expect(saved).toEqual([
    { key: 'welcome', body_ckb: 'بەخێربێیت {name}', body_en: null, body_ar: null },
  ]);
  const row = page.locator('[data-template="welcome"]');
  await expect(row).toContainText('گۆڕدراوە');
  await expect(row).toContainText('بەخێربێیت {name}');

  await row.click();
  await page.getByRole('button', { name: 'گەڕانەوە بۆ بنەڕەت' }).click();
  await expect(page.getByText('دەقی بنەڕەتی گەڕایەوە.')).toBeVisible();
  await expect(row).not.toContainText('گۆڕدراوە');
  const { data: reset } = await admin()
    .from('message_templates')
    .select('body_ckb, body_en, body_ar')
    .eq('gym_id', gym.id);
  expect(reset).toEqual([{ body_ckb: null, body_en: null, body_ar: null }]);
});

test('a receptionist has no messages tab in Settings', async ({ page, data }) => {
  const branchId = await data.branch();
  const reception = await data.staff({ role: 'receptionist', branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, reception, '/settings/display');
  await expect(page.getByRole('link', { name: 'پیشاندان' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'نامەکان' })).toHaveCount(0);
});
