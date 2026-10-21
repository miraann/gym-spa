import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { admin, write, type TestStaff } from './support/backend';
import {
  HOME_HEADING,
  LOGIN_HEADING,
  expect,
  lockFromMenu,
  scanCard,
  signIn,
  submitPasswordLogin,
  test,
  unlock,
} from './support/app';

// Design review screenshots, not a test: `SCREENSHOTS=<folder> pnpm exec playwright test
// screenshots` saves the main screens on a phone and a desktop, light and dark, in Kurdish.
// Skipped in the normal run.

const OUT = process.env.SCREENSHOTS;
test.skip(!OUT, 'Set SCREENSHOTS=<folder> to take design screenshots');

const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const MEMBERS = [
  ['ئاراس محەمەد کەریم', 'male'],
  ['شیلان عەلی ئەحمەد', 'female'],
  ['هێمن جەلال ڕەشید', 'male'],
  ['ڤیان سەلام عوسمان', 'female'],
  ['ڕێبوار ئەنوەر قادر', 'male'],
  ['ژیان کامەران حەسەن', 'female'],
  ['گۆران فەرهاد مستەفا', 'male'],
  ['چنار ئیسماعیل ڕەحیم', 'female'],
] as const;

/** Opens a page; a reload locks the app, so the staff member unlocks it again. */
async function open(page: Page, staff: TestStaff, path: string): Promise<void> {
  await page.goto(path);
  const lock = page.getByRole('heading', { level: 1, name: 'کێ کار دەکات؟' });
  const main = page.locator('#main');
  await expect(lock.or(main)).toBeVisible();
  if (await lock.isVisible()) await unlock(page, staff);
  await expect(page.locator('[data-auth-screen]')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
}

async function shot(page: Page, name: string): Promise<void> {
  // Let the page's own motion finish.
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT ?? '.'}/${name}.png` });
}

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${device} ${scheme}`, async ({ page, data, browser }) => {
      test.setTimeout(180_000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(viewport);
      const gym = await data.gym();
      const branchId = await data.branch();
      const owner = await data.staff({
        role: 'owner',
        branchIds: [],
        allBranches: true,
        fullName: 'سۆران عومەر',
      });
      await data.staff({ branchIds: [branchId], fullName: 'دیلان ئازاد' });
      const memberIds: string[] = [];
      for (const [index, [fullName, gender]] of MEMBERS.entries()) {
        const id = randomUUID();
        memberIds.push(id);
        await write(
          admin()
            .from('members')
            .insert({
              id,
              gym_id: gym.id,
              branch_id: branchId,
              full_name: fullName,
              gender,
              phone: `+964750${String(1234567 + index * 7919).slice(0, 7)}`,
              member_number: 0,
            }),
        );
      }
      // The first member has a card, and lost one before it.
      await write(
        admin()
          .from('nfc_cards')
          .insert({
            id: randomUUID(),
            gym_id: gym.id,
            member_id: memberIds[0] ?? '',
            uid: 'DEADBEEF',
            status: 'ended',
            end_reason: 'lost',
            ended_at: new Date(Date.now() - 86_400_000).toISOString(),
            created_at: new Date(Date.now() - 90 * 86_400_000).toISOString(),
          }),
      );
      await write(
        admin()
          .from('nfc_cards')
          .insert({
            id: randomUUID(),
            gym_id: gym.id,
            member_id: memberIds[0] ?? '',
            uid: '04A23BC15D6E80',
          }),
      );
      const prefix = `${device}-${scheme}`;

      // A fresh device: the login screen, before anyone logs in.
      const fresh = await browser.newPage({ viewport, colorScheme: scheme });
      await fresh.goto('/');
      await expect(fresh.getByRole('heading', LOGIN_HEADING)).toBeVisible();
      await shot(fresh, `${prefix}-01-login`);
      // Not registered: the Owner registers the device at their first login on it.
      await submitPasswordLogin(fresh, owner);
      await expect(fresh.getByRole('heading', { level: 1 })).toBeVisible();
      await fresh.waitForLoadState('networkidle');
      await shot(fresh, `${prefix}-01b-register-device`);
      await fresh.close();

      await signIn(page, owner);
      await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
      await shot(page, `${prefix}-02-home`);

      const pages = [
        ['03-members', '/members'],
        ['04-member', `/members/${memberIds[0] ?? ''}`],
        ['05-staff', '/staff'],
        ['06-appearance', '/settings/appearance'],
        ['07-settings', '/settings'],
        ['08-roles', '/roles'],
        ['11-branches', '/branches'],
        ['12-devices', '/devices'],
        ['13-new-member', '/members/new'],
      ] as const;
      for (const [name, path] of pages) {
        await open(page, owner, path);
        await shot(page, `${prefix}-${name}`);
      }

      // Cards (step 2e): a member's card and history, giving a card, and testing the reader.
      await open(page, owner, `/members/${memberIds[0] ?? ''}`);
      await page.getByTestId('member-cards').scrollIntoViewIfNeeded();
      await shot(page, `${prefix}-14-member-card`);
      await open(page, owner, `/members/${memberIds[1] ?? ''}`);
      await page.getByRole('button', { name: 'پێدانی کارت' }).click();
      await shot(page, `${prefix}-15-give-card`);
      await page.keyboard.press('Escape');
      await open(page, owner, '/settings/card-reader');
      await scanCard(page, '04A23BC15D6E80');
      await expect(page.getByTestId('card-holder')).toBeVisible();
      await shot(page, `${prefix}-16-card-reader`);

      if (device === 'phone') {
        await open(page, owner, '/');
        await page.getByRole('button', { name: 'زیاتر' }).click();
        await shot(page, `${prefix}-09-more`);
        await page.keyboard.press('Escape');
      }

      await lockFromMenu(page);
      await shot(page, `${prefix}-10-lock`);
    });
  }
}
