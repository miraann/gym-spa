import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { admin, write, type TestData } from './support/backend';
import { addCard, addMember } from './support/members';
import { expect, signIn, test } from './support/app';

// Importing members from a file (step 2j): the sample member list (samples/, all fake, one
// intended edge case per row, explained on its second sheet), and a refused import.

const DESKTOP = { width: 1440, height: 900 };
const SAMPLE = fileURLToPath(
  new URL('../../../samples/sample-members-import.xlsx', import.meta.url),
);

/** The gym's two branches, named as a gym made from the seller panel names them. */
async function sampleBranches(data: TestData): Promise<{ main: string; second: string }> {
  const main = await data.branch();
  const second = await data.branch();
  await write(admin().from('branches').update({ name_ckb: 'لقی سەرەکی' }).eq('id', main));
  await write(admin().from('branches').update({ name_ckb: 'لقی بەختیاری' }).eq('id', second));
  return { main, second };
}

async function membersOf(data: TestData) {
  const gym = await data.gym();
  const { data: rows } = await admin()
    .from('members')
    .select(
      'id, member_number, full_name, phone, emergency_phone, birth_date, notes, branch_id, created_at',
    )
    .eq('gym_id', gym.id)
    .order('member_number');
  return rows ?? [];
}

test('a branch manager imports the sample member list', async ({ page, data }) => {
  const { main, second } = await sampleBranches(data);
  const manager = await data.staff({ role: 'branch_manager', branchIds: [main, second] });
  // Already in the app: row 18 of the file (same name and phone), and the card of row 3.
  await addMember(data, main, 'ئاکۆ مستەفا', '+9647801234567');
  const shwan = await addMember(data, main, 'شوان ڕەشید', '+9647501230002');
  await addCard(data, shwan, '04B2119A3C6180');

  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/members');
  await page.getByRole('link', { name: 'هێنان لە فایل' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'هێنانی ئەندامان لە فایل' }),
  ).toBeVisible();
  await page.getByTestId('import-file-input').setInputFiles(SAMPLE);
  await expect(page.getByTestId('import-file')).toContainText('20 ڕیز');

  // The notes column: everyone who sees members would read it. Staff send it to the medical notes.
  const columns = page.getByTestId('import-columns');
  const warning = page.getByTestId('notes-warning');
  await expect(warning).toContainText('تێبینییەکان دەخوێننەوە');
  await warning.getByRole('button', { name: 'ئەم ستوونە وەک تێبینیی پزیشکی بهێنە' }).click();
  await expect(warning).toHaveCount(0);
  await expect(columns.getByRole('combobox', { name: 'تێبینی', exact: true })).toHaveValue(
    'medicalNotes',
  );

  // «سەرەکی» and «Main» are the main branch; staff choose the branch of «لقی ٢», not of «لقی ٣».
  const branches = page.getByTestId('import-branches');
  await expect(branches.getByRole('combobox', { name: 'سەرەکی' })).toHaveValue(main);
  await expect(branches.getByRole('combobox', { name: 'Main' })).toHaveValue(main);
  await branches.getByRole('combobox', { name: 'لقی ٢' }).selectOption({ label: 'لقی بەختیاری' });
  await expect(branches.getByRole('combobox', { name: 'لقی ٣' })).toHaveValue('');

  const preview = page.getByTestId('import-preview');
  await expect(preview).toBeVisible();
  const row = (number: number) => preview.locator(`[data-import-row="${String(number)}"]`);
  const expected: Record<number, string> = {
    2: 'valid',
    3: 'warning', // its card is شوان's
    4: 'warning', // only a birth year
    5: 'warning', // a 10-digit card number, and maybe the same person as row 4
    9: 'warning', // the parent's phone, found in the notes
    10: 'error', // a phone too short
    13: 'error', // «لقی ٣», no branch chosen
    15: 'error', // no name
    18: 'exists', // ئاکۆ مستەفا is already a member
    20: 'valid', // in English
  };
  for (const [number, status] of Object.entries(expected)) {
    await expect(row(Number(number))).toHaveAttribute('data-status', status);
  }
  await expect(row(3).locator('[data-issue="card_taken"]')).toContainText('شوان ڕەشید');
  await expect(row(5).locator('[data-issue="same_person"]')).toContainText('ڕیزی 4');
  await expect(row(9).locator('[data-issue="phone_from_notes"]')).toContainText('+9647509991122');
  // Rows that may be the same person start unticked; rows with errors can't be ticked.
  await expect(row(5).getByRole('checkbox')).not.toBeChecked();
  await expect(row(4).getByRole('checkbox')).toBeChecked();
  await expect(row(10).getByRole('checkbox')).toBeDisabled();
  await expect(page.getByTestId('import-selected')).toHaveText('15 لە 20 دیاری کراون');

  await preview.getByRole('button', { name: /^هەڵە/ }).click();
  await expect(preview.locator('[data-import-row]')).toHaveCount(3);
  await preview.getByRole('button', { name: /^هەموو/ }).click();

  await page.getByRole('button', { name: 'هێنانی 15 ئەندام' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('2 کارتیش دەدرێن.');
  await dialog.getByRole('button', { name: 'هێنان', exact: true }).click();

  const done = page.getByTestId('import-done');
  await expect(done).toContainText('15 ئەندام هێنران');
  await expect(done).toContainText('2 کارتیان پێدرا.');
  await expect(done).toContainText('5 ڕیز نەهێنران.');

  // The rows left out, as a file staff can fix: the file's columns, then the reason.
  const downloading = page.waitForEvent('download');
  await done.getByRole('button', { name: 'داگرتنی ڕیزە نەهێنراوەکان (CSV)' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('sample-members-import - نەهێنراوەکان.csv');
  const csv = await readFile(await download.path(), 'utf8');
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  expect(lines).toHaveLength(6);
  expect(lines[0]).toMatch(/,هۆکار$/);
  expect(lines.find((line) => line.startsWith('4,'))).toContain('دیاری نەکرابوو.');
  expect(lines.find((line) => line.startsWith('4,'))).toContain('لەوانەیە هەمان کەسی ڕیزی 4 بێت.');
  expect(lines.find((line) => line.startsWith('17,'))).toContain('دووبارە ناهێنرێت');

  // Saved: numbered in the file's order after the two members already there.
  const members = await membersOf(data);
  expect(members).toHaveLength(17);
  expect(members.slice(2).map((member) => member.member_number)).toEqual(
    Array.from({ length: 15 }, (_, index) => index + 3),
  );
  const named = (name: string) => members.find((member) => member.full_name === name);
  expect(named('ئارام کەریم محەمەد')).toMatchObject({
    member_number: 3,
    phone: '+9647501234567',
    birth_date: '1995-03-15',
    notes: null,
    branch_id: main,
  });
  // Registered on the day the file says, at noon in Baghdad.
  expect(new Date(named('ئارام کەریم محەمەد')?.created_at ?? '').toISOString()).toBe(
    '2024-01-10T09:00:00.000Z',
  );
  expect(named('ريباز عمر ئەحمەد')).toBeUndefined();
  expect(named('ڤیان سەردار')).toMatchObject({ branch_id: second });
  expect(named('دیلان کاروان ئیبراهیم')).toMatchObject({
    phone: null,
    emergency_phone: '+9647509991122',
  });

  // The knee pain went to the medical notes, which only some staff see.
  const vian = named('ڤیان سەردار')?.id ?? '';
  const { data: health } = await admin()
    .from('member_health')
    .select('medical_notes, blood_type')
    .eq('id', vian)
    .single();
  expect(health).toEqual({ medical_notes: 'ئازاری ئەژنۆ هەیە', blood_type: 'AB+' });

  const { data: cards } = await admin()
    .from('nfc_cards')
    .select('uid, status, member_id')
    .in(
      'member_id',
      members.map((member) => member.id),
    )
    .order('uid');
  expect(cards).toEqual([
    { uid: '04A1C1334F6180', status: 'active', member_id: named('ئارام کەریم محەمەد')?.id },
    { uid: '04B2119A3C6180', status: 'active', member_id: shwan },
    { uid: '04C3221B4D6180', status: 'active', member_id: vian },
  ]);

  // What can't be used yet stays with the import record.
  const gym = await data.gym();
  const { data: imports } = await admin()
    .from('member_imports')
    .select('file_name, member_count, card_count, kept')
    .eq('gym_id', gym.id);
  expect(imports).toHaveLength(1);
  expect(imports?.[0]).toMatchObject({
    file_name: 'sample-members-import.xlsx',
    member_count: 15,
    card_count: 2,
  });
  const kept = imports?.[0]?.kept as Record<string, Record<string, string>>;
  expect(kept[named('ئارام کەریم محەمەد')?.id ?? '']).toEqual({
    oldNumber: '1',
    subscriptionType: 'مانگانە',
    subscriptionEnd: '2026-11-10',
  });
});

test('an import with a row the server refuses saves nothing, and the rest can be imported', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/members/import');

  const csv = 'ناو,مۆبایل,ڕەگەز\nئارام کەریم,0750 123 4567,نێر\nشیلان عەلی,0770 123 4567,مێ\n';
  await page.getByTestId('import-file-input').setInputFiles({
    name: 'members.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`\uFEFF${csv}`),
  });
  // No branch column: everyone joins this device's branch.
  await expect(page.getByTestId('import-branches').getByRole('combobox')).toHaveValue(branchId);
  await expect(page.getByTestId('import-selected')).toHaveText('2 لە 2 دیاری کراون');

  // Someone gets row 2's phone after the preview was made.
  const gym = await data.gym();
  await write(
    admin().from('members').insert({
      id: randomUUID(),
      gym_id: gym.id,
      branch_id: branchId,
      full_name: 'هاوڕێ جەمال',
      gender: 'male',
      phone: '+9647501234567',
      member_number: 0,
    }),
  );

  await page.getByRole('button', { name: 'هێنانی 2 ئەندام' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'هێنان', exact: true }).click();
  await expect(page.getByTestId('import-failure')).toContainText('1 ڕیز وەرنەگیران');
  const refused = page.locator('[data-import-row="2"]');
  await expect(refused).toHaveAttribute('data-status', 'error');
  await expect(refused).toContainText('ئەم مۆبایلە ئێستا هی ئەندامێکی ترە.');
  await expect(refused.getByRole('checkbox')).not.toBeChecked();
  expect(await membersOf(data)).toHaveLength(1);

  await page.getByRole('button', { name: 'هێنانی 1 ئەندام' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'هێنان', exact: true }).click();
  await expect(page.getByTestId('import-done')).toContainText('1 ئەندام هێنران');
  expect((await membersOf(data)).map((member) => member.full_name)).toEqual([
    'هاوڕێ جەمال',
    'شیلان عەلی',
  ]);
});

test('a receptionist may not import members', async ({ page, staff }) => {
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/members/import');
  await expect(page.getByTestId('no-access')).toBeVisible();
  await page.getByRole('link', { name: 'ئەندامان', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ئەندامان' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'هێنان لە فایل' })).toHaveCount(0);
});

/** Imports a small CSV file through the page, and waits for the result. */
async function importCsv(page: Page, name: string, csv: string, count: number): Promise<void> {
  await page.getByTestId('import-file-input').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await page.getByRole('button', { name: `هێنانی ${String(count)} ئەندام` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'هێنان', exact: true }).click();
  await expect(page.getByTestId('import-done')).toContainText(`${String(count)} ئەندام هێنران`);
}

async function importOf(data: TestData, fileName: string) {
  const gym = await data.gym();
  const { data: row } = await admin()
    .from('member_imports')
    .select('id, undone_by, undo_reason')
    .eq('gym_id', gym.id)
    .eq('file_name', fileName)
    .single();
  if (!row) throw new Error(`No import ${fileName}`);
  return row;
}

test('a branch manager takes a wrong import back from its result', async ({ page, data }) => {
  const branchId = await data.branch();
  const manager = await data.staff({ role: 'branch_manager', branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/members/import');
  await importCsv(
    page,
    'wrong.csv',
    'ناو,مۆبایل,ڕەگەز,کارت\nئارام کەریم,0750 123 4567,نێر,04A1C1334F6180\nشیلان عەلی,0770 123 4567,مێ,\nهێمن جەلال,0751 333 4455,نێر,\n',
    3,
  );

  await page.getByTestId('undo-import').click();
  const dialog = page.getByTestId('undo-dialog');
  await expect(dialog.getByTestId('undo-summary')).toContainText('3 ئەندام ئەرشیف دەکرێن.');
  await expect(dialog.getByTestId('undo-summary')).toContainText('1 کارتیان ئیتر کار ناکەن.');
  await expect(dialog.getByTestId('undo-changed')).toHaveCount(0);
  await page.getByTestId('undo-confirm').click();
  await expect(dialog.getByText('هۆکارێک بنووسە.')).toBeVisible();
  await dialog.getByLabel('هۆکار').fill('فایلی هەڵە');
  await page.getByTestId('undo-confirm').click();
  await expect(page.getByText('3 ئەندام ئەرشیف کران.')).toBeVisible();
  await expect(page.getByTestId('import-done-undone')).toBeVisible();
  await expect(page.getByTestId('undo-import')).toHaveCount(0);

  // Archived, never deleted, and the card stopped working.
  const members = await membersOf(data);
  expect(members).toHaveLength(3);
  const gym = await data.gym();
  const { data: statuses } = await admin()
    .from('members')
    .select('status, status_reason')
    .eq('gym_id', gym.id);
  expect(statuses).toEqual(
    Array.from({ length: 3 }, () => ({ status: 'archived', status_reason: 'فایلی هەڵە' })),
  );
  const { data: cards } = await admin()
    .from('nfc_cards')
    .select('status, end_reason')
    .eq('gym_id', gym.id);
  expect(cards).toEqual([{ status: 'ended', end_reason: 'member_archived' }]);
  expect(await importOf(data, 'wrong.csv')).toMatchObject({
    undone_by: manager.id,
    undo_reason: 'فایلی هەڵە',
  });
});

test('the import history shows earlier imports, and counts members changed since', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const manager = await data.staff({
    role: 'branch_manager',
    branchIds: [branchId],
    fullName: 'ڕێبوار ئەنوەر',
  });
  await page.setViewportSize(DESKTOP);
  await signIn(page, manager, '/members/import');
  await importCsv(
    page,
    'list.csv',
    'ناو,مۆبایل,ڕەگەز\nئارام کەریم,0750 123 4567,نێر\nشیلان عەلی,0770 123 4567,مێ\n',
    2,
  );
  await page.getByRole('button', { name: 'هێنانی فایلێکی تر' }).click();

  const history = page.getByTestId('import-history');
  const record = history.locator('[data-import-record="list.csv"]');
  await expect(record).toContainText('ڕێبوار ئەنوەر');
  await expect(record).toContainText('2 ئەندام');

  // Someone corrects a member's address after the import.
  const [aram] = await membersOf(data);
  await write(
    admin()
      .from('members')
      .update({ address: 'هەولێر' })
      .eq('id', aram?.id ?? ''),
  );

  await record.getByTestId('undo-import').click();
  await expect(page.getByTestId('undo-changed')).toContainText(
    '1 لەم ئەندامانە لە دوای هێنانەکە گۆڕانکارییان تێدا کراوە.',
  );
  await page.getByTestId('undo-dialog').getByLabel('هۆکار').fill('لیستی کۆن بوو');
  await page.getByTestId('undo-confirm').click();
  await expect(record.getByTestId('import-undone')).toContainText('ڕێبوار ئەنوەر');
  await expect(record.getByTestId('import-undone')).toContainText('لیستی کۆن بوو');
  await expect(record.getByTestId('undo-import')).toHaveCount(0);
  const gym = await data.gym();
  const { data: statuses } = await admin()
    .from('members')
    .select('status')
    .eq('gym_id', gym.id)
    .eq('status', 'archived');
  expect(statuses).toHaveLength(2);
});

test("staff who may import but not archive can't take an import back", async ({ page, data }) => {
  const branchId = await data.branch();
  const roleId = await data.role('هێنەر', ['members.view', 'members.create', 'members.import']);
  const importer = await data.staff({ roleId, branchIds: [branchId] });
  await page.setViewportSize(DESKTOP);
  await signIn(page, importer, '/members/import');
  await importCsv(page, 'mine.csv', 'ناو,مۆبایل,ڕەگەز\nئارام کەریم,0750 123 4567,نێر\n', 1);
  await expect(page.getByTestId('undo-import')).toHaveCount(0);
  await page.getByRole('button', { name: 'هێنانی فایلێکی تر' }).click();
  await expect(page.getByTestId('import-history')).toContainText('mine.csv');
  await expect(page.getByTestId('undo-import')).toHaveCount(0);
});
