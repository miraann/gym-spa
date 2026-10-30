import { test as base, expect, type Page } from '@playwright/test';
import { TestGym, type Backend } from '../../../../packages/staff-admin/test/fixture.ts';
import { localBackend, localSql } from '../../../../packages/staff-admin/test/local.ts';
import {
  TestPlatformAdmin,
  removePlatformAdminsSql,
  totpCode,
} from '../../../../packages/seller-admin/test/platform.ts';

// What the panel's tests share: the local backend, platform admins made like
// `pnpm bootstrap:platform-admin` does, gyms to clean up, and the login steps.

export const backend: Backend = localBackend();

/** Everything a test made, removed afterwards (admins with SQL: no API may delete one). */
export class Made {
  readonly admins: string[] = [];
  readonly gyms: TestGym[] = [];
  /** Offline gyms' records: their licenses and activations are platform rows, removed with SQL. */
  readonly offlineGyms: string[] = [];

  async admin(label: string): Promise<TestPlatformAdmin> {
    const admin = await TestPlatformAdmin.create(backend, label);
    this.admins.push(admin.id);
    return admin;
  }

  gym(id: string, code: string): TestGym {
    const gym = TestGym.existing(backend, id, code);
    this.gyms.push(gym);
    return gym;
  }

  offlineGym(id: string): void {
    this.offlineGyms.push(id);
  }

  async cleanup(): Promise<void> {
    for (const gym of this.gyms) await gym.cleanup();
    for (const id of this.offlineGyms) {
      // The license log stays (append-only), like the seller log.
      localSql(`delete from platform.activations where gym_id = '${id}';
        delete from platform.licenses where gym_id = '${id}';
        delete from public.gyms where id = '${id}';`);
    }
    localSql(removePlatformAdminsSql(this.admins));
  }
}

export const test = base.extend<{ made: Made }>({
  // eslint-disable-next-line no-empty-pattern
  made: async ({}, use) => {
    const made = new Made();
    await use(made);
    await made.cleanup();
  },
});

export { expect };

export const PANEL = '/seller/';
export const run = () => crypto.randomUUID().slice(0, 6);

/** The login form: email and password. */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('ئیمەیڵ').fill(email);
  await page.getByLabel('وشەی نهێنی', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'چوونەژوورەوە' }).click();
}

/** Types a TOTP code for this secret into the 6-digit field and confirms. */
export async function submitTotp(page: Page, secret: string): Promise<void> {
  await page.getByLabel('کۆدی 6 ژمارەیی').fill(await totpCode(secret));
  await page.getByRole('button', { name: 'پشتڕاستکردنەوە' }).click();
}

/**
 * A platform admin who already chose their password and set up two-step login, signed in to the
 * panel (password, then the code from the "authenticator app").
 */
export async function signInReady(page: Page, admin: TestPlatformAdmin): Promise<void> {
  await page.goto(PANEL);
  await submitLogin(page, admin.email, admin.password);
  await expect(page.getByRole('heading', { name: 'کۆدی ئەپەکە بنووسە' })).toBeVisible();
  if (admin.secret === null) throw new Error('No authenticator secret');
  await submitTotp(page, admin.secret);
  await expect(page.getByRole('heading', { level: 1, name: 'جیمەکان' })).toBeVisible();
}
