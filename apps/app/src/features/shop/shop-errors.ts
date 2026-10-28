import { logError } from '@/lib/logger';
import { errorField } from '@/lib/save-error';

/** Keys the database raises for the shop (supabase/migrations/20261029100000_shop.sql). */
const DATABASE_ERROR_KEYS = [
  'permission_denied',
  'no_branch_access',
  'branch_inactive',
  'gym_read_only',
  'invalid_category',
  'invalid_product',
  'category_not_found',
  'barcode_in_use',
  'product_not_found',
  'product_not_counted',
  'product_inactive',
  'movement_exists',
  'invalid_movement',
  'out_of_stock',
  'invoice_exists',
  'member_not_found',
  'member_archived',
  'invalid_sale',
  'price_changed',
  'walk_in_pays_in_full',
  'invalid_payment',
  'payment_too_large',
] as const;

/** Why a shop call failed, as a key of shop:errors. */
export type ShopErrorKey =
  (typeof DATABASE_ERROR_KEYS)[number] | 'invalid_request' | 'network' | 'unexpected';

function isDatabaseErrorKey(value: unknown): value is (typeof DATABASE_ERROR_KEYS)[number] {
  return DATABASE_ERROR_KEYS.some((key) => key === value);
}

/** Sorts a failed shop call into a key; anything unexpected is logged. */
export function shopErrorKey(error: unknown, action: string): ShopErrorKey {
  const message = errorField(error, 'message');
  const code = errorField(error, 'code');
  if (error instanceof TypeError || message === 'Failed to fetch') return 'network';
  if (isDatabaseErrorKey(message)) return message;
  if (code === '42501') return 'permission_denied';
  if (code === '22023' || code === '22P02') return 'invalid_request';
  logError(error, { area: 'shop', action });
  return 'unexpected';
}
