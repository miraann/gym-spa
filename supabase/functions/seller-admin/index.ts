// The seller panel's server half online (spec §2.6, step MT-3): creates a gym with its first Owner,
// and adds, deactivates, reactivates and resets platform admins, with Supabase Auth's admin API.
// All of it lives in packages/seller-admin (on top of the staff module); this file only wires it to
// Deno. The offline edition has no seller panel, so there is no gym-server version of it.
//
// Supabase gives the function its address and keys (SUPABASE_URL, SUPABASE_SECRET_KEYS, ...), so
// the secret key is never set by hand and is never in the repo or the app.
import { createSellerAdminHandler, supabaseSellerAdminPorts } from '@gym/seller-admin/server';
import { readStaffAdminConfig } from '@gym/staff-admin/server';

const config = readStaffAdminConfig((name) => Deno.env.get(name));
if (config === null) {
  throw new Error('seller-admin: SUPABASE_URL and the API keys are missing from the environment');
}

Deno.serve(createSellerAdminHandler(supabaseSellerAdminPorts(config)));
