// Creates a Click Group platform admin for the seller panel (spec §2.6, step MT-3): the first one,
// or another when no admin can add one from the panel. The panel adds the others.
//
//   pnpm bootstrap:platform-admin --email ali@clickgroup.site --full-name "عەلی"            local
//   pnpm bootstrap:platform-admin --email ali@clickgroup.site --full-name "عەلی" --remote   the project in supabase/.env.local
//
// Asks for what isn't given. The login gets a temporary password, printed here once and stored
// nowhere: at the first login in the panel, the admin chooses their own password, sets up two-step
// login (TOTP) and keeps their recovery codes. The seller log records the new admin with no actor
// (a script with the secret key).
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { isValidAdminEmail, normalizeAdminEmail } from '@gym/core';
import { generateTemporaryPassword } from '@gym/staff-admin/server';
import { ask, connect, fail, run } from './script-support';

const { values: args } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    email: { type: 'string' },
    'full-name': { type: 'string' },
  },
});

async function main() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let email: string;
  let fullName: string;
  try {
    email = normalizeAdminEmail(args.email ?? (await ask(prompt, 'Email address: ')));
    fullName = (args['full-name'] ?? (await ask(prompt, 'Full name: '))).trim();
  } finally {
    prompt.close();
  }
  if (!isValidAdminEmail(email)) {
    fail('A platform admin logs in with a real email address (never a staff login address).');
  }
  if (fullName.length < 1 || fullName.length > 100) fail('The full name must be 1-100 characters.');

  const supabase = connect(args.remote);

  const existing = await supabase.rpc('platform_script_find_admin', { p_email: email });
  if (existing.error) {
    fail(
      `Could not read the platform admins (are the MT-3 migrations applied?): ${existing.error.message}`,
    );
  }
  if (existing.data.length > 0) {
    fail(
      `${email} is already a platform admin. For a lost two-step device or password, see README → Seller panel → Recovery procedure.`,
    );
  }

  const password = generateTemporaryPassword();
  const newLogin = () =>
    supabase.auth.admin.createUser({
      email,
      password,
      // Click Group's own address, confirmed by whoever runs this.
      email_confirm: true,
      // platform_admin_orphan may free the address only for a login made for a platform admin.
      app_metadata: { platform_admin: true },
    });

  let created = await newLogin();
  if (created.error?.code === 'email_exists') {
    // A login left behind by an add that failed and could not be undone: the database decides.
    const orphan = await supabase.rpc('platform_admin_orphan', { p_email: email });
    if (orphan.error) fail(`Could not check the existing login: ${orphan.error.message}`);
    const orphanId: unknown = orphan.data;
    if (typeof orphanId !== 'string') {
      fail(
        `${email} already has another account (a login that is not a left-behind platform admin).`,
      );
    }
    const removed = await supabase.auth.admin.deleteUser(orphanId);
    if (removed.error) fail(`Could not remove the left-behind login: ${removed.error.message}`);
    console.log('✔ Removed a login an earlier, failed attempt left behind.');
    created = await newLogin();
  }
  if (created.error) fail(`Could not create the login: ${created.error.message}`);
  const userId = created.data.user.id;

  const added = await supabase.rpc('platform_script_add_admin', {
    p_user_id: userId,
    p_full_name: fullName,
  });
  if (added.error) {
    // Don't leave a login without its platform admin row behind.
    await supabase.auth.admin.deleteUser(userId);
    fail(`Could not add the platform admin: ${added.error.message}`);
  }

  console.log(`\n✔ Platform admin ${email} created.`);
  console.log(`\n  Temporary password (shown only now, stored nowhere): ${password}\n`);
  console.log(
    'Log in to the seller panel (/seller/) with it. You will choose your own password, set up\n' +
      'two-step login with an authenticator app, and get recovery codes: keep them somewhere safe.\n' +
      'Click Group should always have at least two platform admins; add the second from the panel.',
  );
}

await run(main);
