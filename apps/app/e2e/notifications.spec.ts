import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { admin, write } from './support/backend';
import { addMember } from './support/members';
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

/** Catches what the app opens in a new window, instead of opening WhatsApp. */
async function catchOpenedLinks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.assign(window, { openedLinks: opened });
    window.open = (url?: string | URL) => {
      opened.push(String(url));
      return window;
    };
  });
}

async function openedLinks(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { openedLinks: string[] }).openedLinks);
}

test("reception goes through today's reminders: opens WhatsApp with the welcome filled in, and marks it done", async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const reception = await data.staff({ role: 'receptionist', branchIds: [branchId] });
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501590001');
  const gym = await data.gym();
  await catchOpenedLinks(page);
  await page.setViewportSize(DESKTOP);
  await signIn(page, reception, '/notifications');

  const row = page.locator('[data-reminder="welcome"]');
  await expect(row).toContainText('ئارام کەریم');
  await expect(row).toContainText('بەخێرهاتن');
  await row.getByRole('button', { name: 'واتسئاپ' }).click();
  const text = page.getByLabel('نامە', { exact: true });
  await expect(text).toHaveValue(/^سڵاو ئارام کەریم، بەخێربێیت بۆ /);
  await page.getByTestId('open-whatsapp').click();
  await expect(page.getByText('لە واتسئاپ کرایەوە.')).toBeVisible();

  const [link] = await openedLinks(page);
  expect(link).toMatch(/^https:\/\/wa\.me\/9647501590001\?text=/);
  const sent = decodeURIComponent(new URL(link ?? '').searchParams.get('text') ?? '');
  expect(sent).toContain('ئارام کەریم');
  expect(sent).toContain(gym.nameCkb);
  const { data: messages } = await admin()
    .from('member_messages')
    .select('channel, status, template_key, phone, to_emergency_contact, reminder_id, body')
    .eq('member_id', memberId);
  expect(messages).toHaveLength(1);
  expect(messages?.[0]).toMatchObject({
    channel: 'whatsapp_link',
    status: 'opened',
    template_key: 'welcome',
    phone: '+9647501590001',
    to_emergency_contact: false,
  });
  expect(messages?.[0]?.reminder_id).not.toBeNull();
  expect(messages?.[0]?.body).toBe(sent);
  await expect(row).toContainText('لە واتسئاپ کرایەوە');

  await row.getByRole('button', { name: 'تەواو' }).click();
  await expect(page.locator('[data-reminder="welcome"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'هەمووی' }).click();
  await expect(page.locator('[data-reminder="welcome"][data-done]')).toBeVisible();
});

test("a member without a phone of their own gets the message on the emergency contact's number", async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const reception = await data.staff({ role: 'receptionist', branchIds: [branchId] });
  const gym = await data.gym();
  const memberId = randomUUID();
  await write(
    admin().from('members').insert({
      id: memberId,
      gym_id: gym.id,
      branch_id: branchId,
      full_name: 'شیلان عەلی',
      gender: 'female',
      emergency_contact_name: 'دایکی',
      emergency_phone: '+9647701590002',
      preferred_language: 'en',
      member_number: 0,
    }),
  );
  await catchOpenedLinks(page);
  await page.setViewportSize(DESKTOP);
  await signIn(page, reception, `/members/${memberId}`);

  await page.getByRole('button', { name: 'ناردن بە واتسئاپ' }).click();
  await expect(
    page.getByText('ئەندامەکە ژمارەی خۆی نییە، بۆیە بۆ ژمارەی کەسی نزیک دەچێت (دایکی).'),
  ).toBeVisible();
  // In the member's language.
  await expect(page.getByLabel('نامە', { exact: true })).toHaveValue(/^Hi شیلان عەلی, welcome to /);
  await page.getByTestId('open-whatsapp').click();
  await expect(page.getByText('لە واتسئاپ کرایەوە.')).toBeVisible();
  const [link] = await openedLinks(page);
  expect(link).toMatch(/^https:\/\/wa\.me\/9647701590002\?text=Hi/);
  const { data: messages } = await admin()
    .from('member_messages')
    .select('to_emergency_contact, language, reminder_id')
    .eq('member_id', memberId);
  expect(messages).toEqual([{ to_emergency_contact: true, language: 'en', reminder_id: null }]);
});
