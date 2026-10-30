// A smoke test of offline licenses (step MT-5) on a real project, done as a platform admin through
// the seller-admin function, the way the seller panel does it:
//
//   pnpm smoke:license --remote   the project in supabase/.env.local
//   pnpm smoke:license            local Supabase (`pnpm db:start`, and `pnpm db:functions`)
//
// It logs in with the password and the authenticator app's code (aal2), makes the offline test
// gym's record when it doesn't exist yet (--gym, default smoke-offline; a gym code is permanent,
// so later runs reuse it), issues a yearly license for 30 days, checks the code against the public
// keys this checkout ships (LICENSE_PUBLIC_KEYS; locally the throwaway test key), checks that a
// code with a changed expiry is refused, then revokes the license with a reason and checks that
// the panel shows it revoked.
// Everything it does is in the seller log.
//
// The password and the code are typed by the admin and never printed or stored. Only the public
// (publishable) key is used, never the secret key. For automation: --email, and the password and
// code in SMOKE_ADMIN_PASSWORD and SMOKE_ADMIN_CODE.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs, parseEnv } from 'node:util';
import {
  baghdadDateOf,
  isTestLicenseKid,
  isValidGymCode,
  normalizeGymCode,
  verifyLicenseCode,
  type LicenseKeyRing,
} from '@gym/core';
import type { Database } from '@gym/db';
import {
  issueLicenseResult,
  sellerAdminFailure,
  type IssueLicenseRequest,
  type IssueLicenseResult,
} from '@gym/seller-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ask, fail, localSupabase, readHidden, run, ScriptError } from './script-support';

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    email: { type: 'string' },
    gym: { type: 'string', default: 'smoke-offline' },
  },
});

const REASON = 'Smoke test (pnpm smoke:license)';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Values that must never reach the screen. Every line goes through hide(). */
const secrets: string[] = [];

function hide(text: string): string {
  return secrets.reduce((out, secret) => (secret ? out.replaceAll(secret, '[hidden]') : out), text);
}

function say(line: string): void {
  console.log(hide(line));
}

function stop(message: string): never {
  fail(hide(message));
}

interface Connection {
  readonly url: string;
  readonly publishableKey: string;
}

/** Like smoke:staff-admin: SUPABASE_URL, and the publishable key there or in apps/app/.env.local. */
function connection(): Connection {
  if (!args.remote) {
    const { url, publishableKey } = localSupabase();
    return { url, publishableKey };
  }
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Not there: the variables may come from the environment instead.
  }
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (!url) stop('Set SUPABASE_URL in supabase/.env.local (see supabase/.env.example).');

  let publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    let app: Record<string, string | undefined> = {};
    try {
      app = parseEnv(readFileSync('../apps/app/.env.local', 'utf8'));
    } catch {
      // Not there either: the message below says what to set.
    }
    if (app.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '') === url) {
      publishableKey = app.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
    }
  }
  if (!publishableKey) {
    stop(
      'Set SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) in supabase/.env.local, or make apps/app/.env.local point at the same project.',
    );
  }
  return { url, publishableKey };
}

/**
 * The keys a code must verify against. Remote: only what this checkout ships, never a test key.
 * Local: the throwaway test key `pnpm db:functions` put into supabase/functions/.env (its public
 * half; a real key is never in that file).
 */
function keyRing(): LicenseKeyRing | undefined {
  if (args.remote) return undefined;
  let jwk: unknown = null;
  try {
    const env = parseEnv(readFileSync('functions/.env', 'utf8'));
    jwk = JSON.parse(env.LICENSE_SIGNING_KEY ?? 'null');
  } catch {
    // Missing or unreadable: the message below.
  }
  if (
    typeof jwk !== 'object' ||
    jwk === null ||
    !('kid' in jwk) ||
    !('x' in jwk) ||
    typeof jwk.kid !== 'string' ||
    typeof jwk.x !== 'string' ||
    !isTestLicenseKid(jwk.kid)
  ) {
    stop('No local test key in supabase/functions/.env: start `pnpm db:functions` first.');
  }
  return { publicKeys: { [jwk.kid]: jwk.x }, revoked: [] };
}

type Client = SupabaseClient<Database>;

/** issue_license through the seller-admin function with the admin's aal2 session. */
async function issueLicense(
  { url, publishableKey }: Connection,
  token: string,
  request: IssueLicenseRequest,
): Promise<IssueLicenseResult> {
  const response = await fetch(`${url}/functions/v1/seller-admin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = sellerAdminFailure.safeParse(body);
    stop(
      `seller-admin refused issue_license: ${String(response.status)} ${failure.success ? failure.data.error : 'no readable answer'}`,
    );
  }
  const parsed = issueLicenseResult.safeParse(body);
  if (!parsed.success) stop('seller-admin gave an unexpected answer to issue_license.');
  return parsed.data;
}

/** Logs in with the password, then the authenticator app's code: an aal2 session. */
async function signIn(project: Connection): Promise<{ client: Client; token: string }> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let email: string;
  try {
    email = (args.email ?? (await ask(prompt, 'Platform admin email: '))).trim().toLowerCase();
  } finally {
    prompt.close();
  }
  const password =
    process.env.SMOKE_ADMIN_PASSWORD ??
    (await readHidden('Password (not shown): ', 'SMOKE_ADMIN_PASSWORD'));
  secrets.push(password);

  const client = createClient<Database>(project.url, project.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) stop(`Could not log in: ${login.error.code ?? login.error.message}`);
  const factors = await client.auth.mfa.listFactors();
  // `totp` lists only verified factors.
  const factor = factors.data?.totp[0];
  if (!factor) {
    await client.auth.signOut({ scope: 'local' });
    stop('This account has no two-step login yet: finish its first login in the panel.');
  }
  // Asked only now, so the 30-second code is fresh.
  const code =
    process.env.SMOKE_ADMIN_CODE ??
    (await readHidden('6-digit code from the authenticator app: ', 'SMOKE_ADMIN_CODE'));
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.replace(/\s/g, ''),
  });
  if (verified.error) {
    await client.auth.signOut({ scope: 'local' });
    stop(`The code was refused: ${verified.error.code ?? verified.error.message}`);
  }
  say(`✔ Logged in as ${email} with two-step login`);
  return { client, token: verified.data.access_token };
}

/** The offline test gym's id: the existing record, or a new one (its code is then taken for good). */
async function testGym(client: Client, code: string): Promise<string> {
  const gyms = await client.rpc('seller_gyms');
  if (gyms.error) stop(`Could not read the gyms: ${gyms.error.message}`);
  const existing = gyms.data.find((gym) => gym.code === code);
  if (existing) {
    if (existing.edition !== 'offline')
      stop(`"${code}" is an online gym. Pass --gym <another code>.`);
    say(`✔ Using the offline gym "${code}"`);
    return existing.id;
  }
  const id = crypto.randomUUID();
  const created = await client.rpc('seller_create_offline_gym', {
    p_gym_id: id,
    p_code: code,
    p_name_ckb: 'جیمی تاقیکردنەوەی ئۆفلاین',
    p_name_en: 'Offline test gym',
  });
  if (created.error) stop(`Could not make the offline gym "${code}": ${created.error.message}`);
  say(`✔ Made the offline gym "${code}" (its code is now taken for good)`);
  return id;
}

async function main() {
  const project = connection();
  say(`Supabase: ${project.url}`);
  const gymCode = normalizeGymCode(args.gym);
  if (!isValidGymCode(gymCode)) stop(`"${gymCode}" is not a gym code.`);
  const keys = keyRing();

  const { client, token } = await signIn(project);
  try {
    const gymId = await testGym(client, gymCode);
    const validUntil = baghdadDateOf(Date.now() + 30 * DAY_MS);
    const issued = await issueLicense(project, token, {
      action: 'issue_license',
      gymId,
      type: 'yearly',
      maxBranches: 1,
      maxDevices: 2,
      validUntil,
    });
    say(`✔ Issued license ${issued.licenseId} (${String(issued.code.length)} characters)`);

    const checked = await verifyLicenseCode(issued.code, keys);
    if (!checked.ok) stop(`The code does not verify: ${checked.problem}`);
    const license = checked.value;
    if (args.remote && isTestLicenseKid(license.kid)) {
      stop(`The cloud signed with the test key ${license.kid}: LICENSE_SIGNING_KEY is wrong.`);
    }
    if (
      license.licenseId !== issued.licenseId ||
      license.gymId !== gymId ||
      license.gymCode !== gymCode ||
      license.type !== 'yearly' ||
      license.expiresOn !== validUntil ||
      license.maxBranches !== 1 ||
      license.maxDevices !== 2
    ) {
      stop('The code verifies, but its contents are not what was asked for.');
    }
    say(`✔ Verified with the public key "${license.kid}": ${gymCode}, yearly until ${validUntil}`);

    // The expiry moved a year on and the signature kept: what someone editing a code would try.
    const [prefix, payload, signature] = issued.code.split('.');
    const fields = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    fields.exp = `${String(Number(validUntil.slice(0, 4)) + 1)}${validUntil.slice(4)}`;
    const changed = [
      prefix,
      Buffer.from(JSON.stringify(fields), 'utf8').toString('base64url'),
      signature,
    ].join('.');
    const forged = await verifyLicenseCode(changed, keys);
    if (forged.ok || forged.problem !== 'signature') {
      stop('A code with a changed expiry was not refused by its signature.');
    }
    say('✔ A code with a changed expiry is refused (signature)');

    const revoked = await client.rpc('seller_revoke_license', {
      p_license_id: issued.licenseId,
      p_reason: REASON,
    });
    if (revoked.error) stop(`Could not revoke the license: ${revoked.error.message}`);
    const listed = await client.rpc('seller_licenses', { p_gym_id: gymId });
    if (listed.error) stop(`Could not read the licenses: ${listed.error.message}`);
    const row = listed.data.find((entry) => entry.id === issued.licenseId);
    if (!row?.revoked_at) stop('The panel does not show the license as revoked.');
    say(`✔ Revoked; the panel shows it as revoked on ${row.revoked_at}`);

    say(`\nSmoke test passed. License ${issued.licenseId} of "${gymCode}" stays, revoked.`);
  } finally {
    // Ends only this session, not the admin's open panel.
    await client.auth.signOut({ scope: 'local' });
  }
}

await run(async () => {
  try {
    await main();
  } catch (error) {
    if (error instanceof ScriptError) throw error;
    // Anything unexpected is shown without the secrets.
    stop(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
});
