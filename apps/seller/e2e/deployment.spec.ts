import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localBackend } from '../../../packages/staff-admin/test/local.ts';
import { PANEL, expect, test } from './support/panel';

// The panel on the gym app's domain (decided 2026-10-11): one origin, two apps. The gym app's
// service worker must never answer or cache it, and its bundle reads only what it needs.

const DIST = fileURLToPath(new URL('../../app/dist/seller', import.meta.url));

test("the gym app's service worker never serves the panel, so it is never available offline", async ({
  page,
  context,
}) => {
  // The gym app installs its service worker, which controls the page.
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        return navigator.serviceWorker.controller !== null;
      }),
    )
    .toBe(true);

  // The panel's page and files come from the network, never from the service worker.
  const fromWorker: string[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith(PANEL) && response.fromServiceWorker()) {
      fromWorker.push(response.url());
    }
  });
  await page.goto(PANEL);
  await expect(page.getByRole('heading', { name: 'چوونەژوورەوە' })).toBeVisible();
  expect(fromWorker).toEqual([]);

  // Nothing of the panel is in the service worker's caches.
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(cached.filter((url) => new URL(url).pathname.startsWith(PANEL))).toEqual([]);

  // Offline: the gym app still opens from its cache; the panel doesn't.
  await context.setOffline(true);
  await expect(page.goto(PANEL)).rejects.toThrow();
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty();
  await context.setOffline(false);
});

test("the panel's build reads only its backend address, never a secret", async () => {
  const entries = (await readdir(DIST, { recursive: true })).filter((entry) =>
    /\.(?:html|js)$/.test(entry),
  );
  expect(entries.length).toBeGreaterThan(0);
  const { secretKey } = localBackend();
  let readsBackend = false;
  const leaks: string[] = [];
  for (const entry of entries) {
    const text = await readFile(path.join(DIST, entry), 'utf8');
    if (text.includes(secretKey)) leaks.push(`${entry}: the secret key`);
    if (text.includes('unused-variable-must-not-reach-the-bundle')) {
      leaks.push(`${entry}: VITE_E2E_UNUSED`);
    }
    if (text.includes('http://127.0.0.1:54321')) readsBackend = true;
  }
  expect(readsBackend).toBe(true);
  expect(leaks).toEqual([]);
});

test('the panel has its own stricter Content-Security-Policy and is not indexed', async ({
  page,
}) => {
  await page.goto(PANEL);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("worker-src 'none'");
  expect(csp).toContain("manifest-src 'none'");
  expect(csp).toContain("img-src 'self' data:;");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});
