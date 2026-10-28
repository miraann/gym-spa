import { admin } from './support/backend';
import { addMember } from './support/members';
import { addSpaRoom, addSpaService, addSpaTherapist } from './support/spa';
import { expect, signIn, test } from './support/app';

// The spa calendar (step 6e): reception books a massage for tomorrow, drags it an hour later,
// confirms and cancels it; a walk-in guest pays for the sauna at once and is completed.

const DESKTOP = { width: 1440, height: 900 };

/** Tomorrow in Baghdad at hh:mm, as the database returns it. */
function tomorrowAt(hours: number): string {
  const now = new Date();
  const baghdad = new Date(now.getTime() + 3 * 3_600_000);
  const day = Date.UTC(baghdad.getUTCFullYear(), baghdad.getUTCMonth(), baghdad.getUTCDate() + 1);
  return new Date(day + (hours - 3) * 3_600_000).toISOString();
}

test('reception books a massage, drags it an hour later, confirms and cancels it', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  const massage = await addSpaService(data, {
    nameCkb: 'مەساژ',
    kind: 'massage',
    minutes: 60,
    price: 30_000,
    needsTherapist: true,
  });
  await addSpaRoom(data, branchId, { nameCkb: 'ژووری مەساژ', kind: 'massage', capacity: 1 });
  await addSpaTherapist(data, branchId, 'ڕۆژان عەلی', [massage]);
  const memberId = await addMember(data, branchId, 'ئارام کەریم', '+9647501360001');
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/spa');
  await expect(page.getByRole('heading', { level: 1, name: 'سپا' })).toBeVisible();
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'ڕۆژی دواتر' }).click();
  await page.getByRole('button', { name: 'نۆرەی نوێ' }).click();
  await dialog.getByLabel('ئەندام یان میوان بدۆزەرەوە: ناو، ژمارە یان مۆبایل').fill('ئارام');
  await dialog.getByRole('radio', { name: /ئارام کەریم/ }).click();
  await expect(dialog.getByLabel('کارمەندی سپا')).toHaveValue(/.+/);
  await dialog.getByRole('button', { name: 'تۆمارکردن' }).click();
  await expect(page.getByText(/نۆرەی ئارام کەریم بۆ .* تۆمار کرا\./)).toBeVisible();

  const block = page.locator('[data-spa-booking="ئارام کەریم"]');
  await expect(block).toHaveAttribute('data-status', 'booked');
  const booking = async () => {
    const { data: row } = await admin()
      .from('spa_bookings')
      .select('id, starts_at, status, status_note, price, paid_with')
      .eq('member_id', memberId)
      .single();
    return row;
  };
  expect(await booking()).toMatchObject({ status: 'booked', price: 30_000, paid_with: 'pay' });
  expect(new Date((await booking())?.starts_at ?? '').toISOString()).toBe(tomorrowAt(8));

  // Dragged four rows (an hour, at 15 minutes a row) down.
  const box = await block.boundingBox();
  if (!box) throw new Error('the booking has no box');
  const rowHeight = await page.evaluate(
    () => parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.75,
  );
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 10 + rowHeight * 4, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText(/نۆرەکە گوازرایەوە بۆ/)).toBeVisible();
  await expect
    .poll(async () => new Date((await booking())?.starts_at ?? '').toISOString())
    .toBe(tomorrowAt(9));

  await block.click();
  await dialog.getByRole('button', { name: 'دڵنیاکردنەوە' }).click();
  await expect(page.getByText('نۆرەکە دڵنیا کرایەوە.')).toBeVisible();
  await expect(block).toHaveAttribute('data-status', 'confirmed');

  await block.click();
  await dialog.getByRole('button', { name: 'هەڵوەشاندنەوە' }).click();
  await dialog.getByLabel('هۆکار (ئارەزوومەندانە)').fill('نەخۆش کەوت');
  await dialog.getByRole('button', { name: 'هەڵوەشاندنەوە' }).click();
  await expect(page.getByText('نۆرەکە هەڵوەشێنرایەوە.')).toBeVisible();
  await expect(page.getByText('هەڵوەشێنراو و نەهاتوو (1)')).toBeVisible();
  expect(await booking()).toMatchObject({ status: 'cancelled', status_note: 'نەخۆش کەوت' });
});

test('a walk-in guest pays for the sauna at once, and the visit is completed', async ({
  page,
  data,
}) => {
  const branchId = await data.branch();
  const staff = await data.staff({ branchIds: [branchId] });
  await addSpaService(data, {
    nameCkb: 'ساونا',
    kind: 'sauna',
    minutes: 30,
    price: 10_000,
    needsTherapist: false,
  });
  await addSpaRoom(data, branchId, { nameCkb: 'ساونای گەورە', kind: 'sauna', capacity: 2 });
  await page.setViewportSize(DESKTOP);
  await signIn(page, staff, '/spa');
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'بێ نۆرە' }).click();
  await dialog.getByRole('button', { name: 'میوانی نوێ' }).click();
  await dialog.getByLabel('ناوی میوان').fill('میوانی سپا');
  await dialog.getByLabel('ژمارەی مۆبایل').fill('0750 555 6677');
  await dialog.getByRole('button', { name: 'تۆمارکردن' }).click();
  await expect(page.getByText('میوانی سپا هات بۆ ساونا.')).toBeVisible();

  const gym = await data.gym();
  const { data: guest } = await admin()
    .from('members')
    .select('id, is_guest, phone')
    .eq('gym_id', gym.id)
    .eq('full_name', 'میوانی سپا')
    .single();
  expect(guest).toMatchObject({ is_guest: true, phone: '+9647505556677' });
  const { data: booking } = await admin()
    .from('spa_bookings')
    .select('status, walk_in, invoice_id')
    .eq('member_id', guest?.id ?? '')
    .single();
  expect(booking).toMatchObject({ status: 'arrived', walk_in: true });
  const { data: invoice } = await admin()
    .from('invoices')
    .select('total, payments (amount)')
    .eq('id', booking?.invoice_id ?? '')
    .single();
  expect(invoice).toMatchObject({ total: 10_000, payments: [{ amount: 10_000 }] });

  const block = page.locator('[data-spa-booking="میوانی سپا"]');
  await expect(block).toHaveAttribute('data-status', 'arrived');
  await block.click();
  await dialog.getByRole('button', { name: 'تەواوبوو' }).click();
  await expect(page.getByText('نۆرەکە تەواو بوو.')).toBeVisible();
  await expect(block).toHaveAttribute('data-status', 'completed');
});
