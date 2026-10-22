import { strToU8, zipSync } from 'fflate';
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './support/app';

// Timing, not a test: `IMPORT_TIMING=1 pnpm exec playwright test import-timing` imports a made-up
// list of 5,000 members (an .xlsx file made here, each row with a card and notes) through the
// import page and prints how long each step takes, at full speed and with the CPU slowed down 4
// times (a cheap reception PC). Skipped in the normal run.

test.skip(!process.env.IMPORT_TIMING, 'Set IMPORT_TIMING=1 to time a 5,000-row import');

const ROWS = 5000;
const FIRST = [
  'ئارام',
  'شیلان',
  'هێمن',
  'ڤیان',
  'کاروان',
  'دیلان',
  'سۆران',
  'بەناز',
  'گۆران',
  'نیگار',
];
const SECOND = [
  'کەریم',
  'عەلی',
  'عومەر',
  'جەلال',
  'سەردار',
  'ئیبراهیم',
  'ڕەشید',
  'فاروق',
  'حەمە',
  'ئەنوەر',
];

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A minimal .xlsx file: one sheet of inline strings, as many spreadsheet apps write them. Each
 * variant has its own phones and cards (archived members keep their phones).
 */
function bigXlsx(variant: number): Buffer {
  const header = ['ناو', 'مۆبایل', 'ڕەگەز', 'بەرواری لەدایکبوون', 'ژمارەی کارت', 'تێبینی'];
  const rows = [header];
  for (let i = 0; i < ROWS; i += 1) {
    rows.push([
      `${FIRST[i % 10] ?? ''} ${SECOND[Math.floor(i / 10) % 10] ?? ''} ${String(i)}`,
      `075${String(variant)} ${String(1_000_000 + i).slice(0, 3)} ${String(1_000_000 + i).slice(3)}`,
      i % 2 === 0 ? 'نێر' : 'مێ',
      `${String(1 + (i % 28))}/${String(1 + (i % 12))}/${String(1970 + (i % 35))}`,
      `0${String(7 + variant)}${(0x100000000000 + i).toString(16).toUpperCase()}`,
      i % 3 === 0 ? 'ئازاری پشت' : '',
    ]);
  }
  const sheetRows = rows
    .map(
      (cells, r) =>
        `<row r="${String(r + 1)}">${cells
          .map((text, c) =>
            text === ''
              ? ''
              : `<c r="${String.fromCharCode(65 + c)}${String(r + 1)}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`,
          )
          .join('')}</row>`,
    )
    .join('');
  const files = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Members" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  };
  return Buffer.from(zipSync(files));
}

async function timed(label: string, step: () => Promise<void>): Promise<void> {
  const start = performance.now();
  await step();
  console.log(`${label}: ${((performance.now() - start) / 1000).toFixed(2)} s`);
}

/** From the import page's first step to the members archived again, then back to the start. */
async function importBig(page: Page, file: Buffer): Promise<void> {
  await timed('  reading the file and preparing the rows (until the columns show)', async () => {
    await page.getByTestId('import-file-input').setInputFiles({
      name: 'big.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: file,
    });
    await expect(page.getByTestId('import-columns')).toBeVisible({ timeout: 60_000 });
  });
  await timed('  comparing with existing members (5 calls of 1,000 rows)', async () => {
    await expect(page.getByTestId('import-preview')).toBeVisible({ timeout: 60_000 });
  });
  // The made-up names share their first two words, so most rows start unticked (may be the same
  // person); staff who checked them tick them all.
  await timed('  ticking all rows', async () => {
    await page.getByRole('button', { name: 'دیاریکردنی هەموو ئەوانەی دەهێنرێن' }).click();
    await expect(page.getByTestId('import-selected')).toHaveText(
      `${String(ROWS)} لە ${String(ROWS)} دیاری کراون`,
    );
  });
  await timed('  ticking one row (the whole page updates)', async () => {
    await page.locator('[data-import-row="2"]').getByRole('checkbox').click();
    await expect(page.getByTestId('import-selected')).toHaveText(
      `${String(ROWS - 1)} لە ${String(ROWS)} دیاری کراون`,
    );
  });
  await page.locator('[data-import-row="2"]').getByRole('checkbox').click();
  await page.getByRole('button', { name: `هێنانی ${String(ROWS)} ئەندام` }).click();
  await timed('  importing (one call)', async () => {
    await page.getByRole('dialog').getByRole('button', { name: 'هێنان', exact: true }).click();
    await expect(page.getByTestId('import-done')).toBeVisible({ timeout: 60_000 });
  });
  await page.getByTestId('undo-import').click();
  await expect(page.getByTestId('undo-summary')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('undo-dialog').getByLabel('هۆکار').fill('تاقیکردنەوە');
  await timed('  archiving all of them again (one call)', async () => {
    await page.getByTestId('undo-confirm').click();
    await expect(page.getByTestId('import-done-undone')).toBeVisible({ timeout: 60_000 });
  });
  await page.getByRole('button', { name: 'هێنانی فایلێکی تر' }).click();
}

test('a 5,000-row xlsx file on the import page', async ({ page, data }) => {
  test.setTimeout(600_000);
  const file = bigXlsx(0);
  console.log(`file: ${String(ROWS)} rows, ${(file.length / 1024).toFixed(0)} KB`);
  const branchId = await data.branch();
  const owner = await data.staff({ role: 'owner', branchIds: [branchId], allBranches: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, owner, '/members');
  // The import page itself, once loaded (it is a separate chunk).
  await page.getByRole('link', { name: 'هێنان لە فایل' }).click();
  await expect(page.getByTestId('import-file')).toBeVisible();

  console.log('full speed:');
  await importBig(page, file);

  console.log('CPU 4 times slower:');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await importBig(page, bigXlsx(1));
});
