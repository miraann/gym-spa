import type { Browser, Page } from '@playwright/test';
import type { TestData, TestStaff } from './support/backend';
import { HOME_HEADING, expect, signIn, test, unlock } from './support/app';

// The gym's subscription with Click Group in the gym app (spec §2.6, step MT-3c): the 30-, 7- and
// 1-day warnings and the grace period for staff with billing.view (the Owner here), and the
// read-only banner for everyone.

const DAY = 24 * 60 * 60 * 1000;

const ENDING = 'ئابوونەکە خەریکە تەواو دەبێت';
const GRACE = 'ئابوونەکە تەواو بووە';
const ENDED = 'جیمەکە تەنها بۆ بینینە';
const SUSPENDED = 'جیمەکە ڕاگیراوە';
const HIDE = 'شاردنەوەی ئەم ئاگادارکردنەوەیە';

function inDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString();
}

function notice(page: Page) {
  return page.locator('[data-billing-notice]');
}

/** The gym's Owner: every permission, billing.view included. */
function owner(data: TestData): Promise<TestStaff> {
  return data.staff({ role: 'owner', allBranches: true, branchIds: [] });
}

/** A reload starts at the lock screen (a shared device): the staff member unlocks with their PIN. */
async function reloadAndUnlock(page: Page, staff: TestStaff): Promise<void> {
  await page.reload();
  await unlock(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
}

/** A receptionist on another device (a fresh browser context). */
async function receptionistPage(browser: Browser, staff: TestStaff): Promise<Page> {
  const page = await browser.newPage();
  await signIn(page, staff);
  await expect(page.getByRole('heading', HOME_HEADING)).toBeVisible();
  return page;
}

test('the Owner sees the 30-day warning and can hide it until the 7-day one', async ({
  page,
  data,
}) => {
  await data.setGym({ paid_until: inDays(20) });
  const theOwner = await owner(data);
  await signIn(page, theOwner);

  await expect(notice(page)).toHaveAttribute('data-billing-notice', 'ending-30');
  await expect(notice(page)).toContainText(ENDING);
  await expect(notice(page)).toContainText('ڕۆژ ماوە)');
  await page.getByRole('button', { name: HIDE }).click();
  await expect(notice(page)).toHaveCount(0);

  // Hidden for this staff member on this device, also after a reload ...
  await reloadAndUnlock(page, theOwner);
  await expect(notice(page)).toHaveCount(0);

  // ... until the next stage.
  await data.setGym({ paid_until: inDays(5) });
  await reloadAndUnlock(page, theOwner);
  await expect(notice(page)).toHaveAttribute('data-billing-notice', 'ending-7');
});

test("the last day's warning and the grace period can't be hidden; receptionists see neither", async ({
  page,
  browser,
  data,
}) => {
  await data.setGym({ paid_until: inDays(0.25) });
  // Logs in while the gym has one branch, so the device takes it without asking.
  const theOwner = await owner(data);
  await signIn(page, theOwner);
  await expect(notice(page)).toHaveAttribute('data-billing-notice', 'ending-1');
  await expect(page.getByRole('button', { name: HIDE })).toHaveCount(0);

  const receptionist = await data.staff({ branchIds: [await data.branch()] });
  const reception = await receptionistPage(browser, receptionist);
  await expect(notice(reception)).toHaveCount(0);

  await data.setGym({ paid_until: inDays(-5) });
  await reloadAndUnlock(page, theOwner);
  await expect(notice(page)).toHaveAttribute('data-billing-notice', 'grace');
  await expect(notice(page)).toContainText(GRACE);
  await expect(page.getByRole('button', { name: HIDE })).toHaveCount(0);

  await reloadAndUnlock(reception, receptionist);
  await expect(notice(reception)).toHaveCount(0);
  await reception.close();
});

test('everyone sees when the gym is read-only, and why', async ({ page, data, staff }) => {
  await data.setGym({ paid_until: inDays(-40) });
  await signIn(page, staff);
  await expect(notice(page)).toHaveAttribute('data-billing-notice', 'read_only');
  await expect(notice(page)).toContainText(ENDED);
  await expect(notice(page)).toContainText('ئابوونە');

  await data.setGym({ paid_until: null, suspended_at: new Date().toISOString() });
  await reloadAndUnlock(page, staff);
  await expect(notice(page)).toContainText(SUSPENDED);
  await expect(page.getByRole('button', { name: HIDE })).toHaveCount(0);

  await data.setGym({ suspended_at: null });
  await reloadAndUnlock(page, staff);
  await expect(notice(page)).toHaveCount(0);
});
