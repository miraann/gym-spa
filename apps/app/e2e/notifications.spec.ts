import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { admin, write } from './support/backend';
import { addMember } from './support/members';
import { expect, signIn, test, unlock } from './support/app';

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

test("the bell shows reception today's reminders, not the stock, and opening it marks them read", async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const reception = await data.staff({ role: 'receptionist', branchIds: [branchId] });
  const gym = await data.gym();
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  await write(
    admin()
      .from('staff_notifications')
      .insert([
        {
          gym_id: gym.id,
          branch_id: branchId,
          kind: 'reminders_ready',
          subject_id: branchId,
          notify_on: today,
          details: { count: 4 },
        },
        {
          gym_id: gym.id,
          branch_id: branchId,
          kind: 'low_stock',
          subject_id: randomUUID(),
          notify_on: today,
          details: { product: { ckb: 'ئاو', en: null, ar: null }, quantity: 2, level: 5 },
        },
      ]),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, reception, '/members');

  const bell = page.getByTestId('notification-bell');
  await expect(bell).toHaveAccessibleName('ئاگادارکردنەوەکان · 1 نەخوێندراوە');
  await bell.click();
  const item = page.locator('[data-notification="reminders_ready"]');
  await expect(item).toContainText('4 بیرخستنەوەی واتسئاپ ئامادەن');
  await expect(page.locator('[data-notification="low_stock"]')).toHaveCount(0);
  await expect(bell).toHaveAccessibleName('ئاگادارکردنەوەکان');
  const { data: reads } = await admin()
    .from('staff_notification_reads')
    .select('staff_id')
    .eq('gym_id', gym.id);
  expect(reads).toEqual([{ staff_id: reception.id }]);

  await item.click();
  await expect(page).toHaveURL(/\/notifications$/);
});

/** Today and an earlier day in Baghdad, as YYYY-MM-DD. */
function baghdadDay(daysAgo = 0): string {
  return new Date(Date.now() + 3 * 3_600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

function reminderRow(gymId: string, branchId: string, day: string, count: number) {
  return {
    gym_id: gymId,
    branch_id: branchId,
    kind: 'reminders_ready',
    subject_id: branchId,
    notify_on: day,
    details: { count },
  };
}

function lowStockRow(gymId: string, branchId: string, day: string, product: string) {
  return {
    gym_id: gymId,
    branch_id: branchId,
    kind: 'low_stock',
    subject_id: randomUUID(),
    notify_on: day,
    details: { product: { ckb: product, en: null, ar: null }, quantity: 1, level: 5 },
  };
}

test('the bell groups by day, merges the branches, and opens the right page with its filter', async ({
  page,
  data,
}) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const gym = await data.gym();
  const main = await data.branch();
  const east = await data.branch();
  await write(
    admin()
      .from('staff_notifications')
      .insert([
        reminderRow(gym.id, main, baghdadDay(), 9),
        reminderRow(gym.id, east, baghdadDay(), 1),
        lowStockRow(gym.id, main, baghdadDay(), 'ئاو'),
        lowStockRow(gym.id, main, baghdadDay(), 'خاولی'),
        reminderRow(gym.id, main, baghdadDay(1), 1),
        // Older than a week: only on /notifications, never in the bell.
        reminderRow(gym.id, main, baghdadDay(10), 6),
      ]),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, owner, '/members');

  const bell = page.getByTestId('notification-bell');
  await expect(bell).toHaveAccessibleName('ئاگادارکردنەوەکان · 3 نەخوێندراوە');
  await expect(bell.locator('[data-slot="bell-badge"]')).toHaveText('3');
  await bell.click();
  const panel = page.getByTestId('bell-panel');
  await expect(panel.getByRole('heading', { name: 'ئەمڕۆ' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'دوێنێ' })).toBeVisible();
  await expect(panel.locator('[data-notification]')).toHaveCount(3);
  // One row for both branches' reminders, the branches on one line, most first.
  const reminders = panel.locator('[data-notification="reminders_ready"]').first();
  await expect(reminders).toContainText('10 بیرخستنەوەی واتسئاپ ئامادەن');
  await expect(reminders.locator('[data-slot="bell-branches"]')).toHaveText(
    'لقی تاقیکردنەوە B2 9 · لقی تاقیکردنەوە B3 1',
  );
  await expect(reminders).toHaveAttribute('data-new', 'true');
  await expect(reminders).toContainText('ئێستا');
  // Yesterday's single reminder: the singular wording, "yesterday" as its time.
  const yesterday = panel.locator('[data-notification="reminders_ready"]').nth(1);
  await expect(yesterday).toContainText('1 بیرخستنەوەی واتسئاپ ئامادەیە');
  await expect(yesterday).toContainText('دوێنێ');
  const low = panel.locator('[data-notification="low_stock"]');
  await expect(low).toContainText('2 کاڵا کەمن لە کۆگا');
  await expect(low).toContainText('ئاو، خاولی');
  // Opening it read everything: the badge is gone, the new rows stay marked until it closes.
  await expect(bell).toHaveAccessibleName('ئاگادارکردنەوەکان');
  await expect(bell.locator('[data-slot="bell-badge"]')).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'بینینی هەموو ئاگادارکردنەوەکان' })).toBeVisible();

  await low.click();
  await expect(page).toHaveURL(/\/shop\/stock\?.*low=true/);
  await expect(page).toHaveURL(new RegExp(`branch=${main}`));
  await expect(panel).toHaveCount(0);

  // Yesterday's row opens that day's reminders.
  await bell.click();
  await expect(panel.locator('[data-new]')).toHaveCount(0);
  await panel.locator('[data-notification="reminders_ready"]').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/notifications[?]day=${baghdadDay(1)}`));
});

test('on a phone the bell is a bottom sheet; the badge stops at 9+, and nothing new is said kindly', async ({
  page,
  data,
}) => {
  const owner = await data.staff({ role: 'owner', branchIds: [], allBranches: true });
  const gym = await data.gym();
  const branchId = await data.branch();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, owner, '/members');
  const bell = page.getByTestId('notification-bell');

  // Nothing at all: the friendly empty state.
  await bell.click();
  const sheet = page.locator('[data-slot="sheet-content"][data-side="bottom"]');
  await expect(sheet.getByRole('heading', { name: 'ئاگادارکردنەوەکان' })).toBeVisible();
  await expect(sheet.getByText('هیچ ئاگادارکردنەوەیەکی نوێ نییە')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // Eleven rows: reminders on 6 days, low stock on 5.
  await write(
    admin()
      .from('staff_notifications')
      .insert([
        ...[0, 1, 2, 3, 4, 5].map((days) => reminderRow(gym.id, branchId, baghdadDay(days), 2)),
        ...[0, 1, 2, 3, 4].map((days) => lowStockRow(gym.id, branchId, baghdadDay(days), 'ئاو')),
      ]),
  );
  await page.reload();
  // A reload locks the app.
  await unlock(page, owner);
  await expect(bell.locator('[data-slot="bell-badge"]')).toHaveText('9+');
  await expect(bell).toHaveAccessibleName('ئاگادارکردنەوەکان · 11 نەخوێندراوە');
  await bell.click();
  await expect(sheet.locator('[data-notification]')).toHaveCount(11);
  await expect(sheet.locator('[data-new]')).toHaveCount(11);
  // Marking all read takes the marks away at once.
  await sheet.getByRole('button', { name: 'هەمووی وەک خوێنراو دیاری بکە' }).click();
  await expect(sheet.locator('[data-new]')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'هەمووی وەک خوێنراو دیاری بکە' })).toBeDisabled();
});
