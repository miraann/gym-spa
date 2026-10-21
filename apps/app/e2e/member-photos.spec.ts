import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { admin, write, type TestData } from './support/backend';
import { expect, signIn, test } from './support/app';

// Member photos (step 2c): taken with the camera or picked from a file, resized by the app, kept in
// Postgres, shown on the member's page and in the list.

const DESKTOP = { width: 1440, height: 900 };

// Chromium's fake camera (a moving test picture), allowed without asking.
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['camera'],
});

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A PNG picture with a colored gradient, larger than a stored photo may be. */
function testPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      rows.set([(x * 255) / width, (y * 255) / height, 128], row + 1 + x * 3);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function addMember(data: TestData, branchId: string, fullName: string): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('members').insert({
      id,
      gym_id: gym.id,
      branch_id: branchId,
      full_name: fullName,
      gender: 'female',
      phone: '+9647501239001',
      // The server numbers members, whatever the row says.
      member_number: 0,
    }),
  );
  return id;
}

async function storedPhoto(id: string) {
  const { data } = await admin()
    .from('member_photos')
    .select('photo_type, photo, thumbnail_type, thumbnail')
    .eq('id', id)
    .maybeSingle();
  return data;
}

test('a receptionist adds a photo from a file, sees it in the list, and removes it', async ({
  page,
  staff,
  data,
}) => {
  const id = await addMember(data, await data.branch(), 'ژیلا کەریم');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${id}`);
  await expect(page.getByText('هێشتا وێنەی نییە.', { exact: false })).toBeVisible();

  await page.getByTestId('member-photo-file').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: testPng(1200, 900),
  });
  const confirm = page.getByRole('dialog', { name: 'ئەم وێنەیە دابنرێت؟' });
  await expect(confirm.getByRole('img', { name: 'وێنە نوێیەکە' })).toBeVisible();
  await confirm.getByRole('button', { name: 'دانانی وێنە' }).click();
  await expect(page.getByText('وێنەکە پاشەکەوت کرا')).toBeVisible();
  await expect(page.getByRole('img', { name: 'وێنەی ژیلا کەریم' })).toBeVisible();

  // Resized by the app: WebP, at most 150 KB, with a thumbnail of at most 12 KB.
  const saved = await storedPhoto(id);
  expect(saved?.photo_type).toBe('image/webp');
  expect(saved?.thumbnail_type).toBe('image/webp');
  expect(Buffer.from(saved?.photo ?? '', 'base64').length).toBeLessThanOrEqual(150 * 1024);
  expect(Buffer.from(saved?.thumbnail ?? '', 'base64').length).toBeLessThanOrEqual(12 * 1024);
  const { data: member } = await admin()
    .from('members')
    .select('photo_updated_at')
    .eq('id', id)
    .single();
  expect(member?.photo_updated_at).not.toBeNull();

  // The list shows the thumbnail instead of the first letter.
  await page.getByRole('link', { name: 'ئەندامان', exact: true }).click();
  await expect(page.locator('[data-member="000001"] img')).toBeVisible();

  await page.locator('[data-member="000001"]').click();
  await page.getByRole('button', { name: 'لابردنی وێنە' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'لابردنی وێنە' }).click();
  await expect(page.getByText('وێنەکە لابرا')).toBeVisible();
  expect(await storedPhoto(id)).toBeNull();
});

test('a picture that is not an image is refused before anything is sent', async ({
  page,
  staff,
  data,
}) => {
  const id = await addMember(data, await data.branch(), 'ژیلا کەریم');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${id}`);
  await page.getByTestId('member-photo-file').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(page.getByText('تەنها وێنەی PNG، JPEG یان WebP.')).toBeVisible();
  expect(await storedPhoto(id)).toBeNull();
});

test('staff without members.edit see the photo but cannot change it', async ({ page, data }) => {
  const branchId = await data.branch();
  const trainer = await data.staff({ role: 'trainer', branchIds: [branchId] });
  const id = await addMember(data, branchId, 'ژیلا کەریم');
  // Saved by someone else (the smallest JPEG the database accepts).
  const gym = await data.gym();
  const jpeg = '/9j/4AAQSkZJRg==';
  await write(
    admin().from('member_photos').insert({
      id,
      gym_id: gym.id,
      photo_type: 'image/jpeg',
      photo: jpeg,
      thumbnail_type: 'image/jpeg',
      thumbnail: jpeg,
    }),
  );
  await page.setViewportSize(DESKTOP);
  await signIn(page, trainer, `/members/${id}`);
  await expect(page.getByRole('img', { name: 'وێنەی ژیلا کەریم' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'گرتنی وێنە' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'هەڵبژاردنی وێنە' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'لابردنی وێنە' })).toHaveCount(0);
});

test('a receptionist takes a photo with the camera', async ({ page, staff, data }) => {
  const id = await addMember(data, await data.branch(), 'ژیلا کەریم');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, `/members/${id}`);

  await page.getByRole('button', { name: 'گرتنی وێنە' }).click();
  const camera = page.getByRole('dialog', { name: 'گرتنی وێنە' });
  // The live picture is playing.
  await expect
    .poll(() =>
      camera.getByTestId('member-camera').evaluate((video: HTMLVideoElement) => video.videoWidth),
    )
    .toBeGreaterThan(0);
  await camera.getByRole('button', { name: 'گرتن', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'ئەم وێنەیە دابنرێت؟' })
    .getByRole('button', { name: 'دانانی وێنە' })
    .click();
  await expect(page.getByText('وێنەکە پاشەکەوت کرا')).toBeVisible();
  expect((await storedPhoto(id))?.photo_type).toBe('image/webp');

  // The camera is off again once the dialog closes.
  await expect(camera).toBeHidden();
});
