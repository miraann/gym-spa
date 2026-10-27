// The release flow's last step (README → Releasing): the live site serves the merged commit, and
// the gym app and the seller panel load in a fresh browser, reach the cloud (Auth health 200) and
// log nothing in the console. Read-only: it never logs in and writes nothing.
//
//   node scripts/check-live.mjs                     waits up to 10 minutes for origin/main
//   node scripts/check-live.mjs --commit <sha>      for another commit
//   node scripts/check-live.mjs --site <url>        for another deployment
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    commit: { type: 'string' },
    site: { type: 'string', default: 'https://gym-spa-ten.vercel.app' },
    wait: { type: 'string', default: '600' },
  },
});
const site = values.site.replace(/\/$/, '');
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
let commit = values.commit;
if (!commit) {
  git(['fetch', '--quiet', 'origin', 'main']);
  commit = git(['rev-parse', 'origin/main']);
}

/** The commit in the served index.html (`<meta name="gym-build">`, vite.config.ts). */
async function servedCommit() {
  const response = await fetch(`${site}/?build-check=${String(Date.now())}`, {
    cache: 'no-store',
  });
  const html = await response.text();
  return /<meta name="gym-build" content="([^"]*)"/.exec(html)?.[1] ?? '(none)';
}

const deadline = Date.now() + Number(values.wait) * 1000;
let served = await servedCommit();
while (served !== commit && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  served = await servedCommit();
}
if (served !== commit) {
  console.error(`The site serves ${served}, not ${commit}.`);
  process.exit(1);
}
console.log(`The site serves ${commit}.`);

const browser = await chromium.launch();
let failed = false;
for (const path of ['/', '/seller/']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const problems = [];
  const health = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().includes('/auth/v1/health')) health.push(response.status());
    else if (response.status() >= 400)
      problems.push(`HTTP ${String(response.status())}: ${response.url()}`);
  });
  const response = await page.goto(`${site}${path}`, { waitUntil: 'networkidle' });
  if (response?.status() !== 200) problems.push(`HTTP ${String(response?.status())} for the page`);
  try {
    // The screen rendered: the login screen's title.
    await page.locator('h1').first().waitFor({ timeout: 20_000 });
  } catch {
    problems.push('no screen rendered');
  }
  // The connection indicator's first check.
  await page.waitForTimeout(2000);
  if (path === '/' && !health.includes(200))
    problems.push(`Auth health: ${health.join(', ') || 'never called'}`);
  console.log(`${path}  ${problems.length === 0 ? 'OK' : problems.join('\n    ')}`);
  failed ||= problems.length > 0;
  await context.close();
}
await browser.close();
if (failed) process.exit(1);
