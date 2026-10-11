// The seller module's unit tests in Deno, where the Edge Function runs: the same cases Vitest runs
// in Node (packages/seller-admin/src/cases.ts). `pnpm test:deno`.
import { SELLER_ADMIN_CASES } from '../../../packages/seller-admin/src/cases.ts';

for (const { name, run } of SELLER_ADMIN_CASES) Deno.test(name, run);
