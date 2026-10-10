import { describe, it } from 'vitest';
import { STAFF_ADMIN_CASES } from './cases.ts';

// The same cases run in Deno: supabase/functions/staff-admin/cases.test.ts.
describe('staff-admin', () => {
  for (const { name, run } of STAFF_ADMIN_CASES) it(name, run);
});
