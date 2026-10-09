// Two devices (two separate browser profiles) of the same branch against local Supabase + PowerSync.
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect, signIn, test } from './support/app';
import { admin, type TestStaff } from './support/backend';

interface Device {
  readonly context: BrowserContext;
  readonly page: Page;
}

async function openDevice(browser: Browser, baseURL: string | undefined): Promise<Device> {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage() };
}

/** A value from a device's local database (exposed by the e2e build only). */
function localValue(device: Device, sql: string, params: unknown[]): Promise<unknown> {
  return device.page.evaluate(
    async ([query, values]) => {
      const db = (
        window as unknown as {
          gymTestDatabase: { getOptional(sql: string, params: unknown[]): Promise<unknown> };
        }
      ).gymTestDatabase;
      const row = (await db.getOptional(query, values)) as { value?: unknown } | null;
      return row?.value ?? null;
    },
    [sql, params] as const,
  );
}

async function serverLanguage(staff: TestStaff): Promise<string | null> {
  const { data } = await admin()
    .from('staff_users')
    .select('preferred_language')
    .eq('id', staff.id)
    .single();
  return data?.preferred_language ?? null;
}

test('two devices change things offline, and both changes arrive after reconnecting', async ({
  browser,
  baseURL,
  staff,
  data,
}) => {
  const branchId = (
    await admin().from('staff_branches').select('branch_id').eq('staff_id', staff.id).single()
  ).data?.branch_id;
  const second = await data.staff({ branchIds: [branchId ?? ''] });

  const deviceA = await openDevice(browser, baseURL);
  const deviceB = await openDevice(browser, baseURL);
  try {
    await signIn(deviceA.page, staff, '/settings/display');
    await signIn(deviceB.page, second, '/settings/display');
    for (const device of [deviceA, deviceB]) {
      await expect(device.page.getByRole('status')).toContainText('ئۆنلاین');
    }

    // Both lose the internet, and each staff member picks a language on their own device.
    await deviceA.context.setOffline(true);
    await deviceB.context.setOffline(true);
    await deviceA.page.getByRole('radio', { name: 'English' }).click();
    await deviceB.page.getByRole('radio', { name: 'العربية' }).click();
    await expect(deviceA.page.getByRole('status')).toContainText('Offline');
    await expect(deviceB.page.getByRole('status')).toContainText('غير متصل');

    // Kept on each device, waiting to be sent; nothing reached the server.
    expect(await localValue(deviceA, 'SELECT count(*) AS value FROM ps_crud', [])).toBe(1);
    expect(await serverLanguage(staff)).toBeNull();
    expect(await serverLanguage(second)).toBeNull();

    // Back online: both changes upload, each under its own author.
    await deviceA.context.setOffline(false);
    await deviceB.context.setOffline(false);
    await expect.poll(() => serverLanguage(staff), { timeout: 30_000 }).toBe('en');
    await expect.poll(() => serverLanguage(second), { timeout: 30_000 }).toBe('ar');
    const audit = await admin()
      .from('staff_users')
      .select('id, updated_by')
      .in('id', [staff.id, second.id]);
    expect(Object.fromEntries((audit.data ?? []).map((row) => [row.id, row.updated_by]))).toEqual({
      [staff.id]: staff.id,
      [second.id]: second.id,
    });

    // And each device receives the other's change.
    await expect
      .poll(() =>
        localValue(deviceA, 'SELECT preferred_language AS value FROM staff_users WHERE id = ?', [
          second.id,
        ]),
      )
      .toBe('ar');
    await expect
      .poll(() =>
        localValue(deviceB, 'SELECT preferred_language AS value FROM staff_users WHERE id = ?', [
          staff.id,
        ]),
      )
      .toBe('en');
    await expect(deviceA.page.getByRole('status')).toContainText('Online');
    await expect(deviceB.page.getByRole('status')).toHaveText('متصل');
  } finally {
    await deviceA.context.close();
    await deviceB.context.close();
  }
});

test('a staff member who logs in on another device gets their language there', async ({
  page,
  staff,
}) => {
  await admin().from('staff_users').update({ preferred_language: 'en' }).eq('id', staff.id);
  await signIn(page, staff);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
