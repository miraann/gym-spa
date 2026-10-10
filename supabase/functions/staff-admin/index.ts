// The staff module online (spec §2.5, design B): creates staff logins and resets, deactivates,
// reactivates and renames them with Supabase Auth's admin API. All of it lives in
// packages/staff-admin, which the offline edition's gym-server runs too; this file only wires it
// to Deno.
//
// Supabase gives the function its address and keys (SUPABASE_URL, SUPABASE_SECRET_KEYS, ...), so
// the secret key is never set by hand and is never in the repo or the app.
import {
  createStaffAdminHandler,
  readStaffAdminConfig,
  supabaseStaffAdminPorts,
} from '@gym/staff-admin/server';

const config = readStaffAdminConfig((name) => Deno.env.get(name));
if (config === null) {
  throw new Error('staff-admin: SUPABASE_URL and the API keys are missing from the environment');
}

Deno.serve(createStaffAdminHandler(supabaseStaffAdminPorts(config)));
