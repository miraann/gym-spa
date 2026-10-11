import { describe, it } from 'vitest';
import { SELLER_ADMIN_CASES } from './cases.ts';

// The same cases run in Deno: supabase/functions/seller-admin/cases.test.ts.
describe('seller-admin', () => {
  for (const { name, run } of SELLER_ADMIN_CASES) it(name, run);
});
