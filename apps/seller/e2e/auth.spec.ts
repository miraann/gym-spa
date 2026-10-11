import { TestGym, signIn as staffSignIn } from '../../../packages/staff-admin/test/fixture.ts';
import {
  PANEL,
  backend,
  expect,
  signInReady,
  submitLogin,
  submitTotp,
  test,
} from './support/panel';

// Signing in to the seller panel (spec §2.6): password, then two-step login (TOTP), with a
// password of their own and recovery codes on the first login. Gym staff never get in.

const GYMS_HEADING = { level: 1, name: 'جیمەکان' } as const;

test("a new admin's first login: own password, two-step setup, recovery codes once", async ({
  page,
  made,
}) => {
  const admin = await made.admin('e2e-first');
  await page.goto(PANEL);
  await submitLogin(page, admin.email, admin.password);

  // Someone else chose the password.
  await expect(page.getByRole('heading', { name: 'وشەی نهێنیی خۆت هەڵبژێرە' })).toBeVisible();
  const own = `Own-${crypto.randomUUID()}`;
  await page.getByLabel('وشەی نهێنیی نوێ', { exact: true }).fill(own);
  await page.getByLabel('دووبارە وشەی نهێنیی نوێ').fill(own);
  await page.getByRole('button', { name: 'پاشەکەوتکردن' }).click();

  // Two-step login: the key under the QR code, typed into an "authenticator app".
  await expect(
    page.getByRole('heading', { name: 'چوونەژوورەوەی دوو هەنگاوی ڕێک بخە' }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'کۆدی QR بۆ ئەپی کۆد' })).toBeVisible();
  const secret = (await page.getByTestId('totp-secret').textContent())?.replace(/\s/g, '') ?? '';
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  await submitTotp(page, secret);

  // Recovery codes, shown once.
  await expect(page.getByRole('heading', { name: 'کۆدەکانی گەڕاندنەوە' })).toBeVisible();
  const codes = (await page.locator('output').textContent()) ?? '';
  expect(codes.match(/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}/g)).toHaveLength(10);
  await page.getByRole('button', { name: 'کۆدەکانم هەڵگرت' }).click();
  await expect(page.getByRole('heading', GYMS_HEADING)).toBeVisible();

  // The session is in sessionStorage under the panel's own key, never in the gym app's storage.
  const storage = await page.evaluate(() => ({
    session: Object.keys(sessionStorage),
    local: Object.keys(localStorage),
  }));
  expect(storage.session).toContain('gym-seller-auth');
  expect(storage.local.filter((key) => key.includes('auth') || key.startsWith('sb-'))).toEqual([]);
});

test('a gym staff member is refused, even with the right password', async ({ page }) => {
  const gym = await TestGym.create(backend, 'e2e-sl');
  try {
    const owner = await gym.addStaff('owner', 'owner', { allBranches: true });
    // Their login works in the gym app ...
    await staffSignIn(backend, owner.email, owner.password);
    // ... but not in the panel.
    await page.goto(PANEL);
    await submitLogin(page, owner.email, owner.password);
    await expect(page.getByText('ئەم هەژمارە بەڕێوەبەری پانێڵ نییە.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'چوونەژوورەوە' })).toBeVisible();
  } finally {
    await gym.cleanup();
  }
});

test('a wrong password is refused with one message', async ({ page, made }) => {
  const admin = await made.admin('e2e-wrong');
  await page.goto(PANEL);
  await submitLogin(page, admin.email, 'not-the-password');
  await expect(page.getByText('ئیمەیڵ یان وشەی نهێنی هەڵەیە.')).toBeVisible();
});

test('a lost device: a recovery code after the password, then a new device', async ({
  page,
  made,
}) => {
  const admin = await made.admin('e2e-lost');
  const ready = await admin.ready();
  const codes = await ready.client.rpc('seller_new_recovery_codes');
  const [code] = codes.data ?? [];
  if (!code) throw new Error('no recovery code');

  await page.goto(PANEL);
  await submitLogin(page, admin.email, admin.password);
  await expect(page.getByRole('heading', { name: 'کۆدی ئەپەکە بنووسە' })).toBeVisible();
  await page
    .getByRole('button', { name: 'ئامێرەکەم لەدەست چووە: کۆدی گەڕاندنەوە بەکاربهێنە' })
    .click();

  await page.getByLabel('کۆدی گەڕاندنەوە').fill('aaaa-bbbb-cccc-dddd');
  await page.getByRole('button', { name: 'بەکارهێنان' }).click();
  await expect(page.getByText('ئەم کۆدە هەڵەیە یان پێشتر بەکارهاتووە.')).toBeVisible();

  await page.getByLabel('کۆدی گەڕاندنەوە').fill(code.toUpperCase());
  await page.getByRole('button', { name: 'بەکارهێنان' }).click();
  await expect(
    page.getByRole('heading', { name: 'چوونەژوورەوەی دوو هەنگاوی ڕێک بخە' }),
  ).toBeVisible();
});

test('signing in again needs the second step; signing out ends the session', async ({
  page,
  made,
}) => {
  const admin = await made.admin('e2e-again');
  await admin.ready();
  await signInReady(page, admin);
  await page.getByRole('button', { name: 'چوونەدەرەوە' }).click();
  await expect(page.getByRole('heading', { name: 'چوونەژوورەوە' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('gym-seller-auth'))).toBeNull();
});
