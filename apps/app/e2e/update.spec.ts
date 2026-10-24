// Step 3a: a new version that the service worker finds is shown as a notice until staff update,
// on the login screen and inside the app, and the update reloads into it. Each test serves its own
// copy of the build, so it can change that copy's service worker the way a deployment does.
import { appendFile, cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { LOGIN_HEADING, expect, signIn, test as base } from './support/app';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
};

interface Site {
  readonly url: string;
  /** A new deployment: the service worker changes, as it does when any file of the app does. */
  deploy(): Promise<void>;
}

const test = base.extend<{ site: Site }>({
  // eslint-disable-next-line no-empty-pattern
  site: async ({}, use) => {
    const root = await mkdtemp(path.join(tmpdir(), 'gym-update-'));
    await cp(DIST, root, { recursive: true });
    // Like Vercel (vercel.json): a file if there is one, otherwise the app's index.html.
    const server = createServer((request, response) => {
      void (async () => {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
        let file = path.join(root, pathname);
        const isFile = file.startsWith(root) && (await stat(file).catch(() => null))?.isFile();
        if (!isFile) file = path.join(root, 'index.html');
        response.writeHead(200, {
          'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        response.end(await readFile(file));
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
    const { port } = server.address() as AddressInfo;
    let deployments = 0;
    await use({
      url: `http://localhost:${String(port)}/`,
      deploy: async () => {
        deployments += 1;
        await appendFile(path.join(root, 'sw.js'), `\n// deployment ${String(deployments)}\n`);
      },
    });
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    await rm(root, { recursive: true, force: true });
  },
});

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });
}

/** Coming back online is one of the moments the app looks for a new version (pwa.ts). */
async function lookForUpdate(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

async function hasWaitingVersion(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.waiting);
  });
}

test('the login screen shows a new version, and the update reloads into it', async ({
  page,
  site,
}) => {
  await page.goto(site.url);
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await waitForServiceWorker(page);
  const notice = page.getByTestId('update-notice');
  await expect(notice).toHaveCount(0);

  await site.deploy();
  await lookForUpdate(page);
  await expect(notice).toContainText('وەشانێکی نوێی ئەپەکە ئامادەیە');
  // Nobody is working on the login screen: no word about the app locking.
  await expect(notice).not.toContainText('قفڵ');

  const reloaded = page.waitForEvent('load');
  await notice.getByRole('button', { name: 'نوێکردنەوە' }).click();
  await reloaded;
  await expect(page.getByRole('heading', LOGIN_HEADING)).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(await hasWaitingVersion(page)).toBe(false);
});

test('inside the app the notice says the app locks, and asks first when a form is not saved', async ({
  page,
  site,
  staff,
}) => {
  await signIn(page, staff, `${site.url}members/new`);
  await waitForServiceWorker(page);

  await site.deploy();
  await lookForUpdate(page);
  const notice = page.getByTestId('update-notice');
  await expect(notice).toContainText('ئەپەکە قفڵ دەبێت');

  await page.getByLabel('ناوی تەواو').fill('ئارام کەریم');
  await notice.getByRole('button', { name: 'نوێکردنەوە' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('گۆڕانکارییەکان هێشتا پاشەکەوت نەکراون');
  // Later: nothing happens, the typing stays and so does the notice.
  await dialog.getByRole('button', { name: 'دواتر' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('ناوی تەواو')).toHaveValue('ئارام کەریم');
  await expect(notice).toBeVisible();

  await notice.getByRole('button', { name: 'نوێکردنەوە' }).click();
  const reloaded = page.waitForEvent('load');
  await page.getByRole('dialog').getByRole('button', { name: 'هەر نوێی بکەرەوە' }).click();
  await reloaded;
  // A reload locks the app; the new version needs no more updating.
  await expect(page.locator('[data-auth-screen]')).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(await hasWaitingVersion(page)).toBe(false);
});
