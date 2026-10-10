// The staff module's unit tests in Deno, where the Edge Function runs: the same cases Vitest runs
// in Node (packages/staff-admin/src/cases.ts). `pnpm test:deno`.
import { STAFF_ADMIN_CASES } from '../../../packages/staff-admin/src/cases.ts';

for (const { name, run } of STAFF_ADMIN_CASES) Deno.test(name, run);
