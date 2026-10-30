// The seller panel's server half online (spec §2.6, steps MT-3 and MT-5): creates a gym with its
// first Owner, adds, deactivates, reactivates and resets platform admins with Supabase Auth's admin
// API, and signs offline gyms' license and activation codes. All of it lives in
// packages/seller-admin (on top of the staff module); this file only wires it to Deno. The offline
// edition has no seller panel, so there is no gym-server version of it.
//
// Supabase gives the function its address and keys (SUPABASE_URL, SUPABASE_SECRET_KEYS, ...), so
// the secret key is never set by hand and is never in the repo or the app. The license signing key
// is the LICENSE_SIGNING_KEY secret (README → Licenses); locally `pnpm db:functions` puts a
// throwaway test key in supabase/functions/.env. Without it, issuing answers license_key_missing.
import { importLicenseSigningKey, type LicenseSigningKey } from '@gym/core';
import { createSellerAdminHandler, supabaseSellerAdminPorts } from '@gym/seller-admin/server';
import { readStaffAdminConfig } from '@gym/staff-admin/server';

const config = readStaffAdminConfig((name) => Deno.env.get(name));
if (config === null) {
  throw new Error('seller-admin: SUPABASE_URL and the API keys are missing from the environment');
}

const signingKeyText = Deno.env.get('LICENSE_SIGNING_KEY');
// Loaded and checked once, at the first license; a key it refuses is refused every time (logged by
// the operation, never printed).
let signingKey: Promise<LicenseSigningKey> | undefined;
const licenseKey = signingKeyText
  ? () => (signingKey ??= importLicenseSigningKey(signingKeyText))
  : undefined;

Deno.serve(
  createSellerAdminHandler({
    ...supabaseSellerAdminPorts(config),
    ...(licenseKey ? { licenseKey } : {}),
  }),
);
